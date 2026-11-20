import { assembler } from './serveur.js'
import { demarrerSurveillance } from './monitor.js'

const { config, db, provider, app, push } = await assembler()

demarrerSurveillance({ db, provider, push }, config.monitorIntervalMin)

app.listen(config.port, () => {
  console.log(`TrajetIA : http://localhost:${config.port}`)
  console.log(`  base de données : ${db.type === 'postgres' ? 'PostgreSQL (DATABASE_URL)' : 'PostgreSQL local intégré (' + config.databaseUrl + ')'}`)
  console.log(`  données de transport : ${provider.real ? provider.name + ' (réelles)' : 'DÉMONSTRATION (fictives)'}`)
  console.log(`  IA : ${config.aiEnabled ? (config.aiBaseUrl ? new URL(config.aiBaseUrl).host + ' · ' : 'Claude · ') + config.aiModel : 'non configurée : recommandation automatique par règles (gratuite)'}`)
  console.log(`  notifications : ${push.configure ? 'actives' : 'non configurées (npm run vapid)'}`)
})

// Les horaires se chargent en arrière-plan : le serveur répond déjà, et dit « chargement » le temps qu'il faut
if (typeof provider.charger === 'function') {
  provider.charger().then(() => console.log('  horaires du réseau : prêts')).catch((e) => console.error('  horaires du réseau : ÉCHEC :', e.message))
}
