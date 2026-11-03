// Appels au serveur TrajetIA. Le cookie de session est envoyé automatiquement (httpOnly).

async function appeler(methode, chemin, corps) {
  const rep = await fetch('/api' + chemin, {
    method: methode,
    credentials: 'same-origin',
    headers: corps ? { 'Content-Type': 'application/json' } : undefined,
    body: corps ? JSON.stringify(corps) : undefined,
  })
  let donnees = null
  try { donnees = await rep.json() } catch { /* pas de contenu */ }
  if (!rep.ok) {
    const erreur = new Error(donnees?.message || 'Erreur ' + rep.status)
    erreur.status = rep.status
    erreur.code = donnees?.error
    throw erreur
  }
  return donnees
}

export const api = {
  sante: () => appeler('GET', '/health'),
  moi: async () => { const r = await appeler('GET', '/session'); if (!r.user) { const e = new Error('non connecté'); e.status = 401; throw e } return r },
  inscription: (email, password, prefs) => appeler('POST', '/auth/register', { email, password, prefs }),
  connexion: (email, password) => appeler('POST', '/auth/login', { email, password }),
  deconnexion: () => appeler('POST', '/auth/logout'),
  majPrefs: (prefs) => appeler('PUT', '/me/prefs', prefs),
  exporter: () => appeler('GET', '/me/export'),
  supprimerCompte: (password) => appeler('DELETE', '/me', { password }),
  trajets: () => appeler('GET', '/trips'),
  creerTrajet: (t) => appeler('POST', '/trips', t),
  majTrajet: (id, t) => appeler('PUT', '/trips/' + id, t),
  supprimerTrajet: (id) => appeler('DELETE', '/trips/' + id),
  alertes: () => appeler('GET', '/alerts'),
  lieux: (q) => appeler('GET', '/places?q=' + encodeURIComponent(q)),
  lieuxProches: (lat, lon) => appeler('GET', `/places?lat=${lat}&lon=${lon}`),
  itineraires: ({ from, to, arrive, incident }) =>
    appeler('GET', `/journeys?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&arrive=${arrive}` + (incident ? '&incident=1' : '')),
  fraicheur: () => appeler('GET', '/data-freshness'),
  recommander: (demande) => appeler('POST', '/recommend', demande),
  cleePush: () => appeler('GET', '/push/key'),
  abonnerPush: (subscription) => appeler('POST', '/push/subscribe', { subscription }),
  testerPush: () => appeler('POST', '/push/test'),
  desabonnerPush: (endpoint) => appeler('DELETE', '/push/subscribe', { endpoint }),
}

// ---------- Mesures d'usage anonymes (visiteur = identifiant aléatoire, jamais de trajet ni de position) ----------
function identifiantVisiteur() {
  try {
    let id = localStorage.getItem('trajetia.visiteur')
    if (!id) { id = crypto.randomUUID(); localStorage.setItem('trajetia.visiteur', id) }
    return id
  } catch { return crypto.randomUUID() }
}

export function canal() {
  try {
    const src = new URLSearchParams(window.location.search).get('src')
    if (src && /^[a-z0-9_-]{1,32}$/.test(src)) localStorage.setItem('trajetia.canal', src)
    return localStorage.getItem('trajetia.canal') || 'direct'
  } catch { return 'direct' }
}

export function suivre(name) {
  appeler('POST', '/events', { visitorId: identifiantVisiteur(), name, channel: canal() }).catch(() => {})
}
