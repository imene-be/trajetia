// ============================================================
//  Calculateur d'itinéraires RÉEL, sans clé, sur les données ouvertes d'un réseau :
//   - horaires officiels (GTFS) ;
//   - retards et suppressions en temps réel (GTFS-RT) ;
//   - adresses : Base Adresse Nationale (api-adresse.data.gouv.fr).
//  Réseau branché : Ilévia (métropole de Lille). Un autre réseau = une autre adresse GTFS.
//
//  Méthode : « Connection Scan Algorithm » (meilleure arrivée), avec correspondances à pied.
//  Les durées de marche sont des estimations (vol d'oiseau x 1,3 à 4,5 km/h), pas un calcul de
//  trottoirs : l'application le dit dans l'interface.
// ============================================================
import fs from 'node:fs'
import path from 'node:path'
import { unzipSync, strFromU8 } from 'fflate'
import GtfsRt from 'gtfs-realtime-bindings'
import { partiesParis, minuitParis, ajouterJours, jourVise, hhmmVersSecondes } from '../temps.js'

const URL_GTFS = 'https://media.ilevia.fr/opendata/gtfs.zip'
const URL_RT = 'https://proxy.transport.data.gouv.fr/resource/ilevia-lille-gtfs-rt'
const URL_BAN = 'https://api-adresse.data.gouv.fr/search/'
const VITESSE_MARCHE = 1.25 // m/s (4,5 km/h)
const DETOUR = 1.3 // facteur vol d'oiseau -> chemin réel
const TAMPON_CORRESPONDANCE = 60 // s
const SEUIL_RETARD = 300 // s : en dessous, pas de « perturbation »
const INF = 1e9

const normaliser = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

function distanceM(lat1, lon1, lat2, lon2) {
  const rad = Math.PI / 180
  const a = Math.sin(((lat2 - lat1) * rad) / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lon2 - lon1) * rad) / 2) ** 2
  return 6371000 * 2 * Math.asin(Math.sqrt(a))
}
const marcheSec = (m) => Math.round((m * DETOUR) / VITESSE_MARCHE)

const heureGtfs = (t) => (t.length >= 8 ? Number(t.slice(0, 2)) * 3600 + Number(t.slice(3, 5)) * 60 + Number(t.slice(6, 8)) : -1)

// CSV avec guillemets (petits fichiers)
function lireCsv(texte) {
  const lignes = texte.split(/\r?\n/).filter((l) => l.length)
  const decouper = (l) => {
    if (!l.includes('"')) return l.split(',')
    const out = []
    let cur = ''
    let q = false
    for (let i = 0; i < l.length; i++) {
      const c = l[i]
      if (c === '"') { if (q && l[i + 1] === '"') { cur += '"'; i++ } else q = !q } else if (c === ',' && !q) { out.push(cur); cur = '' } else cur += c
    }
    out.push(cur)
    return out
  }
  const entetes = decouper(lignes[0]).map((h) => h.replace(/^﻿/, '').trim())
  return lignes.slice(1).map((l) => { const v = decouper(l); const o = {}; entetes.forEach((h, i) => { o[h] = v[i] ?? '' }); return o })
}

// ------------------------------------------------------------ moteur

export function creerMoteur(brut) {
  // --- arrêts (points d'arrêt uniquement)
  const arrets = []
  const idArret = new Map()
  for (const r of lireCsv(brut.stops)) {
    if (r.location_type && r.location_type !== '0') continue
    idArret.set(r.stop_id, arrets.length)
    arrets.push({ id: r.stop_id, nom: r.stop_name, cle: normaliser(r.stop_name), lat: Number(r.stop_lat), lon: Number(r.stop_lon) })
  }
  const groupes = new Map() // nom normalisé -> indices d'arrêts
  arrets.forEach((a, i) => { if (!groupes.has(a.cle)) groupes.set(a.cle, []); groupes.get(a.cle).push(i) })

  // --- lignes et courses
  const lignes = []
  const idLigne = new Map()
  for (const r of lireCsv(brut.routes)) {
    idLigne.set(r.route_id, lignes.length)
    lignes.push({ id: r.route_id, court: r.route_short_name || r.route_long_name || r.route_id, type: Number(r.route_type) })
  }
  const courses = []
  const idCourse = new Map()
  for (const r of lireCsv(brut.trips)) {
    if (!idLigne.has(r.route_id)) continue
    idCourse.set(r.trip_id, courses.length)
    courses.push({ id: r.trip_id, ligne: idLigne.get(r.route_id), service: r.service_id, destination: r.trip_headsign })
  }

  // --- calendrier : services actifs par jour
  const services = new Map() // AAAAMMJJ -> Set(service_id)
  const ajouter = (jour, s) => { if (!services.has(jour)) services.set(jour, new Set()); services.get(jour).add(s) }
  if (brut.calendar) {
    for (const r of lireCsv(brut.calendar)) {
      let jour = r.start_date
      const jours = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
      let garde = 0
      while (jour <= r.end_date && garde++ < 800) {
        const j = new Date(Date.UTC(Number(jour.slice(0, 4)), Number(jour.slice(4, 6)) - 1, Number(jour.slice(6, 8)), 12)).getUTCDay()
        if (r[jours[j]] === '1') ajouter(jour, r.service_id)
        jour = ajouterJours(jour, 1)
      }
    }
  }
  if (brut.calendar_dates) {
    const l = brut.calendar_dates.split(/\r?\n/)
    for (let i = 1; i < l.length; i++) {
      const [service, jour, type] = l[i].split(',')
      if (!service) continue
      if (type === '1') ajouter(jour, service)
      else if (type === '2') services.get(jour)?.delete(service)
    }
  }

  // --- horaires (stop_times), stockés en tableaux compacts
  const lignesTexte = brut.stop_times.split(/\r?\n/)
  const entete = lignesTexte[0].replace(/^﻿/, '').split(',')
  const iTrip = entete.indexOf('trip_id')
  const iArr = entete.indexOf('arrival_time')
  const iDep = entete.indexOf('departure_time')
  const iStop = entete.indexOf('stop_id')
  const iSeq = entete.indexOf('stop_sequence')
  const n = lignesTexte.length - 1
  const stTrip = new Int32Array(n)
  const stStop = new Int32Array(n)
  const stArr = new Int32Array(n)
  const stDep = new Int32Array(n)
  const stSeq = new Int32Array(n)
  let k = 0
  for (let i = 1; i <= n; i++) {
    const l = lignesTexte[i]
    if (!l) continue
    const v = l.split(',')
    const c = idCourse.get(v[iTrip])
    const a = idArret.get(v[iStop])
    if (c === undefined || a === undefined) continue
    const arr = heureGtfs(v[iArr])
    const dep = heureGtfs(v[iDep])
    if (arr < 0 || dep < 0) continue
    stTrip[k] = c; stStop[k] = a; stArr[k] = arr; stDep[k] = dep; stSeq[k] = Number(v[iSeq]); k++
  }
  const nbHoraires = k
  // début et fin de chaque course (les lignes d'une course sont contiguës)
  const debutCourse = new Int32Array(courses.length).fill(-1)
  const finCourse = new Int32Array(courses.length).fill(-1)
  for (let i = 0; i < nbHoraires; i++) {
    if (debutCourse[stTrip[i]] === -1) debutCourse[stTrip[i]] = i
    finCourse[stTrip[i]] = i
  }

  // --- correspondances à pied entre arrêts proches (grille)
  const voisins = Array.from({ length: arrets.length }, () => [])
  const grille = new Map()
  const cellule = (lat, lon) => `${Math.floor(lat / 0.003)}:${Math.floor(lon / 0.005)}`
  arrets.forEach((a, i) => { const c = cellule(a.lat, a.lon); if (!grille.has(c)) grille.set(c, []); grille.get(c).push(i) })
  arrets.forEach((a, i) => {
    const cy = Math.floor(a.lat / 0.003)
    const cx = Math.floor(a.lon / 0.005)
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      for (const j of grille.get(`${cy + dy}:${cx + dx}`) || []) {
        if (j === i) continue
        const d = distanceM(a.lat, a.lon, arrets[j].lat, arrets[j].lon)
        if (d <= 250) voisins[i].push({ vers: j, sec: marcheSec(d) })
      }
    }
  })

  const jours = new Map() // cache des journées construites

  // Construit les « connexions » (un tronçon entre deux arrêts consécutifs) d'un jour de service
  function journee(jour) {
    if (jours.has(jour)) return jours.get(jour)
    const actifs = services.get(jour) || new Set()
    const courseActive = []
    let total = 0
    for (let c = 0; c < courses.length; c++) {
      if (debutCourse[c] < 0 || !actifs.has(courses[c].service)) continue
      courseActive.push(c)
      total += finCourse[c] - debutCourse[c]
    }
    const dStop = new Int32Array(total); const aStop = new Int32Array(total)
    const depS = new Int32Array(total); const arrS = new Int32Array(total)
    const tCourse = new Int32Array(total); const seqDep = new Int32Array(total); const seqArr = new Int32Array(total)
    const premiere = new Int32Array(courses.length).fill(-1) // première connexion de chaque course
    const nbConn = new Int32Array(courses.length)
    let m = 0
    for (const c of courseActive) {
      premiere[c] = m
      for (let i = debutCourse[c]; i < finCourse[c]; i++) {
        dStop[m] = stStop[i]; aStop[m] = stStop[i + 1]
        depS[m] = stDep[i]; arrS[m] = stArr[i + 1]
        tCourse[m] = c; seqDep[m] = stSeq[i]; seqArr[m] = stSeq[i + 1]
        m++
      }
      nbConn[c] = finCourse[c] - debutCourse[c]
    }
    const ordre = (dep) => Int32Array.from({ length: total }, (_, i) => i).sort((a, b) => dep[a] - dep[b] || a - b)
    const j = { jour, total, dStop, aStop, depS, arrS, tCourse, seqDep, seqArr, premiere, nbConn, ordS: ordre(depS), ordre }
    jours.set(jour, j)
    return j
  }

  // Vue = horaires à utiliser pour une recherche (théoriques, ou avec le temps réel)
  const vueTheorique = (j) => ({ dep: j.depS, arr: j.arrS, ord: j.ordS, annulees: new Set(), retardees: new Set() })

  // Applique un flux GTFS-RT (retards, suppressions) : renvoie une nouvelle vue
  function vueTempsReel(j, flux, minuitMs) {
    const dep = Int32Array.from(j.depS)
    const arr = Int32Array.from(j.arrS)
    const annulees = new Set()
    let majs = 0
    for (const e of flux.entity || []) {
      const tu = e.tripUpdate
      if (!tu) continue
      const c = idCourse.get(tu.trip?.tripId)
      if (c === undefined || j.premiere[c] < 0) continue
      if (tu.trip.scheduleRelationship === GtfsRt.transit_realtime.TripDescriptor.ScheduleRelationship.CANCELED) { annulees.add(c); continue }
      const horaires = new Map()
      for (const s of tu.stopTimeUpdate || []) {
        const d = s.departure?.time ? Number(s.departure.time) : null
        const a = s.arrival?.time ? Number(s.arrival.time) : null
        horaires.set(s.stopSequence, { dep: d !== null ? Math.round(d - minuitMs / 1000) : null, arr: a !== null ? Math.round(a - minuitMs / 1000) : null })
      }
      if (!horaires.size) continue
      const p = j.premiere[c]
      const nb = j.nbConn[c]
      const retardDep = new Array(nb)
      let retard = 0
      for (let i = 0; i < nb; i++) {
        const u = horaires.get(j.seqDep[p + i])
        if (u && u.dep !== null) retard = u.dep - j.depS[p + i]
        else if (u && u.arr !== null) retard = u.arr - j.arrS[p + i - 1 >= p ? p + i - 1 : p + i]
        retardDep[i] = retard
      }
      for (let i = 0; i < nb; i++) {
        const retardArr = i + 1 < nb ? retardDep[i + 1] : retardDep[i]
        dep[p + i] = j.depS[p + i] + retardDep[i]
        arr[p + i] = Math.max(j.arrS[p + i] + retardArr, dep[p + i])
      }
      majs++
    }
    return { dep, arr, ord: j.ordre(dep), annulees, retardees: new Set(), misesAJour: majs }
  }

  // Incident simulé : plus aucun départ sur la ligne entre t0 et t1 (trains à l'arrêt), puis reprise
  function avecIncident(j, vue, ligne, t0, t1) {
    const dep = Int32Array.from(vue.dep)
    const arr = Int32Array.from(vue.arr)
    for (let i = 0; i < j.total; i++) {
      if (courses[j.tCourse[i]].ligne === ligne && dep[i] >= t0 && dep[i] < t1) {
        const decalage = t1 - dep[i] + Math.floor((dep[i] - t0) / 10)
        dep[i] += decalage
        arr[i] += decalage
      }
    }
    return { dep, arr, ord: j.ordre(dep), annulees: vue.annulees, retardees: new Set([ligne]), misesAJour: vue.misesAJour }
  }

  // Refait le MÊME trajet (mêmes lignes, mêmes arrêts) aux horaires d'une vue : « si vous continuez »
  function retimer(j, vue, trajet, sortie) {
    let t = trajet.departSec
    let apresVehicule = false
    let cumul = 0
    const lignesRetard = new Set()
    for (const e of trajet.brut.etapes) {
      if (e.type === 'acces' || e.type === 'marche') { t += e.sec; continue }
      const sb = j.dStop[e.board]
      const sa = j.aStop[e.alight]
      const ligne = courses[j.tCourse[e.board]].ligne
      const mini = t + (apresVehicule ? TAMPON_CORRESPONDANCE : 0)
      let lo = 0
      let hi = vue.ord.length
      while (lo < hi) { const mid = (lo + hi) >> 1; if (vue.dep[vue.ord[mid]] < mini) lo = mid + 1; else hi = mid }
      let trouve = null
      for (let i = lo; i < vue.ord.length && !trouve; i++) {
        const c = vue.ord[i]
        if (vue.dep[c] > mini + 4 * 3600) break
        if (j.dStop[c] !== sb) continue
        const crs = j.tCourse[c]
        if (courses[crs].ligne !== ligne || vue.annulees.has(crs)) continue
        const p = j.premiere[crs]
        for (let m = c - p; m < j.nbConn[crs]; m++) if (j.aStop[p + m] === sa) { trouve = { c, alight: p + m }; break }
      }
      if (!trouve) return null
      const retardLeg = vue.arr[trouve.alight] - j.arrS[e.alight] // retard par rapport au trajet prévu
      if (retardLeg - cumul >= SEUIL_RETARD || vue.dep[trouve.c] - j.depS[trouve.c] >= SEUIL_RETARD) lignesRetard.add(ligne)
      cumul = Math.max(cumul, retardLeg)
      t = vue.arr[trouve.alight]
      apresVehicule = true
    }
    return { arriveeSec: t + (sortie.get(trajet.brut.arretFinal) ?? 0), lignesRetard }
  }

  // ---------------------------------------------------------- lieux
  function resoudre(id) {
    if (id.startsWith('stop:')) {
      const idx = groupes.get(id.slice(5))
      if (!idx) return null
      return { acces: idx.map((s) => ({ s, sec: 0 })), nom: arrets[idx[0]].nom, point: null }
    }
    if (id.startsWith('addr:')) {
      const [lon, lat] = id.slice(5).split(',').map(Number)
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
      const proches = arrets.map((a, s) => ({ s, d: distanceM(lat, lon, a.lat, a.lon) })).filter((x) => x.d <= 1000).sort((a, b) => a.d - b.d).slice(0, 12)
      if (!proches.length) return null
      return { acces: proches.map((x) => ({ s: x.s, sec: marcheSec(x.d) })), nom: 'votre adresse', point: { lat, lon } }
    }
    return null
  }

  function lieuxParNom(q, max = 5) {
    const cle = normaliser(q)
    const trouves = []
    for (const [nom, idx] of groupes) {
      const pos = nom.indexOf(cle)
      if (pos < 0) continue
      trouves.push({ nom, idx, score: (pos === 0 ? 0 : 100) + nom.length - Math.min(idx.length, 8) * 3 })
    }
    return trouves.sort((a, b) => a.score - b.score).slice(0, max).map((t) => ({ id: 'stop:' + t.nom, label: arrets[t.idx[0]].nom, type: 'stop_area' }))
  }

  function lieuxProches(lat, lon, max = 5) {
    const vus = new Set()
    const res = []
    for (const x of arrets.map((a, s) => ({ s, d: distanceM(lat, lon, a.lat, a.lon) })).sort((a, b) => a.d - b.d)) {
      if (x.d > 1500 || res.length >= max) break
      const cle = arrets[x.s].cle
      if (vus.has(cle)) continue
      vus.add(cle)
      res.push({ id: 'stop:' + cle, label: arrets[x.s].nom, type: 'stop_area' })
    }
    return res
  }

  // ---------------------------------------------------------- recherche (CSA)
  function csa(j, vue, acces, sortie, debutSec, interdites, autorisees) {
    const nA = arrets.length
    const arrivee = new Int32Array(nA).fill(INF)
    const type = new Uint8Array(nA) // 1 = accès à pied, 2 = véhicule, 3 = correspondance à pied
    const ref = new Int32Array(nA).fill(-1)
    const embarque = new Int32Array(courses.length).fill(-1)
    let meilleur = INF
    let arretFinal = -1

    const sortiePossible = (s, t) => {
      const e = sortie.get(s)
      if (e !== undefined && t + e < meilleur) { meilleur = t + e; arretFinal = s }
    }
    const marcher = (s, t) => {
      for (const v of voisins[s]) {
        const tt = t + v.sec
        if (tt < arrivee[v.vers]) { arrivee[v.vers] = tt; type[v.vers] = 3; ref[v.vers] = s; sortiePossible(v.vers, tt) }
      }
    }
    for (const a of acces) {
      const t = debutSec + a.sec
      if (t < arrivee[a.s]) { arrivee[a.s] = t; type[a.s] = 1; ref[a.s] = a.sec; sortiePossible(a.s, t); marcher(a.s, t) }
    }

    const { dep, arr, ord } = vue
    // recherche du premier tronçon qui part à partir de debutSec
    let lo = 0
    let hi = ord.length
    while (lo < hi) { const mid = (lo + hi) >> 1; if (dep[ord[mid]] < debutSec) lo = mid + 1; else hi = mid }

    for (let i = lo; i < ord.length; i++) {
      const c = ord[i]
      if (dep[c] >= meilleur) break
      const course = j.tCourse[c]
      if (vue.annulees.has(course)) continue
      if (interdites && interdites.has(courses[course].ligne)) continue
      if (autorisees && !autorisees.has(courses[course].ligne)) continue
      let monte = embarque[course] !== -1
      if (!monte) {
        const s = j.dStop[c]
        const tampon = type[s] === 2 ? TAMPON_CORRESPONDANCE : 0
        if (arrivee[s] + tampon <= dep[c]) { embarque[course] = c; monte = true }
      }
      if (monte) {
        const s2 = j.aStop[c]
        if (arr[c] < arrivee[s2]) { arrivee[s2] = arr[c]; type[s2] = 2; ref[s2] = c; sortiePossible(s2, arr[c]); marcher(s2, arr[c]) }
      }
    }
    if (arretFinal < 0) return null

    // reconstruction du trajet en remontant
    const etapes = []
    let s = arretFinal
    let securite = 0
    while (securite++ < 60) {
      if (type[s] === 2) {
        const alight = ref[s]
        const board = embarque[j.tCourse[alight]]
        etapes.unshift({ type: 'bus', board, alight })
        s = j.dStop[board]
      } else if (type[s] === 3) {
        const de = ref[s]
        etapes.unshift({ type: 'marche', de, vers: s, sec: marcheSec(distanceM(arrets[de].lat, arrets[de].lon, arrets[s].lat, arrets[s].lon)) })
        s = de
      } else {
        etapes.unshift({ type: 'acces', vers: s, sec: ref[s] })
        break
      }
    }
    return { etapes, arriveeSec: meilleur, arretFinal, sortieSec: sortie.get(arretFinal) }
  }

  const modeDe = (t) => (t === 1 ? 'metro' : t === 0 ? 'tram' : t === 2 ? 'train' : 'bus')
  const libelleLigne = (l) => (l.type === 1 ? (/^M/i.test(l.court) ? l.court : 'M' + l.court) : l.type === 0 ? 'Tram ' + l.court : 'Bus ' + l.court)

  // Transforme le résultat brut en trajet lisible. `vue` donne les horaires utilisés.
  function enTrajet(j, vue, r, sortieDest, id) {
    const legs = []
    const lignesUtilisees = []
    const courseIds = []
    let marche = 0
    let correspondances = 0
    let premierDepart = null
    let dernierArr = null
    const avant = r.etapes.find((e) => e.type === 'acces')
    for (const e of r.etapes) {
      if (e.type === 'acces') {
        if (e.sec >= 30) { const mn = Math.max(1, Math.round(e.sec / 60)); legs.push({ mode: 'marche', label: 'Marche', minutes: mn, text: `Marchez ${mn} min jusqu’à ${arrets[e.vers].nom}` }); marche += mn }
      } else if (e.type === 'marche') {
        const mn = Math.max(1, Math.round(e.sec / 60))
        legs.push({ mode: 'marche', label: 'Marche', minutes: mn, text: `Correspondance : marchez ${mn} min jusqu’à ${arrets[e.vers].nom}` }); marche += mn
      } else {
        const course = courses[j.tCourse[e.board]]
        const ligne = lignes[course.ligne]
        const minutes = Math.max(1, Math.round((vue.arr[e.alight] - vue.dep[e.board]) / 60))
        const nomLigne = libelleLigne(ligne)
        legs.push({
          mode: modeDe(ligne.type), label: nomLigne, minutes,
          text: `Prendre ${ligne.type === 1 ? 'le métro' : ligne.type === 0 ? 'le tram' : 'le bus'} ${ligne.court}${course.destination ? ' direction ' + course.destination : ''} jusqu’à ${arrets[j.aStop[e.alight]].nom}`,
        })
        lignesUtilisees.push(course.ligne)
        courseIds.push(j.tCourse[e.board])
        if (premierDepart === null) premierDepart = vue.dep[e.board] - (avant?.sec || 0)
        dernierArr = vue.arr[e.alight]
        correspondances++
      }
    }
    if (sortieDest && r.sortieSec >= 30) {
      const mn = Math.max(1, Math.round(r.sortieSec / 60))
      legs.push({ mode: 'marche', label: 'Marche', minutes: mn, text: `Marchez ${mn} min jusqu’à destination` }); marche += mn
    }
    if (!courseIds.length) return null
    const arrivee = r.arriveeSec
    const depart = premierDepart
    return {
      id, cle: courseIds.join('>'), lignes: [...new Set(lignesUtilisees)], courses: courseIds,
      legs, departSec: depart, arriveeSec: arrivee, durationMin: Math.round((arrivee - depart) / 60),
      transfers: Math.max(0, correspondances - 1), walkMin: marche, brut: r,
    }
  }

  return { arrets, lignes, courses, groupes, journee, vueTheorique, vueTempsReel, avecIncident, retimer, resoudre, lieuxParNom, lieuxProches, csa, enTrajet, voisins, services, libelleLigne }
}

// ------------------------------------------------------------ recherche de trajets (au-dessus du moteur)

export function chercher(moteur, { origine, destination, arriveBySec, maintenant = new Date(), tempsReel = null, incident = false }) {
  const o = moteur.resoudre(origine)
  const d = moteur.resoudre(destination)
  if (!o || !d) return { erreur: 'lieu_inconnu', message: 'Départ ou arrivée introuvable : choisissez-les dans les suggestions.' }
  const cible = jourVise(arriveBySec, maintenant)
  const j = moteur.journee(cible.jour)
  if (!j.total) return { erreur: 'pas_de_service', message: 'Aucun horaire n’est disponible pour ce jour dans les données du réseau.' }

  const sortie = new Map(d.acces.map((a) => [a.s, a.sec]))
  const debut = Math.max(0, cible.aujourdhui ? Math.max(cible.maintenantSec, arriveBySec - 7200) : arriveBySec - 7200)
  const pas = 300

  const balayage = (vue, interdites) => {
    const trouves = new Map()
    for (let t = debut; t <= arriveBySec; t += pas) {
      const r = moteur.csa(j, vue, o.acces, sortie, t, interdites)
      if (!r) continue
      const tr = moteur.enTrajet(j, vue, r, Boolean(d.point), '')
      if (tr && !trouves.has(tr.cle)) trouves.set(tr.cle, tr)
    }
    if (!trouves.size || ![...trouves.values()].some((x) => x.arriveeSec <= arriveBySec)) {
      const r = moteur.csa(j, vue, o.acces, sortie, debut, interdites)
      const tr = r && moteur.enTrajet(j, vue, r, Boolean(d.point), '')
      if (tr) trouves.set(tr.cle, tr)
    }
    return [...trouves.values()]
  }
  const dansLeTemps = (x) => x.arriveeSec <= arriveBySec
  const habituelle = (liste) => [...liste].sort((a, b) => Number(dansLeTemps(b)) - Number(dansLeTemps(a)) || (dansLeTemps(a) ? b.departSec - a.departSec : a.arriveeSec - b.arriveeSec))[0]

  const vueT = moteur.vueTheorique(j)
  const theoriques = balayage(vueT)
  if (!theoriques.length) return { erreur: 'aucun_trajet', message: 'Aucun trajet trouvé dans les transports du réseau entre ces deux lieux.' }
  const habituel = habituelle(theoriques)

  let vueR = null
  if (cible.aujourdhui && tempsReel) vueR = moteur.vueTempsReel(j, tempsReel, minuitParis(cible.jour))
  let simule = false
  if (incident) {
    const ligneCible = habituel.lignes[0]
    const t0 = habituel.departSec - 300
    vueR = moteur.avecIncident(j, vueR || vueT, ligneCible, t0, t0 + 25 * 60)
    simule = true
  }
  const vue = vueR || vueT
  const rt = vueR ? balayage(vueR) : theoriques

  // L'itinéraire habituel est-il perturbé ? On refait le même trajet (mêmes lignes) aux horaires réels
  let retardSec = 0
  let continuer = null
  const lignesPerturbees = new Set()
  const supprime = habituel.courses.some((c) => vue.annulees.has(c))
  if (vueR) {
    continuer = moteur.retimer(j, vueR, habituel, sortie)
    retardSec = continuer ? continuer.arriveeSec - habituel.arriveeSec : 0
    for (const l of continuer ? continuer.lignesRetard : habituel.lignes) lignesPerturbees.add(l)
  }
  const perturbe = vueR && (supprime || !continuer || retardSec >= SEUIL_RETARD)

  const fiabilite = (x) => {
    if (!vueR) return 'high'
    let pire = 0
    for (const e of x.brut.etapes) if (e.type === 'bus') pire = Math.max(pire, vueR.dep[e.board] - j.depS[e.board])
    return pire >= 600 ? 'low' : pire >= 180 ? 'medium' : 'high'
  }
  const vers = (x, i, extra = {}) => ({
    id: 'n' + i, operator: 'Ilévia', legs: x.legs, durationMin: x.durationMin, departureMin: Math.round(x.departSec / 60), arrivalMin: Math.round(x.arriveeSec / 60),
    transfers: x.transfers, walkMin: x.walkMin, reliability: fiabilite(x), disruptions: [], ...extra,
  })

  const choisir = (liste, n) => {
    // d'abord ceux qui arrivent à l'heure, en partant le plus tard possible, puis les plus courts
    const tries = [...liste].sort((a, b) => Number(dansLeTemps(b)) - Number(dansLeTemps(a)) || (dansLeTemps(a) ? b.departSec - a.departSec || a.durationMin - b.durationMin : a.arriveeSec - b.arriveeSec))
    const pris = []
    const vus = new Set()
    for (const x of tries) {
      const sig = x.lignes.join(',')
      if (vus.has(sig)) continue
      vus.add(sig)
      pris.push(x)
      if (pris.length >= n) break
    }
    return pris
  }

  if (!perturbe) {
    // Trajets variés : le meilleur, puis les meilleurs qui évitent chacune des lignes du premier
    const variantes = habituel.lignes.flatMap((l) => balayage(vue, new Set([l])))
    return { journeys: choisir([...rt, ...variantes], 4).map((x, i) => vers(x, i)), realtime: Boolean(vueR), simulated: simule, day: cible.aujourdhui ? 'today' : 'tomorrow', disruption: null, continueArrivalMin: null }
  }

  // Perturbé : le trajet habituel avec ses horaires réels + des alternatives qui évitent les lignes touchées
  const noms = [...lignesPerturbees].map((l) => moteur.libelleLigne(moteur.lignes[l])).join(', ')
  const retardMin = Math.round(retardSec / 60)
  const message = simule
    ? `Incident simulé sur ${noms} (test : retard de ${retardMin} min). Les horaires du réseau sont réels.`
    : supprime || !continuer ? `Course supprimée sur ${noms} (données temps réel Ilévia).` : `Retard de ${retardMin} min constaté sur ${noms} (données temps réel Ilévia).`
  const arriveeHabituelle = continuer ? continuer.arriveeSec : habituel.arriveeSec
  const habituelReel = vers(habituel, 0, {
    id: 'habituel', habitual: true, arrivalMin: Math.round(arriveeHabituelle / 60), durationMin: Math.round((arriveeHabituelle - habituel.departSec) / 60), reliability: 'low',
    disruptions: [{ id: 'retard', effect: supprime || !continuer ? 'NO_SERVICE' : 'SIGNIFICANT_DELAYS', title: supprime || !continuer ? `Course supprimée (${noms})` : `Retard sur ${noms}`, message, delayMin: retardMin, simulated: simule }],
  })
  // Alternatives : l'utilisateur est au départ à l'heure de son trajet habituel. On cherche les arrivées les plus tôt
  // en évitant les lignes perturbées, puis en variant le premier choix.
  const alt = new Map()
  const essayer = (debutSec, interdites) => {
    const r = moteur.csa(j, vue, o.acces, sortie, debutSec, interdites)
    const tr = r && moteur.enTrajet(j, vue, r, Boolean(d.point), '')
    if (tr && !alt.has(tr.cle)) alt.set(tr.cle, tr)
    return tr
  }
  const t0 = habituel.departSec - 300
  const premiere = essayer(t0, lignesPerturbees)
  if (premiere) essayer(t0, new Set([...lignesPerturbees, ...premiere.lignes]))
  essayer(t0 + 600, lignesPerturbees)
  const alternatives = [...alt.values()].sort((a, b) => a.arriveeSec - b.arriveeSec).slice(0, 3).map((x, i) => vers(x, i + 1))
  return { journeys: [habituelReel, ...alternatives], realtime: Boolean(vueR), simulated: simule, day: cible.aujourdhui ? 'today' : 'tomorrow', disruption: null, continueArrivalMin: null }
}

// ------------------------------------------------------------ chargement des données et fournisseur

async function telecharger(url, fichier, fetchImpl, log) {
  const recent = fs.existsSync(fichier) && Date.now() - fs.statSync(fichier).mtimeMs < 24 * 3600 * 1000
  if (recent) return
  try {
    log(`téléchargement des horaires : ${url}`)
    const rep = await fetchImpl(url, { signal: AbortSignal.timeout(180000) })
    if (!rep.ok) throw new Error('HTTP ' + rep.status)
    fs.mkdirSync(path.dirname(fichier), { recursive: true })
    fs.writeFileSync(fichier + '.tmp', Buffer.from(await rep.arrayBuffer()))
    fs.renameSync(fichier + '.tmp', fichier)
  } catch (e) {
    if (!fs.existsSync(fichier)) throw e
    log('téléchargement impossible, utilisation de la copie existante : ' + e.message)
  }
}

export function lireZip(fichier) {
  const voulus = new Set(['stops.txt', 'routes.txt', 'trips.txt', 'stop_times.txt', 'calendar.txt', 'calendar_dates.txt'])
  const f = unzipSync(new Uint8Array(fs.readFileSync(fichier)), { filter: (x) => voulus.has(x.name) })
  const txt = (nom) => (f[nom] ? strFromU8(f[nom]) : null)
  return { stops: txt('stops.txt'), routes: txt('routes.txt'), trips: txt('trips.txt'), stop_times: txt('stop_times.txt'), calendar: txt('calendar.txt'), calendar_dates: txt('calendar_dates.txt') }
}

export function creerIlevia(config = {}, { fetchImpl = fetch, log = console.log, dossier = 'data/gtfs' } = {}) {
  let moteur = null
  let erreur = null
  let cache = { at: 0, flux: null }
  const adressesEnMemoire = new Map() // recherches d'adresses déjà faites (5 min) : la saisie semi-automatique rappelle souvent les mêmes débuts de mot

  const fluxTempsReel = async () => {
    if (cache.flux && Date.now() - cache.at < 20000) return cache.flux
    try {
      const rep = await fetchImpl(URL_RT, { signal: AbortSignal.timeout(8000) })
      if (!rep.ok) throw new Error('HTTP ' + rep.status)
      const flux = GtfsRt.transit_realtime.FeedMessage.decode(new Uint8Array(await rep.arrayBuffer()))
      cache = { at: Date.now(), flux }
      return flux
    } catch (e) {
      log('temps réel indisponible : ' + e.message)
      return cache.flux // à défaut, le dernier flux connu ou rien (horaires théoriques)
    }
  }

  return {
    name: 'Ilévia (données ouvertes)',
    real: true,
    get ready() { return Boolean(moteur) },
    get error() { return erreur },

    async charger() {
      try {
        const fichier = path.join(dossier, 'ilevia.zip')
        await telecharger(config.gtfsUrl || URL_GTFS, fichier, fetchImpl, log)
        const debut = Date.now()
        moteur = creerMoteur(lireZip(fichier))
        log(`horaires chargés : ${moteur.arrets.length} arrêts, ${moteur.courses.length} courses, en ${Date.now() - debut} ms`)
      } catch (e) {
        erreur = e.message
        throw e
      }
    },

    async places({ q, lat, lon }) {
      if (!moteur) throw new Error('chargement')
      if (q === undefined && lat !== undefined) {
        return [{ id: `addr:${lon.toFixed(5)},${lat.toFixed(5)}`, label: 'Ma position', type: 'address' }, ...moteur.lieuxProches(lat, lon)]
      }
      const arrets = moteur.lieuxParNom(q, 5)
      let adresses = []
      const clePlace = q.toLowerCase().trim()
      const connue = adressesEnMemoire.get(clePlace)
      if (connue && Date.now() - connue.at < 300000) return [...arrets, ...connue.adresses]
      try {
        const url = `${URL_BAN}?q=${encodeURIComponent(q)}&limit=3&lat=50.63&lon=3.06`
        const rep = await fetchImpl(url, { signal: AbortSignal.timeout(4000) })
        if (rep.ok) {
          adresses = (await rep.json()).features
            .filter((f) => f.properties.postcode?.startsWith('59') || f.properties.postcode?.startsWith('62'))
            .map((f) => ({ id: `addr:${f.geometry.coordinates[0].toFixed(5)},${f.geometry.coordinates[1].toFixed(5)}`, label: f.properties.label, type: 'address' }))
          adressesEnMemoire.set(clePlace, { at: Date.now(), adresses }) // on ne mémorise que les réponses réussies
          if (adressesEnMemoire.size > 200) adressesEnMemoire.delete(adressesEnMemoire.keys().next().value)
        }
      } catch { /* sans les adresses, les arrêts restent proposés */ }
      return [...arrets, ...adresses]
    },

    async journeys({ fromId, toId, arriveBy, scenario, incident }) {
      if (!moteur) throw new Error('chargement')
      const r = chercher(moteur, {
        origine: fromId, destination: toId, arriveBySec: hhmmVersSecondes(arriveBy),
        tempsReel: await fluxTempsReel(), incident: incident === true || scenario === 'perturbation',
      })
      if (r.erreur) { const e = new Error(r.message); e.code = r.erreur; e.status = 404; throw e }
      return r
    },
  }
}

export { partiesParis }
