// Éléments d'interface qui parlent au serveur : choix d'un lieu, fenêtre de compte, bandeau de source.
import React, { useEffect, useId, useState } from 'react'
import { api } from './api.js'

// ---------- Champ de lieu avec suggestions (les lieux viennent de la source de données) ----------
export function ChampLieu({ etiquette, lieu, onChoisir, onPosition }) {
  const [texte, setTexte] = useState(lieu?.label || '')
  const [options, setOptions] = useState([])
  const idListe = useId()

  // Quand un lieu est choisi (par l'utilisateur, la position ou un trajet enregistré), le champ affiche son nom
  useEffect(() => { if (lieu?.label) setTexte(lieu.label) }, [lieu?.id, lieu?.label])

  useEffect(() => {
    if (texte.trim().length < 2 || texte === lieu?.label) { setOptions([]); return undefined }
    let actif = true
    const minuteur = setTimeout(() => {
      api.lieux(texte.trim()).then((r) => { if (actif) setOptions(r.places) }).catch(() => { if (actif) setOptions([]) })
    }, 250)
    return () => { actif = false; clearTimeout(minuteur) }
  }, [texte])

  const changer = (valeur) => {
    setTexte(valeur)
    const trouve = options.find((o) => o.label === valeur)
    if (trouve) onChoisir({ id: trouve.id, label: trouve.label })
    // Le texte ne correspond plus au lieu choisi : on oublie ce lieu (sinon la recherche utiliserait l'ancien en silence)
    else if (lieu && valeur !== lieu.label) onChoisir(null)
  }

  return (
    <label className="champ">
      <small>{etiquette}</small>
      <span className="champ-ligne">
        <input value={texte} onChange={(e) => changer(e.target.value)} list={idListe} placeholder="Saisissez un arrêt ou une gare" />
        {onPosition && <button type="button" className="mini-bouton" onClick={onPosition} aria-label="Utiliser ma position">📍</button>}
      </span>
      <datalist id={idListe}>{options.map((o) => <option key={o.id} value={o.label} />)}</datalist>
    </label>
  )
}

// ---------- Fenêtre : connexion / inscription ----------
export function FeuilleCompte({ onFermer, onConnecte, message }) {
  const [mode, setMode] = useState('inscription')
  const [email, setEmail] = useState('')
  const [motDePasse, setMotDePasse] = useState('')
  const [erreur, setErreur] = useState('')
  const [attente, setAttente] = useState(false)

  const envoyer = async (e) => {
    e.preventDefault()
    setErreur('')
    setAttente(true)
    try {
      const rep = mode === 'inscription' ? await api.inscription(email, motDePasse) : await api.connexion(email, motDePasse)
      onConnecte(rep.user, mode === 'inscription')
    } catch (err) {
      setErreur(err.message)
    } finally {
      setAttente(false)
    }
  }

  return (
    <div className="voile" role="dialog" aria-modal="true" aria-label="Compte TrajetIA">
      <form className="feuille" onSubmit={envoyer}>
        <button type="button" className="fermer" onClick={onFermer} aria-label="Fermer">✕</button>
        <h2>{mode === 'inscription' ? 'Créer mon compte' : 'Me connecter'}</h2>
        <p className="sous-titre sans-limite">{message || 'Une adresse e-mail suffit pour enregistrer vos trajets et recevoir des alertes.'}</p>
        <label className="champ">
          <small>Adresse e-mail</small>
          <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="champ">
          <small>Mot de passe (10 caractères minimum)</small>
          <input type="password" autoComplete={mode === 'inscription' ? 'new-password' : 'current-password'} required minLength={10} value={motDePasse} onChange={(e) => setMotDePasse(e.target.value)} />
        </label>
        {erreur && <div className="note orange" role="alert">{erreur}</div>}
        <button className="bouton-principal large" disabled={attente}>{attente ? 'Un instant…' : mode === 'inscription' ? 'Créer mon compte' : 'Me connecter'}</button>
        <button type="button" className="lien centre" onClick={() => { setMode(mode === 'inscription' ? 'connexion' : 'inscription'); setErreur('') }}>
          {mode === 'inscription' ? 'J’ai déjà un compte' : 'Pas encore de compte ? S’inscrire'}
        </button>
      </form>
    </div>
  )
}

// ---------- Bandeau : d'où viennent les données ----------
//  sante : undefined = on vérifie, null = le serveur ne répond pas, sinon { source: { name, real, ready, error } | null }
export function BandeauSource({ sante }) {
  if (sante === undefined) return null
  if (sante === null) {
    return <div className="bandeau-source rouge" role="alert">⛔ Le serveur TrajetIA ne répond pas. Lancez-le avec « npm run dev » dans le dossier trajetia, puis rechargez la page.</div>
  }
  const source = sante.source
  if (!source) {
    return <div className="bandeau-source rouge" role="alert">⛔ Aucune source de données de transport n’est active sur le serveur.</div>
  }
  if (source.ready === false) {
    return <div className="bandeau-source" role="status">⏳ Chargement des horaires du réseau {source.name}… quelques secondes.</div>
  }
  if (source.error) {
    return <div className="bandeau-source rouge" role="alert">⛔ Horaires indisponibles : {source.error}</div>
  }
  if (!source.real) {
    return <div className="bandeau-source" role="status">🧪 Données de démonstration (fictives). Pas de transport réel.</div>
  }
  return <div className="bandeau-source ok" role="status">✅ Données réelles : {source.name}. Horaires officiels et temps réel.</div>
}
