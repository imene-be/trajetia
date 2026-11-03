import { test } from 'node:test'
import assert from 'node:assert/strict'
import { creerMoteur, chercher } from '../providers/gtfs.js'
import { minuitParis } from '../temps.js'

// Réseau minimal inventé pour tester le calcul : A -(métro R1)-> B -> C -(bus R2)-> D, et un bus lent direct A -> D (R3)
const JOUR = '20261103'
const hh = (s) => `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:00`
const MIN = 60

function reseau() {
  const stops = ['stop_id,stop_name,stop_lat,stop_lon,location_type', 'A,Alpha,50.630,3.060,0', 'B,Bravo,50.640,3.060,0', 'C,Charlie,50.650,3.060,0', 'D,Delta,50.660,3.060,0']
  const routes = ['route_id,route_short_name,route_type', 'R1,1,1', 'R2,2,3', 'R3,3,3']
  const trips = ['route_id,service_id,trip_id,trip_headsign']
  const st = ['trip_id,arrival_time,departure_time,stop_id,stop_sequence']
  const ajouterCourse = (route, id, arrets) => {
    trips.push(`${route},S1,${id},Terminus`)
    arrets.forEach(([stop, t], i) => st.push(`${id},${hh(t)},${hh(t)},${stop},${i + 1}`))
  }
  for (let t = 8 * 3600 + 10 * MIN; t <= 10 * 3600; t += 10 * MIN) {
    ajouterCourse('R1', `R1-${t}`, [['A', t], ['B', t + 5 * MIN], ['C', t + 10 * MIN]])
    ajouterCourse('R2', `R2-${t}`, [['C', t + 12 * MIN], ['D', t + 17 * MIN]])
  }
  for (const t of [8 * 3600 + 15 * MIN, 8 * 3600 + 45 * MIN, 9 * 3600 + 15 * MIN]) ajouterCourse('R3', `R3-${t}`, [['A', t], ['D', t + 40 * MIN]])
  return creerMoteur({
    stops: stops.join('\n'), routes: routes.join('\n'), trips: trips.join('\n'), stop_times: st.join('\n'),
    calendar_dates: ['service_id,date,exception_type', `S1,${JOUR},1`].join('\n'), calendar: null,
  })
}

const MAINTENANT = new Date('2026-11-03T07:00:00Z') // 08:00 à Paris
const demande = (extra = {}) => ({ origine: 'stop:alpha', destination: 'stop:delta', arriveBySec: 9 * 3600 + 30 * MIN, maintenant: MAINTENANT, ...extra })
const epoch = (secondes) => String(Math.round(minuitParis(JOUR) / 1000) + secondes)
const flux = (entites) => ({ entity: entites })
const retard = (tripId, depart, minutes) => ({ tripUpdate: { trip: { tripId }, stopTimeUpdate: [{ stopSequence: 1, departure: { time: epoch(depart + minutes * MIN) } }] } })

test('trouve un trajet avec correspondance et des horaires cohérents', () => {
  const r = chercher(reseau(), demande())
  assert.equal(r.erreur, undefined)
  const j = r.journeys[0]
  assert.deepEqual(j.legs.filter((l) => l.mode !== 'marche').map((l) => l.mode), ['metro', 'bus'])
  assert.equal(j.transfers, 1)
  assert.ok(j.durationMin >= 15 && j.durationMin <= 25, 'durée : ' + j.durationMin)
  assert.ok(j.arrivalMin <= 9 * 60 + 30, 'arrive avant l’heure voulue')
  assert.equal(r.disruption, null)
})

test('propose aussi un trajet différent (bus direct) comme alternative', () => {
  const r = chercher(reseau(), demande())
  const lignes = r.journeys.map((j) => j.legs.filter((l) => l.mode !== 'marche').map((l) => l.label).join('+'))
  assert.ok(lignes.some((l) => l.includes('Bus 3')), 'le bus direct R3 doit apparaître : ' + lignes.join(' | '))
})

test('lieu inconnu et jour sans service : erreurs claires', () => {
  const m = reseau()
  assert.equal(chercher(m, demande({ origine: 'stop:nulle part' })).erreur, 'lieu_inconnu')
  // 06:00 est passée : on vise demain, jour sans service dans ce réseau
  assert.equal(chercher(m, demande({ arriveBySec: 6 * 3600 })).erreur, 'pas_de_service')
})

test('recherche de lieux par nom (sans accents ni majuscules) et par position', () => {
  const m = reseau()
  assert.equal(m.lieuxParNom('CHARL')[0].label, 'Charlie')
  assert.equal(m.lieuxProches(50.6401, 3.0601)[0].label, 'Bravo')
})

test('retard réel (GTFS-RT) : le trajet habituel est signalé perturbé avec son nouveau retard', () => {
  const m = reseau()
  // quelques courses du métro R1 (celles de 09:00 à 09:30) partent 25 minutes en retard
  const entites = []
  for (let t = 9 * 3600; t < 9 * 3600 + 30 * MIN; t += 10 * MIN) entites.push(retard(`R1-${t}`, t, 25))
  const r = chercher(m, demande({ tempsReel: flux(entites) }))
  assert.equal(r.realtime, true)
  const habituel = r.journeys[0]
  assert.equal(habituel.habitual, true, 'premier trajet = trajet habituel perturbé')
  assert.ok(habituel.disruptions[0].delayMin >= 5, 'retard annoncé : ' + habituel.disruptions[0].delayMin)
  assert.equal(habituel.reliability, 'low')
  assert.ok(r.journeys.length > 1, 'des alternatives sont proposées')
  assert.ok(r.journeys.slice(1).every((j) => j.disruptions.length === 0))
})

test('course supprimée (GTFS-RT) : signalée comme supprimée', () => {
  const m = reseau()
  const habituel = chercher(m, demande()).journeys[0]
  const idCourse = m.courses.find((c) => c.id.startsWith('R1-') && m.lignes[c.ligne].court === '1')
  assert.ok(idCourse)
  // on supprime toutes les courses R1 : plus aucun métro
  const entites = m.courses.filter((c) => c.id.startsWith('R1-')).map((c) => ({ tripUpdate: { trip: { tripId: c.id, scheduleRelationship: 3 } } }))
  const r = chercher(m, demande({ tempsReel: flux(entites) }))
  assert.equal(r.journeys[0].habitual, true)
  assert.match(r.journeys[0].disruptions[0].message, /supprimée/)
  assert.ok(r.journeys.length >= 2, 'le bus direct reste proposé')
  assert.ok(habituel)
})

test('incident simulé : les horaires restent ceux du réseau, un retard apparaît sur la ligne du trajet', () => {
  const r = chercher(reseau(), demande({ incident: true }))
  assert.equal(r.simulated, true)
  const habituel = r.journeys[0]
  assert.equal(habituel.habitual, true)
  assert.match(habituel.disruptions[0].message, /Incident simulé/)
  assert.ok(habituel.disruptions[0].delayMin >= 15)
  assert.ok(habituel.arrivalMin > r.journeys[1].arrivalMin - 60)
})

test('sans temps réel, pas de fausse perturbation', () => {
  const r = chercher(reseau(), demande({ tempsReel: flux([]) }))
  assert.ok(!r.journeys.some((j) => j.disruptions.length))
})

// ---- Données RÉELLES Ilévia (nécessite Internet la première fois ; ensuite le fichier est en cache dans data/gtfs)
test('données réelles Ilévia : Gare Lille Flandres → Euratechnologies, avec le temps réel du moment (nécessite Internet)', async (t) => {
  const { creerIlevia } = await import('../providers/gtfs.js')
  const p = creerIlevia({}, { log: () => {} })
  try { await p.charger() } catch (e) { return t.skip('horaires indisponibles : ' + e.message) }

  const lieux = await p.places({ q: 'euratech' })
  assert.ok(lieux.some((l) => l.label === 'Euratechnologies'), 'l’arrêt Euratechnologies doit être proposé')
  assert.ok((await p.places({ lat: 50.6378, lon: 3.0709 })).some((l) => /Flandres/.test(l.label)), 'la gare est proche de ces coordonnées')

  const r = await p.journeys({ fromId: 'stop:gare lille flandres', toId: 'stop:euratechnologies', arriveBy: '18:00' })
  assert.ok(r.journeys.length >= 2, 'plusieurs trajets réels')
  for (const j of r.journeys) {
    assert.ok(j.durationMin > 5 && j.durationMin < 90, 'durée plausible : ' + j.durationMin)
    assert.ok(j.legs.some((l) => l.mode !== 'marche'), 'au moins un transport')
  }
  const inc = await p.journeys({ fromId: 'stop:gare lille flandres', toId: 'stop:euratechnologies', arriveBy: '18:00', incident: true })
  assert.equal(inc.journeys[0].habitual, true)
  assert.ok(inc.journeys.length >= 2)
  console.log('  trajet réel :', r.journeys[0].legs.map((l) => l.label + ' ' + l.minutes + ' min').join(' > '))
})
