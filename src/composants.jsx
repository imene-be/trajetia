// Petits morceaux d'interface réutilisés dans plusieurs écrans
import React from 'react'
import { Icone } from './Icones.jsx'

// ---------- Logo ----------
export function Logo() {
  return (
    <div className="logo">
      <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true">
        <path d="M9 24 L17 14 L26 12" stroke="#14b8a6" strokeWidth="3" strokeLinecap="round" fill="none" />
        <circle cx="8" cy="25" r="4.5" fill="#0f766e" />
        <circle cx="17" cy="14" r="3.5" fill="#14b8a6" />
        <circle cx="27" cy="11" r="4" fill="#0f766e" />
      </svg>
      <span>Trajet<b>IA</b></span>
    </div>
  )
}

// ---------- En-tête ----------
export function Entete({ onRetour, onCloche, decor }) {
  return (
    <div className="entete">
      <div className="entete-ligne">
        {onRetour && (
          <button className="bouton-rond" onClick={onRetour} aria-label="Retour"><Icone nom="arrowLeft" taille={20} /></button>
        )}
        <Logo />
        <div className="entete-droite">
          <button className="bouton-rond cloche" onClick={onCloche} aria-label="Alertes">
            <Icone nom="bell" taille={20} /><span className="point" />
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------- Barre d'onglets ----------
const ICONES = {
  accueil: <path d="M3 11 L12 3 L21 11 V21 H15 V14 H9 V21 H3 Z" />,
  alertes: <path d="M12 3 L22 20 H2 Z M12 10 V15 M12 17.5 V18" />,
  favoris: <path d="M12 21 C5 15.5 3 12 3 8.8 A4.8 4.8 0 0 1 12 6.3 A4.8 4.8 0 0 1 21 8.8 C21 12 19 15.5 12 21 Z" />,
  profil: <path d="M12 12 a4 4 0 1 0 0 -8 a4 4 0 0 0 0 8 M4 21 c0 -4.5 4 -7 8 -7 s8 2.5 8 7" />,
}

export function BarreOnglets({ actif, onChange }) {
  const onglets = [
    ['accueil', 'Accueil'],
    ['alertes', 'Alertes'],
    ['favoris', 'Mes favoris'],
    ['profil', 'Profil'],
  ]
  return (
    <nav className="onglets">
      {onglets.map(([id, nom]) => (
        <button key={id} className={actif === id ? 'actif' : ''} onClick={() => onChange(id)}>
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            {ICONES[id]}
          </svg>
          {id === 'alertes' && <span className="point point-onglet" />}
          <span>{nom}</span>
        </button>
      ))}
    </nav>
  )
}

// ---------- Icône d'un mode de transport ----------
export function IconeMode({ mode }) {
  if (mode === 'metro') return <span className="icone metro">M</span>
  if (mode === 'tram') return <span className="icone tram"><Icone nom="tram" taille={18} /></span>
  if (mode === 'bus') return <span className="icone bus"><Icone nom="bus" taille={18} /></span>
  if (mode === 'train') return <span className="icone train"><Icone nom="train" taille={18} /></span>
  return <span className="icone marche"><Icone nom="walk" taille={18} /></span>
}

// ---------- Les étapes d'un trajet : marche 5 min → métro 16 min → marche 8 min ----------
export function LigneEtapes({ etapes, avecLigne }) {
  return (
    <div className="etapes-ligne">
      {etapes.filter((e) => e.mode !== 'marche' || e.min >= 2).map((e, i) => (
        <React.Fragment key={i}>
          {i > 0 && <Icone nom="chevronRight" taille={14} className="fleche" />}
          <div className="etape-mini">
            <IconeMode mode={e.mode} />
            <small>
              {avecLigne && e.mode !== 'marche' && <b>{e.ligne}<br /></b>}
              {e.min} min
            </small>
          </div>
        </React.Fragment>
      ))}
    </div>
  )
}

// ---------- Petite étiquette colorée ----------
export function Pastille({ type = 'gris', icone, children }) {
  return (
    <span className={'pastille ' + type}>
      {icone && <Icone nom={icone} taille={13} className="pastille-icone" />}
      {children}
    </span>
  )
}

// ---------- Interrupteur ----------
export function Interrupteur({ actif, onChange, label }) {
  return (
    <button
      role="switch"
      aria-checked={actif}
      aria-label={label}
      className={'interrupteur' + (actif ? ' actif' : '')}
      onClick={() => onChange(!actif)}
    >
      <span />
    </button>
  )
}
