// Outils de date et d'heure pour Paris (le réseau est à Lille, même fuseau).
const FORMAT = new Intl.DateTimeFormat('fr-CA', {
  timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
})

export function partiesParis(date = new Date()) {
  const p = Object.fromEntries(FORMAT.formatToParts(date).map((x) => [x.type, x.value]))
  return {
    jour: `${p.year}${p.month}${p.day}`,
    secondes: (Number(p.hour) % 24) * 3600 + Number(p.minute) * 60 + Number(p.second),
  }
}

// Date (AAAAMMJJ) + n jours
export function ajouterJours(jour, n) {
  const d = new Date(Date.UTC(Number(jour.slice(0, 4)), Number(jour.slice(4, 6)) - 1, Number(jour.slice(6, 8)) + n, 12))
  return d.toISOString().slice(0, 10).replaceAll('-', '')
}

// Instant (ms) du minuit local à Paris pour un jour AAAAMMJJ
export function minuitParis(jour) {
  const midi = Date.UTC(Number(jour.slice(0, 4)), Number(jour.slice(4, 6)) - 1, Number(jour.slice(6, 8)), 12)
  const p = partiesParis(new Date(midi))
  const decalageMs = (p.secondes - 12 * 3600) * 1000 // écart entre l'heure locale lue et midi UTC
  return midi - 12 * 3600 * 1000 - decalageMs
}

// Jour de service visé pour « arriver à HH:MM » : aujourd'hui si l'heure n'est pas passée, sinon demain
export function jourVise(arriveBySecondes, maintenant = new Date()) {
  const p = partiesParis(maintenant)
  return arriveBySecondes >= p.secondes ? { jour: p.jour, aujourdhui: true, maintenantSec: p.secondes } : { jour: ajouterJours(p.jour, 1), aujourdhui: false, maintenantSec: 0 }
}

export const hhmmVersSecondes = (hhmm) => Number(hhmm.slice(0, 2)) * 3600 + Number(hhmm.slice(3, 5)) * 60
