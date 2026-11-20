import React from 'react'
import { Icone } from '../Icones.jsx'
import { Entete, Pastille } from '../composants.jsx'

// Écran « Mes favoris » : les trajets habituels enregistrés par l'utilisateur
export default function Favoris({ app }) {
  const { user, trajetsEnregistres } = app
  return (
    <div className="ecran">
      <Entete onCloche={() => app.aller('alertes')} />

      <h1 className="titre-page">Mes favoris</h1>
      <p className="sous-titre">Vos trajets habituels, surveillés pour vous.</p>

      {!user && (
        <div className="carte-blanche bloc">
          <p>Connectez-vous pour enregistrer votre trajet habituel. TrajetIA le surveille et vous prévient en cas de perturbation.</p>
          <button className="bouton-principal large" onClick={() => app.ouvrirCompte()}>Créer un compte ou me connecter</button>
        </div>
      )}

      {user && trajetsEnregistres.length === 0 && (
        <div className="carte-blanche bloc">
          <p>Aucun favori pour le moment. Lancez une recherche depuis l’accueil, puis touchez « Enregistrer ce trajet ».</p>
          <button className="bouton-contour large" onClick={() => app.aller('accueil')}>Aller à l’accueil</button>
        </div>
      )}

      {trajetsEnregistres.map((t) => (
        <div key={t.id} className={'carte-blanche frequent ' + (t.alertsOn ? 'ok' : '')}>
          <div className="frequent-haut">
            <span className="rond-icone"><Icone nom="home" taille={18} /></span><Icone nom="arrowRight" taille={16} className="fleche" /><span className="rond-icone"><Icone nom="pin" taille={18} /></span>
            <Pastille type={t.alertsOn ? 'vert' : 'gris'}>{t.alertsOn ? 'Alertes activées' : 'Alertes désactivées'}</Pastille>
          </div>
          <div className="frequent-corps">
            <div>
              <b>{t.name}</b>
              <small className="avec-ico"><Icone nom="clock" taille={13} /> Arriver pour : {t.arriveBy}</small>
            </div>
          </div>
          <div className="actions-frequent">
            <button className="bouton-contour" onClick={() => app.ouvrirTrajet(t)}><Icone nom="route" taille={15} /> Voir les trajets</button>
            <button className="bouton-contour" onClick={() => app.basculerAlertes(t)}>{t.alertsOn ? <><Icone nom="bellOff" taille={15} /> Couper les alertes</> : <><Icone nom="bell" taille={15} /> Activer les alertes</>}</button>
            <button className="bouton-contour rouge-texte" onClick={() => app.supprimerTrajet(t.id)} aria-label={'Supprimer ' + t.name}><Icone nom="trash" taille={16} /></button>
          </div>
        </div>
      ))}
    </div>
  )
}
