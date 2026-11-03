import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import rateLimit from 'express-rate-limit'

const COOKIE = 'tj_session'
const SEPT_JOURS = 7 * 24 * 3600
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/

export const PREFS_PAR_DEFAUT = {
  priorite: 'arrivee', arriverHeure: true, moinsChangements: true, moinsMarche: false, eviterRetards: true,
  position: false, notifications: false,
}
const CLES_PREFS = Object.keys(PREFS_PAR_DEFAUT)

export function nettoyerPrefs(entree) {
  const prefs = { ...PREFS_PAR_DEFAUT }
  for (const cle of CLES_PREFS) {
    if (entree && cle in entree) {
      if (cle === 'priorite') {
        if (['arrivee', 'simplicite', 'confort'].includes(entree[cle])) prefs[cle] = entree[cle]
      } else if (typeof entree[cle] === 'boolean') prefs[cle] = entree[cle]
    }
  }
  return prefs
}

export function creerAuth({ db, config }) {
  const router = Router()

  const limiteur = rateLimit({
    windowMs: 15 * 60 * 1000, limit: config.authRateLimit ?? 10, standardHeaders: true, legacyHeaders: false,
    message: { error: 'trop_de_tentatives', message: 'Trop de tentatives. Réessayez dans quelques minutes.' },
  })

  const poserCookie = (res, userId) => {
    const token = jwt.sign({ sub: userId }, config.jwtSecret, { expiresIn: SEPT_JOURS })
    res.cookie(COOKIE, token, {
      httpOnly: true, sameSite: 'strict', secure: config.isProd, maxAge: SEPT_JOURS * 1000, path: '/',
    })
  }

  const publicUser = (u) => ({ id: u.id, email: u.email, prefs: nettoyerPrefs(JSON.parse(u.prefs_json || '{}')) })

  router.post('/auth/register', limiteur, async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase()
    const motDePasse = String(req.body?.password || '')
    if (!EMAIL.test(email)) return res.status(400).json({ error: 'email_invalide', message: 'Adresse e-mail invalide.' })
    if (motDePasse.length < 10 || motDePasse.length > 128) {
      return res.status(400).json({ error: 'mot_de_passe_faible', message: 'Le mot de passe doit faire entre 10 et 128 caractères.' })
    }
    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) {
      return res.status(409).json({ error: 'email_deja_utilise', message: 'Un compte existe déjà avec cette adresse.' })
    }
    const hash = await bcrypt.hash(motDePasse, config.bcryptCost)
    const { lastInsertRowid } = db.prepare('INSERT INTO users (email, password_hash, prefs_json) VALUES (?, ?, ?)')
      .run(email, hash, JSON.stringify(nettoyerPrefs(req.body?.prefs)))
    poserCookie(res, Number(lastInsertRowid))
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(lastInsertRowid)
    res.status(201).json({ user: publicUser(user) })
  })

  router.post('/auth/login', limiteur, async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase()
    const motDePasse = String(req.body?.password || '')
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email)
    // On compare toujours un hash, même si le compte n'existe pas (pas de fuite par le temps de réponse)
    const hash = user?.password_hash || '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv'
    const ok = await bcrypt.compare(motDePasse, hash)
    if (!user || !ok) return res.status(401).json({ error: 'identifiants_invalides', message: 'E-mail ou mot de passe incorrect.' })
    poserCookie(res, user.id)
    res.json({ user: publicUser(user) })
  })

  router.post('/auth/logout', (_req, res) => {
    res.clearCookie(COOKIE, { path: '/' })
    res.json({ ok: true })
  })

  return router
}

// Middleware : lit le cookie de session et charge l'utilisateur
export function exigerConnexion({ db, config }) {
  return (req, res, next) => {
    try {
      const token = req.cookies?.[COOKIE]
      if (!token) return res.status(401).json({ error: 'non_connecte', message: 'Connexion requise.' })
      const { sub } = jwt.verify(token, config.jwtSecret)
      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(sub)
      if (!user) return res.status(401).json({ error: 'non_connecte', message: 'Connexion requise.' })
      req.user = user
      next()
    } catch {
      res.status(401).json({ error: 'non_connecte', message: 'Connexion requise.' })
    }
  }
}

// Compte : lecture, préférences, export des données et suppression (RGPD)
export function creerCompte({ db, config }) {
  const router = Router()
  const exiger = exigerConnexion({ db, config })

  router.get('/me', exiger, (req, res) => {
    res.json({ user: { id: req.user.id, email: req.user.email, prefs: nettoyerPrefs(JSON.parse(req.user.prefs_json || '{}')) } })
  })

  router.put('/me/prefs', exiger, (req, res) => {
    const prefs = nettoyerPrefs(req.body)
    db.prepare('UPDATE users SET prefs_json = ? WHERE id = ?').run(JSON.stringify(prefs), req.user.id)
    res.json({ prefs })
  })

  // Droit d'accès / portabilité : toutes les données de la personne
  router.get('/me/export', exiger, (req, res) => {
    const id = req.user.id
    res.json({
      compte: { email: req.user.email, cree_le: req.user.created_at, preferences: nettoyerPrefs(JSON.parse(req.user.prefs_json || '{}')) },
      trajets: db.prepare('SELECT name, from_label, to_label, arrive_by, alerts_on, created_at FROM trips WHERE user_id = ?').all(id),
      alertes: db.prepare('SELECT title, body, severity, created_at FROM alerts WHERE user_id = ?').all(id),
      notifications: db.prepare('SELECT created_at FROM push_subscriptions WHERE user_id = ?').all(id),
    })
  })

  // Droit à l'effacement : supprime le compte et tout ce qui lui est lié
  router.delete('/me', exiger, async (req, res) => {
    const ok = await bcrypt.compare(String(req.body?.password || ''), req.user.password_hash)
    if (!ok) return res.status(403).json({ error: 'mot_de_passe_incorrect', message: 'Mot de passe incorrect.' })
    db.prepare('UPDATE events SET user_id = NULL WHERE user_id = ?').run(req.user.id)
    db.prepare('DELETE FROM users WHERE id = ?').run(req.user.id)
    res.clearCookie(COOKIE, { path: '/' })
    res.json({ ok: true })
  })

  return router
}
