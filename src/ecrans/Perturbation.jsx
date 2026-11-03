import React from 'react'
import { Entete, IconeMode, Pastille } from '../composants.jsx'
import { heure, enMinutes } from '../data.js'
import { trierParArrivee } from '../ia.js'
import { useRecommandation } from '../useRecommandation.js'

const sansHtml = (texte) => String(texte).replace(/<[^>]+>/g, '')

// Écran 2 : Perturbation détectée + recommandation de l'IA
export default function Perturbation({ app }) {
  const info = app.recherche.perturbation
  if (!info) {
    return (
      <div className="ecran">
        <Entete onRetour={() => app.aller('accueil')} onCloche={() => app.aller('alertes')} />
        <h1 className="titre-page">Aucune perturbation</h1>
        <p className="sous-titre">Aucune perturbation n’a été détectée sur votre recherche actuelle.</p>
        <button className="bouton-principal large" onClick={() => app.aller('accueil')}>Retour à l’accueil</button>
      </div>
    )
  }
  return <Detail app={app} info={info} />
}

function Detail({ app, info }) {
  const alternatives = info.alternatives
  const { statut, reco } = useRecommandation(alternatives, 'arrivee', app.prefs, app.arriverPour, info.continuerArrivee)
  const reussi = statut === 'ia' || statut === 'regles'
  const limite = enMinutes(app.arriverPour)

  // Les heures viennent des opérateurs : on les affiche tout de suite, sans attendre l'IA
  const prioritaire = (reussi && alternatives.find((t) => t.id === reco.idTrajet)) || trierParArrivee(alternatives)[0]
  const gain = info.continuerArrivee - prioritaire.arrivee
  const retard = info.continuerArrivee - limite
  const ecart = prioritaire.arrivee - limite

  const transports = prioritaire.etapes
    .filter((e) => e.mode !== 'marche')
    .map((e) => sansHtml(e.texte).replace(/^Prendre /, ''))
    .join(', puis ')

  return (
    <div className="ecran">
      <Entete onRetour={() => app.aller('accueil')} onCloche={() => app.aller('alertes')} />

      <div className="carte-blanche formulaire compact">
        <div className="ab">
          <div className="pastille-ab">A</div><div className="trait-ab" /><div className="pastille-ab">B</div>
        </div>
        <div className="champs">
          <div className="champ"><small>Départ</small><b>{app.depart?.label}</b></div>
          <div className="champ"><small>Arrivée</small><b>{app.arrivee?.label}</b></div>
        </div>
        <span className="bouton-rond echange">⇅</span>
      </div>

      <div className="alerte-orange">
        <div className="alerte-haut">
          <span className="rond-alerte">!</span>
          <h2>Perturbation détectée</h2>
          <Pastille type="orange-doux">● En cours</Pastille>
        </div>
        <p>Votre itinéraire habituel est impacté. {info.cause ? info.cause : ''}</p>
      </div>

      <div className="carte-blanche comparaison">
        <div className="comp-ligne">
          <span className="icone bus">🚌</span>
          <div><b>Si vous continuez</b><small>Arrivée estimée à</small></div>
          <div className="comp-heure">
            <span className="grand rouge">{heure(info.continuerArrivee)}</span>
            {retard > 0 && <Pastille type="rouge-doux">+ {retard} min après {app.arriverPour}</Pastille>}
          </div>
        </div>
        <div className="comp-ligne ia">
          <span className="icone eclair">⚡</span>
          <div>
            <b>{gain <= 0 ? 'Meilleure alternative' : reussi ? 'En suivant l’itinéraire prioritaire' : 'En suivant le trajet le plus rapide'}</b>
            <small>Arrivée estimée à</small>
          </div>
          <div className="comp-heure">
            <span className="grand vert">{heure(prioritaire.arrivee)}</span>
            <Pastille type="vert-doux">{ecart <= 0 ? '− ' + Math.abs(ecart) + ' min avant ' + app.arriverPour : '+ ' + ecart + ' min'}</Pastille>
          </div>
        </div>
      </div>

      <div className="carte-blanche reco">
        <div className="reco-haut">
          <h3><span className="etincelle">✦</span> {statut === 'ia' ? 'Recommandation IA' : 'Recommandation automatique'}</h3>
          {reussi && (
            <Pastille type="vert" icone="🛡️">{prioritaire.risque === 0 ? 'Fiabilité élevée' : 'Fiabilité moyenne'}</Pastille>
          )}
        </div>

        {statut === 'chargement' && (
          <div className="chargement">
            <span className="rouleau" />
            <div>
              <b>L’IA analyse les alternatives…</b>
              <small>Si elle met plus de 3 secondes, nous affichons les alternatives par heure d’arrivée.</small>
            </div>
          </div>
        )}

        {reussi && (
          <>
            <p className="texte-reco">{reco.raison}</p>
            <p className="texte-reco">
              Itinéraire : {transports || 'à pied'}.{' '}
              {gain > 0
                ? <>Il vous fait gagner environ <b>{gain} minutes</b> par rapport à votre trajet perturbé.</>
                : <>Aucune alternative n’arrive plus tôt que votre trajet habituel ({heure(info.continuerArrivee)}) : l’incident vous fait perdre moins de temps qu’un détour.</>}
            </p>
            <Etapes trajet={prioritaire} />
          </>
        )}

        {statut === 'secours' && (
          <>
            <div className="note orange">
              ⏱️ La recommandation de l’IA n’est pas disponible. Voici les alternatives, classées par heure d’arrivée.
            </div>
            <div className="liste-etapes">
              {trierParArrivee(alternatives).map((t) => (
                <button key={t.id} className="ligne-etape bouton-ligne" onClick={() => app.choisir(t)}>
                  <b>{heure(t.arrivee)}</b>
                  <span className="texte-etape">{t.duree} min · {t.correspondances} correspondance(s)</span>
                  <span className="chevron">›</span>
                </button>
              ))}
            </div>
          </>
        )}

        <button className="bouton-principal large" onClick={() => app.choisir(prioritaire)}>
          {reussi ? 'Suivre le trajet prioritaire' : 'Suivre le trajet le plus rapide'} →
        </button>
        <button className="bouton-contour large" onClick={() => app.aller('itineraires')}>Voir d’autres options →</button>
      </div>

      <div className="detail-perturbation">
        <span className="icone metro grand-icone">!</span>
        <div>
          <b>Détail de la perturbation</b>
          <div>{info.ligne}{info.titre && info.titre !== info.ligne ? ' – ' + info.titre : ''}</div>
          {info.cause && <small>{info.cause}</small>}
        </div>
        {info.dureeMin != null && (
          <div className="duree-pert">
            <small>Retard estimé</small>
            <b>≈ {info.dureeMin} min</b>
            {info.jusqua != null && <small>Jusqu’à {heure(info.jusqua)}</small>}
          </div>
        )}
      </div>
    </div>
  )
}

function Etapes({ trajet }) {
  return (
    <div className="liste-etapes">
      {trajet.etapes.map((e, i) => (
        <div key={i} className="ligne-etape">
          <IconeMode mode={e.mode} />
          <span className="texte-etape">{sansHtml(e.texte)}</span>
          <small>{e.min} min</small>
        </div>
      ))}
    </div>
  )
}
