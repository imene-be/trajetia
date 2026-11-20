import { Router } from 'express'
import { exigerConnexion } from './auth.js'

const HEURE = /^([01]\d|2[0-3]):[0-5]\d$/
const MAX_TRAJETS = 20

function lire(corps) {
  const texte = (v, max) => (typeof v === 'string' && v.trim().length > 0 && v.length <= max ? v.trim() : null)
  const name = texte(corps?.name, 60)
  const fromLabel = texte(corps?.from?.label, 120)
  const fromId = texte(corps?.from?.id, 120)
  const toLabel = texte(corps?.to?.label, 120)
  const toId = texte(corps?.to?.id, 120)
  const arriveBy = typeof corps?.arriveBy === 'string' && HEURE.test(corps.arriveBy) ? corps.arriveBy : null
  if (!name || !fromLabel || !fromId || !toLabel || !toId || !arriveBy) return null
  return { name, fromLabel, fromId, toLabel, toId, arriveBy, alertsOn: corps.alertsOn === false ? 0 : 1 }
}

const vers = (t) => ({
  id: t.id, name: t.name, from: { label: t.from_label, id: t.from_id }, to: { label: t.to_label, id: t.to_id },
  arriveBy: t.arrive_by, alertsOn: Boolean(t.alerts_on),
})

// Un identifiant d'URL valide, sinon null (évite d'envoyer n'importe quoi à la base)
const idValide = (v) => (/^\d{1,9}$/.test(String(v)) ? Number(v) : null)

// Trajets habituels de l'utilisateur. Chaque requête filtre sur user_id :
// personne ne peut lire ou modifier le trajet d'un autre.
export function creerTrajets({ db, config }) {
  const router = Router()
  // La connexion n'est exigée que pour ces routes (et pas pour les routes des routeurs suivants)
  router.use(['/trips', '/alerts'], exigerConnexion({ db, config }))

  router.get('/trips', async (req, res) => {
    res.json({ trips: (await db.all('SELECT * FROM trips WHERE user_id = $1 ORDER BY id', [req.user.id])).map(vers) })
  })

  router.post('/trips', async (req, res) => {
    const t = lire(req.body)
    if (!t) return res.status(400).json({ error: 'trajet_invalide', message: 'Trajet incomplet ou invalide.' })
    const { n } = await db.get('SELECT COUNT(*)::int AS n FROM trips WHERE user_id = $1', [req.user.id])
    if (n >= MAX_TRAJETS) return res.status(400).json({ error: 'trop_de_trajets', message: 'Maximum 20 trajets.' })
    const cree = await db.get(
      'INSERT INTO trips (user_id, name, from_label, from_id, to_label, to_id, arrive_by, alerts_on) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
      [req.user.id, t.name, t.fromLabel, t.fromId, t.toLabel, t.toId, t.arriveBy, t.alertsOn],
    )
    res.status(201).json({ trip: vers(cree) })
  })

  router.put('/trips/:id', async (req, res) => {
    const t = lire(req.body)
    const id = idValide(req.params.id)
    if (!t) return res.status(400).json({ error: 'trajet_invalide', message: 'Trajet incomplet ou invalide.' })
    const modifie = id === null ? undefined : await db.get(
      'UPDATE trips SET name=$1, from_label=$2, from_id=$3, to_label=$4, to_id=$5, arrive_by=$6, alerts_on=$7 WHERE id=$8 AND user_id=$9 RETURNING *',
      [t.name, t.fromLabel, t.fromId, t.toLabel, t.toId, t.arriveBy, t.alertsOn, id, req.user.id],
    )
    if (!modifie) return res.status(404).json({ error: 'introuvable', message: 'Trajet introuvable.' })
    res.json({ trip: vers(modifie) })
  })

  router.delete('/trips/:id', async (req, res) => {
    const id = idValide(req.params.id)
    const { count } = id === null ? { count: 0 } : await db.run('DELETE FROM trips WHERE id = $1 AND user_id = $2', [id, req.user.id])
    if (!count) return res.status(404).json({ error: 'introuvable', message: 'Trajet introuvable.' })
    res.json({ ok: true })
  })

  router.get('/alerts', async (req, res) => {
    res.json({
      alerts: await db.all('SELECT id, trip_id, title, body, severity, created_at FROM alerts WHERE user_id = $1 ORDER BY id DESC LIMIT 50', [req.user.id]),
    })
  })

  return router
}
