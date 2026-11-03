// Outils de temps et transformation des itinéraires reçus du serveur.
// (Plus aucune donnée fictive ici : elles viennent maintenant de l'API.)

// Heure d'arrivée proposée par défaut : dans environ une heure (arrondie au quart d'heure),
// pour que les trajets proposés soient ceux du moment, avec le temps réel.
export function heureParDefaut(maintenant = new Date()) {
  const minutes = Math.ceil((maintenant.getHours() * 60 + maintenant.getMinutes() + 60) / 15) * 15
  if (minutes >= 24 * 60) return '09:00'
  return String(Math.floor(minutes / 60)).padStart(2, '0') + ':' + String(minutes % 60).padStart(2, '0')
}
export const ARRIVER_POUR_DEFAUT = heureParDefaut()

export function heure(min) {
  const h = Math.floor(min / 60) % 24
  const m = Math.round(min) % 60
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0')
}

export function enMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

const RISQUE = { high: 0, medium: 3, low: 8 }

// Transforme un itinéraire du serveur en objet utilisé par les écrans
export function versTrajet(j) {
  const badges = []
  if (j.reliability === 'high') badges.push({ texte: 'Trajet stable', type: 'vert', icone: '🛡️' })
  if (j.reliability === 'medium') badges.push({ texte: 'Risque modéré', type: 'orange', icone: '⚠️' })
  if (j.reliability === 'low') badges.push({ texte: 'Perturbation sur le trajet', type: 'orange', icone: '⚠️' })
  if (j.walkMin > 0) badges.push({ texte: j.walkMin + ' min de marche', type: 'gris', icone: '🚶' })
  badges.push({ texte: j.transfers === 0 ? 'Direct' : j.transfers + ' correspondance' + (j.transfers > 1 ? 's' : ''), type: 'gris', icone: '🔁' })
  return {
    id: j.id,
    operateur: j.operator,
    etapes: j.legs.map((l) => ({ mode: l.mode, ligne: l.label, min: l.minutes, texte: l.text })),
    duree: j.durationMin,
    arrivee: j.arrivalMin,
    correspondances: j.transfers,
    marche: j.walkMin,
    reliabilite: j.reliability,
    risque: RISQUE[j.reliability] ?? 3,
    perturbations: j.disruptions || [],
    badges,
  }
}

// Donne une étiquette distincte à chaque trajet (le plus rapide, le plus simple, moins de marche)
export function etiqueter(trajets) {
  const prises = new Set()
  const choisir = (critere, etiquette, type) => {
    const candidat = [...trajets].filter((t) => !prises.has(t.id)).sort(critere)[0]
    if (candidat) { candidat.etiquette = etiquette; candidat.typeEtiquette = type; prises.add(candidat.id) }
  }
  choisir((a, b) => a.arrivee - b.arrivee, 'Le plus rapide', 'vert')
  choisir((a, b) => a.correspondances - b.correspondances || a.arrivee - b.arrivee, 'Le plus simple', 'bleu')
  choisir((a, b) => a.marche - b.marche, 'Moins de marche', 'orange')
  trajets.forEach((t) => { if (!t.etiquette) { t.etiquette = 'Alternative'; t.typeEtiquette = 'gris' } })
  return trajets
}
