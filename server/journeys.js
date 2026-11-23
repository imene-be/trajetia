import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { fraicheurIlevia } from './providers/ilevia.js'

const HEURE = /^([01]\d|2[0-3]):[0-5]\d$/

// Recherche de lieux, d'itinéraires et fraîcheur des données.
// Rien n'est enregistré ici : la position (lat/lon) sert uniquement à trouver des arrêts proches.
// Tracés « sur les rues » pour la carte : service de calcul d'itinéraire OpenStreetMap (FOSSGIS, gratuit, sans clé).
// L'appel passe par notre serveur : le service ne voit jamais l'adresse IP de l'utilisateur.
const URL_RUES = 'https://routing.openstreetmap.de'
const PROFILS = { foot: 'routed-foot', car: 'routed-car' }
const POINT = /^-?\d{1,3}\.\d{1,7},-?\d{1,3}\.\d{1,7}$/

export function creerItineraires({ provider, fraicheur = fraicheurIlevia, fetchImpl = fetch }) {
  const router = Router()
  // La limite ne concerne que ces routes (et pas celles des routeurs suivants)
  router.use(['/places', '/journeys', '/data-freshness'], rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: true, legacyHeaders: false }))
  router.use('/streets', rateLimit({ windowMs: 60_000, limit: 240, standardHeaders: true, legacyHeaders: false }))
  const tracesEnMemoire = new Map()

  // GET /api/streets?mode=foot|car&points=lat,lon;lat,lon;…  ->  { path: [[lat, lon], …], distanceM }
  router.get('/streets', async (req, res) => {
    const mode = String(req.query.mode || '')
    const points = String(req.query.points || '').split(';').filter(Boolean)
    if (!PROFILS[mode] || points.length < 2 || points.length > 60 || !points.every((p) => POINT.test(p))) {
      return res.status(400).json({ error: 'requete_invalide', message: 'Mode (foot ou car) et 2 à 60 points « lat,lon » attendus.' })
    }
    const cle = mode + '|' + points.join(';')
    const connu = tracesEnMemoire.get(cle)
    if (connu) return res.json(connu)
    const coords = points.map((p) => { const [lat, lon] = p.split(','); return `${lon},${lat}` }).join(';')
    try {
      const rep = await fetchImpl(`${URL_RUES}/${PROFILS[mode]}/route/v1/driving/${coords}?overview=full&geometries=geojson`, {
        signal: AbortSignal.timeout(5000), headers: { 'User-Agent': 'TrajetIA (projet etudiant)' },
      })
      if (!rep.ok) throw new Error('HTTP ' + rep.status)
      const donnees = await rep.json()
      const route = donnees.routes?.[0]
      if (donnees.code !== 'Ok' || !route) throw new Error(donnees.code || 'pas de tracé')
      const resultat = { path: route.geometry.coordinates.map(([lon, lat]) => [lat, lon]), distanceM: Math.round(route.distance) }
      tracesEnMemoire.set(cle, resultat)
      if (tracesEnMemoire.size > 500) tracesEnMemoire.delete(tracesEnMemoire.keys().next().value)
      res.json(resultat)
    } catch (e) {
      res.status(502).json({ error: 'source_en_erreur', message: 'Tracé sur les rues indisponible.', detail: e.message })
    }
  })

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
