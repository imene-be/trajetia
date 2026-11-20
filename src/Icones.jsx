// Jeu d'icônes unique de l'application : traits fins, couleur héritée du texte (currentColor).
import React from 'react'

const CHEMINS = {
  bell: 'M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9 M10.3 21a1.94 1.94 0 0 0 3.4 0',
  bellOff: 'M8.7 3A6 6 0 0 1 18 8c0 2.7.5 4.8 1.2 6.2 M17 17H3s3-2 3-9a4.7 4.7 0 0 1 .3-2 M10.3 21a1.94 1.94 0 0 0 3.4 0 M2 2l20 20',
  home: 'M3 10.5 12 3l9 7.5 M5 9.5V21h14V9.5 M10 21v-6h4v6',
  pin: 'M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0z M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 7v5l3 2',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  shieldCheck: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z M9 12l2 2 4-4',
  alert: 'M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z M12 9v4 M12 17h.01',
  alertCircle: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 8v5 M12 16h.01',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 11v5 M12 8h.01',
  walk: 'M13 5a1.6 1.6 0 1 0 0-3.2A1.6 1.6 0 0 0 13 5z M10.5 22l1.6-6.5-2.6-2.5.8-5 M8 12l2.3-3.4 3.4.6 2.3 3.3 3 .5 M12.1 15.5l3.4 2.5.7 4',
  transfer: 'M17 2l4 4-4 4 M3 11v-1a4 4 0 0 1 4-4h14 M7 22l-4-4 4-4 M21 13v1a4 4 0 0 1-4 4H3',
  route: 'M6 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4z M18 21a2 2 0 1 0 0-4 2 2 0 0 0 0 4z M6 7v3a4 4 0 0 0 4 4h4a4 4 0 0 1 4 4v-1',
  leaf: 'M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.5 19 2c1 2 2 4.2 2 8 0 5.5-4.8 10-10 10z M2 21c0-3 1.9-5.5 5-7',
  zap: 'M13 2 3 14h9l-1 8 10-12h-9z',
  bus: 'M5 3h14a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z M3 11h18 M7 18v3 M17 18v3 M7.5 14.5h.01 M16.5 14.5h.01',
  tram: 'M7 3h10a2 2 0 0 1 2 2v11a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V5a2 2 0 0 1 2-2z M5 11h14 M12 3V1 M9 1h6 M8 19l-2 3 M16 19l2 3 M8.5 15h.01 M15.5 15h.01',
  train: 'M7 2h10a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V5a3 3 0 0 1 3-3z M4 10h16 M12 2v8 M8 18l-2 4 M16 18l2 4 M8.5 14h.01 M15.5 14h.01',
  sparkles: 'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z',
  arrowRight: 'M5 12h14 M13 6l6 6-6 6',
  arrowLeft: 'M19 12H5 M11 6l-6 6 6 6',
  arrowUpRight: 'M7 17 17 7 M8 7h9v9',
  chevronRight: 'M9 6l6 6-6 6',
  swap: 'M7 4v16 M3 8l4-4 4 4 M17 20V4 M13 16l4 4 4-4',
  plus: 'M12 5v14 M5 12h14',
  check: 'M5 12.5l4.5 4.5L19 7',
  checkCircle: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M8 12l3 3 5-6',
  x: 'M6 6l12 12 M18 6 6 18',
  trash: 'M4 7h16 M10 11v6 M14 11v6 M6 7l1 13h10l1-13 M9 7V4h6v3',
  refresh: 'M21 12a9 9 0 0 1-15.5 6.2 M3 12A9 9 0 0 1 18.5 5.8 M18.5 2v4h-4 M5.5 22v-4h4',
  share: 'M12 15V3 M7 8l5-5 5 5 M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7',
  navigation: 'M3 11 22 2l-9 19-2-8z',
  lock: 'M5 11h14v10H5z M8 11V7a4 4 0 0 1 8 0v4',
  calendar: 'M4 5h16v16H4z M4 10h16 M8 3v4 M16 3v4',
  radio: 'M12 13a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z M7.8 7.8a6 6 0 0 0 0 8.4 M16.2 7.8a6 6 0 0 1 0 8.4 M4.9 4.9a10 10 0 0 0 0 14.2 M19.1 4.9a10 10 0 0 1 0 14.2',
  flask: 'M9 3h6 M10 3v6L4.5 19a1.5 1.5 0 0 0 1.3 2.2h12.4a1.5 1.5 0 0 0 1.3-2.2L14 9V3 M7 15h10',
  locate: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M12 2v3 M12 19v3 M2 12h3 M19 12h3',
  heart: 'M12 21C5 15.5 3 12 3 8.8A4.8 4.8 0 0 1 12 6.3 4.8 4.8 0 0 1 21 8.8C21 12 19 15.5 12 21z',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4 21c0-4.5 4-7 8-7s8 2.5 8 7',
  dashboard: 'M3 11 12 3l9 8 M5 10v11h14V10',
}

export function Icone({ nom, taille = 18, epaisseur = 1.9, className = '', titre }) {
  const d = CHEMINS[nom]
  if (!d) return null
  return (
    <svg className={'ico ' + className} width={taille} height={taille} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={epaisseur} strokeLinecap="round" strokeLinejoin="round" role={titre ? 'img' : undefined} aria-label={titre} aria-hidden={titre ? undefined : true}>
      {d.split(' M').map((p, i) => <path key={i} d={(i ? 'M' : '') + p} />)}
    </svg>
  )
}
