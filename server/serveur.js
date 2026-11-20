import { loadConfig } from './config.js'
import { openDb } from './db.js'
import { choisirFournisseur } from './providers/index.js'
import { creerApp } from './app.js'

// Assemble toute l'application (base PostgreSQL, source de données, routes).
// Utilisé par le serveur classique (index.js) ET par la fonction Vercel (api/index.js).
export async function assembler() {
  const config = loadConfig()
  const db = await openDb(config.databaseUrl)
  const provider = choisirFournisseur(config)
  const { app, push } = creerApp({ db, config, provider })
  return { config, db, provider, app, push }
}
