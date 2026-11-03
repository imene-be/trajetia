import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { fraicheurIlevia } from './providers/ilevia.js'

const HEURE = /^([01]\d|2[0-3]):[0-5]\d$/

// Recherche de lieux, d'itinéraires et fraîcheur des données.
// Rien n'est enregistré ici : la position (lat/lon) sert uniquement à trouver des arrêts proches.
export function creerItineraires({ provider, fraicheur = fraicheurIlevia }) {
  const router = Router()
  // La limite ne concerne que ces trois routes (et pas celles des routeurs suivants)
  router.use(['/places', '/journeys', '/data-freshness'], rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: true, legacyHeaders: false }))

  const source = () => ({ name: provider.name, real: provider.real })
  // Les horaires d'un réseau se chargent au démarrage (quelques secondes) : on le dit clairement
  const enChargement = (res) => res.status(503).json({
    error: 'chargement',
    message: provider.error ? 'Les horaires du réseau n’ont pas pu être chargés : ' + provider.error : 'Chargement des horaires du réseau… quelques secondes.',
  })
  const erreurSource = (res, e) => (e.status === 404
    ? res.status(404).json({ error: e.code || 'introuvable', message: e.message })
    : res.status(502).json({ error: 'source_en_erreur', message: 'La source de données ne répond pas.', detail: e.message }))
  const indisponible = (res) => res.status(503).json({
    error: 'source_indisponible',
    message: 'Aucune source de données de transport n’est configurée (jeton NAVITIA_TOKEN manquant).',
  })

  router.get('/places', async (req, res) => {
    if (!provider) return indisponible(res)
    if (provider.ready === false) return enChargement(res)
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : ''
    const lat = Number(req.query.lat)
    const lon = Number(req.query.lon)
    const parPosition = req.query.lat !== undefined && Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180
    if (!parPosition && (q.length < 2 || q.length > 100)) {
      return res.status(400).json({ error: 'requete_invalide', message: 'Saisissez au moins 2 caractères.' })
    }
    try {
      res.json({ source: source(), places: await provider.places(parPosition ? { lat, lon } : { q }) })
    } catch (e) {
      erreurSource(res, e)
    }
  })

  router.get('/journeys', async (req, res) => {
    if (!provider) return indisponible(res)
    if (provider.ready === false) return enChargement(res)
    const { from, to, arrive, scenario, incident } = req.query
    if (typeof from !== 'string' || typeof to !== 'string' || from.length > 120 || to.length > 120 || !HEURE.test(String(arrive))) {
      return res.status(400).json({ error: 'requete_invalide', message: 'Départ, arrivée et heure (HH:MM) sont obligatoires.' })
    }
    try {
      const donnees = await provider.journeys({
        fromId: from, toId: to, arriveBy: arrive, scenario: provider.real ? undefined : scenario, incident: incident === '1',
      })
      res.json({ source: source(), ...donnees })
    } catch (e) {
      erreurSource(res, e)
    }
  })

  // Mesure réelle de l'âge du flux temps réel (aide à trancher l'incertitude « fraîcheur des données »)
  router.get('/data-freshness', async (_req, res) => {
    try {
      res.json({ reseaux: [await fraicheur()] })
    } catch (e) {
      res.status(502).json({ error: 'source_en_erreur', message: 'Flux temps réel injoignable.', detail: e.message })
    }
  })

  return router
}
