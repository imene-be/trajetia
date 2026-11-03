import React, { useState, useEffect, useCallback } from 'react'
import { BarreOnglets } from './composants.jsx'
import { FeuilleCompte, BandeauSource } from './formulaires.jsx'
import Accueil from './ecrans/Accueil.jsx'
import Perturbation from './ecrans/Perturbation.jsx'
import Itineraires from './ecrans/Itineraires.jsx'
import TrajetEnCours from './ecrans/TrajetEnCours.jsx'
import Alertes from './ecrans/Alertes.jsx'
import Profil from './ecrans/Profil.jsx'
import { api, suivre, canal } from './api.js'
import { ARRIVER_POUR_DEFAUT, versTrajet, etiqueter } from './data.js'

const PREFS_PAR_DEFAUT = {
  priorite: 'arrivee', arriverHeure: true, moinsChangements: true, moinsMarche: false, eviterRetards: true,
  position: false, notifications: false,
}

function lirePrefsLocales() {
  try { return { ...PREFS_PAR_DEFAUT, ...JSON.parse(localStorage.getItem('trajetia.prefs') || '{}') } } catch { return PREFS_PAR_DEFAUT }
}

// Quel onglet est allumé selon l'écran affiché
const ONGLET = {
  accueil: 'accueil', perturbation: 'accueil', trajet: 'accueil',
  alertes: 'alertes', itineraires: 'itineraires', profil: 'profil',
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

  const toast = setMessage

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

  const chercher = useCallback(async (d = depart, a = arrivee, options = {}) => {
    if (!d || !a) { toast('Choisissez un départ et une arrivée dans les suggestions.'); return null }
    setRecherche((r) => ({ ...r, etat: 'chargement', erreur: '' }))
    try {
      const rep = await api.itineraires({ from: d.id, to: a.id, arrive: arriverPour, incident: options.incident })
      const trajets = etiqueter(rep.journeys.map(versTrajet))
      // Une perturbation est détectée si un trajet porte une perturbation et qu'il existe d'autres options
      let perturbation = null
      const touche = trajets.find((t) => t.perturbations.length > 0)
      const autres = trajets.filter((t) => t !== touche && t.perturbations.length === 0)
      if (touche && autres.length > 0) {
        const p = touche.perturbations[0]
        perturbation = {
          ligne: p.title, titre: p.title, cause: p.message, dureeMin: p.delayMin ?? null, jusqua: null,
          simulee: Boolean(p.simulated), continuerArrivee: touche.arrivee, alternatives: etiqueter(autres),
        }
      }
      const resultat = { etat: 'ok', trajets, perturbation, erreur: '', source: rep.source, simule: Boolean(rep.simulated), jour: rep.day, tempsReel: Boolean(rep.realtime) }
      setRecherche(resultat)
      return resultat
    } catch (e) {
      if (e.code === 'chargement') {
        // Les horaires du réseau se chargent : on réessaie tout seul
        setRecherche({ etat: 'chargement', trajets: [], perturbation: null, erreur: '' })
        setTimeout(() => chercher(d, a, options), 2500)
        return null
      }
      setRecherche({ etat: 'erreur', trajets: [], perturbation: null, erreur: e.message })
      return null
    }
  }, [depart, arrivee, arriverPour])

  // Premier affichage : un trajet d'exemple prêt à l'emploi (Lille Flandres → Euratechnologies) quand les horaires sont prêts
  useEffect(() => {
    const src = sante?.source
    if (!src || src.ready === false || depart || arrivee) return
    const reel = src.real && /Ilévia/.test(src.name)
    if (!reel && src.real) return // autre source (ex. Navitia) : l'utilisateur choisit ses lieux
    const d = reel ? { id: 'stop:gare lille flandres', label: 'Gare Lille Flandres' } : { id: 'demo:lille-flandres', label: 'Lille Flandres' }
    const a = reel ? { id: 'stop:euratechnologies', label: 'Euratechnologies' } : { id: 'demo:euratechnologies', label: 'Euratechnologies' }
    setDepart(d)
    setArrivee(a)
    chercher(d, a)
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
    sante, user, prefs, depart, arrivee, setDepart, setArrivee, arriverPour, setArriverPour,
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
        toast('🔔 Incident simulé sur votre ligne (test)')
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
    ouvrirTrajet: (t) => { setDepart(t.from); setArrivee(t.to); setArriverPour(t.arriveBy); setEcran('accueil'); chercher(t.from, t.to) },

    // ---------- Position (avec consentement : l'interrupteur du Profil + l'accord du navigateur) ----------
    utiliserPosition: () => {
      if (!navigator.geolocation) { toast('La géolocalisation n’est pas disponible sur cet appareil.'); return }
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          try {
            const r = await api.lieuxProches(pos.coords.latitude, pos.coords.longitude)
            if (r.places[0]) { setDepart({ id: r.places[0].id, label: r.places[0].label }); toast('Départ : ' + r.places[0].label) } else toast('Aucun arrêt proche trouvé.')
          } catch (e) { toast(e.message) }
        },
        () => toast('Position refusée : saisissez votre départ à la main.'),
        { timeout: 8000, maximumAge: 60000 },
      )
    },

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

  const ecrans = { accueil: Accueil, perturbation: Perturbation, itineraires: Itineraires, trajet: TrajetEnCours, alertes: Alertes, profil: Profil }
  const Ecran = ecrans[ecran]

  return (
    <div className="page">
      <div className="telephone">
        <div className="barre-statut"><span>9:41</span><span className="encoche" /><span>▂▄▆ 🔋</span></div>
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
