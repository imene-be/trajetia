import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import express from 'express'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'
import jwt from 'jsonwebtoken'
import { creerAuth, creerCompte, nettoyerPrefs } from './auth.js'
import { creerTrajets } from './trips.js'
import { creerItineraires } from './journeys.js'
import { creerRecommandeur, creerRoutesIa } from './ai.js'
import { creerPush } from './push.js'
import { creerEvenements } from './events.js'

// Construit l'application. Tout ce qui est externe (base, fournisseur, IA, push) est injecté :
// c'est ce qui permet de la tester sans réseau ni clé.
export function creerApp({ db, config, provider, claude, pushSender, fraicheur }) {
  const app = express()
  if (config.trustProxy) app.set('trust proxy', 1)
  app.disable('x-powered-by')
  app.use(helmet())
  app.use(express.json({ limit: '50kb' }))
  app.use(cookieParser())

  // Protection CSRF en plus du cookie SameSite=Strict : une requête qui modifie des données
  // doit venir de notre propre site.
  app.use('/api', (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next()
    const origine = req.get('origin')
    const localEnDev = !config.isProd && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origine || '')
    if (origine && !localEnDev && !config.allowedOrigins.includes(origine) && origine !== `${req.protocol}://${req.get('host')}`) {
      return res.status(403).json({ error: 'origine_refusee', message: 'Origine non autorisée.' })
    }
    next()
  })

  const userDepuisCookie = (req) => {
    try {
      const { sub } = jwt.verify(req.cookies?.tj_session, config.jwtSecret)
      return db.prepare('SELECT id FROM users WHERE id = ?').get(sub)
    } catch { return null }
  }

  const push = creerPush({ db, config, sender: pushSender })
  const recommander = creerRecommandeur({ db, config, client: claude })

  const api = express.Router()
  api.get('/health', (_req, res) => res.json({
    ok: true,
    source: provider ? { name: provider.name, real: provider.real, ready: provider.ready !== false, error: provider.error || null } : null,
    ia: config.aiEnabled || Boolean(claude),
    recommandation: config.aiEnabled || claude ? 'ia' : 'regles',
    iaModele: config.aiEnabled ? (config.aiBaseUrl ? `${new URL(config.aiBaseUrl).host} · ${config.aiModel}` : `Claude · ${config.aiModel}`) : null,
    push: push.configure || Boolean(pushSender),
  }))
  // Session : répond toujours 200 (utilisateur ou null), pour que le navigateur n'affiche pas d'erreur quand on n'est pas connecté
  api.get('/session', (req, res) => {
    try {
      const { sub } = jwt.verify(req.cookies?.tj_session, config.jwtSecret)
      const u = db.prepare('SELECT * FROM users WHERE id = ?').get(sub)
      res.json({ user: u ? { id: u.id, email: u.email, prefs: nettoyerPrefs(JSON.parse(u.prefs_json || '{}')) } : null })
    } catch { res.json({ user: null }) }
  })
  api.use(creerAuth({ db, config }))
  api.use(creerCompte({ db, config }))
  api.use(creerTrajets({ db, config }))
  api.use(creerItineraires({ provider, fraicheur }))
  api.use(creerRoutesIa({ recommander }))
  api.use(push.router)
  api.use(creerEvenements({ db, config, userDepuisCookie }))
  api.use((_req, res) => res.status(404).json({ error: 'introuvable', message: 'Route inconnue.' }))
  app.use('/api', api)

  // En production, le même serveur sert l'application construite (npm run build)
  const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist')
  if (fs.existsSync(dist)) {
    app.use(express.static(dist))
    app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')))
  }

  app.use((err, _req, res, _next) => {
    console.error(err)
    res.status(err.status || 500).json({ error: 'erreur_serveur', message: 'Une erreur est survenue.' })
  })

  return { app, push }
}
