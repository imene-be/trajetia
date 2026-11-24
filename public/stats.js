// Page simple pour voir combien de personnes ont ouvert l'appli depuis chaque QR code.
// Elle lit /api/stats/canaux : uniquement des chiffres par canal, sans donnée personnelle, sans jeton.
const $ = (id) => document.getElementById(id)

const pct = (x) => Math.round(x * 100) + ' %'
const pluriel = (n, un, plusieurs) => `${n} ${n > 1 ? plusieurs : un}`

function afficher({ visiteurs, canaux }) {
  $('total').textContent = visiteurs
  const liste = $('canaux')
  liste.replaceChildren()
  const lignes = Object.entries(canaux).sort((a, b) => b[1].visiteurs - a[1].visiteurs)
  if (!lignes.length) {
    const v = document.createElement('li')
    v.className = 'vide'
    v.textContent = 'Aucune visite enregistrée pour le moment.'
    liste.append(v)
  }
  const max = Math.max(1, ...lignes.map(([, c]) => c.visiteurs))
  for (const [nom, c] of lignes) {
    const li = document.createElement('li')
    li.className = 'canal' + (nom === 'direct' ? '' : ' qr')
    const tete = document.createElement('div')
    tete.className = 'tete'
    const n = document.createElement('span')
    n.className = 'nom'
    n.textContent = nom === 'direct' ? 'Direct (sans QR code)' : nom
    const nb = document.createElement('span')
    nb.className = 'nb'
    nb.textContent = c.visiteurs
    tete.append(n, nb)
    const detail = document.createElement('div')
    detail.className = 'detail'
    detail.textContent = `${pluriel(c.visiteurs, 'visiteur', 'visiteurs')} · ${c.actives} ${c.actives > 1 ? 'ont testé' : 'a testé'} un trajet (${pct(c.tauxConversion)})`
    const barre = document.createElement('div')
    barre.className = 'barre'
    const rempli = document.createElement('span')
    rempli.style.width = Math.max(3, (c.visiteurs / max) * 100) + '%'
    barre.append(rempli)
    li.append(tete, detail, barre)
    liste.append(li)
  }
  $('maj').textContent = 'Mis à jour à ' + new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

async function charger() {
  try {
    const rep = await fetch('/api/stats/canaux', { cache: 'no-store' })
    if (!rep.ok) throw new Error('HTTP ' + rep.status)
    afficher(await rep.json())
    $('erreur').hidden = true
  } catch {
    $('erreur').textContent = 'Impossible de charger les résultats pour le moment. Réessaie dans un instant.'
    $('erreur').hidden = false
  }
}

$('actualiser').addEventListener('click', charger)
charger()
setInterval(charger, 30000)
