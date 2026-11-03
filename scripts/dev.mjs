// Lance tout d'un coup : le serveur (port 3001) et l'application (port 5173).
//   npm run dev     puis ouvrir http://localhost:5173
import { spawn } from 'node:child_process'

const lancer = (nom, commande, args, couleur) => {
  const p = spawn(commande, args, { stdio: ['ignore', 'pipe', 'pipe'], env: process.env })
  const prefixe = (flux, sortie) => flux.on('data', (d) => d.toString().split('\n').filter(Boolean).forEach((l) => sortie.write(`\x1b[${couleur}m[${nom}]\x1b[0m ${l}\n`)))
  prefixe(p.stdout, process.stdout)
  prefixe(p.stderr, process.stderr)
  p.on('exit', (code) => { console.log(`[${nom}] arrêté (code ${code})`); arreter() })
  return p
}

const enfants = [
  lancer('serveur', process.execPath, ['--env-file-if-exists=.env', 'server/index.js'], 36),
  lancer('appli', process.execPath, ['node_modules/vite/bin/vite.js'], 35),
]
let fini = false
function arreter() {
  if (fini) return
  fini = true
  enfants.forEach((e) => e.kill())
  setTimeout(() => process.exit(0), 300)
}
process.on('SIGINT', arreter)
process.on('SIGTERM', arreter)
