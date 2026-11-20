import React from 'react'
import { Icone } from '../Icones.jsx'
import { Entete, Pastille, Interrupteur } from '../composants.jsx'

const PREFERENCES = [
  ['arriverHeure', 'clock', 'Arriver à l’heure', 'Priorité haute'],
  ['moinsChangements', 'transfer', 'Moins de changements', 'À privilégier'],
  ['moinsMarche', 'walk', 'Moins de marche', 'Si possible'],
  ['eviterRetards', 'shieldCheck', 'Éviter les retards', 'Alertes renforcées'],
]

const quand = (iso) => {
  const d = new Date(iso)
  return d.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

// Écran 5 : Alertes intelligentes
export default function Alertes({ app }) {
  const { user, trajetsEnregistres, alertes } = app
  return (
    <div className="ecran">
      <Entete onCloche={() => {}} />

      <h1 className="titre-page">Alertes intelligentes</h1>
      <p className="sous-titre">Anticipez, adaptez, voyagez plus sereinement.</p>

      <div className="titre-liste">
        <h2>Mes trajets fréquents</h2>
      </div>

      {!user && (
        <div className="carte-blanche bloc">
          <p>Connectez-vous pour enregistrer vos trajets habituels. TrajetIA les surveille et vous prévient en cas de perturbation.</p>
          <button className="bouton-principal large" onClick={() => app.ouvrirCompte()}>Créer un compte ou me connecter</button>
        </div>
      )}

      {user && trajetsEnregistres.length === 0 && (
        <div className="carte-blanche bloc">
          <p>Aucun trajet enregistré. Lancez une recherche depuis l’accueil, puis touchez « Enregistrer ce trajet ».</p>
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

      <div className="titre-liste">
        <h2>Préférences IA</h2>
      </div>
      <p className="sous-titre petit">L’IA personnalise ses recommandations selon vos priorités.</p>

      <div className="grille-prefs">
        {PREFERENCES.map(([cle, icone, nom, sous]) => (
          <div key={cle} className="carte-blanche pref">
            <span className="rond-icone petit"><Icone nom={icone} taille={16} /></span>
            <span><b>{nom}</b><small>{sous}</small></span>
            <Interrupteur actif={app.prefs[cle]} onChange={(v) => app.changerPref(cle, v)} label={nom} />
          </div>
        ))}
      </div>

      <div className="bandeau-donnees">
        <span className="cadenas"><Icone nom="lock" taille={18} /></span>
        <span>
          <b>Vos données de trajet restent sous votre contrôle</b>
          <small>Nous utilisons uniquement vos trajets enregistrés pour vous envoyer des alertes. L’IA ne reçoit aucune donnée personnelle.</small>
        </span>
        <button className="lien" onClick={() => app.aller('profil')}>En savoir plus</button>
      </div>

      <div className="titre-liste">
        <h2>Alertes récentes</h2>
      </div>

      <div className="carte-blanche liste-alertes">
        {alertes.length === 0 && <p className="vide">Aucune alerte pour le moment.</p>}
        {alertes.map((a) => (
          <div key={a.id} className="ligne-alerte">
            <span className="rond-type warn"><Icone nom="alert" taille={16} /></span>
            <span><b>{a.title}</b><small>{quand(a.created_at)} · {a.body}</small></span>
          </div>
        ))}
      </div>
    </div>
  )
}
