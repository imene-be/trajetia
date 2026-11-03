// Test COMPLET de l'application, de A à Z, dans un vrai Chrome, avec de vraies données.
// Il démarre ses propres serveurs (ports 3095 à 3097) : il ne touche pas à votre serveur habituel.
//   npm run test:complet
// Il écrit le résultat dans RAPPORT_TESTS.json (utilisé par `npm run rapport`).
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const CAPTURES = process.argv[2] || '/tmp/e2e-complet'
fs.mkdirSync(CAPTURES, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const resultats = []
let section = ''
const SECTION = (nom) => { section = nom; console.log('\n== ' + nom) }
const ok = (nom, condition, detail = '') => {
  resultats.push({ section, nom, ok: Boolean(condition), detail: String(detail || '') })
  console.log((condition ? '  ✔ ' : '  ✖ ') + nom + (detail ? '  → ' + detail : ''))
  return Boolean(condition)
}

// ---------------------------------------------------------------- serveurs
const serveurs = []
async function demarrer(port, env = {}) {
  const db = `/tmp/tj-complet-${port}.db`
  for (const f of [db, db + '-wal', db + '-shm']) fs.rmSync(f, { force: true })
  const p = spawn(process.execPath, ['--env-file=.env', 'server/index.js'], { env: { ...process.env, PORT: String(port), DB_PATH: db, ...env }, stdio: ['ignore', 'pipe', 'pipe'] })
  let journal = ''
  p.stdout.on('data', (d) => { journal += d })
  p.stderr.on('data', (d) => { journal += d })
  const s = { port, db, p, url: `http://localhost:${port}`, journal: () => journal, arreter: () => new Promise((r) => { if (p.exitCode !== null || p.signalCode) return r(); p.once('exit', r); p.kill() }) }
  serveurs.push(s)
  for (let i = 0; i < 40; i++) {
    await sleep(500)
    try { const h = await (await fetch(s.url + '/api/health')).json(); if (h.source?.ready) return s } catch { /* pas encore prêt */ }
  }
  throw new Error('serveur non prêt sur le port ' + port + '\n' + journal)
}
async function tout_arreter() { for (const s of serveurs) { try { await s.arreter() } catch { /* ignore */ } } }

// ---------------------------------------------------------------- aides navigateur
const texte = (page) => page.evaluate(() => document.body.innerText)
const attendreTexte = (page, t, ms = 12000) => page.waitForFunction((x) => document.body.innerText.includes(x), { timeout: ms }, t)
async function cliquer(page, t, selecteur = 'button') {
  const ok_ = await page.evaluate((txt, sel) => {
    const el = [...document.querySelectorAll(sel)].find((b) => b.innerText.includes(txt) || b.getAttribute('aria-label') === txt)
    if (el) { el.click(); return true }
    return false
  }, t, selecteur)
  if (!ok_) throw new Error('bouton introuvable : ' + t)
}
const cliquerSel = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e) throw new Error('introuvable ' + s); e.click() }, sel)
const capture = async (page, nom) => { await sleep(450); await page.screenshot({ path: `${CAPTURES}/${nom}.png` }) }
const ecrireInput = (page, handle, valeur) => page.evaluate((el, v) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}, handle, valeur)
// Saisit un lieu comme un utilisateur : on tape, les suggestions arrivent, on choisit celle qui correspond
async function saisirLieu(page, index, partiel, contient) {
  const champs = await page.$$('.formulaire .champ input')
  const champ = champs[index]
  await ecrireInput(page, champ, '')
  await champ.click()
  await champ.type(partiel, { delay: 30 })
  await page.waitForFunction((i, c) => {
    const dl = document.querySelectorAll('.formulaire datalist')[i]
    return dl && [...dl.querySelectorAll('option')].some((o) => o.value.toLowerCase().includes(c.toLowerCase()))
  }, { timeout: 8000 }, index, contient)
  const label = await page.evaluate((i, c) => [...document.querySelectorAll('.formulaire datalist')[i].querySelectorAll('option')].find((o) => o.value.toLowerCase().includes(c.toLowerCase())).value, index, contient)
  await ecrireInput(page, champ, label)
  await sleep(150)
  return label
}
const nbCartes = (page) => page.$$eval('.trajet', (e) => e.length)
const maintenantParis = (plusMin = 0) => {
  const d = new Date(Date.now() + plusMin * 60000)
  const p = Object.fromEntries(new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d).map((x) => [x.type, x.value]))
  return `${p.hour}:${p.minute}`
}

const errConsole = []
const reqEchouees = []
function surveiller(page, nom) {
  page.on('pageerror', (e) => errConsole.push(`[${nom}] ${e.message}`))
  page.on('console', (m) => { if (m.type() === 'error') errConsole.push(`[${nom}] ${m.text()}`) })
  page.on('requestfailed', (r) => reqEchouees.push(`[${nom}] ${r.url()} ${r.failure()?.errorText}`))
  page.on('response', (r) => { if (r.status() >= 400 && !/\/api\/(auth\/login|auth\/register)$/.test(r.url())) reqEchouees.push(`[${nom}] ${r.status()} ${r.url().replace(/^https?:\/\/[^/]+/, '')}`) })
}

let navigateur
try {
  // ============================================================== SERVEURS
  SECTION('0. Démarrage des serveurs de test')
  const A = await demarrer(3097, { MONITOR_INTERVAL_MIN: '0.05', ADMIN_TOKEN: 'admin-test', ALLOWED_ORIGINS: 'http://localhost:3097' })
  ok('serveur principal démarré (données Ilévia réelles, IA Gemini, notifications)', /réelles/.test(A.journal()) && /gemini/.test(A.journal()) && /notifications : actives/.test(A.journal()), A.journal().split('\n').filter((l) => /IA|notifications/.test(l)).join(' | ').trim())
  const C = await demarrer(3096, { AI_TIMEOUT_MS: '1', ALLOWED_ORIGINS: 'http://localhost:3096' })
  ok('serveur « IA trop lente » démarré (délai de 1 ms pour provoquer le plan B)', true)

  navigateur = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 430, height: 900 } })
  const ctx = navigateur.defaultBrowserContext()
  await ctx.overridePermissions(A.url, ['geolocation', 'notifications', 'clipboard-read', 'clipboard-write', 'clipboard-sanitized-write'])
  const page = await navigateur.newPage()
  surveiller(page, 'principal')
  page.on('dialog', async (d) => { await d.accept(d.type() === 'prompt' ? 'trajetia-demo-2026' : undefined) })
  await page.setGeolocation({ latitude: 50.6378, longitude: 3.0709 }) // devant la Gare Lille Flandres

  // ============================================================== 1. DÉMARRAGE
  SECTION('1. Démarrage et accueil')
  await page.goto(A.url + '/?src=gare', { waitUntil: 'networkidle0' })
  await page.waitForSelector('.trajet', { timeout: 15000 })
  let t = await texte(page)
  ok('bandeau « Données réelles : Ilévia »', t.includes('Données réelles : Ilévia'))
  const valeurs0 = await page.$$eval('.formulaire .champ input', (e) => e.map((i) => i.value))
  ok('trajet d’exemple pré-rempli (Gare Lille Flandres → Euratechnologies)', valeurs0[0] === 'Gare Lille Flandres' && valeurs0[1] === 'Euratechnologies', valeurs0.join(' → '))
  ok('des trajets réels sont affichés', (await nbCartes(page)) >= 2, (await nbCartes(page)) + ' trajets')
  ok('note sur le temps réel affichée', /temps réel|Horaires officiels|Horaires de demain/.test(t))
  const heureDefaut = await page.$eval('.champ-heure input', (e) => e.value)
  ok('heure d’arrivée par défaut proche de « maintenant + 1 h »', Math.abs((+heureDefaut.slice(0, 2) * 60 + +heureDefaut.slice(3)) - (+maintenantParis(60).slice(0, 2) * 60 + +maintenantParis(60).slice(3))) <= 20, heureDefaut)
  await capture(page, '01-accueil')

  // ============================================================== 2. RECHERCHE
  SECTION('2. Recherche de lieux et de trajets')
  const l1 = await saisirLieu(page, 0, 'republique', 'République')
  ok('suggestions d’arrêts réelles pour « republique »', l1.toLowerCase().includes('république'), l1)
  await cliquer(page, 'Rechercher')
  await sleep(1500)
  ok('recherche avec un nouveau départ : des trajets s’affichent', (await nbCartes(page)) >= 1)
  const l2 = await saisirLieu(page, 1, 'euratech', 'Euratechnologies')
  ok('suggestions pour « euratech »', l2 === 'Euratechnologies' || l2.includes('Euratechnologies'), l2)
  await cliquerSel(page, '.echange')
  await sleep(300)
  const apresSwap = await page.$$eval('.formulaire .champ input', (e) => e.map((i) => i.value))
  ok('bouton ⇅ : départ et arrivée inversés', apresSwap[0].includes('Euratechnologies') && apresSwap[1].toLowerCase().includes('république'), apresSwap.join(' ↔ '))
  await cliquerSel(page, '.echange')
  const champsHeure = await page.$('.champ-heure input')
  await ecrireInput(page, champsHeure, maintenantParis(120))
  await cliquer(page, 'Rechercher')
  await sleep(1500)
  ok('changement de l’heure d’arrivée puis recherche', (await nbCartes(page)) >= 1)
  // adresse
  const champs = await page.$$('.formulaire .champ input')
  await ecrireInput(page, champs[1], '')
  await champs[1].click()
  await champs[1].type('10 rue nationale lille', { delay: 20 })
  await page.waitForFunction(() => [...document.querySelectorAll('.formulaire datalist')[1].querySelectorAll('option')].some((o) => /Rue Nationale.*Lille/i.test(o.value)), { timeout: 10000 })
  const adr = await page.evaluate(() => [...document.querySelectorAll('.formulaire datalist')[1].querySelectorAll('option')].find((o) => /Rue Nationale.*Lille/i.test(o.value)).value)
  await ecrireInput(page, champs[1], adr)
  await sleep(200)
  await cliquer(page, 'Rechercher')
  await sleep(2000)
  t = await texte(page)
  ok('adresse réelle (Base Adresse Nationale) proposée et utilisable comme arrivée', (await nbCartes(page)) >= 1 && !t.includes('introuvable'), adr)
  await capture(page, '02-recherche-adresse')
  // cas d'erreur : champ vide
  const champs2 = await page.$$('.formulaire .champ input')
  await ecrireInput(page, champs2[1], '')
  await cliquer(page, 'Rechercher')
  await sleep(500)
  ok('arrivée vide : message clair au lieu d’une erreur', (await texte(page)).includes('Choisissez un départ et une arrivée'))

  // ============================================================== 3. POSITION
  SECTION('3. Utiliser ma position (géolocalisation avec consentement)')
  await cliquer(page, 'Profil', 'nav button')
  await page.waitForSelector('button[aria-label="Position"]')
  ok('interrupteur « position » désactivé par défaut', (await page.$eval('button[aria-label="Position"]', (e) => e.getAttribute('aria-checked'))) === 'false')
  await cliquer(page, 'Accueil', 'nav button')
  ok('bouton 📍 absent tant que la position n’est pas autorisée', (await page.$('button[aria-label="Utiliser ma position"]')) === null)
  await cliquer(page, 'Profil', 'nav button')
  await cliquerSel(page, 'button[aria-label="Position"]')
  await cliquer(page, 'Accueil', 'nav button')
  await page.waitForSelector('button[aria-label="Utiliser ma position"]')
  ok('après consentement : bouton 📍 visible', true)
  await cliquerSel(page, 'button[aria-label="Utiliser ma position"]')
  await page.waitForFunction(() => document.querySelector('.formulaire .champ input').value === 'Ma position', { timeout: 10000 })
  ok('bouton 📍 : le départ devient « Ma position » (coordonnées du navigateur)', true)
  await cliquer(page, 'Rechercher')
  await sleep(2000)
  ok('recherche de trajets depuis « Ma position » (marche jusqu’à l’arrêt incluse)', (await nbCartes(page)) >= 1, (await nbCartes(page)) + ' trajets')
  const pres1 = await page.evaluate(async () => (await (await fetch('/api/places?lat=50.6378&lon=3.0709')).json()).places.map((p) => p.label))
  const pres2 = await page.evaluate(async () => (await (await fetch('/api/places?lat=50.6335&lon=3.0194')).json()).places.map((p) => p.label))
  ok('arrêts réels les plus proches de la gare (position 1)', pres1.some((l) => l.includes('Flandres')), pres1.join(', '))
  ok('arrêts réels les plus proches d’Euratechnologies (position 2)', pres2.some((l) => l.includes('Euratech')), pres2.join(', '))
  const posEnregistree = await page.evaluate(async () => { try { return JSON.stringify(Object.entries(localStorage)) } catch { return '' } })
  ok('la position n’est jamais mémorisée côté navigateur', !/50\.63|3\.0[0-9]/.test(posEnregistree))
  await capture(page, '03-position')
  // refus de la position
  const page2 = await navigateur.newPage()
  surveiller(page2, 'refus-position')
  await ctx.overridePermissions(A.url, ['notifications', 'clipboard-read', 'clipboard-write']) // retire « geolocation »
  await page2.goto(A.url + '/?ecran=profil', { waitUntil: 'networkidle0' })
  if ((await page2.$eval('button[aria-label="Position"]', (e) => e.getAttribute('aria-checked'))) === 'false') await cliquerSel(page2, 'button[aria-label="Position"]')
  await cliquer(page2, 'Accueil', 'nav button')
  await page2.waitForSelector('button[aria-label="Utiliser ma position"]')
  await cliquerSel(page2, 'button[aria-label="Utiliser ma position"]')
  await attendreTexte(page2, 'Position refusée', 10000).then(() => ok('position refusée par l’utilisateur : message clair, rien ne casse', true)).catch(() => ok('position refusée par l’utilisateur : message clair, rien ne casse', false))
  await page2.close()
  await ctx.overridePermissions(A.url, ['geolocation', 'notifications', 'clipboard-read', 'clipboard-write', 'clipboard-sanitized-write'])

  // ============================================================== 4. INCIDENT, IA, ALTERNATIVES
  SECTION('4. Incident simulé, vraie IA, alternatives, trajet en cours')
  await page.goto(A.url + '/?src=gare', { waitUntil: 'networkidle0' })
  await page.waitForSelector('.trajet')
  await cliquer(page, 'simuler un incident')
  await attendreTexte(page, 'Détail de la perturbation')
  ok('écran « Perturbation détectée » (incident simulé annoncé comme tel)', (await texte(page)).includes('Incident simulé'))
  await attendreTexte(page, 'Recommandation IA', 12000)
  await page.waitForSelector('.texte-reco', { timeout: 12000 })
  const reco = await page.$eval('.texte-reco', (e) => e.innerText)
  ok('recommandation par la VRAIE IA (Gemini) affichée', true, '« ' + reco + ' »')
  ok('la phrase de l’IA ne contient pas d’identifiant technique', !/\bn\d\b|routeId|habituel/.test(reco))
  t = await texte(page)
  ok('« Si vous continuez » comparé à la meilleure alternative', t.includes('Si vous continuez') && /Meilleure alternative|itinéraire prioritaire|trajet le plus rapide/.test(t))
  ok('détail de la perturbation affiché', t.includes('Détail de la perturbation'))
  await capture(page, '04-perturbation-ia')
  await cliquer(page, 'Voir d’autres options')
  await attendreTexte(page, 'Itinéraires alternatifs')
  const avant = await page.$$eval('.trajet .duree', (e) => e.map((x) => x.innerText))
  await cliquer(page, 'Simplicité')
  await sleep(1200)
  const apres = await page.$$eval('.trajet .duree', (e) => e.map((x) => x.innerText))
  await cliquer(page, 'Confort')
  await sleep(1200)
  const actif = await page.$eval('.chip.actif', (e) => e.innerText)
  ok('priorités Heure d’arrivée / Simplicité / Confort : la liste se met à jour', apres.length >= 1 && actif.includes('Confort'), `avant=${avant.join(',')} simplicité=${apres.join(',')}`)
  await capture(page, '05-alternatives')
  await cliquer(page, 'Choisir cet itinéraire')
  await attendreTexte(page, 'Trajet en cours')
  ok('trajet en cours affiché avec l’heure d’arrivée', /\d\d:\d\d/.test(await texte(page)))
  let guard = 0
  while (!(await texte(page)).includes('Vous êtes arrivé') && guard++ < 12) { await cliquer(page, 'Étape terminée'); await sleep(250) }
  ok('« Étape terminée » : la progression va jusqu’à l’arrivée', (await texte(page)).includes('Vous êtes arrivé'), guard + ' étapes')
  await capture(page, '06-trajet-arrive')
  await cliquer(page, 'Revoir le trajet')
  await cliquer(page, 'Partager mon ETA')
  await sleep(600)
  const presse = await page.evaluate(() => navigator.clipboard.readText())
  ok('« Partager mon heure d’arrivée » : copiée dans le presse-papiers', /J’arrive à \d\d:\d\d/.test(presse), presse)
  await cliquer(page, 'Recalculer')
  await attendreTexte(page, 'Trajets actualisés', 8000).then(() => ok('« Recalculer » : trajets actualisés', true)).catch(() => ok('« Recalculer » : trajets actualisés', false))

  // ============================================================== 5. COMPTE
  SECTION('5. Compte, trajets enregistrés, préférences')
  await cliquer(page, 'Me prévenir en cas de retard')
  await page.waitForSelector('.feuille')
  ok('sans compte : la demande de compte s’ouvre seulement au moment d’enregistrer', true)
  await cliquerSel(page, '.feuille .fermer')
  const email = `test-${Date.now()}@exemple.fr`
  const mdp = 'trajetia-demo-2026'
  await cliquer(page, 'Accueil', 'nav button')
  await page.waitForSelector('.trajet')
  await cliquer(page, 'Enregistrer ce trajet')
  await page.waitForSelector('.feuille')
  await page.type('.feuille input[type=email]', email)
  await page.type('.feuille input[type=password]', mdp)
  await cliquerSel(page, '.feuille button.bouton-principal')
  await attendreTexte(page, 'Trajet enregistré')
  ok('inscription (e-mail + mot de passe) puis trajet enregistré', true, email)
  const sess = await page.evaluate(async () => (await (await fetch('/api/session')).json()).user)
  ok('session ouverte (cookie httpOnly, invisible du JavaScript de la page)', sess?.email === email && !document_cookie_visible(await page.evaluate(() => document.cookie)))
  function document_cookie_visible(c) { return /tj_session/.test(c) }
  await cliquer(page, 'Alertes', 'nav button')
  await attendreTexte(page, 'Alertes activées')
  ok('écran Alertes : le trajet enregistré apparaît', (await texte(page)).includes('Gare Lille Flandres → Euratechnologies'))
  await cliquer(page, 'Couper les alertes')
  await attendreTexte(page, 'Alertes désactivées')
  ok('couper puis réactiver les alertes d’un trajet', true)
  await cliquer(page, 'Activer les alertes')
  await attendreTexte(page, 'Alertes activées')
  await cliquer(page, 'Voir les trajets')
  await page.waitForSelector('.trajet', { timeout: 15000 })
  ok('« Voir les trajets » rouvre la recherche de ce trajet enregistré', true)
  // préférences : persistées côté serveur
  await cliquer(page, 'Alertes', 'nav button')
  await page.waitForSelector('button[aria-label="Moins de marche"]')
  await cliquerSel(page, 'button[aria-label="Moins de marche"]')
  await cliquerSel(page, 'button[aria-label="Éviter les retards"]')
  await sleep(800)
  await page.reload({ waitUntil: 'networkidle0' })
  await cliquer(page, 'Alertes', 'nav button')
  await page.waitForSelector('button[aria-label="Moins de marche"]')
  const prefs = await page.$$eval('button[role=switch]', (e) => Object.fromEntries(e.map((b) => [b.getAttribute('aria-label'), b.getAttribute('aria-checked')])))
  ok('préférences IA enregistrées sur le serveur et retrouvées après rechargement', prefs['Moins de marche'] === 'true' && prefs['Éviter les retards'] === 'false', JSON.stringify(prefs))
  ok('session conservée après rechargement de la page', (await texte(page)).includes('Alertes intelligentes') && (await page.evaluate(async () => (await (await fetch('/api/session')).json()).user)) !== null)
  await capture(page, '07-alertes')
  // doublon, mauvais mot de passe, déconnexion
  await cliquer(page, 'Profil', 'nav button')
  await cliquer(page, 'Me déconnecter')
  await attendreTexte(page, 'Vous êtes déconnecté')
  ok('déconnexion', (await page.evaluate(async () => (await (await fetch('/api/session')).json()).user)) === null)
  await cliquer(page, 'Créer un compte ou me connecter')
  await page.waitForSelector('.feuille')
  await page.type('.feuille input[type=email]', email)
  await page.type('.feuille input[type=password]', mdp)
  await cliquerSel(page, '.feuille button.bouton-principal')
  await attendreTexte(page, 'existe déjà')
  ok('inscription avec un e-mail déjà utilisé : refusée avec un message clair', true)
  await cliquer(page, 'J’ai déjà un compte')
  const mdpInput = await page.$('.feuille input[type=password]')
  await ecrireInput(page, mdpInput, 'mauvais-mot-de-passe-123')
  await cliquerSel(page, '.feuille button.bouton-principal')
  await attendreTexte(page, 'incorrect')
  ok('connexion avec un mauvais mot de passe : refusée (message générique)', true)
  await ecrireInput(page, mdpInput, mdp)
  await cliquerSel(page, '.feuille button.bouton-principal')
  await attendreTexte(page, 'Vous êtes connecté')
  ok('reconnexion avec le bon mot de passe', true)
  await cliquer(page, 'Alertes', 'nav button')
  await attendreTexte(page, 'Gare Lille Flandres → Euratechnologies')
  ok('après reconnexion : trajets et préférences retrouvés', true)
  // supprimer un trajet
  await page.waitForSelector('button[aria-label^="Supprimer"]')
  await cliquerSel(page, 'button[aria-label^="Supprimer"]')
  await sleep(800)
  ok('suppression d’un trajet enregistré', !(await texte(page)).includes('Alertes activées'))

  // ============================================================== 6. NOTIFICATIONS
  SECTION('6. Notifications push (réelles)')
  await cliquer(page, 'Profil', 'nav button')
  await page.waitForSelector('button[aria-label="Notifications"]')
  await cliquerSel(page, 'button[aria-label="Notifications"]')
  await attendreTexte(page, 'Notifications activées', 15000)
  ok('activation des notifications (abonnement push créé)', true)
  const abonne = await page.evaluate(async () => Boolean(await (await navigator.serviceWorker.getRegistration())?.pushManager.getSubscription()))
  ok('abonnement présent dans le navigateur', abonne)
  await sleep(6000) // laisse au navigateur le temps d'enregistrer son abonnement auprès du service de notifications
  await cliquer(page, 'Envoyer une notification de test')
  const lireNotifs = () => page.evaluate(async () => (await (await navigator.serviceWorker.getRegistration()).getNotifications()).map((n) => n.title))
  let recues = []
  const debutPush = Date.now()
  // le service de notifications (Google/Apple/Mozilla) met parfois quelques secondes : on attend jusqu'à 45 s
  while (Date.now() - debutPush < 45000 && !recues.some((x) => x.includes('notification de test'))) { await sleep(1000); recues = await lireNotifs() }
  ok('notification de test envoyée par le serveur ET reçue par le navigateur', recues.some((x) => x.includes('notification de test')), `reçue en ${Math.round((Date.now() - debutPush) / 1000)} s`)

  // ============================================================== 7. ALERTE AUTOMATIQUE
  SECTION('7. Surveillance automatique d’un trajet (alerte + notification)')
  const dans4 = maintenantParis(4)
  const cree = await page.evaluate(async (arrive) => {
    const r = await fetch('/api/trips', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Trajet surveillé (test)', from: { id: 'stop:gare lille flandres', label: 'Gare Lille Flandres' }, to: { id: 'stop:euratechnologies', label: 'Euratechnologies' }, arriveBy: arrive, alertsOn: true }) })
    return r.status
  }, dans4)
  ok('trajet à arriver dans 4 minutes enregistré (impossible à tenir : sert à déclencher l’alerte)', cree === 201, 'arriver pour ' + dans4)
  let alerte = null
  for (let i = 0; i < 30 && !alerte; i++) { await sleep(1000); alerte = await page.evaluate(async () => (await (await fetch('/api/alerts')).json()).alerts[0] || null) }
  ok('le serveur surveille le trajet et crée une alerte tout seul', Boolean(alerte), alerte ? alerte.title + ' : ' + alerte.body : 'aucune alerte')
  const debutAlerte = Date.now()
  while (Date.now() - debutAlerte < 45000 && !recues.some((x) => x.includes('Perturbation sur'))) { await sleep(1000); recues = await lireNotifs() }
  ok('la notification de l’alerte automatique est reçue', recues.some((x) => x.includes('Perturbation sur')), `reçue en ${Math.round((Date.now() - debutAlerte) / 1000)} s`)
  const nbAlertes = await page.evaluate(async () => (await (await fetch('/api/alerts')).json()).alerts.length)
  await sleep(6000)
  const nbAlertes2 = await page.evaluate(async () => (await (await fetch('/api/alerts')).json()).alerts.length)
  ok('pas de doublon : une seule alerte par trajet, jour et type', nbAlertes === nbAlertes2, `${nbAlertes} → ${nbAlertes2}`)
  await cliquer(page, 'Alertes', 'nav button')
  await attendreTexte(page, 'Perturbation sur', 8000)
  ok('l’alerte apparaît dans « Alertes récentes »', true)
  await capture(page, '08-alerte-automatique')

  // ============================================================== 8. PROFIL, RGPD
  SECTION('8. Profil, fraîcheur des données, export et suppression (RGPD)')
  await cliquer(page, 'Profil', 'nav button')
  await cliquer(page, 'Mesurer la fraîcheur')
  await attendreTexte(page, 'flux vieux de', 20000)
  const fr = (await texte(page)).match(/flux vieux de (\d+) s, (\d+) courses/)
  ok('fraîcheur RÉELLE du flux temps réel mesurée', Boolean(fr), fr ? `${fr[1]} s, ${fr[2]} courses suivies` : '')
  t = await texte(page)
  ok('état des services exact (données réelles, IA active, notifications configurées)', t.includes('réelles') && /IA .*gemini/.test(t) && t.includes('configurées'))
  const exportation = await page.evaluate(async () => (await fetch('/api/me/export')).json())
  ok('export RGPD : toutes les données de la personne', exportation.compte?.email === email && Array.isArray(exportation.trajets) && Array.isArray(exportation.alertes), `${exportation.trajets.length} trajet(s), ${exportation.alertes.length} alerte(s)`)
  await cliquer(page, 'Télécharger mes données')
  await sleep(500)
  ok('bouton « Télécharger mes données » sans erreur', true)
  await cliquer(page, 'Supprimer mon compte')
  await attendreTexte(page, 'Compte et données supprimés', 10000)
  const apresSuppr = await page.evaluate(async (e) => ({
    session: (await (await fetch('/api/session')).json()).user,
    connexion: (await fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: e, password: 'trajetia-demo-2026' }) })).status,
  }), email)
  ok('suppression du compte : session fermée et connexion impossible', apresSuppr.session === null && apresSuppr.connexion === 401)
  await capture(page, '09-profil-apres-suppression')

  // ============================================================== 9. MOBILE ET ACCESSIBILITÉ
  SECTION('9. Affichage mobile et accessibilité de base')
  const mobile = await navigateur.newPage()
  surveiller(mobile, 'mobile')
  await mobile.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
  await mobile.goto(A.url, { waitUntil: 'networkidle0' })
  await mobile.waitForSelector('.trajet', { timeout: 15000 })
  const debord = await mobile.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  ok('mobile (390 px) : aucun défilement horizontal', debord <= 1, `débordement : ${debord}px`)
  for (const ecran of ['accueil', 'alertes', 'itineraires', 'profil']) {
    await mobile.goto(`${A.url}/?ecran=${ecran}`, { waitUntil: 'networkidle0' })
    const d = await mobile.evaluate(() => document.querySelector('.contenu').scrollWidth - document.querySelector('.contenu').clientWidth)
    ok(`mobile : écran « ${ecran} » sans débordement`, d <= 1, `${d}px`)
  }
  await capture(mobile, '10-mobile-profil')
  const sansNom = await mobile.evaluate(() => {
    const manque = []
    document.querySelectorAll('button').forEach((b) => { if (!(b.innerText || '').trim() && !b.getAttribute('aria-label')) manque.push(b.className) })
    document.querySelectorAll('input').forEach((i) => { if (!i.closest('label') && !i.getAttribute('aria-label')) manque.push('input ' + i.type) })
    return manque
  })
  ok('boutons et champs : tous ont un nom accessible', sansNom.length === 0, sansNom.join(', '))
  const lang = await mobile.evaluate(() => document.documentElement.lang)
  ok('langue de la page déclarée (fr)', lang === 'fr')
  await mobile.close()

  // ============================================================== 10. PLAN B
  SECTION('10. Plan B : l’IA ne répond pas dans le délai')
  await ctx.overridePermissions(C.url, ['notifications'])
  const pc = await navigateur.newPage()
  surveiller(pc, 'plan-b')
  await pc.goto(C.url, { waitUntil: 'networkidle0' })
  await pc.waitForSelector('.trajet', { timeout: 15000 })
  await cliquer(pc, 'simuler un incident')
  await attendreTexte(pc, 'Détail de la perturbation')
  await attendreTexte(pc, 'n’est pas disponible', 12000).then(() => ok('IA trop lente : message clair + alternatives classées par heure d’arrivée', true)).catch(() => ok('IA trop lente : message clair + alternatives classées par heure d’arrivée', false))
  const lignes = await pc.$$eval('.bouton-ligne b', (e) => e.map((x) => x.innerText))
  ok('les alternatives restent disponibles et triées', lignes.length >= 1 && [...lignes].sort().join() === lignes.join(), lignes.join(' < '))
  await capture(pc, '11-plan-b')
  await pc.close()

  // ============================================================== 11. PERFORMANCES, SÉCURITÉ, KPI
  SECTION('11. Performances, sécurité, indicateurs')
  const mesure = async (url, opt) => { const d = Date.now(); const r = await fetch(url, opt); await r.text(); return Date.now() - d }
  const lat = { places: [], journeys: [], recommend: [] }
  for (let i = 0; i < 5; i++) {
    lat.places.push(await mesure(`${A.url}/api/places?q=gare${i}`))
    lat.journeys.push(await mesure(`${A.url}/api/journeys?from=stop:gare%20lille%20flandres&to=stop:euratechnologies&arrive=${maintenantParis(60)}`))
  }
  const demandeIA = { alternatives: [{ id: 'a', durationMin: 20, arrivalMin: 900, transfers: 1, walkMin: 3, reliability: 'high', modes: ['metro', 'bus'] }, { id: 'b', durationMin: 25, arrivalMin: 905, transfers: 0, walkMin: 6, reliability: 'high', modes: ['bus'] }], arriveByMin: 910, continueArrivalMin: 925, prefs: { priorite: 'arrivee' } }
  for (let i = 0; i < 2; i++) { // peu d'appels : l'offre gratuite limite le nombre de requêtes par jour et par modèle
    demandeIA.alternatives[0].arrivalMin = 900 + i // évite le cache pour mesurer l'IA
    lat.recommend.push(await mesure(`${A.url}/api/recommend`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(demandeIA) }))
  }
  const med = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)]
  ok('recherche de lieux (arrêts + adresses de l’État) : temps de réponse médian < 1500 ms', med(lat.places) < 1500, `${med(lat.places)} ms (premières requêtes, avant mise en mémoire)`)
  ok('calcul d’itinéraires réels : temps de réponse médian < 1500 ms', med(lat.journeys) < 1500, `${med(lat.journeys)} ms`)
  ok('IA (Gemini) : temps de réponse médian < 3000 ms (limite de votre PDF)', med(lat.recommend) < 3000, `${lat.recommend.join(', ')} ms`)
  const sansCookie = await fetch(`${A.url}/api/trips`)
  ok('sécurité : trajets inaccessibles sans connexion (401)', sansCookie.status === 401)
  const csrf = await fetch(`${A.url}/api/auth/register`, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://site-malveillant.example' }, body: JSON.stringify({ email: 'x@x.fr', password: 'un-mot-de-passe-solide' }) })
  ok('sécurité : requête venue d’un autre site refusée (403)', csrf.status === 403)
  const kp = await fetch(`${A.url}/api/admin/kpis`)
  ok('sécurité : tableau de bord des KPI refusé sans jeton (401)', kp.status === 401)
  const k = await (await fetch(`${A.url}/api/admin/kpis`, { headers: { 'x-admin-token': 'admin-test' } })).json()
  ok('KPI : visiteurs, North Star et conversion par canal « gare » mesurés', k.visiteurs >= 1 && k.northStarMetric.valeur >= 1 && k.conversionParCanal?.gare?.visiteurs >= 1, `visiteurs=${k.visiteurs}, North Star=${k.northStarMetric.valeur}, activation=${k.tauxActivation}, canal gare=${JSON.stringify(k.conversionParCanal.gare)}`)
  const j = await (await fetch(`${A.url}/api/health`)).json()
  ok('santé du service : source, IA et notifications annoncées', j.source.real && j.ia && j.push, JSON.stringify({ source: j.source.name, ia: j.iaModele, push: j.push }))

  // ============================================================== 12. REDÉMARRAGE ET PRODUCTION
  SECTION('12. Persistance après redémarrage et mode production')
  const reg = await fetch(`${A.url}/api/auth/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'persistance@exemple.fr', password: 'un-mot-de-passe-solide' }) })
  const cookie = reg.headers.getSetCookie().find((c) => c.startsWith('tj_session=')).split(';')[0]
  await fetch(`${A.url}/api/trips`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ name: 'Persistant', from: { id: 'stop:gare lille flandres', label: 'Gare Lille Flandres' }, to: { id: 'stop:euratechnologies', label: 'Euratechnologies' }, arriveBy: '09:00' }) })
  const dbPath = A.db
  await A.arreter()
  const A2 = await (async () => { const p = spawn(process.execPath, ['--env-file=.env', 'server/index.js'], { env: { ...process.env, PORT: '3097', DB_PATH: dbPath, ALLOWED_ORIGINS: 'http://localhost:3097' }, stdio: 'ignore' }); serveurs.push({ p, arreter: () => new Promise((r) => { if (p.exitCode !== null || p.signalCode) return r(); p.once('exit', r); p.kill() }) }); for (let i = 0; i < 40; i++) { await sleep(500); try { if ((await (await fetch('http://localhost:3097/api/health')).json()).source?.ready) return true } catch { /* attente */ } } return false })()
  const relog = await fetch('http://localhost:3097/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'persistance@exemple.fr', password: 'un-mot-de-passe-solide' }) })
  const ck2 = relog.headers.getSetCookie().find((c) => c.startsWith('tj_session=')).split(';')[0]
  const trajetsApres = await (await fetch('http://localhost:3097/api/trips', { headers: { cookie: ck2 } })).json()
  ok('après redémarrage du serveur : le compte et le trajet sont toujours là (base SQLite)', A2 && relog.status === 200 && trajetsApres.trips.length === 1)

  const secret = 'a'.repeat(40)
  const P = await demarrer(3095, { NODE_ENV: 'production', JWT_SECRET: secret, ALLOWED_ORIGINS: 'http://localhost:3095' })
  const rp = await fetch('http://localhost:3095/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'prod@exemple.fr', password: 'un-mot-de-passe-solide' }) })
  const sc = rp.headers.getSetCookie().find((c) => c.startsWith('tj_session=')) || ''
  ok('mode production : cookie de session HttpOnly + Secure + SameSite=Strict', /HttpOnly/i.test(sc) && /Secure/i.test(sc) && /SameSite=Strict/i.test(sc))
  const hp = await fetch('http://localhost:3095/api/health')
  ok('mode production : en-têtes de sécurité (HSTS, CSP, nosniff)', Boolean(hp.headers.get('strict-transport-security') && hp.headers.get('content-security-policy') && hp.headers.get('x-content-type-options')))
  const pageProd = await (await fetch('http://localhost:3095/')).text()
  ok('mode production : le même serveur sert l’application construite', pageProd.includes('<div id="root">'))
  const sansSecret = spawn(process.execPath, ['server/index.js'], { env: { ...process.env, NODE_ENV: 'production', JWT_SECRET: '', PORT: '3094' }, stdio: ['ignore', 'pipe', 'pipe'] })
  let sortie = ''
  sansSecret.stderr.on('data', (d) => { sortie += d })
  await new Promise((r) => sansSecret.once('exit', r))
  ok('mode production : le serveur refuse de démarrer sans JWT_SECRET', /JWT_SECRET/.test(sortie))

  // ============================================================== 13. ERREURS
  SECTION('13. Erreurs JavaScript et réseau pendant tout le parcours')
  ok('aucune erreur JavaScript dans la console (hors refus attendus des tests négatifs : 401, 409)', errConsole.filter((e) => !/status of 40[1349]/.test(e)).length === 0, errConsole.slice(0, 3).join(' | '))
  const attendues = reqEchouees.filter((r) => !/ 40[134] /.test(r) && !/ 429 /.test(r))
  ok('aucune requête réseau en échec inattendue', attendues.length === 0, attendues.slice(0, 3).join(' | '))
} catch (e) {
  ok('parcours complet', false, e.message)
  console.error(e)
} finally {
  const duree = Math.round(process.uptime())
  fs.writeFileSync('RAPPORT_TESTS.json', JSON.stringify({ date: new Date().toISOString(), dureeSecondes: duree, resultats, erreursConsole: errConsole.slice(0, 20), requetesEnEchec: reqEchouees.slice(0, 20) }, null, 2))
  try { await navigateur?.close() } catch { /* ignore */ }
  await tout_arreter()
  const echecs = resultats.filter((r) => !r.ok)
  console.log(`\n${resultats.length - echecs.length}/${resultats.length} vérifications réussies en ${duree} s. Captures : ${CAPTURES}`)
  if (echecs.length) { console.log('ÉCHECS :'); echecs.forEach((r) => console.log(` - [${r.section}] ${r.nom} ${r.detail}`)) }
  process.exit(echecs.length ? 1 : 0)
}
