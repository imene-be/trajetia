import pg from 'pg'
import { PGlite } from '@electric-sql/pglite'

// Base de données PostgreSQL.
//  - EN PRODUCTION (Vercel, Neon, Supabase…) : une adresse postgres://… dans DATABASE_URL.
//  - EN LOCAL, sans rien installer : PGlite, un vrai PostgreSQL qui tourne dans le programme et garde ses
//    données dans un dossier (data/pgdata), ou en mémoire pour les tests ('memory://').
// Le reste du code ne voit qu'une petite interface : get / all / run / exec.

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    prefs_json TEXT NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS trips (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    from_label TEXT NOT NULL,
    from_id TEXT NOT NULL,
    to_label TEXT NOT NULL,
    to_id TEXT NOT NULL,
    arrive_by TEXT NOT NULL,
    alerts_on INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS push_subscriptions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS alerts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    trip_id INTEGER REFERENCES trips(id) ON DELETE SET NULL,
    signature TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'warn',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, signature)
  );
  CREATE TABLE IF NOT EXISTS events (
    id SERIAL PRIMARY KEY,
    visitor_id TEXT NOT NULL,
    user_id INTEGER,
    name TEXT NOT NULL,
    channel TEXT NOT NULL DEFAULT 'direct',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS events_name ON events(name, created_at);
  CREATE TABLE IF NOT EXISTS ai_calls (
    id SERIAL PRIMARY KEY,
    model TEXT NOT NULL,
    outcome TEXT NOT NULL,
    ms INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
`

const estUneAdressePostgres = (c) => /^postgres(ql)?:\/\//i.test(c)

/**
 * @param {string} cible  adresse postgres://… (production), 'memory://' (tests) ou chemin d'un dossier (local)
 * @param {{ max?: number }} options  max = nombre de connexions de l'adresse postgres (1 pour un PGlite derrière un socket)
 */
export async function openDb(cible, options = {}) {
  let executer // (sql, params) -> { rows, count }
  let fermer
  let type

  if (estUneAdressePostgres(cible)) {
    type = 'postgres'
    const pool = new pg.Pool({ connectionString: cible, max: options.max ?? 5, idleTimeoutMillis: 10_000 })
    executer = async (sql, params) => { const r = await pool.query(sql, params); return { rows: r.rows, count: r.rowCount ?? 0 } }
    fermer = () => pool.end()
    // Création des tables : on saute l'étape si tout existe déjà (cas normal). Pas de verrou de session :
    // il est incompatible avec le pooler de Neon. Si deux démarrages simultanés se croisent, le perdant réessaie.
    const existe = async () => (await pool.query("SELECT to_regclass('public.ai_calls') AS t")).rows[0].t !== null
    if (!(await existe())) {
      for (let essai = 1; ; essai++) {
        try { await pool.query(SCHEMA); break } catch (e) {
          if (essai >= 4) throw e
          await new Promise((r) => setTimeout(r, 400 * essai))
        }
      }
    }
  } else {
    type = 'pglite'
    const pglite = cible === 'memory://' ? new PGlite() : new PGlite(cible)
    await pglite.waitReady
    executer = async (sql, params) => { const r = await pglite.query(sql, params); return { rows: r.rows, count: r.affectedRows ?? r.rows.length } }
    fermer = () => pglite.close()
    await pglite.exec(SCHEMA)
    return interface_(type, executer, fermer, pglite)
  }
  return interface_(type, executer, fermer)
}

function interface_(type, executer, fermer, pglite) {
  return {
    type,
    /** toutes les lignes */
    all: async (sql, params = []) => (await executer(sql, params)).rows,
    /** la première ligne (ou undefined) */
    get: async (sql, params = []) => (await executer(sql, params)).rows[0],
    /** pour INSERT / UPDATE / DELETE : { count } = nombre de lignes touchées */
    run: async (sql, params = []) => { const r = await executer(sql, params); return { count: r.count, rows: r.rows } },
    close: async () => { await fermer() },
    _pglite: pglite,
  }
}
