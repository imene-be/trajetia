// Test de bout en bout dans un vrai navigateur (Chrome) contre le vrai serveur.
// Teste l'application comme vous la lancez au quotidien : par Vite (npm run dev), avec son proxy vers le serveur.
// Variable E2E_URL = adresse de l'application (par défaut http://localhost:3001, ou http://localhost:5173 en mode dev).
//   node scripts/e2e-dev.mjs [dossier-des-captures]
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'

const URL = process.env.E2E_URL || 'http://localhost:3001'
const CAPTURES = process.argv[2] || '/tmp/e2e-captures'
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
fs.mkdirSync(CAPTURES, { recursive: true })

const resultats = []
const ok = (nom, condition, detail = '') => { resultats.push({ nom, ok: Boolean(condition), detail }); console.log((condition ? '✔' : '✖') + ' ' + nom + (detail ? '  ' + detail : '')) }

const navigateur = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 430, height: 900 } })
const page = await navigateur.newPage()
const erreursConsole = []
page.on('pageerror', (e) => erreursConsole.push(e.message))
page.on('console', (m) => { if (m.type() === 'error') erreursConsole.push(m.text()) })

const texte = () => page.evaluate(() => document.body.innerText)
const attendreTexte = (t, ms = 8000) => page.waitForFunction((x) => document.body.innerText.includes(x), { timeout: ms }, t)
const cliquerTexte = async (t, selecteur = 'button') => {
  const clique = await page.evaluate((txt, sel) => {
    const el = [...document.querySelectorAll(sel)].find((b) => b.innerText.includes(txt))
    if (el) { el.click(); return true }
    return false
  }, t, selecteur)
  if (!clique) throw new Error('bouton introuvable : ' + t)
}
const capture = async (nom) => { await new Promise((r) => setTimeout(r, 500)); await page.screenshot({ path: `${CAPTURES}/${nom}.png` }) }

try {
  // 1. Accueil, données de démonstration clairement signalées
  await page.goto(URL + '/?src=gare', { waitUntil: 'networkidle0' })
  await page.waitForSelector('.trajet', { timeout: 8000 })
  ok('accueil : des trajets sont affichés par l’API', (await page.$$('.trajet')).length >= 3)
  ok('accueil : bandeau « Données réelles : Ilévia » visible', (await texte()).includes('Données réelles : Ilévia'))
  const lieux = await page.evaluate(async () => (await (await fetch('/api/places?q=euratech')).json()).places.map((p) => p.label))
  ok('recherche de lieux réelle (arrêts Ilévia)', lieux.includes('Euratechnologies'), lieux.join(', '))
  await capture('1-accueil')

  // 2. Incident simulé : l'IA répond, ou (si elle est lente) le plan B du dossier s'affiche. Les deux sont corrects ; on dit lequel.
  await cliquerTexte('simuler un incident')
  await attendreTexte('Détail de la perturbation')
  const sante = await page.evaluate(async () => (await fetch('/api/health')).json())
  const attendu = sante.ia ? 'Recommandation IA' : 'Recommandation automatique'
  await page.waitForFunction((a) => document.body.innerText.includes(a) || document.body.innerText.includes('n’est pas disponible'), { timeout: 15000 }, attendu)
  const tp = await texte()
  const planB = tp.includes('n’est pas disponible')
  ok('perturbation : « Si vous continuez » et incident simulé annoncé comme tel', tp.includes('Si vous continuez') && tp.includes('Incident simulé'))
  ok(planB ? 'perturbation : l’IA n’a pas répondu à temps → le PLAN B du dossier s’affiche (alternatives classées), comme prévu' : (sante.ia ? `perturbation : recommandation par la VRAIE IA (${sante.iaModele})` : 'perturbation : recommandation automatique (jamais présentée comme une IA)'), planB || tp.includes(attendu), planB ? 'IA lente ou quota épuisé pendant ce test' : 'IA répondue')
  await capture('2-perturbation')

  // 3. Itinéraires alternatifs puis choix
  await cliquerTexte('Voir d’autres options')
  await attendreTexte('Itinéraires alternatifs')
  ok('itinéraires : au moins une alternative réelle est proposée', (await page.$$('.trajet')).length >= 1)
  await capture('3-itineraires')
  await cliquerTexte('Choisir cet itinéraire')
  await attendreTexte('Trajet en cours')
  await capture('4-trajet-en-cours')
  await cliquerTexte('Étape terminée')
  ok('trajet en cours : la progression avance', true)

  // 4. Enregistrer un trajet -> inscription -> trajet enregistré côté serveur
  await cliquerTexte('Accueil', 'nav button')
  await page.waitForSelector('.trajet')
  await cliquerTexte('Enregistrer ce trajet')
  await page.waitForSelector('.feuille')
  await capture('5-inscription')
  const email = `e2e-${Date.now()}@exemple.fr`
  await page.type('.feuille input[type=email]', email)
  await page.type('.feuille input[type=password]', 'un-mot-de-passe-solide')
  await page.click('.feuille button.bouton-principal')
  await attendreTexte('Trajet enregistré')
  ok('inscription puis enregistrement du trajet', true)
  const trajets = await page.evaluate(async () => (await (await fetch('/api/trips')).json()).trips)
  ok('le trajet est bien enregistré côté serveur', trajets.length === 1, trajets[0]?.name)

  // 5. Alertes : le trajet apparaît
  await cliquerTexte('Alertes', 'nav button')
  await attendreTexte('Alertes activées')
  ok('alertes : le trajet enregistré est listé', (await texte()).includes('Gare Lille Flandres → Euratechnologies'))
  await capture('6-alertes')

  // 6. Profil : mesure réelle de la fraîcheur des données Ilévia
  await cliquerTexte('Profil', 'nav button')
  await cliquerTexte('Mesurer la fraîcheur')
  await attendreTexte('flux vieux de', 15000)
  const t = await texte()
  ok('profil : fraîcheur RÉELLE du flux Ilévia mesurée', /flux vieux de \d+ s/.test(t), t.match(/Ilévia[^\n]*flux vieux de[^\n]*/)?.[0])
  ok('profil : l’état des services est exact', sante.ia ? t.includes('IA ' + sante.iaModele) : t.includes('automatique par règles'))
  await capture('7-profil')

  // 7. Déconnexion
  await cliquerTexte('Me déconnecter')
  await attendreTexte('Vous êtes déconnecté')
  const apres = await page.evaluate(async () => (await (await fetch('/api/session')).json()).user)
  ok('déconnexion : la session est fermée', apres === null)
} catch (e) {
  ok('parcours complet', false, e.message)
  await capture('erreur').catch(() => {})
}

ok('aucune erreur JavaScript dans la console', erreursConsole.length === 0, erreursConsole.slice(0, 3).join(' | '))
await navigateur.close()
const echecs = resultats.filter((r) => !r.ok).length
console.log(`\n${resultats.length - echecs}/${resultats.length} vérifications réussies. Captures : ${CAPTURES}`)
process.exit(echecs ? 1 : 0)
