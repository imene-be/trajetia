import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import rateLimit from 'express-rate-limit'

const COOKIE = 'tj_session'
const SEPT_JOURS = 7 * 24 * 3600
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/
const VIOLATION_UNICITE = '23505' // code PostgreSQL : valeur déjà existante

export const PREFS_PAR_DEFAUT = {
  priorite: 'arrivee', arriverHeure: true, moinsChangements: true, moinsMarche: false, eviterRetards: true,
  position: true, notifications: false,
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
    const dejaPris = () => res.status(409).json({ error: 'email_deja_utilise', message: 'Un compte existe déjà avec cette adresse.' })
    if (await db.get('SELECT 1 FROM users WHERE email = $1', [email])) return dejaPris()
    const hash = await bcrypt.hash(motDePasse, config.bcryptCost)
    let user
    try {
      user = await db.get('INSERT INTO users (email, password_hash, prefs_json) VALUES ($1, $2, $3) RETURNING *',
        [email, hash, JSON.stringify(nettoyerPrefs(req.body?.prefs))])
    } catch (e) {
      if (e?.code === VIOLATION_UNICITE) return dejaPris() // deux inscriptions simultanées avec le même e-mail
      throw e
    }
    poserCookie(res, user.id)
    res.status(201).json({ user: publicUser(user) })
  })

  router.post('/auth/login', limiteur, async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase()
    const motDePasse = String(req.body?.password || '')
    const user = await db.get('SELECT * FROM users WHERE email = $1', [email])
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

// Lit le cookie de session et renvoie l'utilisateur (ou null)
export async function utilisateurDepuisCookie({ db, config }, req) {
  try {
    const token = req.cookies?.[COOKIE]
    if (!token) return null
    const { sub } = jwt.verify(token, config.jwtSecret)
    return (await db.get('SELECT * FROM users WHERE id = $1', [sub])) || null
  } catch {
    return null
  }
}

// Middleware : exige une session valide
export function exigerConnexion({ db, config }) {
  return async (req, res, next) => {
    const user = await utilisateurDepuisCookie({ db, config }, req)
    if (!user) return res.status(401).json({ error: 'non_connecte', message: 'Connexion requise.' })
    req.user = user
    next()
  }
}

// Compte : lecture, préférences, export des données et suppression (RGPD)
export function creerCompte({ db, config }) {
  const router = Router()
  const exiger = exigerConnexion({ db, config })

  router.get('/me', exiger, (req, res) => {
    res.json({ user: { id: req.user.id, email: req.user.email, prefs: nettoyerPrefs(JSON.parse(req.user.prefs_json || '{}')) } })
  })

  router.put('/me/prefs', exiger, async (req, res) => {
    const prefs = nettoyerPrefs(req.body)
    await db.run('UPDATE users SET prefs_json = $1 WHERE id = $2', [JSON.stringify(prefs), req.user.id])
    res.json({ prefs })
  })

  // Droit d'accès / portabilité : toutes les données de la personne
  router.get('/me/export', exiger, async (req, res) => {
    const id = req.user.id
    res.json({
      compte: { email: req.user.email, cree_le: req.user.created_at, preferences: nettoyerPrefs(JSON.parse(req.user.prefs_json || '{}')) },
      trajets: await db.all('SELECT name, from_label, to_label, arrive_by, alerts_on, created_at FROM trips WHERE user_id = $1 ORDER BY id', [id]),
      alertes: await db.all('SELECT title, body, severity, created_at FROM alerts WHERE user_id = $1 ORDER BY id', [id]),
      notifications: await db.all('SELECT created_at FROM push_subscriptions WHERE user_id = $1', [id]),
    })
  })

  // Droit à l'effacement : supprime le compte et tout ce qui lui est lié
  router.delete('/me', exiger, async (req, res) => {
    const ok = await bcrypt.compare(String(req.body?.password || ''), req.user.password_hash)
    if (!ok) return res.status(403).json({ error: 'mot_de_passe_incorrect', message: 'Mot de passe incorrect.' })
    await db.run('UPDATE events SET user_id = NULL WHERE user_id = $1', [req.user.id])
    await db.run('DELETE FROM users WHERE id = $1', [req.user.id])
    res.clearCookie(COOKIE, { path: '/' })
    res.json({ ok: true })
  })

  return router
}
