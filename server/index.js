import { loadConfig } from './config.js'
import { openDb } from './db.js'
import { choisirFournisseur } from './providers/index.js'
import { creerApp } from './app.js'
import { demarrerSurveillance } from './monitor.js'

const config = loadConfig()
const db = openDb(config.dbPath)
const provider = choisirFournisseur(config)
const { app, push } = creerApp({ db, config, provider })

demarrerSurveillance({ db, provider, push }, config.monitorIntervalMin)

app.listen(config.port, () => {
  console.log(`TrajetIA : http://localhost:${config.port}`)
  console.log(`  données de transport : ${provider.real ? provider.name + ' (réelles)' : 'DÉMONSTRATION (fictives)'}`)
  console.log(`  IA : ${config.aiEnabled ? (config.aiBaseUrl ? new URL(config.aiBaseUrl).host + ' · ' : 'Claude · ') + config.aiModel : 'non configurée : recommandation automatique par règles (gratuite)'}`)
  console.log(`  notifications : ${push.configure ? 'actives' : 'non configurées (npm run vapid)'}`)
})

// Les horaires se chargent en arrière-plan : le serveur répond déjà, et dit « chargement » le temps qu'il faut
if (typeof provider.charger === 'function') {
  provider.charger().then(() => console.log('  horaires du réseau : prêts')).catch((e) => console.error('  horaires du réseau : ÉCHEC :', e.message))
}
