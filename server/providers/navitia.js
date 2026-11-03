// Fournisseur RÉEL : API Navitia (couvre les trains SNCF et, selon la région choisie,
// des réseaux urbains comme Ilévia, IDFM ou TCL).
// Nécessite un jeton gratuit à demander sur https://navitia.io (NAVITIA_TOKEN).
//
// ⚠️ Ce fichier n'a PAS été testé contre le vrai service (pas de jeton à ce jour).
// Seule la transformation des réponses est testée, avec un exemple écrit à la main
// d'après la documentation. À valider dès réception du jeton.

const MODES = {
  Metro: 'metro', Tramway: 'tram', Bus: 'bus', BusRapidTransit: 'bus', Coach: 'bus',
  Train: 'train', LocalTrain: 'train', LongDistanceTrain: 'train', RapidTransit: 'train', Funicular: 'tram',
}
const EFFETS_GRAVES = new Set(['NO_SERVICE', 'SIGNIFICANT_DELAYS', 'DETOUR', 'REDUCED_SERVICE', 'MODIFIED_SERVICE'])

// 'YYYYMMDDTHHMMSS' (heure locale) -> minutes depuis minuit
export function minutesDuJour(dateNavitia) {
  const m = /T(\d{2})(\d{2})/.exec(dateNavitia || '')
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}

function modeDe(section) {
  const physique = (section.display_informations?.physical_mode || '').replace(/^physical_mode:/, '')
  return MODES[physique] || MODES[section.display_informations?.commercial_mode] || 'bus'
}

// Transforme un trajet Navitia au format interne de TrajetIA
export function transformerTrajet(j, index, perturbations = {}) {
  const etapes = []
  const perturbationsDuTrajet = new Map()
  let marche = 0
  let correspondances = 0
  for (const s of j.sections || []) {
    const minutes = Math.max(1, Math.round((s.duration || 0) / 60))
    if (s.type === 'street_network' || s.type === 'crow_fly' || s.type === 'transfer') {
      if (s.type === 'transfer') correspondances++
      if (s.duration) { etapes.push({ mode: 'marche', label: 'Marche', minutes, text: `Marchez ${minutes} min` }); marche += minutes }
    } else if (s.type === 'public_transport') {
      const info = s.display_informations || {}
      const mode = modeDe(s)
      const ligne = info.label || info.name || info.commercial_mode || ''
      etapes.push({
        mode, label: ligne, minutes,
        text: `Prendre ${info.commercial_mode ? info.commercial_mode.toLowerCase() + ' ' : ''}${ligne}${info.direction ? ' direction ' + info.direction : ''}${s.to?.name ? ' jusqu’à ' + s.to.name : ''}`.trim(),
      })
      for (const lien of s.links || []) {
        if (lien.type === 'disruption' && perturbations[lien.id]) perturbationsDuTrajet.set(lien.id, perturbations[lien.id])
      }
    }
  }
  const liste = [...perturbationsDuTrajet.values()]
  const grave = liste.some((p) => EFFETS_GRAVES.has(p.effect))
  return {
    id: `n${index}`,
    operator: j.sections?.find((s) => s.display_informations?.network)?.display_informations.network || 'Réseau',
    legs: etapes,
    durationMin: Math.round((j.duration || 0) / 60),
    departureMin: minutesDuJour(j.departure_date_time),
    arrivalMin: minutesDuJour(j.arrival_date_time),
    transfers: j.nb_transfers ?? correspondances,
    walkMin: marche,
    reliability: grave ? 'low' : liste.length ? 'medium' : 'high',
    disruptions: liste,
  }
}

export function indexerPerturbations(liste = []) {
  const index = {}
  for (const d of liste) {
    index[d.id] = {
      id: d.id,
      effect: d.severity?.effect || '',
      title: d.severity?.name || 'Perturbation',
      message: (d.messages || [])[0]?.text || d.cause || '',
    }
  }
  return index
}

export function creerNavitia(config, fetchImpl = fetch) {
  async function appeler(chemin, params) {
    const url = new URL(config.navitiaBase + `/coverage/${config.navitiaCoverage}` + chemin)
    for (const [k, v] of Object.entries(params || {})) url.searchParams.set(k, v)
    const rep = await fetchImpl(url, { headers: { Authorization: config.navitiaToken }, signal: AbortSignal.timeout(8000) })
    if (rep.status === 401 || rep.status === 403) throw new Error('navitia_jeton_refuse')
    if (!rep.ok && rep.status !== 404) throw new Error('navitia_erreur_' + rep.status)
    return rep.status === 404 ? {} : rep.json()
  }

  return {
    name: 'navitia',
    real: true,

    async places({ q, lat, lon }) {
      const donnees = q
        ? await appeler('/places', { q, count: '6', 'type[]': 'stop_area' })
        : await appeler(`/coords/${lon};${lat}/places_nearby`, { count: '5', 'type[]': 'stop_area' })
      const lieux = donnees.places || donnees.places_nearby || []
      return lieux.map((p) => ({ id: p.id, label: p.name, type: p.embedded_type }))
    },

    // arriveBy = 'HH:MM' aujourd'hui. Les données sont en temps réel (data_freshness=realtime).
    async journeys({ fromId, toId, arriveBy, dateIso }) {
      const jour = (dateIso || new Date().toISOString().slice(0, 10)).replaceAll('-', '')
      const donnees = await appeler('/journeys', {
        from: fromId, to: toId, datetime: `${jour}T${arriveBy.replace(':', '')}00`, datetime_represents: 'arrival',
        data_freshness: 'realtime', count: '4',
      })
      const perturbations = indexerPerturbations(donnees.disruptions)
      return {
        journeys: (donnees.journeys || []).map((j, i) => transformerTrajet(j, i, perturbations)),
        disruption: null,
        continueArrivalMin: null,
      }
    },
  }
}
