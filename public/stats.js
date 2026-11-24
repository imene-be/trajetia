// Page simple pour voir combien de personnes ont ouvert l'appli depuis chaque QR code.
// Elle lit /api/admin/kpis (protégé par ADMIN_TOKEN). Le jeton reste dans l'onglet (sessionStorage) et n'est envoyé qu'à notre serveur.
const $ = (id) => document.getElementById(id)
const CLE = 'trajetia.admin'

const pct = (x) => (x === null || x === undefined ? '—' : Math.round(x * 100) + ' %')
const pluriel = (n, un, plusieurs) => `${n} ${n > 1 ? plusieurs : un}`

function montrerErreur(msg) {
  $('erreur').textContent = msg
  $('erreur').hidden = !msg
}

function ligne(nom, valeur) {
  const d = document.createElement('div')
  const dt = document.createElement('dt')
  const dd = document.createElement('dd')
  dt.textContent = nom
  dd.textContent = valeur
  d.append(dt, dd)
  return d
}

function afficher(k) {
  $('total').textContent = k.visiteurs
  const canaux = Object.entries(k.conversionParCanal || {}).sort((a, b) => b[1].visiteurs - a[1].visiteurs)
  const max = Math.max(1, ...canaux.map(([, c]) => c.visiteurs))
  const liste = $('canaux')
  liste.replaceChildren()
  if (!canaux.length) {
    const v = document.createElement('li')
    v.className = 'vide'
    v.textContent = 'Aucune visite enregistrée pour le moment.'
    liste.append(v)
  }
  for (const [nom, c] of canaux) {
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
  const autres = $('autres')
  autres.replaceChildren(
    ligne('Alternatives consultées (7 derniers jours)', k.northStarMetric?.valeur ?? 0),
    ligne('Inscrits qui ont utilisé l’appli', pct(k.tauxActivation)),
    ligne('Reviennent dans les 7 jours', pct(k.tauxRetention7j)),
  )
  $('maj').textContent = 'Mis à jour à ' + new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

async function charger(jeton) {
  montrerErreur('')
  let rep
  try {
    rep = await fetch('/api/admin/kpis', { headers: { 'x-admin-token': jeton }, cache: 'no-store' })
  } catch {
    montrerErreur('Impossible de joindre le serveur. Réessaie dans un instant.')
    return false
  }
  if (rep.status === 401) {
    sessionStorage.removeItem(CLE)
    montrerErreur('Accès refusé : jeton incorrect, ou ADMIN_TOKEN pas encore défini sur le serveur.')
    return false
  }
  if (!rep.ok) {
    montrerErreur('Le serveur a répondu une erreur (' + rep.status + '). Réessaie dans un instant.')
    return false
  }
  afficher(await rep.json())
  sessionStorage.setItem(CLE, jeton)
  $('connexion').hidden = true
  $('resultats').hidden = false
  return true
}

$('connexion').addEventListener('submit', (e) => {
  e.preventDefault()
  charger($('jeton').value.trim())
})
$('actualiser').addEventListener('click', () => charger(sessionStorage.getItem(CLE) || ''))
$('deconnexion').addEventListener('click', () => {
  sessionStorage.removeItem(CLE)
  $('resultats').hidden = true
  $('connexion').hidden = false
  $('jeton').value = ''
})

const memorise = sessionStorage.getItem(CLE)
if (memorise) charger(memorise)
