// Surveillance des perturbations : à intervalle régulier, pour chaque trajet enregistré
// avec alertes actives, on demande les itinéraires en temps réel. Si l'arrivée dépasse
// l'heure voulue ou si une perturbation grave touche le trajet, on crée une alerte
// (une seule par trajet, par jour et par type) et on envoie une notification.

function partiesParis(maintenant) {
  const f = new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
  const p = Object.fromEntries(f.formatToParts(maintenant).map((x) => [x.type, x.value]))
  return { jour: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) % 24 * 60 + Number(p.minute) }
}
const enMinutes = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))
const hhmm = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`

export async function surveillerUneFois({ db, provider, push, maintenant = new Date(), log = () => {} }) {
  if (!provider || !provider.real) return { vérifiés: 0, alertes: 0, raison: 'aucune source de données réelle' }
  const { jour, minutes } = partiesParis(maintenant)
  const trajets = db.prepare('SELECT t.*, u.id AS uid FROM trips t JOIN users u ON u.id = t.user_id WHERE t.alerts_on = 1').all()
  let verifies = 0
  let alertes = 0
  for (const t of trajets) {
    const limite = enMinutes(t.arrive_by)
    if (minutes < limite - 120 || minutes > limite) continue // seulement dans les 2 h avant l'heure d'arrivée
    verifies++
    try {
      const { journeys } = await provider.journeys({ fromId: t.from_id, toId: t.to_id, arriveBy: t.arrive_by, dateIso: jour })
      if (!journeys.length) continue
      const meilleur = [...journeys].sort((a, b) => a.arrivalMin - b.arrivalMin)[0]
      const enRetard = meilleur.arrivalMin > limite
      const habituel = journeys.find((j) => j.habitual && j.disruptions?.length)
      const grave = journeys.every((j) => j.reliability === 'low')
      if (!enRetard && !grave && !habituel) continue
      const type = enRetard ? 'retard' : 'perturbation'
      const titre = `Perturbation sur « ${t.name} »`
      const corps = habituel && !enRetard
        ? `${habituel.disruptions[0].message} Meilleure alternative : arrivée à ${hhmm(meilleur.arrivalMin)}.`
        : enRetard
        ? `Arrivée estimée ${hhmm(meilleur.arrivalMin)} au lieu de ${t.arrive_by}. Ouvrez TrajetIA pour voir les alternatives.`
        : 'Une perturbation touche votre trajet. Ouvrez TrajetIA pour voir les alternatives.'
      const { changes } = db.prepare('INSERT OR IGNORE INTO alerts (user_id, trip_id, signature, title, body, severity) VALUES (?, ?, ?, ?, ?, ?)')
        .run(t.uid, t.id, `${t.id}:${jour}:${type}`, titre, corps, 'warn')
      if (changes) {
        alertes++
        await push.envoyerAUtilisateur(t.uid, { title: titre, body: corps, url: '/?ecran=perturbation' })
      }
    } catch (e) {
      log(`surveillance trajet ${t.id}: ${e.message}`)
    }
  }
  return { vérifiés: verifies, alertes }
}

export function demarrerSurveillance(deps, intervalleMin) {
  const minuteur = setInterval(() => { surveillerUneFois({ ...deps, log: console.warn }).catch((e) => console.warn('surveillance:', e.message)) }, intervalleMin * 60_000)
  minuteur.unref()
  return () => clearInterval(minuteur)
}
