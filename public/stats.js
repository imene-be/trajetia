// Suivi du flyer : combien de personnes ont scanné le QR code, et combien sont venues directement.
// Elle lit /api/stats/canaux : uniquement des nombres, sans donnée personnelle, sans jeton.
const $ = (id) => document.getElementById(id)
const nombre = (n) => n.toLocaleString('fr-FR')
const pluriel = (n, un, plusieurs) => `${nombre(n)} ${n > 1 ? plusieurs : un}`

// « il y a 3 minutes », « il y a 2 heures »…
function ilYa(iso) {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000))
  if (s < 60) return 'à l’instant'
  const m = Math.round(s / 60)
  if (m < 60) return `il y a ${pluriel(m, 'minute', 'minutes')}`
  const h = Math.round(m / 60)
  if (h < 24) return `il y a ${pluriel(h, 'heure', 'heures')}`
  const j = Math.round(h / 24)
  return `il y a ${pluriel(j, 'jour', 'jours')}`
}

function afficher({ qr, direct, visiteurs, dernierScan, canaux }) {
  $('qr').textContent = nombre(qr)
  $('direct').textContent = nombre(direct)
  $('dernier').textContent = dernierScan ? `Dernier scan : ${ilYa(dernierScan)}` : 'Aucun scan pour le moment'
  $('total').textContent = visiteurs
    ? `${pluriel(visiteurs, 'personne a', 'personnes ont')} ouvert TrajetIA depuis le lancement du flyer.`
    : 'Personne n’a encore ouvert TrajetIA depuis le lancement du flyer.'

  // Détail par QR code, seulement s'il y en a plus d'un (ou s'il porte un autre nom que « flyer »)
  const detail = Object.entries(canaux)
  const afficherDetail = detail.length > 1 || (detail.length === 1 && detail[0][0] !== 'flyer')
  $('detail').hidden = !afficherDetail
  if (afficherDetail) $('detail').textContent = 'Par QR code : ' + detail.map(([nom, n]) => `${nom} ${nombre(n)}`).join(' · ')

  $('maj').textContent = 'Mis à jour à ' + new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

async function charger() {
  try {
    const rep = await fetch('/api/stats/canaux', { cache: 'no-store' })
    if (!rep.ok) throw new Error('HTTP ' + rep.status)
    afficher(await rep.json())
    $('erreur').hidden = true
  } catch {
    $('erreur').textContent = 'Impossible d’afficher les chiffres pour le moment. Réessaie dans un instant.'
    $('erreur').hidden = false
  }
}

$('actualiser').addEventListener('click', charger)
charger()
setInterval(charger, 30000)
