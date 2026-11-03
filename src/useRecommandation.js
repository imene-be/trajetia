import { useEffect, useState } from 'react'
import { demanderRecommandation } from './ia.js'

// Demande la recommandation de l'IA et dit où on en est :
//  active = false : pas d'appel (l'IA n'est utilisée que lorsqu'une perturbation touche un trajet)
//  statut = 'sans' | 'chargement' | 'ia' (vraie IA) | 'regles' (recommandation automatique gratuite) | 'secours' (plan B)
export function useRecommandation(trajets, priorite, prefs, arriverPour, continuerArrivee, active = true) {
  const [etat, setEtat] = useState({ statut: active ? 'chargement' : 'sans', reco: null })
  const cle = trajets.map((t) => t.id + ':' + t.arrivee).join('|')

  useEffect(() => {
    let actif = true
    if (!active) { setEtat({ statut: 'sans', reco: null }); return undefined }
    setEtat({ statut: 'chargement', reco: null })
    if (trajets.length === 0) { setEtat({ statut: 'secours', reco: null }); return undefined }
    demanderRecommandation(trajets, priorite, prefs, arriverPour, continuerArrivee).then((reco) => {
      if (actif) setEtat({ statut: reco.source === 'ia' || reco.source === 'regles' ? reco.source : 'secours', reco })
    })
    return () => { actif = false }
  }, [active, cle, priorite, arriverPour, prefs.arriverHeure, prefs.moinsChangements, prefs.moinsMarche, prefs.eviterRetards])

  return etat
}
