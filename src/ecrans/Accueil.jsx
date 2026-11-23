import React, { useState } from 'react'
import { Icone } from '../Icones.jsx'
import { Entete, LigneEtapes, Pastille } from '../composants.jsx'
import { ChampLieu } from '../formulaires.jsx'
import { heure, enMinutes } from '../data.js'
import Carte from '../Carte.jsx'

// Écran 1 : Accueil et trajets proposés
export default function Accueil({ app }) {
  const { depart, arrivee, setDepart, setArrivee, arriverPour, setArriverPour, recherche, prefs } = app
  const limite = enMinutes(arriverPour)
  // Trajet dessiné sur la carte : celui que l'utilisateur a touché, sinon le premier de la liste
  const [selection, setSelection] = useState(null)
  const trajets = recherche.etat === 'ok' ? recherche.trajets : []
  const affiche = trajets.find((t) => t.id === selection) || trajets[0] || null

  const echanger = () => {
    setDepart(arrivee)
    setArrivee(depart)
  }

  return (
    <div className="ecran">
      <Entete onCloche={() => app.aller('alertes')} />

      <h1 className="titre-accueil">Bonjour !</h1>
      <p className="sous-titre">Des trajets plus sereins, même en cas de perturbations.</p>

      <button className="bandeau-ia" onClick={() => app.aller('alertes')}>
        <span className="etincelle"><Icone nom="sparkles" taille={20} /></span>
        <span><b>IA pour anticiper les perturbations</b><small>Des itinéraires plus fiables, en temps réel.</small></span>
        <Icone nom="chevronRight" taille={18} className="chevron" />
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
        <button className="bouton-rond echange" onClick={echanger} aria-label="Inverser départ et arrivée"><Icone nom="swap" taille={18} /></button>
      </div>

      <Carte position={app.position} depart={depart} arrivee={arrivee} localisation={app.localisation} onLocaliser={app.localiser} trajet={affiche} />
      {affiche && (
        <div className="legende-carte">
          <Icone nom="route" taille={14} /> Sur la carte : <b>{affiche.etiquette.toLowerCase()}</b>, arrivée {heure(affiche.arrivee)}.
          {trajets.length > 1 && <span> Touchez un autre trajet pour l’afficher.</span>}
        </div>
      )}

      <div className="ligne-recherche">
        <label className="champ-heure">
          <span className="avec-ico"><Icone nom="clock" taille={16} /> Arriver pour</span>
          <input type="time" value={arriverPour} onChange={(e) => setArriverPour(e.target.value)} />
        </label>
        <button className="bouton-principal" onClick={() => app.chercher()}><span className="avec-ico">Rechercher <Icone nom="arrowUpRight" taille={16} /></span></button>
      </div>

      <div className="modes" aria-hidden="true">
        <span className="mode-chip"><i className="icone train"><Icone nom="train" taille={14} /></i>Train</span>
        <span className="mode-chip"><i className="icone metro">M</i>Métro</span>
        <span className="mode-chip"><i className="icone tram"><Icone nom="tram" taille={14} /></i>Tram</span>
        <span className="mode-chip"><i className="icone bus"><Icone nom="bus" taille={14} /></i>Bus</span>
        <span className="mode-chip"><i className="icone marche"><Icone nom="walk" taille={14} /></i>Marche</span>
      </div>

      {recherche.etat === 'ok' && recherche.perturbation && (
        <button className="alerte-orange cliquable" onClick={() => app.aller('perturbation')}>
          <span className="rond-alerte">!</span>
          <span>
            <b>{recherche.perturbation.simulee ? 'Incident simulé sur votre trajet (test)' : 'Perturbation détectée sur votre trajet'}</b>
            <small>
              {recherche.perturbation.cause} Si vous continuez : arrivée {heure(recherche.perturbation.continuerArrivee)}.{' '}
              {recherche.perturbation.alternatives.length > 0 ? 'Voir la recommandation et les alternatives.' : 'Aucune alternative n’évite la ligne touchée.'}
            </small>
          </span>
          <Icone nom="chevronRight" taille={18} className="chevron" />
        </button>
      )}
      {recherche.etat === 'ok' && !recherche.perturbation && recherche.trajets.length > 0 && (
        <div className="note vert etat-trajet" role="status">
          <Icone nom="checkCircle" taille={16} />
          <span>
            <b>Aucune perturbation sur votre trajet.</b>{' '}
            Trajet conseillé : départ {heure(recherche.trajets[0].arrivee - recherche.trajets[0].duree)}, arrivée {heure(recherche.trajets[0].arrivee)}
            {recherche.trajets[0].arrivee <= limite ? ` (à l’heure pour ${arriverPour}).` : ` (après ${arriverPour} : partez dès que possible).`}
          </span>
        </div>
      )}

      <div className="titre-liste">
        <h2>Trajets proposés</h2>
        <button className="lien" onClick={app.enregistrerTrajet}><span className="avec-ico"><Icone nom="plus" taille={14} /> Enregistrer ce trajet</span></button>
      </div>

      {recherche.etat === 'ok' && (
        <div className="note gris marge">
          {recherche.jour === 'tomorrow'
            ? <><Icone nom="calendar" taille={14} /> {`Horaires de demain à ${arriverPour} : horaires officiels du réseau (le temps réel ne concerne que les trajets du moment).`}</>
            : recherche.tempsReel ? <><Icone nom="radio" taille={14} /> Retards et suppressions du moment pris en compte (temps réel Ilévia).</> : <><Icone nom="clock" taille={14} /> Horaires officiels du réseau (temps réel indisponible pour le moment).</>}
        </div>
      )}
      {recherche.etat === 'vide' && <div className="note gris">Choisissez un départ et une arrivée parmi les suggestions : les trajets s’affichent automatiquement.</div>}
      {recherche.etat === 'chargement' && <div className="chargement"><span className="rouleau" /><b>Recherche des meilleurs trajets…</b></div>}
      {recherche.etat === 'erreur' && <div className="note orange" role="alert"><Icone nom="alert" taille={14} /> {recherche.erreur}</div>}
      {recherche.etat === 'ok' && recherche.trajets.length === 0 && <div className="note gris">Aucun trajet trouvé pour cette recherche.</div>}

      {recherche.etat === 'ok' && recherche.trajets.map((t, i) => {
        const enRetard = t.arrivee > limite
        return (
          <div
            key={t.id} className={'carte-blanche trajet cliquable-trajet' + (i === 0 ? ' meilleur' : '') + (t === affiche ? ' sur-carte' : '')}
            onClick={() => { setSelection(t.id); document.querySelector('.carte-zone')?.scrollIntoView({ behavior: 'smooth', block: 'center' }) }}
          >
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
            <button className="bouton-contour large" onClick={(e) => { e.stopPropagation(); app.choisir(t) }}><span className="avec-ico">Suivre ce trajet <Icone nom="arrowRight" taille={16} /></span></button>
          </div>
        )
      })}

      {recherche.etat === 'ok' && recherche.simule && (
        <div className="note orange marge"><Icone nom="flask" taille={14} /> Incident simulé actif (test). Relancez la recherche pour revenir à la situation réelle.</div>
      )}
      {recherche.etat === 'ok' && recherche.trajets.length > 0 && (
        <button className="bouton-demo" onClick={app.simuler}>
          <Icone nom="flask" taille={16} /> Tester : simuler un incident sur ma ligne (horaires réels)
        </button>
      )}
    </div>
  )
}
