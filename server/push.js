import { Router } from 'express'
import webpush from 'web-push'
import { exigerConnexion } from './auth.js'

// Notifications web push (standard VAPID, sans service tiers payant).
// Les clés se génèrent avec `npm run vapid` (voir .env.example).
export function creerPush({ db, config, sender }) {
  const configure = Boolean(config.vapidPublicKey && config.vapidPrivateKey)
  if (configure && !sender) webpush.setVapidDetails(config.vapidSubject, config.vapidPublicKey, config.vapidPrivateKey)
  const envoyer = sender || ((sub, charge) => webpush.sendNotification(sub, charge))

  async function envoyerAUtilisateur(userId, payload) {
    if (!configure && !sender) return 0
    const abonnements = await db.all('SELECT * FROM push_subscriptions WHERE user_id = $1', [userId])
    let envoyes = 0
    for (const a of abonnements) {
      try {
        await envoyer({ endpoint: a.endpoint, keys: { p256dh: a.p256dh, auth: a.auth } }, JSON.stringify(payload))
        envoyes++
      } catch (e) {
        // Abonnement expiré ou révoqué : on le supprime
        if (e?.statusCode === 404 || e?.statusCode === 410) await db.run('DELETE FROM push_subscriptions WHERE id = $1', [a.id])
      }
    }
    return envoyes
  }

  const router = Router()
  router.get('/push/key', (_req, res) => res.json({ publicKey: configure ? config.vapidPublicKey : null }))

  router.post('/push/subscribe', exigerConnexion({ db, config }), async (req, res) => {
    const s = req.body?.subscription
    const ok = s && typeof s.endpoint === 'string' && s.endpoint.startsWith('https://') && s.endpoint.length <= 600
      && typeof s.keys?.p256dh === 'string' && typeof s.keys?.auth === 'string'
    if (!ok) return res.status(400).json({ error: 'abonnement_invalide', message: 'Abonnement invalide.' })
    await db.run(
      'INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES ($1, $2, $3, $4) ON CONFLICT (endpoint) DO UPDATE SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth',
      [req.user.id, s.endpoint, s.keys.p256dh, s.keys.auth],
    )
    res.status(201).json({ ok: true })
  })

  // Envoie une vraie notification de test à tous les appareils de l'utilisateur (pour vérifier que tout fonctionne)
  router.post('/push/test', exigerConnexion({ db, config }), async (req, res) => {
    const envoyes = await envoyerAUtilisateur(req.user.id, {
      title: 'TrajetIA : notification de test', body: 'Les notifications fonctionnent. Vous serez prévenu en cas de perturbation sur vos trajets.', url: '/',
    })
    res.json({ envoyes })
  })

  router.delete('/push/subscribe', exigerConnexion({ db, config }), async (req, res) => {
    await db.run('DELETE FROM push_subscriptions WHERE endpoint = $1 AND user_id = $2', [String(req.body?.endpoint || ''), req.user.id])
    res.json({ ok: true })
  })

  return { router, envoyerAUtilisateur, configure }
}
