// Suivi du QR code : combien de personnes sont venues par le flyer, et combien autrement.
// Elle lit /api/stats/canaux : uniquement des nombres, sans donnée personnelle, sans jeton.
const $ = (id) => document.getElementById(id)
const nombre = (n) => n.toLocaleString('fr-FR')
const personnes = (n) => `${nombre(n)} ${n > 1 ? 'personnes' : 'personne'}`

// « il y a 3 min », « il y a 2 h », « il y a 1 j »
function ilYa(iso) {
  const min = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000))
  if (min < 1) return 'à l’instant'
  if (min < 60) return `il y a ${min} min`
  if (min < 1440) return `il y a ${Math.floor(min / 60)} h`
  return `il y a ${Math.floor(min / 1440)} j`
}

// « 24 novembre à 11:20 »
const quand = (iso) => new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })

function afficher({ qr, direct, visiteurs, dernierScan, depuis, canaux }) {
  $('qr').textContent = nombre(qr)
  $('direct').textContent = nombre(direct)
  $('dernier').textContent = dernierScan ? `Dernier scan : ${ilYa(dernierScan)}` : 'Aucun scan pour l’instant'
  $('total').textContent = `Total : ${personnes(visiteurs)} depuis le ${quand(depuis)}`

  // Détail par QR code, seulement s'il y en a plusieurs (ou s'il porte un autre nom que « flyer »)
  const detail = Object.entries(canaux)
  const afficherDetail = detail.length > 1 || (detail.length === 1 && detail[0][0] !== 'flyer')
  $('detail').hidden = !afficherDetail
  if (afficherDetail) $('detail').textContent = detail.map(([nom, n]) => `${nom} : ${nombre(n)}`).join('  ·  ')

  $('maj').textContent = 'Actualisé à ' + new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

async function charger() {
  try {
    const rep = await fetch('/api/stats/canaux', { cache: 'no-store' })
    if (!rep.ok) throw new Error('HTTP ' + rep.status)
    afficher(await rep.json())
    $('erreur').hidden = true
  } catch {
    $('erreur').textContent = 'Les chiffres ne sont pas disponibles pour le moment. Réessaie dans un instant.'
    $('erreur').hidden = false
  }
}

$('actualiser').addEventListener('click', charger)
charger()
setInterval(charger, 30000)
