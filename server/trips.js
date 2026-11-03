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

// Trajets habituels de l'utilisateur. Chaque requête filtre sur user_id :
// personne ne peut lire ou modifier le trajet d'un autre.
export function creerTrajets({ db, config }) {
  const router = Router()
  // La connexion n'est exigée que pour ces routes (et pas pour les routes des routeurs suivants)
  router.use(['/trips', '/alerts'], exigerConnexion({ db, config }))

  router.get('/trips', (req, res) => {
    res.json({ trips: db.prepare('SELECT * FROM trips WHERE user_id = ? ORDER BY id').all(req.user.id).map(vers) })
  })

  router.post('/trips', (req, res) => {
    const t = lire(req.body)
    if (!t) return res.status(400).json({ error: 'trajet_invalide', message: 'Trajet incomplet ou invalide.' })
    const { n } = db.prepare('SELECT COUNT(*) AS n FROM trips WHERE user_id = ?').get(req.user.id)
    if (n >= MAX_TRAJETS) return res.status(400).json({ error: 'trop_de_trajets', message: 'Maximum 20 trajets.' })
    const { lastInsertRowid } = db.prepare(
      'INSERT INTO trips (user_id, name, from_label, from_id, to_label, to_id, arrive_by, alerts_on) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(req.user.id, t.name, t.fromLabel, t.fromId, t.toLabel, t.toId, t.arriveBy, t.alertsOn)
    res.status(201).json({ trip: vers(db.prepare('SELECT * FROM trips WHERE id = ?').get(lastInsertRowid)) })
  })

  router.put('/trips/:id', (req, res) => {
    const t = lire(req.body)
    if (!t) return res.status(400).json({ error: 'trajet_invalide', message: 'Trajet incomplet ou invalide.' })
    const { changes } = db.prepare(
      'UPDATE trips SET name=?, from_label=?, from_id=?, to_label=?, to_id=?, arrive_by=?, alerts_on=? WHERE id=? AND user_id=?',
    ).run(t.name, t.fromLabel, t.fromId, t.toLabel, t.toId, t.arriveBy, t.alertsOn, Number(req.params.id), req.user.id)
    if (!changes) return res.status(404).json({ error: 'introuvable', message: 'Trajet introuvable.' })
    res.json({ trip: vers(db.prepare('SELECT * FROM trips WHERE id = ?').get(Number(req.params.id))) })
  })

  router.delete('/trips/:id', (req, res) => {
    const { changes } = db.prepare('DELETE FROM trips WHERE id = ? AND user_id = ?').run(Number(req.params.id), req.user.id)
    if (!changes) return res.status(404).json({ error: 'introuvable', message: 'Trajet introuvable.' })
    res.json({ ok: true })
  })

  router.get('/alerts', (req, res) => {
    res.json({
      alerts: db.prepare('SELECT id, trip_id, title, body, severity, created_at FROM alerts WHERE user_id = ? ORDER BY id DESC LIMIT 50').all(req.user.id),
    })
  })

  return router
}
