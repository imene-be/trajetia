// Point d'entrée Vercel (fonction serverless). Toutes les routes /api/* arrivent ici (voir vercel.json).
// Au premier appel d'une instance (« démarrage à froid ») : connexion à la base puis chargement des horaires du réseau.
import { assembler } from '../server/serveur.js'

let pret = null

function demarrer() {
  if (!pret) {
    pret = (async () => {
      const s = await assembler()
      if (typeof s.provider.charger === 'function') await s.provider.charger()
      return s.app
    })().catch((e) => { pret = null; throw e }) // en cas d'échec, le prochain appel réessaie
  }
  return pret
}

export default async function handler(req, res) {
  try {
    const app = await demarrer()
    return app(req, res)
  } catch (e) {
    console.error('démarrage impossible :', e)
    res.statusCode = 503
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ error: 'demarrage_impossible', message: 'Le service démarre ou est indisponible, réessayez dans un instant.' }))
  }
}
