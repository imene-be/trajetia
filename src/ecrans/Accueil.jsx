import React from 'react'
import { Entete, LigneEtapes, Pastille } from '../composants.jsx'
import { ChampLieu } from '../formulaires.jsx'
import { heure, enMinutes } from '../data.js'

// Écran 1 : Accueil et trajets proposés
export default function Accueil({ app }) {
  const { depart, arrivee, setDepart, setArrivee, arriverPour, setArriverPour, recherche, prefs } = app
  const limite = enMinutes(arriverPour)

  const echanger = () => {
    setDepart(arrivee)
    setArrivee(depart)
  }

  return (
    <div className="ecran">
      <Entete decor onCloche={() => app.aller('alertes')} />

      <h1 className="titre-accueil">Bonjour !</h1>
      <p className="sous-titre">Des trajets plus sereins, même en cas de perturbations.</p>

      <button className="bandeau-ia" onClick={() => app.aller('alertes')}>
        <span className="etincelle">✦</span>
        <span><b>IA pour anticiper les perturbations</b><small>Des itinéraires plus fiables, en temps réel.</small></span>
        <span className="chevron">›</span>
      </button>

      <div className="carte-blanche formulaire">
        <div className="ab">
          <div className="pastille-ab">A</div>
          <div className="trait-ab" />
          <div className="pastille-ab">B</div>
        </div>
        <div className="champs">
          <ChampLieu etiquette="Départ" lieu={depart} onChoisir={setDepart} onPosition={prefs.position ? app.utiliserPosition : null} />
          <ChampLieu etiquette="Arrivée" lieu={arrivee} onChoisir={setArrivee} />
        </div>
        <button className="bouton-rond echange" onClick={echanger} aria-label="Inverser départ et arrivée">⇅</button>
      </div>

      <div className="ligne-recherche">
        <label className="champ-heure">
          <span>🕘 Arriver pour</span>
          <input type="time" value={arriverPour} onChange={(e) => setArriverPour(e.target.value)} />
        </label>
        <button className="bouton-principal" onClick={() => app.chercher()}>Rechercher ↗</button>
      </div>

      <div className="modes" aria-hidden="true">
        <span className="mode-chip"><i className="icone train">🚆</i>Train</span>
        <span className="mode-chip"><i className="icone metro">M</i>Métro</span>
        <span className="mode-chip"><i className="icone tram">🚋</i>Tram</span>
        <span className="mode-chip"><i className="icone bus">🚌</i>Bus</span>
        <span className="mode-chip"><i className="icone marche">🚶</i>Marche</span>
      </div>

      {recherche.perturbation && (
        <button className="alerte-orange cliquable" onClick={() => app.aller('perturbation')}>
          <span className="rond-alerte">!</span>
          <span><b>Perturbation détectée sur votre trajet</b><small>Voir l’impact sur votre heure d’arrivée et les alternatives.</small></span>
          <span className="chevron">›</span>
        </button>
      )}

      <div className="titre-liste">
        <h2>Trajets proposés</h2>
        <button className="lien" onClick={app.enregistrerTrajet}>＋ Enregistrer ce trajet</button>
      </div>

      {recherche.etat === 'ok' && (
        <div className="note gris marge">
          {recherche.jour === 'tomorrow'
            ? `📅 Horaires de demain à ${arriverPour} : horaires officiels du réseau (le temps réel ne concerne que les trajets du moment).`
            : recherche.tempsReel ? '📡 Retards et suppressions du moment pris en compte (temps réel Ilévia).' : '🕘 Horaires officiels du réseau (temps réel indisponible pour le moment).'}
        </div>
      )}
      {recherche.etat === 'vide' && <div className="note gris">Choisissez un départ et une arrivée parmi les suggestions, puis lancez la recherche.</div>}
      {recherche.etat === 'chargement' && <div className="chargement"><span className="rouleau" /><b>Recherche des meilleurs trajets…</b></div>}
      {recherche.etat === 'erreur' && <div className="note orange" role="alert">⚠️ {recherche.erreur}</div>}
      {recherche.etat === 'ok' && recherche.trajets.length === 0 && <div className="note gris">Aucun trajet trouvé pour cette recherche.</div>}

      {recherche.etat === 'ok' && recherche.trajets.map((t, i) => {
        const enRetard = t.arrivee > limite
        return (
          <div key={t.id} className={'carte-blanche trajet' + (i === 0 ? ' meilleur' : '')}>
            <div className="trajet-haut">
              <div>
                <div className="duree">{t.duree} min</div>
                <div className={'arrivee' + (enRetard ? ' rouge' : '')}>
                  {enRetard ? 'Arrive après ' + arriverPour + ' · ' : ''}Arrivée {heure(t.arrivee)}
                </div>
              </div>
              <Pastille type={t.typeEtiquette}>{t.etiquette}</Pastille>
            </div>
            <LigneEtapes etapes={t.etapes} />
            <div className="badges">
              {t.badges.map((b) => <Pastille key={b.texte} type={b.type} icone={b.icone}>{b.texte}</Pastille>)}
            </div>
            <button className="bouton-contour large" onClick={() => app.choisir(t)}>Suivre ce trajet →</button>
          </div>
        )
      })}

      {recherche.etat === 'ok' && recherche.simule && (
        <div className="note orange marge">🧪 Incident simulé actif (test). Relancez la recherche pour revenir à la situation réelle.</div>
      )}
      {recherche.etat === 'ok' && recherche.trajets.length > 0 && (
        <button className="bouton-demo" onClick={app.simuler}>
          🧪 Tester : simuler un incident sur ma ligne (horaires réels)
        </button>
      )}
    </div>
  )
}
