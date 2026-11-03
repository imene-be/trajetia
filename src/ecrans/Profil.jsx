import React, { useState } from 'react'
import { Entete, Interrupteur } from '../composants.jsx'
import { api, canal } from '../api.js'

// Profil : compte, confidentialité, état réel des services
export default function Profil({ app }) {
  const { user, sante } = app
  const [fraicheur, setFraicheur] = useState(null)
  const source = sante?.source

  const mesurer = async () => {
    setFraicheur('mesure…')
    try {
      const r = (await api.fraicheur()).reseaux[0]
      setFraicheur(`${r.reseau} : flux vieux de ${r.ageSecondes} s, ${r.miseAJourDeCourses} courses suivies`)
    } catch (e) { setFraicheur('Mesure impossible : ' + e.message) }
  }

  return (
    <div className="ecran">
      <Entete onCloche={() => app.aller('alertes')} />

      <h1 className="titre-page">Profil</h1>
      <p className="sous-titre">{user ? user.email : 'Vous utilisez TrajetIA sans compte.'}</p>

      {!user ? (
        <div className="carte-blanche bloc">
          <h3>Sans compte, tout de suite</h3>
          <p>Vous pouvez chercher des trajets sans vous inscrire. Un compte n’est nécessaire que pour enregistrer vos trajets et recevoir des alertes.</p>
          <button className="bouton-principal large" onClick={() => app.ouvrirCompte()}>Créer un compte ou me connecter</button>
        </div>
      ) : (
        <div className="carte-blanche bloc">
          <h3>Mon compte</h3>
          <button className="bouton-contour large" onClick={app.deconnexion}>Me déconnecter</button>
        </div>
      )}

      <div className="carte-blanche bloc">
        <h3>Vos choix</h3>
        <div className="ligne-reglage">
          <span><b>Utiliser ma position</b><small>Facultatif. Sert à trouver l’arrêt le plus proche, n’est jamais enregistrée. Le navigateur demande aussi votre accord.</small></span>
          <Interrupteur actif={app.prefs.position} onChange={(v) => app.changerPref('position', v)} label="Position" />
        </div>
        <div className="ligne-reglage">
          <span><b>Notifications</b><small>Être prévenu d’une perturbation même si l’application est fermée.</small></span>
          <Interrupteur actif={app.prefs.notifications} onChange={app.basculerNotifications} label="Notifications" />
        </div>
        {user && app.prefs.notifications && (
          <button className="bouton-contour large" onClick={app.testerNotification}>🔔 Envoyer une notification de test</button>
        )}
      </div>

      <div className="carte-blanche bloc">
        <h3>Vos données</h3>
        <ul>
          <li>Enregistrées sur notre serveur : e-mail, trajets habituels, préférences et alertes.</li>
          <li>Jamais envoyées à l’IA : elle ne reçoit que des itinéraires.</li>
          <li>Vous pouvez les télécharger ou les supprimer à tout moment (RGPD).</li>
        </ul>
        {user && (
          <>
            <button className="bouton-contour large" onClick={app.exporter}>Télécharger mes données</button>
            <button className="bouton-contour large rouge-texte" onClick={app.supprimerCompte}>Supprimer mon compte et mes données</button>
          </>
        )}
      </div>

      <div className="carte-blanche bloc demo">
        <h3>État des services</h3>
        <ul>
          <li>Données de transport : <b>{source ? (source.real ? 'réelles (' + source.name + ')' : 'démonstration (fictives)') : 'non configurées'}</b></li>
          <li>Recommandation : <b>{sante?.ia ? 'IA ' + (sante.iaModele || '') + ' (active)' : 'automatique par règles (gratuit, sans IA générative)'}</b></li>
          <li>Notifications : <b>{sante?.push ? 'configurées' : 'non configurées sur le serveur'}</b></li>
          <li>Canal d’arrivée : <b>{canal()}</b></li>
        </ul>
        <button className="bouton-contour large" onClick={mesurer}>Mesurer la fraîcheur des données Ilévia (réel)</button>
        {fraicheur && <div className="note gris">{fraicheur}</div>}
      </div>
    </div>
  )
}
