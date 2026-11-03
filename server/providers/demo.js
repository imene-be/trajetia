// Fournisseur de DÉMONSTRATION : données fictives (scénario du prototype Lille).
// Il n'est utilisé que si ALLOW_DEMO_DATA est actif et qu'aucun vrai fournisseur n'est configuré.
// Toutes les réponses sont marquées `source.real = false` : l'interface affiche
// « Données de démonstration » pour ne jamais les faire passer pour réelles.

const MAINTENANT = 8 * 60 + 26

function trajet(t) {
  const durationMin = t.legs.reduce((s, l) => s + l.minutes, 0) + (t.wait || 0)
  const walkMin = t.legs.filter((l) => l.mode === 'marche').reduce((s, l) => s + l.minutes, 0)
  return { operator: 'Démo', disruptions: [], departureMin: MAINTENANT, ...t, durationMin, walkMin, arrivalMin: MAINTENANT + durationMin }
}
const m = (mode, label, minutes, text) => ({ mode, label, minutes, text })

const NORMAUX = [
  trajet({ id: 'r1', transfers: 0, reliability: 'high', wait: 2, legs: [m('marche', 'Marche', 4, 'Marchez 4 min'), m('metro', 'M1', 14, 'Prendre le métro M1'), m('marche', 'Marche', 6, 'Marchez 6 min')] }),
  trajet({ id: 'r2', transfers: 1, reliability: 'high', legs: [m('train', 'Train', 11, 'Prendre le train'), m('bus', '18', 14, 'Prendre le bus 18'), m('marche', 'Marche', 6, 'Marchez 6 min')] }),
  trajet({ id: 'r3', transfers: 2, reliability: 'medium', legs: [m('bus', '12', 8, 'Prendre le bus 12'), m('tram', 'T', 24, 'Prendre le tram T'), m('marche', 'Marche', 2, 'Marchez 2 min')] }),
]

const ALTERNATIVES = [
  trajet({ id: 'a', transfers: 2, reliability: 'high', legs: [m('marche', 'Marche', 6, 'Marchez 6 min jusqu’à la station'), m('metro', 'Ligne 2', 8, 'Prendre le métro (Ligne 2) jusqu’à République'), m('tram', 'Tram T', 12, 'Prendre le tram T direction Euratechnologies'), m('marche', 'Marche', 2, 'Marchez 2 min')] }),
  trajet({ id: 'b', transfers: 0, reliability: 'high', legs: [m('marche', 'Marche', 8, 'Marchez 8 min jusqu’à l’arrêt'), m('bus', 'Bus', 24, 'Prendre le bus direction Euratechnologies'), m('marche', 'Marche', 4, 'Marchez 4 min')] }),
  trajet({ id: 'c', transfers: 2, reliability: 'medium', wait: 3, legs: [m('marche', 'Marche', 3, 'Marchez 3 min'), m('tram', 'Tram R', 16, 'Prendre le tram R'), m('bus', 'Bus 18', 18, 'Prendre le bus 18 direction Euratechnologies'), m('marche', 'Marche', 2, 'Marchez 2 min')] }),
]

export function creerDemo() {
  return {
    name: 'demo',
    real: false,

    async places({ q }) {
      const base = [
        { id: 'demo:lille-flandres', label: 'Lille Flandres', type: 'stop_area' },
        { id: 'demo:euratechnologies', label: 'Euratechnologies', type: 'stop_area' },
        { id: 'demo:universite', label: 'Université de Lille', type: 'stop_area' },
      ]
      return q ? base.filter((p) => p.label.toLowerCase().includes(q.toLowerCase())) : base
    },

    async journeys({ scenario }) {
      if (scenario === 'perturbation') {
        return {
          journeys: ALTERNATIVES,
          disruption: { line: 'Métro M1', title: 'Ralentissements importants', cause: 'Incident technique à Lille', estimatedMin: 25, untilMin: MAINTENANT + 25 },
          continueArrivalMin: NORMAUX[0].arrivalMin + 26,
        }
      }
      return { journeys: NORMAUX, disruption: null, continueArrivalMin: null }
    },
  }
}
