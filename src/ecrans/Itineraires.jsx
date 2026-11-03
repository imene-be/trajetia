import React from 'react'
import { Entete, LigneEtapes, Pastille } from '../composants.jsx'
import { heure, enMinutes } from '../data.js'
import { classer, trierParArrivee } from '../ia.js'
import { useRecommandation } from '../useRecommandation.js'

const PRIORITES = [
  ['arrivee', '🕘', 'Heure d’arrivée'],
  ['simplicite', '🔀', 'Simplicité'],
  ['confort', '🍃', 'Confort'],
]

// Écran 3 : Itinéraires alternatifs
export default function Itineraires({ app }) {
  const info = app.recherche.perturbation
  const trajets = info ? info.alternatives : app.recherche.trajets
  if (trajets.length === 0) {
    return (
      <div className="ecran">
        <Entete onRetour={() => app.aller('accueil')} onCloche={() => app.aller('alertes')} />
        <h1 className="titre-page">Itinéraires</h1>
        <p className="sous-titre">Lancez d’abord une recherche depuis l’accueil.</p>
        <button className="bouton-principal large" onClick={() => app.aller('accueil')}>Aller à l’accueil</button>
      </div>
    )
  }
  return <Liste app={app} info={info} trajets={trajets} />
}

function Liste({ app, info, trajets }) {
  const [priorite, setPriorite] = React.useState(app.prefs.priorite || 'arrivee')
  const { prefs, arriverPour } = app
  const { statut, reco } = useRecommandation(trajets, priorite, prefs, arriverPour, info?.continuerArrivee, Boolean(info))
  const limite = enMinutes(arriverPour)

  // Si l'IA ne répond pas à temps : tri par heure d'arrivée, sans explication
  const liste = statut === 'secours' ? trierParArrivee(trajets) : classer(trajets, priorite, prefs, limite)

  return (
    <div className="ecran">
      <Entete onRetour={() => app.aller('accueil')} onCloche={() => app.aller('alertes')} />

      <h1 className="titre-page">Itinéraires alternatifs</h1>
      <p className="sous-titre">{app.depart?.label} → {app.arrivee?.label}</p>

      {info && (
        <button className="alerte-orange cliquable" onClick={() => app.aller('perturbation')}>
          <span className="rond-alerte">!</span>
          <span>
            <b>Perturbation sur votre itinéraire habituel</b>
            <small>{info.ligne}. Voici des itinéraires alternatifs.</small>
          </span>
          <span className="chevron">›</span>
        </button>
      )}

      <div className="priorites">
        <span>Prioriser :</span>
        {PRIORITES.map(([id, icone, nom]) => (
          <button key={id} className={'chip' + (priorite === id ? ' actif' : '')} onClick={() => setPriorite(id)}>
            {icone} {nom}
          </button>
        ))}
      </div>

      {statut === 'secours' && (
        <div className="note orange marge">⏱️ La recommandation de l’IA n’est pas disponible : alternatives classées par heure d’arrivée.</div>
      )}

      {liste.map((t, i) => {
        const recommande = i === 0 && (statut === 'ia' || statut === 'regles' || statut === 'chargement')
        return (
          <div key={t.id} className={'carte-blanche trajet' + (recommande ? ' meilleur' : '')}>
            <div className="trajet-haut">
              <div>
                <div className="duree">{t.duree} min</div>
                <div className={'arrivee' + (t.arrivee > limite ? ' rouge' : '')}>Arrivée {heure(t.arrivee)}</div>
              </div>
              <Pastille type={t.typeEtiquette}>{t.etiquette}</Pastille>
            </div>
            <LigneEtapes etapes={t.etapes} avecLigne />
            <div className="badges">
              {t.badges.map((b) => <Pastille key={b.texte} type={b.type} icone={b.icone}>{b.texte}</Pastille>)}
            </div>

            {recommande && (
              <div className="boite-ia">
                <span className="etincelle">✦</span>
                <span>
                  <b>{statut === 'ia' ? 'Itinéraire recommandé par l’IA' : 'Itinéraire recommandé'}</b>
                  <small>{statut === 'chargement' ? 'L’IA analyse les alternatives…' : reco.raison}</small>
                </span>
              </div>
            )}
            <button className={recommande ? 'bouton-principal large' : 'bouton-contour large'} onClick={() => app.choisir(t)}>
              Choisir cet itinéraire →
            </button>
          </div>
        )
      })}
    </div>
  )
}
