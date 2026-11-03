import React from 'react'
import { Entete, IconeMode, Pastille } from '../composants.jsx'
import { heure } from '../data.js'

// Écran 4 : Trajet en cours
export default function TrajetEnCours({ app }) {
  const trajet = app.choix
  if (!trajet) {
    return (
      <div className="ecran">
        <Entete onCloche={() => app.aller('alertes')} />
        <h1 className="titre-page">Trajet en cours</h1>
        <p className="sous-titre">Aucun trajet sélectionné. Choisissez un itinéraire pour le suivre.</p>
        <button className="bouton-principal large" onClick={() => app.aller('accueil')}>Choisir un trajet</button>
      </div>
    )
  }
  const { etape, setEtape } = app
  const etapes = trajet.etapes
  const termine = etape >= etapes.length

  const ecoule = etapes.slice(0, etape).reduce((somme, e) => somme + e.min, 0)
  const reste = Math.max(trajet.duree - ecoule, 0)
  const courante = etapes[etape]
  const suivantes = etapes.slice(etape + 1)

  return (
    <div className="ecran">
      <Entete onCloche={() => app.aller('alertes')} />

      <div className="en-cours-haut">
        <div>
          <h1 className="titre-page">Trajet en cours</h1>
          <p className="sous-titre">{app.depart?.label} → {app.arrivee?.label}</p>
          <Pastille type="vert" icone="⚡">Trajet choisi : {trajet.etiquette.toLowerCase()}</Pastille>
        </div>
        <div className="eta">
          <small>Arrivée estimée</small>
          <b>{heure(trajet.arrivee)}</b>
          <span>{termine ? 'Vous êtes arrivé' : 'dans ' + reste + ' min'}</span>
        </div>
      </div>

      <div className="carte-blanche progression">
        {etapes.map((e, i) => (
          <div key={i} className={'pas' + (i < etape ? ' fait' : i === etape ? ' courant' : '')}>
            <div className="pas-haut"><IconeMode mode={e.mode} /><span><b>{e.mode === 'marche' ? 'Marche' : e.ligne}</b><small>{e.min} min</small></span></div>
            <div className="barre"><span /></div>
          </div>
        ))}
      </div>

      {termine ? (
        <div className="carte-blanche etape-courante arrive">
          <h3>🎉 Vous êtes arrivé à {app.arrivee?.label}</h3>
          <p>Arrivée prévue à {heure(trajet.arrivee)}.</p>
          <button className="bouton-contour large" onClick={() => setEtape(0)}>Revoir le trajet</button>
        </div>
      ) : (
        <div className="carte-blanche etape-courante">
          <div className="etape-haut">
            <IconeMode mode={courante.mode} />
            <div>
              <small>Prochaine étape</small>
              <div className="texte-etape gros" dangerouslySetInnerHTML={{ __html: courante.texte }} />
            </div>
            <span className="temps">🕘 {courante.min} min</span>
          </div>
          <button className="bouton-principal large" onClick={() => setEtape(etape + 1)}>
            ➤ Étape terminée (démo)
          </button>
        </div>
      )}

      {suivantes.length > 0 && (
        <div className="carte-blanche suivantes">
          <h3>Étapes suivantes</h3>
          {suivantes.map((e, i) => (
            <div key={i} className="ligne-etape">
              <IconeMode mode={e.mode} />
              <span className="texte-etape" dangerouslySetInnerHTML={{ __html: e.texte }} />
              <small className="temps">{e.min} min</small>
            </div>
          ))}
        </div>
      )}

      <div className="note vert surveille">
        🛡️ <span><b>Suivi du trajet</b><br /><small>Le suivi en direct pendant le trajet n’est pas encore disponible : utilisez « Recalculer » pour actualiser.</small></span>
      </div>

      <div className="trois-boutons">
        <button onClick={() => app.chercher().then((t) => t && app.toast('Trajets actualisés'))}>↻ Recalculer</button>
        <button onClick={() => app.partager(trajet)}>⇪ Partager mon ETA</button>
        <button className="rouge" onClick={app.enregistrerTrajet}>🔔 Me prévenir en cas de retard</button>
      </div>
    </div>
  )
}
