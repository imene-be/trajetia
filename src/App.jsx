import React, { useState, useEffect, useCallback, useRef } from 'react'
import { BarreOnglets } from './composants.jsx'
import { Icone } from './Icones.jsx'
import { FeuilleCompte, BandeauSource } from './formulaires.jsx'
import Accueil from './ecrans/Accueil.jsx'
import Perturbation from './ecrans/Perturbation.jsx'
import Itineraires from './ecrans/Itineraires.jsx'
import Favoris from './ecrans/Favoris.jsx'
import TrajetEnCours from './ecrans/TrajetEnCours.jsx'
import Alertes from './ecrans/Alertes.jsx'
import Profil from './ecrans/Profil.jsx'
import { api, suivre, canal } from './api.js'
import { ARRIVER_POUR_DEFAUT, versTrajet, etiqueter } from './data.js'

const PREFS_PAR_DEFAUT = {
  priorite: 'arrivee', arriverHeure: true, moinsChangements: true, moinsMarche: false, eviterRetards: true,
  position: true, notifications: false,
}

function lirePrefsLocales() {
  try { return { ...PREFS_PAR_DEFAUT, ...JSON.parse(localStorage.getItem('trajetia.prefs') || '{}') } } catch { return PREFS_PAR_DEFAUT }
}

// Quel onglet est allumé selon l'écran affiché
const ONGLET = {
  accueil: 'accueil', perturbation: 'accueil', trajet: 'accueil',
  alertes: 'alertes', itineraires: 'accueil', favoris: 'favoris', profil: 'profil',
}

// Permet d'ouvrir directement un écran : ?ecran=alertes
function ecranDepart() {
  const demande = new URLSearchParams(window.location.search).get('ecran')
  return ONGLET[demande] ? demande : 'accueil'
}

const base64VersOctets = (b64) => {
  const rempli = (b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(rempli), (c) => c.charCodeAt(0))
}

export default function App() {
  const [ecran, setEcran] = useState(ecranDepart)
  const [sante, setSante] = useState(undefined) // undefined = chargement, puis { source, ia, push }
  const [user, setUser] = useState(null)
  const [prefs, setPrefs] = useState(lirePrefsLocales)
  const [depart, setDepart] = useState(null)
  const [arrivee, setArrivee] = useState(null)
  const [arriverPour, setArriverPour] = useState(ARRIVER_POUR_DEFAUT)
  const [recherche, setRecherche] = useState({ etat: 'vide', trajets: [], perturbation: null, erreur: '' })
  const [choix, setChoix] = useState(null)
  const [etape, setEtape] = useState(0)
  const [trajetsEnregistres, setTrajetsEnregistres] = useState([])
  const [alertes, setAlertes] = useState([])
  const [feuille, setFeuille] = useState(null)
  const [message, setMessage] = useState('')
  // Position de l'utilisateur : gardée dans le navigateur uniquement (jamais envoyée à l'IA)
  const [position, setPosition] = useState(null)
  const [localisation, setLocalisation] = useState(0) // compteur : demande de recentrage de la carte
  const departModifie = useRef(false)
  const essaiPosition = useRef(false)
  const chercherRef = useRef(null)

  const toast = setMessage

  // Heure affichée dans la barre du téléphone (ordinateur uniquement)
  const lireHeure = () => new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  const [heureLocale, setHeureLocale] = useState(lireHeure)
  useEffect(() => { const t = setInterval(() => setHeureLocale(lireHeure()), 20000); return () => clearInterval(t) }, [])

  // Sur ordinateur : le téléphone (390 x 844 px + cadre) se réduit pour tenir dans la fenêtre, sans jamais changer de proportions
  useEffect(() => {
    const ajuster = () => {
      const echelle = Math.min(1, (window.innerHeight - 24) / 864, (window.innerWidth - 24) / 410)
      document.documentElement.style.setProperty('--echelle', String(Math.max(0.45, echelle)))
    }
    ajuster()
    window.addEventListener('resize', ajuster)
    return () => window.removeEventListener('resize', ajuster)
  }, [])

  useEffect(() => {
    try { localStorage.setItem('trajetia.prefs', JSON.stringify(prefs)) } catch { /* ignore */ }
  }, [prefs])

  useEffect(() => {
    if (!message) return undefined
    const t = setTimeout(() => setMessage(''), 3200)
    return () => clearTimeout(t)
  }, [message])

  const chargerCompte = useCallback(async (u) => {
    setUser(u)
    setPrefs((p) => ({ ...p, ...u.prefs }))
    const [t, a] = await Promise.all([api.trajets(), api.alertes()])
    setTrajetsEnregistres(t.trips)
    setAlertes(a.alerts)
  }, [])

  // Démarrage : source de données, session éventuelle, mesure de visite
  useEffect(() => {
    api.sante().then(setSante).catch(() => setSante(null))
    api.moi().then((r) => chargerCompte(r.user)).catch(() => {})
    try {
      if (!sessionStorage.getItem('trajetia.visite')) { sessionStorage.setItem('trajetia.visite', '1'); suivre('visit') }
    } catch { /* ignore */ }
  }, [chargerCompte])

  // Tant que le serveur ne répond pas ou que les horaires se chargent, on réessaie toutes les 2 secondes
  useEffect(() => {
    const attendre = sante === null || (sante && sante.source && sante.source.ready === false && !sante.source.error)
    if (!attendre) return undefined
    const t = setInterval(() => api.sante().then(setSante).catch(() => setSante(null)), 2000)
    return () => clearInterval(t)
  }, [sante])

  const numeroRecherche = useRef(0) // seule la dernière recherche lancée a le droit d'afficher son résultat

  const chercher = useCallback(async (d = depart, a = arrivee, options = {}) => {
    if (!d || !a) { toast('Choisissez un départ et une arrivée dans les suggestions.'); return null }
    const numero = ++numeroRecherche.current
    const aJour = () => numero === numeroRecherche.current
    setRecherche((r) => ({ ...r, etat: 'chargement', erreur: '' }))
    try {
      const rep = await api.itineraires({ from: d.id, to: a.id, arrive: options.arrive || arriverPour, incident: options.incident })
      if (!aJour()) return null // l'utilisateur a changé de lieu entre-temps : réponse périmée
      const trajets = etiqueter(rep.journeys.map(versTrajet))
      // Perturbation : le trajet habituel porte une perturbation (retard ou suppression, réel ou simulé).
      // Les autres trajets sont les alternatives qui évitent la ligne touchée (il peut ne pas y en avoir).
      let perturbation = null
      const touche = trajets.find((t) => t.perturbations.length > 0)
      if (touche) {
        // copies : les alternatives reçoivent leurs propres étiquettes sans écraser celles de la liste d'accueil
        const autres = trajets.filter((t) => t !== touche && t.perturbations.length === 0).map((t) => ({ ...t }))
        const p = touche.perturbations[0]
        perturbation = {
          ligne: p.title, titre: p.title, cause: p.message, dureeMin: p.delayMin ?? null, jusqua: null,
          simulee: Boolean(p.simulated), continuerArrivee: touche.arrivee, habituel: touche, alternatives: etiqueter(autres),
        }
      }
      const resultat = { etat: 'ok', trajets, perturbation, erreur: '', source: rep.source, simule: Boolean(rep.simulated), jour: rep.day, tempsReel: Boolean(rep.realtime) }
      setRecherche(resultat)
      return resultat
    } catch (e) {
      if (!aJour()) return null
      if (e.code === 'chargement') {
        // Les horaires du réseau se chargent : on réessaie tout seul
        setRecherche({ etat: 'chargement', trajets: [], perturbation: null, erreur: '' })
        setTimeout(() => { if (aJour()) chercherRef.current?.(d, a, options) }, 2500)
        return null
      }
      setRecherche({ etat: 'erreur', trajets: [], perturbation: null, erreur: e.message })
      return null
    }
  }, [depart, arrivee, arriverPour])

  chercherRef.current = chercher

  // Dès que le départ, l'arrivée ou l'heure changent, on relance la recherche (court délai pendant la saisie de l'heure).
  // Si un des deux lieux est effacé, les anciens résultats disparaissent : ils ne correspondent plus à la demande.
  useEffect(() => {
    if (!depart || !arrivee) {
      numeroRecherche.current++
      setRecherche({ etat: 'vide', trajets: [], perturbation: null, erreur: '' })
      return undefined
    }
    if (!/^\d{2}:\d{2}$/.test(arriverPour)) return undefined
    const t = setTimeout(() => chercherRef.current?.(depart, arrivee), 300)
    return () => clearTimeout(t)
  }, [depart?.id, arrivee?.id, arriverPour])

  // Les repères A et B de la carte ont besoin de coordonnées : on les complète si le lieu n'en a pas (trajet d'exemple, favori)
  const completer = (lieu, appliquer) => {
    if (!lieu || Number.isFinite(lieu.lat)) return
    if (lieu.id.startsWith('addr:')) {
      const [lon, lat] = lieu.id.slice(5).split(',').map(Number)
      if (Number.isFinite(lat) && Number.isFinite(lon)) appliquer((l) => (l && l.id === lieu.id ? { ...l, lat, lon } : l))
      return
    }
    api.lieux(lieu.label).then((r) => {
      const t = r.places.find((x) => x.id === lieu.id)
      if (t && Number.isFinite(t.lat)) appliquer((l) => (l && l.id === lieu.id ? { ...l, lat: t.lat, lon: t.lon } : l))
    }).catch(() => {})
  }
  useEffect(() => { completer(depart, setDepart) }, [depart?.id, depart?.lat])
  useEffect(() => { completer(arrivee, setArrivee) }, [arrivee?.id, arrivee?.lat])

  // Premier affichage : un trajet d'exemple prêt à l'emploi (Lille Flandres → Euratechnologies) quand les horaires sont prêts
  useEffect(() => {
    const src = sante?.source
    if (!src || src.ready === false || depart || arrivee) return
    const reel = src.real && /Ilévia/.test(src.name)
    if (!reel && src.real) return // autre source (ex. Navitia) : l'utilisateur choisit ses lieux
    const d = reel ? { id: 'stop:gare lille flandres', label: 'Gare Lille Flandres' } : { id: 'demo:lille-flandres', label: 'Lille Flandres' }
    const a = reel ? { id: 'stop:euratechnologies', label: 'Euratechnologies' } : { id: 'demo:euratechnologies', label: 'Euratechnologies' }
    setDepart(d)
    setArrivee(a) // la recherche part toute seule (effet ci-dessus)
  }, [sante])

  // Lecture de la position (avec l'accord du navigateur). Si `commeDepart`, l'arrêt ou l'adresse la plus proche devient le départ.
  const localiserUtilisateur = useCallback(({ commeDepart, centrer, silencieux }) => {
    if (!navigator.geolocation) { if (!silencieux) toast('La géolocalisation n’est pas disponible sur cet appareil.'); return }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lon } = pos.coords
        setPosition({ lat, lon })
        if (centrer) setLocalisation((n) => n + 1)
        if (!commeDepart) return
        try {
          const r = await api.lieuxProches(lat, lon)
          const lieu = r.places[0]
          // Hors du réseau (aucun arrêt à moins d'un kilomètre) : on garde le départ actuel
          if (!lieu) { if (!silencieux) toast('Aucun arrêt Ilévia près de votre position : saisissez votre départ.'); return }
          if (silencieux && departModifie.current) return // l'utilisateur a déjà choisi son départ
          setDepart({ id: lieu.id, label: lieu.label, lat, lon }) // la recherche se relance toute seule
          if (!silencieux) toast('Départ : ' + lieu.label)
        } catch (e) { if (!silencieux) toast(e.message) }
      },
      () => { if (!silencieux) toast('Position refusée : saisissez votre départ à la main.') },
      { timeout: 8000, maximumAge: 60000 },
    )
  }, [])

  // Au lancement : la position sert de départ par défaut, si la préférence est active. Refus = saisie manuelle, sans message.
  useEffect(() => {
    const src = sante?.source
    if (!src || src.ready === false || essaiPosition.current) return
    essaiPosition.current = true
    if (prefs.position) localiserUtilisateur({ commeDepart: true, silencieux: true })
  }, [sante])

  const aller = (nom) => {
    setEcran(nom)
    document.querySelector('.contenu')?.scrollTo(0, 0)
    if ((nom === 'perturbation' || nom === 'itineraires') && recherche.perturbation) suivre('alternative_viewed')
    // Les alertes créées par le serveur pendant que l'application est ouverte apparaissent dès qu'on ouvre l'écran
    if (nom === 'alertes' && user) api.alertes().then((a) => setAlertes(a.alerts)).catch(() => {})
  }

  const ouvrirCompte = (messageFeuille) => setFeuille({ message: messageFeuille })

  const app = {
    sante, user, prefs, depart, arrivee, position, localisation, setArrivee,
    setDepart: (lieu) => { departModifie.current = true; setDepart(lieu) }, arriverPour, setArriverPour,
    recherche, chercher, choix, etape, setEtape, trajetsEnregistres, alertes,
    aller, toast, ouvrirCompte,

    changerPref: async (cle, valeur) => {
      const suivantes = { ...prefs, [cle]: valeur }
      setPrefs(suivantes)
      if (user) { try { await api.majPrefs(suivantes) } catch { toast('Préférence non enregistrée sur le serveur.') } }
    },

    // Test : simule un incident sur la ligne de votre trajet. Les horaires et les itinéraires restent ceux du vrai réseau.
    simuler: async () => {
      const r = await chercher(depart, arrivee, { incident: true })
      if (r?.perturbation) {
        suivre('demo_started')
        toast('Incident simulé sur votre ligne (test)')
        setEcran('perturbation')
        suivre('alternative_viewed')
      } else if (r) toast('Aucune alternative trouvée pour cet incident simulé.')
    },

    choisir: (trajet) => { setChoix(trajet); setEtape(0); aller('trajet') },

    partager: (trajet) => {
      const texte = 'J’arrive à ' + String(Math.floor(trajet.arrivee / 60)).padStart(2, '0') + ':' + String(trajet.arrivee % 60).padStart(2, '0') + ' (TrajetIA)'
      try { navigator.clipboard?.writeText(texte) } catch { /* ignore */ }
      toast('Heure d’arrivée copiée : ' + texte)
    },

    // ---------- Compte ----------
    apresConnexion: async (u, nouveau) => {
      await chargerCompte(u)
      if (nouveau) suivre('signup')
      const suite = feuille?.apres
      setFeuille(null)
      toast(nouveau ? 'Compte créé. Bienvenue !' : 'Vous êtes connecté.')
      if (suite) suite()
    },
    deconnexion: async () => {
      await api.deconnexion().catch(() => {})
      setUser(null); setTrajetsEnregistres([]); setAlertes([]); setPrefs(PREFS_PAR_DEFAUT)
      toast('Vous êtes déconnecté.')
    },
    exporter: async () => {
      const donnees = await api.exporter()
      const lien = document.createElement('a')
      lien.href = URL.createObjectURL(new Blob([JSON.stringify(donnees, null, 2)], { type: 'application/json' }))
      lien.download = 'mes-donnees-trajetia.json'
      lien.click()
    },
    supprimerCompte: async () => {
      const mdp = window.prompt('Pour supprimer définitivement votre compte et vos trajets, saisissez votre mot de passe :')
      if (!mdp) return
      try {
        await api.supprimerCompte(mdp)
        setUser(null); setTrajetsEnregistres([]); setAlertes([]); setPrefs(PREFS_PAR_DEFAUT)
        toast('Compte et données supprimés.')
      } catch (e) { toast(e.message) }
    },

    // ---------- Trajets enregistrés ----------
    enregistrerTrajet: () => {
      if (!depart || !arrivee) { toast('Choisissez un départ et une arrivée.'); return }
      const faire = async () => {
        try {
          const { trip } = await api.creerTrajet({ name: `${depart.label} → ${arrivee.label}`, from: depart, to: arrivee, arriveBy: arriverPour, alertsOn: true })
          setTrajetsEnregistres((l) => [...l, trip])
          suivre('trip_saved')
          toast('Trajet enregistré. Nous le surveillons pour vous.')
        } catch (e) { toast(e.message) }
      }
      if (!user) setFeuille({ message: 'Créez votre compte pour enregistrer ce trajet et recevoir des alertes.', apres: faire })
      else faire()
    },
    supprimerTrajet: async (id) => {
      try { await api.supprimerTrajet(id); setTrajetsEnregistres((l) => l.filter((t) => t.id !== id)) } catch (e) { toast(e.message) }
    },
    basculerAlertes: async (trajet) => {
      try {
        const { trip } = await api.majTrajet(trajet.id, { name: trajet.name, from: trajet.from, to: trajet.to, arriveBy: trajet.arriveBy, alertsOn: !trajet.alertsOn })
        setTrajetsEnregistres((l) => l.map((t) => (t.id === trip.id ? trip : t)))
      } catch (e) { toast(e.message) }
    },
    ouvrirTrajet: (t) => {
      departModifie.current = true; setDepart(t.from); setArrivee(t.to); setArriverPour(t.arriveBy); setEcran('accueil')
      // Si rien n'a changé (même trajet, même heure), l'effet ne repart pas : on relance la recherche nous-mêmes
      if (t.from.id === depart?.id && t.to.id === arrivee?.id && t.arriveBy === arriverPour) chercher(t.from, t.to)
    },

    // ---------- Position (avec consentement : l'interrupteur du Profil + l'accord du navigateur) ----------
    utiliserPosition: () => { departModifie.current = true; localiserUtilisateur({ commeDepart: true, centrer: true }) },
    // Bouton « Me localiser » de la carte : montre « Vous êtes ici » sans changer le départ
    localiser: () => localiserUtilisateur({ centrer: true }),

    testerNotification: async () => {
      try {
        const { envoyes } = await api.testerPush()
        toast(envoyes > 0 ? 'Notification de test envoyée : regardez en haut de votre écran.' : 'Aucun appareil abonné : activez d’abord les notifications.')
      } catch (e) { toast(e.message) }
    },

    // ---------- Notifications push ----------
    basculerNotifications: async (activer) => {
      if (!activer) {
        try {
          const reg = await navigator.serviceWorker?.getRegistration()
          const sub = await reg?.pushManager.getSubscription()
          if (sub) { await api.desabonnerPush(sub.endpoint).catch(() => {}); await sub.unsubscribe() }
        } catch { /* ignore */ }
        return app.changerPref('notifications', false)
      }
      if (!user) { setFeuille({ message: 'Un compte est nécessaire pour vous envoyer des notifications.' }); return }
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        toast('Les notifications ne sont pas disponibles sur ce navigateur.'); return
      }
      try {
        const { publicKey } = await api.cleePush()
        if (!publicKey) { toast('Notifications non configurées sur le serveur (clés VAPID manquantes).'); return }
        const permission = await Notification.requestPermission()
        if (permission !== 'granted') { toast('Notifications refusées dans le navigateur.'); return }
        const reg = await navigator.serviceWorker.register('/sw.js')
        await navigator.serviceWorker.ready
        const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64VersOctets(publicKey) })
        await api.abonnerPush(sub.toJSON())
        suivre('push_enabled')
        await app.changerPref('notifications', true)
        toast('Notifications activées.')
      } catch (e) { toast('Activation impossible : ' + e.message) }
    },
  }

  const ecrans = { accueil: Accueil, perturbation: Perturbation, itineraires: Itineraires, favoris: Favoris, trajet: TrajetEnCours, alertes: Alertes, profil: Profil }
  const Ecran = ecrans[ecran]

  return (
    <div className="page">
      <div className="telephone">
        <div className="barre-statut"><span>{heureLocale}</span><span className="encoche" /><span className="etat-sys"><Icone nom="radio" taille={15} epaisseur={2.2} /></span></div>
        <div className="contenu">
          <BandeauSource sante={sante} />
          <Ecran key={ecran} app={app} />
        </div>
        {message && !feuille && <div className="toast" role="status">{message}</div>}
        {feuille && <FeuilleCompte message={feuille.message} onFermer={() => setFeuille(null)} onConnecte={app.apresConnexion} />}
        <BarreOnglets actif={ONGLET[ecran]} onChange={aller} />
      </div>
    </div>
  )
}

export { canal }
