// ============================================================
//  L'IA de TrajetIA : appel au serveur, qui interroge la vraie IA (API Claude).
//
//  Règles de l'architecture, appliquées côté serveur :
//   - l'IA ne reçoit que des itinéraires, aucune donnée personnelle ;
//   - le serveur vérifie sa réponse avant de nous la renvoyer ;
//   - plan B : si l'IA ne répond pas à temps, on affiche les alternatives
//     classées par heure d'arrivée.
//  Si aucune clé d'IA n'est configurée, le serveur répond « secours » :
//  l'application n'invente jamais de recommandation.
// ============================================================
import { api } from './api.js'
import { enMinutes } from './data.js'

const DELAI_CLIENT_MS = 3500 // un peu plus que le délai serveur (3 s)

function score(t, prefs, arriverPour) {
  let s = t.arrivee
  if (prefs.arriverHeure && t.arrivee > arriverPour) s += 20 + (t.arrivee - arriverPour)
  if (prefs.moinsChangements) s += t.correspondances * 4
  if (prefs.moinsMarche) s += t.marche * 0.5
  if (prefs.eviterRetards) s += t.risque
  return s
}

// Classement d'affichage selon la priorité choisie (arrivee / simplicite / confort)
export function classer(trajets, priorite, prefs, arriverPour) {
  const liste = [...trajets]
  if (priorite === 'simplicite') return liste.sort((a, b) => a.correspondances - b.correspondances || a.arrivee - b.arrivee)
  if (priorite === 'confort') return liste.sort((a, b) => a.marche * 1.5 + a.risque - (b.marche * 1.5 + b.risque) || a.arrivee - b.arrivee)
  return liste.sort((a, b) => score(a, prefs, arriverPour) - score(b, prefs, arriverPour))
}

export function trierParArrivee(trajets) {
  return [...trajets].sort((a, b) => a.arrivee - b.arrivee)
}

const SECOURS = { idTrajet: null, raison: '', source: 'secours' }

export async function demanderRecommandation(trajets, priorite, prefs, arriverPourTexte, continuerArrivee) {
  const demande = {
    alternatives: trajets.map((t) => ({
      id: t.id, durationMin: t.duree, arrivalMin: t.arrivee, transfers: t.correspondances,
      walkMin: t.marche, reliability: t.reliabilite, modes: t.etapes.map((e) => e.mode),
    })),
    arriveByMin: enMinutes(arriverPourTexte),
    continueArrivalMin: continuerArrivee ?? null,
    prefs: {
      priorite, arriverHeure: prefs.arriverHeure, moinsChangements: prefs.moinsChangements,
      moinsMarche: prefs.moinsMarche, eviterRetards: prefs.eviterRetards,
    },
  }
  try {
    const delai = new Promise((_, rejet) => setTimeout(() => rejet(new Error('trop lent')), DELAI_CLIENT_MS))
    const rep = await Promise.race([api.recommander(demande), delai])
    if (rep.source !== 'ia' && rep.source !== 'regles') return { ...SECOURS, cause: rep.cause }
    return { idTrajet: rep.routeId, raison: rep.reason, source: rep.source }
  } catch {
    return { ...SECOURS, cause: 'erreur' }
  }
}
