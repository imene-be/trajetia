import { creerNavitia } from './navitia.js'
import { creerDemo } from './demo.js'
import { creerIlevia } from './gtfs.js'

// Choix de la source de données :
//  1. Navitia si un jeton est fourni (SNCF et plusieurs réseaux) ;
//  2. sinon les données OUVERTES du réseau Ilévia (Lille), réelles et sans clé ;
//  3. la démonstration fictive n'existe que si on la demande explicitement (DEMO_DATA=true).
export function choisirFournisseur(config) {
  if (config.navitiaToken) return creerNavitia(config)
  if (process.env.DEMO_DATA === 'true') return creerDemo()
  return creerIlevia(config)
}
