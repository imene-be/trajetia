// Configuration lue dans les variables d'environnement (voir .env.example).
// Aucun secret n'est écrit dans le code.
const isProd = process.env.NODE_ENV === 'production'

export function loadConfig(overrides = {}) {
  const config = {
    isProd,
    port: Number(process.env.PORT || 3001),
    dbPath: process.env.DB_PATH || 'data/trajetia.db',
    jwtSecret: process.env.JWT_SECRET || (isProd ? '' : 'dev-only-secret-change-me-please-0123456789'),
    bcryptCost: Number(process.env.BCRYPT_COST || 12),
    // Origines autorisées pour les requêtes qui modifient des données (protection CSRF en plus du cookie SameSite)
    allowedOrigins: (process.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://localhost:3001').split(',').map((s) => s.trim()).filter(Boolean),
    trustProxy: process.env.TRUST_PROXY === '1',
    // Données de transport
    navitiaToken: process.env.NAVITIA_TOKEN || '',
    navitiaBase: process.env.NAVITIA_BASE || 'https://api.navitia.io/v1',
    navitiaCoverage: process.env.NAVITIA_COVERAGE || 'sncf',
    // Données de démonstration : autorisées par défaut en développement, interdites en production
    allowDemoData: process.env.ALLOW_DEMO_DATA ? process.env.ALLOW_DEMO_DATA === 'true' : !isProd,
    // IA de recommandation. Deux façons de la brancher :
    //  - un service compatible « OpenAI » (Groq, Gemini, OpenRouter, Ollama sur votre ordinateur…) : AI_BASE_URL + AI_MODEL (+ AI_API_KEY),
    //    plusieurs ont une offre GRATUITE ;
    //  - l'API Claude (payante) : ANTHROPIC_API_KEY (lue par le SDK).
    aiBaseUrl: (process.env.AI_BASE_URL || '').replace(/\/+$/, ''),
    aiApiKey: process.env.AI_API_KEY || '',
    aiEnabled: Boolean(process.env.AI_BASE_URL && process.env.AI_MODEL) || Boolean(process.env.ANTHROPIC_API_KEY),
    // Plusieurs modèles possibles, séparés par des virgules : si le premier a épuisé son quota gratuit du jour (erreur 429), on essaie le suivant
    aiModels: (process.env.AI_MODEL || (process.env.AI_BASE_URL ? '' : 'claude-haiku-5-5')).split(',').map((m) => m.trim()).filter(Boolean),
    aiModel: (process.env.AI_MODEL || (process.env.AI_BASE_URL ? '' : 'claude-haiku-5-5')).split(',')[0].trim(),
    aiTimeoutMs: Number(process.env.AI_TIMEOUT_MS || 3000),
    // Notifications web push (générées avec `npm run vapid`)
    vapidPublicKey: process.env.VAPID_PUBLIC_KEY || '',
    vapidPrivateKey: process.env.VAPID_PRIVATE_KEY || '',
    vapidSubject: process.env.VAPID_SUBJECT || 'mailto:contact@example.com',
    // Surveillance des perturbations
    monitorIntervalMin: Number(process.env.MONITOR_INTERVAL_MIN || 5),
    // Accès au tableau de bord des KPI
    adminToken: process.env.ADMIN_TOKEN || '',
    ...overrides,
  }
  if (isProd && config.jwtSecret.length < 32) {
    throw new Error('JWT_SECRET (32 caractères minimum) est obligatoire en production')
  }
  return config
}
