// Petits morceaux d'interface réutilisés dans plusieurs écrans
import React from 'react'

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

// ---------- Décor : silhouette de Lille ----------
export function Skyline() {
  return (
    <svg className="skyline" viewBox="0 0 220 90" aria-hidden="true">
      <rect x="0" y="62" width="220" height="28" fill="#d7e8f3" opacity=".6" />
      <rect x="20" y="40" width="46" height="30" fill="#cfe0ee" />
      <polygon points="20,40 43,26 66,40" fill="#b9d0e3" />
      <rect x="92" y="14" width="14" height="56" fill="#c3d8e8" />
      <polygon points="92,14 99,2 106,14" fill="#a9c4da" />
      <rect x="96" y="22" width="6" height="8" fill="#e8f1f8" />
      <rect x="120" y="36" width="70" height="34" fill="#cfe0ee" />
      <polygon points="120,36 155,22 190,36" fill="#b9d0e3" />
      <rect x="132" y="46" width="8" height="10" fill="#e8f1f8" />
      <rect x="150" y="46" width="8" height="10" fill="#e8f1f8" />
      <rect x="168" y="46" width="8" height="10" fill="#e8f1f8" />
      <circle cx="12" cy="52" r="12" fill="#cfe5d6" />
      <circle cx="204" cy="54" r="11" fill="#cfe5d6" />
    </svg>
  )
}

// ---------- En-tête ----------
export function Entete({ onRetour, onCloche, decor }) {
  return (
    <div className="entete">
      {decor && <Skyline />}
      <div className="entete-ligne">
        {onRetour && (
          <button className="bouton-rond" onClick={onRetour} aria-label="Retour">←</button>
        )}
        <Logo />
        <div className="entete-droite">
          <button className="bouton-rond cloche" onClick={onCloche} aria-label="Alertes">
            🔔<span className="point" />
          </button>
          <div className="meteo">⛅ <b>14°C</b><small>Lille</small></div>
        </div>
      </div>
    </div>
  )
}

// ---------- Barre d'onglets ----------
const ICONES = {
  accueil: <path d="M3 11 L12 3 L21 11 V21 H15 V14 H9 V21 H3 Z" />,
  alertes: <path d="M12 3 L22 20 H2 Z M12 10 V15 M12 17.5 V18" />,
  itineraires: <path d="M4 8 H18 M14 4 L18 8 L14 12 M20 16 H6 M10 12 L6 16 L10 20" />,
  profil: <path d="M12 12 a4 4 0 1 0 0 -8 a4 4 0 0 0 0 8 M4 21 c0 -4.5 4 -7 8 -7 s8 2.5 8 7" />,
}

export function BarreOnglets({ actif, onChange }) {
  const onglets = [
    ['accueil', 'Accueil'],
    ['alertes', 'Alertes'],
    ['itineraires', 'Itinéraires'],
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
  if (mode === 'tram') return <span className="icone tram">🚋</span>
  if (mode === 'bus') return <span className="icone bus">🚌</span>
  if (mode === 'train') return <span className="icone train">🚆</span>
  return <span className="icone marche">🚶</span>
}

// ---------- Les étapes d'un trajet : 🚶 5 min → M 16 min → 🚶 8 min ----------
export function LigneEtapes({ etapes, avecLigne }) {
  return (
    <div className="etapes-ligne">
      {etapes.filter((e) => e.mode !== 'marche' || e.min >= 2).map((e, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span className="fleche">→</span>}
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
      {icone && <span className="pastille-icone">{icone}</span>}
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

// ---------- Carte (dessin simple du parcours) ----------
export function Carte() {
  return (
    <svg className="carte" viewBox="0 0 360 150" aria-hidden="true">
      <rect width="360" height="150" fill="#eaf3e6" />
      <rect x="10" y="12" width="70" height="40" rx="6" fill="#dcebd5" />
      <rect x="95" y="90" width="80" height="45" rx="6" fill="#dcebd5" />
      <rect x="250" y="95" width="90" height="40" rx="6" fill="#dcebd5" />
      <rect x="280" y="10" width="70" height="35" rx="6" fill="#f3efe0" />
      <path d="M170 -10 C 150 40, 200 70, 190 160" stroke="#bcd9ee" strokeWidth="26" fill="none" />
      <path d="M0 100 H360 M120 0 V150 M260 0 V150" stroke="#fff" strokeWidth="5" opacity=".9" />
      <path d="M40 80 L100 92 L150 88" stroke="#1a73e8" strokeWidth="4" strokeDasharray="2 7" strokeLinecap="round" fill="none" />
      <path d="M150 88 C 200 98, 240 80, 300 52 L 322 38" stroke="#1a73e8" strokeWidth="5" strokeLinecap="round" fill="none" />
      <circle cx="40" cy="80" r="6" fill="#14213d" />
      <circle cx="95" cy="91" r="11" fill="#1a73e8" /><text x="95" y="95" textAnchor="middle" fontSize="11" fill="#fff">🚶</text>
      <rect x="140" y="77" width="22" height="22" rx="6" fill="#1a73e8" /><text x="151" y="93" textAnchor="middle" fontSize="12" fill="#fff">🚌</text>
      <rect x="226" y="62" width="30" height="18" rx="6" fill="#1a73e8" /><text x="241" y="75" textAnchor="middle" fontSize="10" fontWeight="700" fill="#fff">T</text>
      <path d="M322 38 m-9 -4 a9 9 0 1 1 18 0 c0 7 -9 17 -9 17 s-9 -10 -9 -17z" fill="#e5322d" />
      <circle cx="322" cy="34" r="3" fill="#fff" />
      <text x="26" y="64" fontSize="11" fontWeight="700" fill="#14213d">Lille Flandres</text>
      <text x="262" y="30" fontSize="11" fontWeight="700" fill="#14213d">Euratechnologies</text>
    </svg>
  )
}
