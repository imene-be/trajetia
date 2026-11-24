import crypto from 'node:crypto'
import { Router } from 'express'
import rateLimit from 'express-rate-limit'

// Mesures d'usage anonymes : une pastille par visiteur (identifiant aléatoire), jamais de trajet ni de position.
const NOMS = new Set(['visit', 'demo_started', 'signup', 'trip_saved', 'alternative_viewed', 'app_open', 'push_enabled'])
const UUID = /^[0-9a-f-]{16,40}$/i
const CANAL = /^[a-z0-9_-]{1,32}$/

export function creerEvenements({ db, config, userDepuisCookie }) {
  const router = Router()

  router.post('/events', rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: true, legacyHeaders: false }), async (req, res) => {
    const { visitorId, name } = req.body || {}
    const channel = CANAL.test(String(req.body?.channel || '')) ? req.body.channel : 'direct'
    if (!UUID.test(String(visitorId)) || !NOMS.has(name)) return res.status(400).json({ error: 'evenement_invalide', message: 'Événement invalide.' })
    const user = await userDepuisCookie?.(req)
    await db.run('INSERT INTO events (visitor_id, user_id, name, channel) VALUES ($1, $2, $3, $4)', [visitorId, user?.id ?? null, name, channel])
    res.status(201).json({ ok: true })
  })

  // Résultats des QR codes, SANS jeton : uniquement le nombre de visiteurs uniques par canal (?src=…) et
  // combien ont testé un trajet. Aucune donnée personnelle, aucun identifiant, rien sur l'IA ni les comptes.
  // Un visiteur compte pour son premier canal, comme dans le tableau de bord admin ci-dessous.
  router.get('/stats/canaux', rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: true, legacyHeaders: false }), async (_req, res) => {
    const lignes = await db.all(`
      WITH premier AS (SELECT DISTINCT ON (visitor_id) visitor_id, channel FROM events ORDER BY visitor_id, created_at, id),
           actif AS (SELECT DISTINCT visitor_id FROM events WHERE name IN ('trip_saved', 'alternative_viewed'))
      SELECT p.channel AS canal, COUNT(*)::int AS visiteurs, COUNT(a.visitor_id)::int AS actives
      FROM premier p LEFT JOIN actif a ON a.visitor_id = p.visitor_id
      GROUP BY p.channel ORDER BY visiteurs DESC, canal`)
    const canaux = {}
    let visiteurs = 0
    for (const l of lignes) {
      canaux[l.canal] = { visiteurs: l.visiteurs, actives: l.actives, tauxConversion: l.visiteurs ? l.actives / l.visiteurs : 0 }
      visiteurs += l.visiteurs
    }
    res.set('cache-control', 'no-store').json({ visiteurs, canaux })
  })

  // Tableau de bord des indicateurs du dossier (North Star + 3 KPI). Protégé par ADMIN_TOKEN.
  router.get('/admin/kpis', async (req, res) => {
    const fourni = Buffer.from(String(req.get('x-admin-token') || ''))
    const attendu = Buffer.from(config.adminToken || '')
    if (!attendu.length || fourni.length !== attendu.length || !crypto.timingSafeEqual(fourni, attendu)) {
      return res.status(401).json({ error: 'non_autorise', message: 'Accès refusé.' })
    }
    const lignes = await db.all('SELECT visitor_id, name, channel, created_at FROM events ORDER BY created_at, id')
    const visiteurs = new Map()
    for (const e of lignes) {
      const quand = new Date(e.created_at)
      const v = visiteurs.get(e.visitor_id) || { canal: e.channel, inscrit: false, active: false, premiereActivation: null, ouvertures: new Set() }
      if (e.name === 'signup') v.inscrit = true
      if ((e.name === 'trip_saved' || e.name === 'alternative_viewed') && !v.active) { v.active = true; v.premiereActivation = quand }
      if (e.name === 'app_open' || e.name === 'visit') v.ouvertures.add(quand.toISOString().slice(0, 10))
      visiteurs.set(e.visitor_id, v)
    }
    const parCanal = {}
    let inscrits = 0
    let inscritsActives = 0
    let actives = 0
    let retenus = 0
    for (const v of visiteurs.values()) {
      const c = (parCanal[v.canal] ||= { visiteurs: 0, actives: 0 })
      c.visiteurs++
      if (v.active) { c.actives++; actives++ }
      if (v.inscrit) { inscrits++; if (v.active) inscritsActives++ }
      if (v.active) {
        const debut = v.premiereActivation.getTime()
        const revenu = [...v.ouvertures].some((jour) => {
          const t = new Date(jour + 'T12:00:00Z').getTime()
          return t - debut > 12 * 3600_000 && t - debut <= 7 * 24 * 3600_000 + 12 * 3600_000
        })
        if (revenu) retenus++
      }
    }
    for (const c of Object.values(parCanal)) c.tauxConversion = c.visiteurs ? c.actives / c.visiteurs : 0
    const nsm = (await db.get("SELECT COUNT(*)::int AS n FROM events WHERE name = 'alternative_viewed' AND created_at >= now() - interval '7 days'")).n
    const ia = await db.all('SELECT outcome, COUNT(*)::int AS n FROM ai_calls GROUP BY outcome')
    res.json({
      northStarMetric: { description: 'Trajets perturbés pour lesquels une alternative est consultée (7 derniers jours)', valeur: nsm },
      tauxActivation: inscrits ? inscritsActives / inscrits : null,
      tauxRetention7j: actives ? retenus / actives : null,
      conversionParCanal: parCanal,
      visiteurs: visiteurs.size,
      appelsIa: Object.fromEntries(ia.map((r) => [r.outcome, r.n])),
    })
  })

  return router
}
