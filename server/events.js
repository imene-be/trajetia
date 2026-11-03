import crypto from 'node:crypto'
import { Router } from 'express'
import rateLimit from 'express-rate-limit'

// Mesures d'usage anonymes : une pastille par visiteur (identifiant aléatoire), jamais de trajet ni de position.
const NOMS = new Set(['visit', 'demo_started', 'signup', 'trip_saved', 'alternative_viewed', 'app_open', 'push_enabled'])
const UUID = /^[0-9a-f-]{16,40}$/i
const CANAL = /^[a-z0-9_-]{1,32}$/

export function creerEvenements({ db, config, userDepuisCookie }) {
  const router = Router()

  router.post('/events', rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: true, legacyHeaders: false }), (req, res) => {
    const { visitorId, name } = req.body || {}
    const channel = CANAL.test(String(req.body?.channel || '')) ? req.body.channel : 'direct'
    if (!UUID.test(String(visitorId)) || !NOMS.has(name)) return res.status(400).json({ error: 'evenement_invalide', message: 'Événement invalide.' })
    const user = userDepuisCookie?.(req)
    db.prepare('INSERT INTO events (visitor_id, user_id, name, channel) VALUES (?, ?, ?, ?)').run(visitorId, user?.id ?? null, name, channel)
    res.status(201).json({ ok: true })
  })

  // Tableau de bord des indicateurs du dossier (North Star + 3 KPI). Protégé par ADMIN_TOKEN.
  router.get('/admin/kpis', (req, res) => {
    const fourni = Buffer.from(String(req.get('x-admin-token') || ''))
    const attendu = Buffer.from(config.adminToken || '')
    if (!attendu.length || fourni.length !== attendu.length || !crypto.timingSafeEqual(fourni, attendu)) {
      return res.status(401).json({ error: 'non_autorise', message: 'Accès refusé.' })
    }
    const lignes = db.prepare('SELECT visitor_id, name, channel, created_at FROM events ORDER BY created_at').all()
    const visiteurs = new Map()
    for (const e of lignes) {
      const v = visiteurs.get(e.visitor_id) || { canal: e.channel, inscrit: false, active: false, premiereActivation: null, ouvertures: new Set(), }
      if (e.name === 'signup') v.inscrit = true
      if ((e.name === 'trip_saved' || e.name === 'alternative_viewed') && !v.active) { v.active = true; v.premiereActivation = e.created_at }
      if (e.name === 'app_open' || e.name === 'visit') v.ouvertures.add(e.created_at.slice(0, 10))
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
        const debut = new Date(v.premiereActivation.replace(' ', 'T') + 'Z').getTime()
        const revenu = [...v.ouvertures].some((jour) => {
          const t = new Date(jour + 'T12:00:00Z').getTime()
          return t - debut > 12 * 3600_000 && t - debut <= 7 * 24 * 3600_000 + 12 * 3600_000
        })
        if (revenu) retenus++
      }
    }
    for (const c of Object.values(parCanal)) c.tauxConversion = c.visiteurs ? c.actives / c.visiteurs : 0
    const nsm = db.prepare("SELECT COUNT(*) AS n FROM events WHERE name = 'alternative_viewed' AND created_at >= datetime('now', '-7 days')").get().n
    const ia = db.prepare('SELECT outcome, COUNT(*) AS n FROM ai_calls GROUP BY outcome').all()
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
