import { test } from 'node:test'
import http from 'node:http'
import assert from 'node:assert/strict'
import { loadConfig } from '../config.js'
import { openDb } from '../db.js'
import { creerApp } from '../app.js'
import { creerDemo } from '../providers/demo.js'
import { transformerTrajet, indexerPerturbations } from '../providers/navitia.js'
import { fraicheurIlevia } from '../providers/ilevia.js'
import { surveillerUneFois } from '../monitor.js'
import { verifierRecommandation, nettoyerDemande, recommandationLocale } from '../ai.js'

async function demarrer(options = {}) {
  const config = loadConfig({ bcryptCost: 4, authRateLimit: 1000, adminToken: 'admin-secret', aiTimeoutMs: 80, ...options.config })
  const db = openDb(':memory:')
  const { app, push } = creerApp({
    db, config, provider: options.provider === undefined ? creerDemo() : options.provider, claude: options.claude, pushSender: options.pushSender,
  })
  const serveur = await new Promise((r) => { const s = app.listen(0, () => r(s)) })
  const base = `http://localhost:${serveur.address().port}/api`
  const fermer = () => new Promise((r) => serveur.close(r))
  // Un « navigateur » avec son propre cookie de session
  const client = () => {
    let cookie = ''
    return async (method, chemin, corps, entetes = {}) => {
      const rep = await fetch(base + chemin, {
        method,
        headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...entetes },
        body: corps ? JSON.stringify(corps) : undefined,
      })
      const set = rep.headers.getSetCookie()
      const session = set.find((c) => c.startsWith('tj_session='))
      if (session) cookie = session.split(';')[0].length > 'tj_session='.length ? session.split(';')[0] : ''
      let data = null
      try { data = await rep.json() } catch { /* pas de corps */ }
      return { status: rep.status, data, set }
    }
  }
  return { db, config, push, base, fermer, client }
}

const MDP = 'un-mot-de-passe-solide'
const trajetValide = { name: 'Domicile → Travail', from: { label: 'Lille Flandres', id: 'demo:lille-flandres' }, to: { label: 'Euratechnologies', id: 'demo:euratechnologies' }, arriveBy: '09:00' }

// ---------------------------------------------------------------- comptes

test('inscription, connexion, session et déconnexion', async () => {
  const s = await demarrer()
  const a = s.client()
  assert.equal((await a('GET', '/me')).status, 401)

  const inscription = await a('POST', '/auth/register', { email: 'Ana@Exemple.fr', password: MDP })
  assert.equal(inscription.status, 201)
  assert.equal(inscription.data.user.email, 'ana@exemple.fr')
  assert.equal(inscription.data.user.password_hash, undefined, 'le hash ne doit jamais sortir')
  const cookie = inscription.set.find((c) => c.startsWith('tj_session='))
  assert.match(cookie, /HttpOnly/i)
  assert.match(cookie, /SameSite=Strict/i)

  assert.equal((await a('GET', '/me')).data.user.email, 'ana@exemple.fr')
  await a('POST', '/auth/logout')
  assert.equal((await a('GET', '/me')).status, 401)

  const b = s.client()
  assert.equal((await b('POST', '/auth/login', { email: 'ana@exemple.fr', password: 'faux-faux-faux' })).status, 401)
  assert.equal((await b('POST', '/auth/login', { email: 'ana@exemple.fr', password: MDP })).status, 200)
  await s.fermer()
})

test('/session répond 200 sans erreur, connecté ou non', async () => {
  const s = await demarrer()
  const a = s.client()
  const avant = await a('GET', '/session')
  assert.equal(avant.status, 200)
  assert.equal(avant.data.user, null)
  await a('POST', '/auth/register', { email: 's@s.fr', password: MDP })
  assert.equal((await a('GET', '/session')).data.user.email, 's@s.fr')
  await s.fermer()
})

test('refuse un mot de passe faible, un e-mail invalide et un doublon', async () => {
  const s = await demarrer()
  const a = s.client()
  assert.equal((await a('POST', '/auth/register', { email: 'pas-un-email', password: MDP })).status, 400)
  assert.equal((await a('POST', '/auth/register', { email: 'a@b.fr', password: 'court' })).status, 400)
  assert.equal((await a('POST', '/auth/register', { email: 'a@b.fr', password: MDP })).status, 201)
  assert.equal((await s.client()('POST', '/auth/register', { email: 'A@B.fr', password: MDP })).status, 409)
  await s.fermer()
})

test('le mot de passe est stocké haché, jamais en clair', async () => {
  const s = await demarrer()
  await s.client()('POST', '/auth/register', { email: 'h@h.fr', password: MDP })
  const { password_hash } = s.db.prepare('SELECT password_hash FROM users').get()
  assert.ok(password_hash.startsWith('$2'))
  assert.ok(!password_hash.includes(MDP))
  await s.fermer()
})

test('limite le nombre de tentatives de connexion', async () => {
  const s = await demarrer({ config: { authRateLimit: 3 } })
  const a = s.client()
  const statuts = []
  for (let i = 0; i < 5; i++) statuts.push((await a('POST', '/auth/login', { email: 'x@x.fr', password: 'whatever-whatever' })).status)
  assert.deepEqual(statuts, [401, 401, 401, 429, 429])
  await s.fermer()
})

test('refuse une requête qui modifie des données depuis un autre site (CSRF)', async () => {
  const s = await demarrer()
  const a = s.client()
  const r = await a('POST', '/auth/register', { email: 'c@c.fr', password: MDP }, { origin: 'https://site-malveillant.example' })
  assert.equal(r.status, 403)
  await s.fermer()
})

test('préférences, export et suppression du compte (RGPD)', async () => {
  const s = await demarrer()
  const a = s.client()
  await a('POST', '/auth/register', { email: 'r@r.fr', password: MDP })
  const prefs = await a('PUT', '/me/prefs', { priorite: 'confort', moinsMarche: true, position: true, intrus: 'x' })
  assert.equal(prefs.data.prefs.priorite, 'confort')
  assert.equal(prefs.data.prefs.intrus, undefined)
  await a('POST', '/trips', trajetValide)

  const exportation = await a('GET', '/me/export')
  assert.equal(exportation.data.trajets.length, 1)
  assert.equal(exportation.data.compte.email, 'r@r.fr')

  assert.equal((await a('DELETE', '/me', { password: 'mauvais-mot-de-passe' })).status, 403)
  assert.equal((await a('DELETE', '/me', { password: MDP })).status, 200)
  assert.equal(s.db.prepare('SELECT COUNT(*) AS n FROM users').get().n, 0)
  assert.equal(s.db.prepare('SELECT COUNT(*) AS n FROM trips').get().n, 0, 'les trajets doivent disparaître avec le compte')
  await s.fermer()
})

// ---------------------------------------------------------------- trajets

test('trajets : création, lecture, modification, suppression et validation', async () => {
  const s = await demarrer()
  const a = s.client()
  assert.equal((await a('GET', '/trips')).status, 401)
  await a('POST', '/auth/register', { email: 't@t.fr', password: MDP })

  assert.equal((await a('POST', '/trips', { ...trajetValide, arriveBy: '25:99' })).status, 400)
  assert.equal((await a('POST', '/trips', { ...trajetValide, name: '' })).status, 400)

  const cree = await a('POST', '/trips', trajetValide)
  assert.equal(cree.status, 201)
  const id = cree.data.trip.id
  assert.equal((await a('GET', '/trips')).data.trips.length, 1)
  assert.equal((await a('PUT', `/trips/${id}`, { ...trajetValide, arriveBy: '08:30' })).data.trip.arriveBy, '08:30')
  assert.equal((await a('DELETE', `/trips/${id}`)).status, 200)
  assert.equal((await a('GET', '/trips')).data.trips.length, 0)
  await s.fermer()
})

test('un utilisateur ne peut ni voir ni modifier les trajets d’un autre', async () => {
  const s = await demarrer()
  const ana = s.client()
  const ben = s.client()
  await ana('POST', '/auth/register', { email: 'ana@x.fr', password: MDP })
  await ben('POST', '/auth/register', { email: 'ben@x.fr', password: MDP })
  const id = (await ana('POST', '/trips', trajetValide)).data.trip.id

  assert.equal((await ben('GET', '/trips')).data.trips.length, 0)
  assert.equal((await ben('PUT', `/trips/${id}`, trajetValide)).status, 404)
  assert.equal((await ben('DELETE', `/trips/${id}`)).status, 404)
  assert.equal((await ana('GET', '/trips')).data.trips.length, 1)
  await s.fermer()
})

// ---------------------------------------------------------------- itinéraires

test('itinéraires : la source est toujours indiquée, la démo est marquée non réelle', async () => {
  const s = await demarrer()
  const a = s.client()
  const r = await a('GET', '/journeys?from=a&to=b&arrive=09:00&scenario=perturbation')
  assert.equal(r.status, 200)
  assert.deepEqual(r.data.source, { name: 'demo', real: false })
  assert.ok(r.data.journeys.length >= 3)
  assert.equal((await a('GET', '/journeys?from=a&to=b&arrive=9h')).status, 400)
  assert.equal((await a('GET', '/places?q=a')).status, 400)
  await s.fermer()
})

test('sans source de données configurée : erreur claire, jamais de fausses données', async () => {
  const s = await demarrer({ provider: null })
  const r = await s.client()('GET', '/journeys?from=a&to=b&arrive=09:00')
  assert.equal(r.status, 503)
  assert.equal(r.data.error, 'source_indisponible')
  await s.fermer()
})

test('Navitia : transformation d’un trajet (exemple écrit d’après la documentation, non officiel)', () => {
  const perturbations = indexerPerturbations([{ id: 'd1', severity: { effect: 'SIGNIFICANT_DELAYS', name: 'retards importants' }, messages: [{ text: 'Incident' }] }])
  const trajet = transformerTrajet({
    duration: 1680, departure_date_time: '20261103T082600', arrival_date_time: '20261103T085400', nb_transfers: 1,
    sections: [
      { type: 'street_network', duration: 360 },
      { type: 'public_transport', duration: 600, display_informations: { commercial_mode: 'Metro', physical_mode: 'physical_mode:Metro', label: '2', direction: 'CH Dron', network: 'Ilévia' }, to: { name: 'République' }, links: [{ type: 'disruption', id: 'd1' }] },
      { type: 'transfer', duration: 120 },
      { type: 'public_transport', duration: 600, display_informations: { commercial_mode: 'Tramway', physical_mode: 'physical_mode:Tramway', label: 'T' }, to: { name: 'Euratechnologies' } },
    ],
  }, 0, perturbations)
  assert.equal(trajet.arrivalMin, 8 * 60 + 54)
  assert.equal(trajet.durationMin, 28)
  assert.equal(trajet.transfers, 1)
  assert.deepEqual(trajet.legs.map((l) => l.mode), ['marche', 'metro', 'marche', 'tram'])
  assert.equal(trajet.reliability, 'low')
  assert.equal(trajet.operator, 'Ilévia')
})

test('données réelles Ilévia : mesure de la fraîcheur du flux temps réel (nécessite Internet)', async (t) => {
  let f
  try { f = await fraicheurIlevia() } catch (e) { return t.skip('hors ligne : ' + e.message) }
  assert.ok(f.entites > 0)
  assert.ok(f.ageSecondes >= 0 && f.ageSecondes < 3600, `flux trop ancien : ${f.ageSecondes}s`)
  console.log('  Fraîcheur réelle Ilévia :', f)
})

// ---------------------------------------------------------------- IA

const alternatives = [
  { id: 'a', durationMin: 28, arrivalMin: 534, transfers: 2, walkMin: 8, reliability: 'high', modes: ['marche', 'metro', 'tram'] },
  { id: 'b', durationMin: 36, arrivalMin: 542, transfers: 0, walkMin: 12, reliability: 'high', modes: ['bus'] },
]
const demande = { alternatives, arriveByMin: 540, continueArrivalMin: 558, prefs: { priorite: 'arrivee' } }
const faux = (texte) => ({ messages: { create: async () => ({ content: [{ type: 'text', text: texte }] }) } })

test('IA : une heure inventée dans la phrase est refusée par le contrôle', async () => {
  const s = await demarrer({ claude: faux('{"routeId":"a","claimedArrivalMin":534,"reason":"Le plus rapide pour arriver avant 09:00, arrivée 08:54."}') })
  const a = s.client()
  const r = await a('POST', '/recommend', demande)
  // 09:00 n'est pas une heure présente dans les données : le contrôle doit refuser
  assert.equal(r.data.source, 'secours')
  assert.equal(r.data.cause, 'refusee_par_le_controle')
  await s.fermer()
})

test('IA : réponse correcte acceptée', async () => {
  const s = await demarrer({ claude: faux('Voici : {"routeId":"a","claimedArrivalMin":534,"reason":"Le plus rapide, arrivée à 08:54."}') })
  const r = await s.client()('POST', '/recommend', demande)
  assert.equal(r.data.source, 'ia')
  assert.equal(r.data.routeId, 'a')
  await s.fermer()
})

test('IA : trajet inconnu, heure inventée ou JSON invalide sont refusés par le contrôle', () => {
  const alts = nettoyerDemande(demande).alternatives
  assert.equal(verifierRecommandation({ routeId: 'zzz', claimedArrivalMin: 534, reason: 'ok' }, alts), false)
  assert.equal(verifierRecommandation({ routeId: 'a', claimedArrivalMin: 500, reason: 'ok' }, alts), false)
  assert.equal(verifierRecommandation({ routeId: 'a', claimedArrivalMin: 534, reason: 'Arrivée à 08:12' }, alts), false)
  assert.equal(verifierRecommandation({ routeId: 'a', claimedArrivalMin: 534, reason: '' }, alts), false)
  assert.equal(verifierRecommandation(null, alts), false)
  assert.equal(verifierRecommandation({ routeId: 'a', claimedArrivalMin: 534, reason: 'Plus rapide, arrivée à 08:54' }, alts), true)
})

test('IA : plan B si l’IA dépasse le délai', async () => {
  const lent = { messages: { create: (_p, opts) => new Promise((_ok, ko) => opts.signal.addEventListener('abort', () => ko(opts.signal.reason))) } }
  const s = await demarrer({ claude: lent })
  const debut = Date.now()
  const r = await s.client()('POST', '/recommend', demande)
  assert.equal(r.data.source, 'secours')
  assert.equal(r.data.cause, 'trop_lent')
  assert.ok(Date.now() - debut < 2000)
  await s.fermer()
})

test('sans clé d’IA : recommandation automatique gratuite, annoncée comme telle (source « regles »)', async () => {
  const s = await demarrer()
  const r = await s.client()('POST', '/recommend', demande)
  assert.equal(r.data.source, 'regles')
  assert.equal(r.data.routeId, 'a')
  assert.match(r.data.reason, /08:54/)
  await s.fermer()
})

test('recommandation automatique : suit la priorité choisie et ne cite que des heures présentes dans les données', () => {
  const d = (priorite) => nettoyerDemande({ ...demande, prefs: { priorite, arriverHeure: true } })
  assert.equal(recommandationLocale(d('arrivee')).routeId, 'a') // le plus tôt
  assert.equal(recommandationLocale(d('simplicite')).routeId, 'b') // 0 correspondance
  for (const p of ['arrivee', 'simplicite', 'confort']) {
    const d1 = d(p)
    assert.equal(verifierRecommandation(recommandationLocale(d1), d1.alternatives), true, 'phrase vérifiable : ' + p)
  }
})

test('IA : les données personnelles ne partent jamais vers l’IA', async () => {
  let envoye = ''
  const espion = { messages: { create: async (p) => { envoye = JSON.stringify(p); return { content: [{ type: 'text', text: 'rien' }] } } } }
  const s = await demarrer({ claude: espion })
  await s.client()('POST', '/recommend', { ...demande, email: 'secret@x.fr', position: { lat: 50.6, lon: 3.07 }, alternatives: alternatives.map((a) => ({ ...a, from: 'Domicile 12 rue X', userId: 42 })) })
  assert.ok(envoye.length > 0)
  for (const interdit of ['secret@x.fr', '50.6', 'Domicile', 'rue X', 'userId']) assert.ok(!envoye.includes(interdit), `fuite : ${interdit}`)
  await s.fermer()
})

test('IA : requête invalide refusée et un même calcul n’est facturé qu’une fois', async () => {
  let appels = 0
  const compteur = { messages: { create: async () => { appels++; return { content: [{ type: 'text', text: '{"routeId":"a","claimedArrivalMin":534,"reason":"Le plus rapide, arrivée à 08:54."}' }] } } } }
  const s = await demarrer({ claude: compteur })
  const a = s.client()
  assert.equal((await a('POST', '/recommend', { alternatives: [] })).status, 400)
  await a('POST', '/recommend', demande)
  await a('POST', '/recommend', demande)
  assert.equal(appels, 1)
  await s.fermer()
})

// ---------------------------------------------------------------- notifications et surveillance

test('notifications : abonnement, surveillance, alerte envoyée une seule fois', async () => {
  const envois = []
  const reel = { name: 'faux-reel', real: true, journeys: async () => ({ journeys: [{ id: 'x', arrivalMin: 9 * 60 + 18, reliability: 'high' }] }) }
  const s = await demarrer({ provider: reel, pushSender: async (sub, charge) => { envois.push({ sub, charge: JSON.parse(charge) }) } })
  const a = s.client()
  await a('POST', '/auth/register', { email: 'p@p.fr', password: MDP })
  await a('POST', '/trips', trajetValide)
  assert.equal((await a('POST', '/push/subscribe', { subscription: { endpoint: 'http://non-https', keys: { p256dh: 'a', auth: 'b' } } })).status, 400)
  assert.equal((await a('POST', '/push/subscribe', { subscription: { endpoint: 'https://push.example/abc', keys: { p256dh: 'k', auth: 'a' } } })).status, 201)

  const maintenant = new Date('2026-11-03T07:30:00Z') // 08:30 à Paris, arrivée voulue 09:00
  const un = await surveillerUneFois({ db: s.db, provider: reel, push: s.push, maintenant })
  assert.equal(un.alertes, 1)
  assert.equal(envois.length, 1)
  assert.match(envois[0].charge.body, /09:18/)
  const deux = await surveillerUneFois({ db: s.db, provider: reel, push: s.push, maintenant })
  assert.equal(deux.alertes, 0, 'pas de doublon')
  assert.equal(envois.length, 1)
  assert.equal((await a('GET', '/alerts')).data.alerts.length, 1)

  const hors = await surveillerUneFois({ db: s.db, provider: reel, push: s.push, maintenant: new Date('2026-11-03T20:00:00Z') })
  assert.equal(hors.vérifiés, 0, 'rien à surveiller hors de la fenêtre avant l’heure d’arrivée')
  await s.fermer()
})

test('notification de test : envoyée aux appareils abonnés, réservée aux utilisateurs connectés', async () => {
  const envois = []
  const s = await demarrer({ pushSender: async (sub, charge) => { envois.push(JSON.parse(charge)) } })
  const a = s.client()
  assert.equal((await a('POST', '/push/test')).status, 401)
  await a('POST', '/auth/register', { email: 't@t.fr', password: MDP })
  assert.equal((await a('POST', '/push/test')).data.envoyes, 0)
  await a('POST', '/push/subscribe', { subscription: { endpoint: 'https://push.example/xyz', keys: { p256dh: 'k', auth: 'a' } } })
  assert.equal((await a('POST', '/push/test')).data.envoyes, 1)
  assert.match(envois[0].title, /test/)
  await s.fermer()
})

test('surveillance : ne tourne jamais sur des données de démonstration', async () => {
  const s = await demarrer()
  const r = await surveillerUneFois({ db: s.db, provider: creerDemo(), push: s.push, maintenant: new Date() })
  assert.equal(r.alertes, 0)
  assert.match(r.raison, /réelle/)
  await s.fermer()
})

// ---------------------------------------------------------------- mesures (KPI)

test('événements anonymes et tableau de bord protégé', async () => {
  const s = await demarrer()
  const a = s.client()
  const v1 = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa'
  const v2 = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb'
  assert.equal((await a('POST', '/events', { visitorId: 'x', name: 'visit' })).status, 400)
  assert.equal((await a('POST', '/events', { visitorId: v1, name: 'inconnu' })).status, 400)
  await a('POST', '/events', { visitorId: v1, name: 'visit', channel: 'gare' })
  await a('POST', '/events', { visitorId: v1, name: 'signup', channel: 'gare' })
  await a('POST', '/events', { visitorId: v1, name: 'alternative_viewed', channel: 'gare' })
  await a('POST', '/events', { visitorId: v2, name: 'visit', channel: 'video' })

  assert.equal((await a('GET', '/admin/kpis')).status, 401)
  assert.equal((await a('GET', '/admin/kpis', null, { 'x-admin-token': 'mauvais' })).status, 401)
  const kpis = await a('GET', '/admin/kpis', null, { 'x-admin-token': 'admin-secret' })
  assert.equal(kpis.status, 200)
  assert.equal(kpis.data.northStarMetric.valeur, 1)
  assert.equal(kpis.data.tauxActivation, 1)
  assert.equal(kpis.data.conversionParCanal.gare.tauxConversion, 1)
  assert.equal(kpis.data.conversionParCanal.video.tauxConversion, 0)
  await s.fermer()
})

test('les limites de débit restent sur leur route : trop de recherches ne bloquent ni les mesures ni les notifications', async () => {
  const s = await demarrer()
  const a = s.client()
  let dernier = 0
  for (let i = 0; i < 125; i++) dernier = (await a('GET', '/places?q=ab')).status
  assert.equal(dernier, 429, 'la recherche de lieux est bien limitée')
  assert.equal((await a('POST', '/events', { visitorId: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa', name: 'visit' })).status, 201)
  assert.equal((await a('GET', '/admin/kpis')).status, 401, 'la route admin répond (401), pas 429')
  assert.equal((await a('GET', '/push/key')).status, 200)
  await s.fermer()
})

test('sécurité : en-têtes de protection et routes inconnues', async () => {
  const s = await demarrer()
  const rep = await fetch(s.base + '/health')
  assert.ok(rep.headers.get('x-content-type-options'))
  assert.equal(rep.headers.get('x-powered-by'), null)
  assert.equal((await s.client()('GET', '/n-existe-pas')).status, 404)
  await s.fermer()
})

// ---------------------------------------------------------------- IA via un service compatible « OpenAI » (Groq, Gemini, Ollama… : gratuit possible)

async function faussIaCompatible(reponse) {
  const vus = []
  const serveur = http.createServer((req, res) => {
    let corps = ''
    req.on('data', (c) => { corps += c })
    req.on('end', () => {
      const requete = { url: req.url, auth: req.headers.authorization, corps }
      vus.push(requete)
      reponse(requete, res)
    })
  })
  await new Promise((r) => serveur.listen(0, r))
  return { url: `http://localhost:${serveur.address().port}/v1`, vus, fermer: () => new Promise((r) => { serveur.closeAllConnections?.(); serveur.close(r) }) }
}
const ok = (contenu) => (_req, res) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ choices: [{ message: { content: contenu } }] })) }
const configIa = (url) => ({ aiBaseUrl: url, aiModel: 'modele-test', aiModels: ['modele-test'], aiApiKey: 'cle-test', aiEnabled: true })
const BONNE = '{"routeId":"a","claimedArrivalMin":534,"reason":"Le plus rapide, arrivée à 08:54."}'

test('IA compatible OpenAI : réponse valide acceptée, clé envoyée, aucune donnée personnelle', async () => {
  const ia = await faussIaCompatible(ok(BONNE))
  const s = await demarrer({ config: configIa(ia.url) })
  const r = await s.client()('POST', '/recommend', { ...demande, email: 'secret@x.fr', position: { lat: 50.6, lon: 3.07 } })
  assert.equal(r.data.source, 'ia')
  assert.equal(r.data.routeId, 'a')
  assert.equal(ia.vus[0].url, '/v1/chat/completions')
  assert.equal(ia.vus[0].auth, 'Bearer cle-test')
  assert.match(ia.vus[0].corps, /modele-test/)
  for (const interdit of ['secret@x.fr', '50.6']) assert.ok(!ia.vus[0].corps.includes(interdit), 'fuite : ' + interdit)
  await s.fermer(); await ia.fermer()
})

test('IA compatible OpenAI : si le service refuse response_format, on réessaie sans', async () => {
  let appels = 0
  const ia = await faussIaCompatible((req, res) => {
    appels++
    if (req.corps.includes('response_format')) { res.statusCode = 400; res.end('{"error":"unsupported"}'); return }
    ok(BONNE)(req, res)
  })
  const s = await demarrer({ config: configIa(ia.url) })
  assert.equal((await s.client()('POST', '/recommend', demande)).data.source, 'ia')
  assert.equal(appels, 2)
  await s.fermer(); await ia.fermer()
})

test('IA compatible OpenAI : quota du 1er modèle épuisé (429) -> le modèle suivant répond', async () => {
  const modelesVus = []
  const ia = await faussIaCompatible((req, res) => {
    const modele = JSON.parse(req.corps).model
    modelesVus.push(modele)
    if (modele === 'modele-epuise') { res.statusCode = 429; res.end('{"error":{"message":"quota"}}'); return }
    ok(BONNE)(req, res)
  })
  const s = await demarrer({ config: { ...configIa(ia.url), aiModel: 'modele-epuise', aiModels: ['modele-epuise', 'modele-secours'] } })
  const r = await s.client()('POST', '/recommend', demande)
  assert.equal(r.data.source, 'ia')
  assert.deepEqual(modelesVus, ['modele-epuise', 'modele-secours'])
  assert.equal(s.db.prepare("SELECT model FROM ai_calls WHERE outcome = 'ok'").get().model, 'modele-secours', 'le journal retient le modèle réellement utilisé')
  await s.fermer(); await ia.fermer()
})

test('IA compatible OpenAI : tous les modèles à court de quota -> plan B', async () => {
  const ia = await faussIaCompatible((_q, res) => { res.statusCode = 429; res.end('{}') })
  const s = await demarrer({ config: { ...configIa(ia.url), aiModels: ['a', 'b'] } })
  const r = await s.client()('POST', '/recommend', demande)
  assert.equal(r.data.source, 'secours')
  assert.equal(r.data.cause, 'erreur')
  await s.fermer(); await ia.fermer()
})

test('IA compatible OpenAI : réponse invalide, erreur serveur ou trop lente -> plan B', async () => {
  for (const [nom, reponse, cause] of [
    ['invalide', ok('désolé, je ne sais pas'), 'refusee_par_le_controle'],
    ['trajet inventé', ok('{"routeId":"zzz","claimedArrivalMin":534,"reason":"ok"}'), 'refusee_par_le_controle'],
    ['erreur 500', (_q, res) => { res.statusCode = 500; res.end('boom') }, 'erreur'],
    ['trop lente', () => { /* ne répond jamais */ }, 'trop_lent'],
  ]) {
    const ia = await faussIaCompatible(reponse)
    const s = await demarrer({ config: configIa(ia.url) })
    const r = await s.client()('POST', '/recommend', demande)
    assert.equal(r.data.source, 'secours', nom)
    assert.equal(r.data.cause, cause, nom)
    await s.fermer(); await ia.fermer()
  }
})

test('/health indique quelle IA est branchée', async () => {
  const ia = await faussIaCompatible(ok(BONNE))
  const s = await demarrer({ config: configIa(ia.url) })
  const h = await (await fetch(s.base + '/health')).json()
  assert.equal(h.ia, true)
  assert.match(h.iaModele, /modele-test/)
  await s.fermer(); await ia.fermer()
})
