// Page des visites : combien de personnes sont venues par le QR code du flyer, et combien directement.
// Elle lit /api/stats/canaux : uniquement des chiffres, sans donnée personnelle, sans jeton.
const $ = (id) => document.getElementById(id)
const nombre = (n) => n.toLocaleString('fr-FR')

function afficher({ visiteurs, canaux }) {
  const direct = canaux.direct?.visiteurs ?? 0
  // « QR code » = toutes les visites arrivées avec une étiquette ?src=… (par exemple ?src=flyer), c'est-à-dire autrement que « direct »
  const qr = Object.entries(canaux).reduce((somme, [nom, c]) => (nom === 'direct' ? somme : somme + c.visiteurs), 0)
  $('qr').textContent = nombre(qr)
  $('direct').textContent = nombre(direct)
  $('total').textContent = nombre(visiteurs)
  $('maj').textContent = 'Mis à jour à ' + new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

async function charger() {
  try {
    const rep = await fetch('/api/stats/canaux', { cache: 'no-store' })
    if (!rep.ok) throw new Error('HTTP ' + rep.status)
    afficher(await rep.json())
    $('erreur').hidden = true
  } catch {
    $('erreur').textContent = 'Impossible de charger les chiffres pour le moment. Réessaie dans un instant.'
    $('erreur').hidden = false
  }
}

$('actualiser').addEventListener('click', charger)
charger()
setInterval(charger, 30000)
