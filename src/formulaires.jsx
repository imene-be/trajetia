// Éléments d'interface qui parlent au serveur : choix d'un lieu, fenêtre de compte, bandeau de source.
import { Icone } from './Icones.jsx'
import React, { useEffect, useId, useState } from 'react'
import { api } from './api.js'

// ---------- Champ de lieu avec suggestions (les lieux viennent de l'API : arrêts Ilévia + Base Adresse Nationale) ----------
// Comparaison souple : sans accents, tirets ni apostrophes (« Republique Beaux Arts » = « République Beaux-Arts »)
const cle = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

export function ChampLieu({ etiquette, lieu, onChoisir, onPosition }) {
  const [texte, setTexte] = useState(lieu?.label || '')
  const [options, setOptions] = useState([])
  const [etat, setEtat] = useState('') // '' | 'recherche' | 'aucun' | 'erreur'
  const [ouvert, setOuvert] = useState(false)
  const [actif, setActif] = useState(0) // suggestion surlignée (clavier)
  const idListe = useId()
  const idChamp = useId()

  // Quand un lieu est choisi (par l'utilisateur, la position, l'inversion ou un trajet enregistré), le champ affiche son nom
  useEffect(() => { if (lieu?.label) setTexte(lieu.label) }, [lieu?.id, lieu?.label])

  const choisir = (o) => {
    setTexte(o.label)
    setOptions([])
    setOuvert(false)
    setEtat('')
    onChoisir({ id: o.id, label: o.label, lat: o.lat, lon: o.lon })
  }

  // Suggestions : on interroge l'API dès 2 caractères (sauf si le texte est déjà le lieu choisi)
  useEffect(() => {
    const q = texte.trim()
    if (q.length < 2 || (lieu && texte === lieu.label)) { setOptions([]); setEtat(''); return undefined }
    let encours = true
    setEtat('recherche')
    const minuteur = setTimeout(() => {
      api.lieux(q).then((r) => {
        if (!encours) return
        setOptions(r.places)
        setActif(0)
        setEtat(r.places.length ? '' : 'aucun')
        // Le texte tapé correspond exactement à une suggestion : elle est retenue sans avoir à cliquer
        const exact = !lieu && r.places.find((o) => cle(o.label) === cle(q))
        if (exact) onChoisir({ id: exact.id, label: exact.label, lat: exact.lat, lon: exact.lon })
      }).catch(() => { if (encours) { setOptions([]); setEtat('erreur') } })
    }, 250)
    return () => { encours = false; clearTimeout(minuteur) }
  }, [texte])

  const changer = (valeur) => {
    setTexte(valeur)
    setOuvert(true)
    // Le texte ne correspond plus au lieu choisi : on oublie ce lieu (sinon la recherche utiliserait l'ancien en silence)
    if (lieu && valeur !== lieu.label) onChoisir(null)
  }

  const clavier = (e) => {
    if (!options.length) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setOuvert(true); setActif((i) => (i + 1) % options.length) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActif((i) => (i - 1 + options.length) % options.length) }
    else if (e.key === 'Enter') { e.preventDefault(); choisir(options[actif] || options[0]) }
    else if (e.key === 'Escape') setOuvert(false)
  }

  // En quittant le champ sans avoir cliqué : la meilleure suggestion est retenue (le champ affiche son nom)
  const quitter = () => {
    setOuvert(false)
    if (!lieu && options.length) choisir(options[0])
  }

  const montrer = ouvert && texte.trim().length >= 2 && !(lieu && texte === lieu.label)

  return (
    <div className="champ champ-lieu">
      <small><label htmlFor={idChamp}>{etiquette}</label></small>
      <span className="champ-ligne">
        <input
          id={idChamp} value={texte} placeholder="Saisissez un arrêt ou une adresse" autoComplete="off"
          role="combobox" aria-expanded={montrer && options.length > 0} aria-controls={idListe} aria-autocomplete="list"
          onChange={(e) => changer(e.target.value)} onFocus={(e) => { e.target.select(); setOuvert(true) }} onBlur={quitter} onKeyDown={clavier}
        />
        {onPosition && <button type="button" className="mini-bouton" onClick={onPosition} aria-label="Utiliser ma position"><Icone nom="locate" taille={18} /></button>}
      </span>
      {montrer && options.length > 0 && (
        <ul className="suggestions" role="listbox" id={idListe}>
          {options.map((o, i) => (
            <li key={o.id} role="option" aria-selected={i === actif}>
              {/* onMouseDown : choisir avant que le champ ne perde le focus */}
              <button type="button" className={i === actif ? 'actif' : ''} onMouseDown={(e) => { e.preventDefault(); choisir(o) }}>
                <Icone nom={o.type === 'address' ? 'pin' : 'bus'} taille={15} />
                <span>{o.label}</span>
                <small>{o.type === 'address' ? 'Adresse' : 'Arrêt'}</small>
              </button>
            </li>
          ))}
        </ul>
      )}
      {montrer && etat === 'aucun' && <div className="suggestions vide">Aucun arrêt ni adresse trouvé dans la métropole lilloise.</div>}
      {montrer && etat === 'erreur' && <div className="suggestions vide">Suggestions indisponibles pour le moment.</div>}
    </div>
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
        <button type="button" className="fermer" onClick={onFermer} aria-label="Fermer"><Icone nom="x" taille={16} /></button>
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
    return <div className="bandeau-source rouge" role="alert"><Icone nom="alertCircle" taille={15} /> Le serveur TrajetIA ne répond pas. Lancez-le avec « npm run dev » dans le dossier trajetia, puis rechargez la page.</div>
  }
  const source = sante.source
  if (!source) {
    return <div className="bandeau-source rouge" role="alert"><Icone nom="alertCircle" taille={15} /> Aucune source de données de transport n’est active sur le serveur.</div>
  }
  if (source.ready === false) {
    return <div className="bandeau-source" role="status"><Icone nom="clock" taille={15} /> Chargement des horaires du réseau {source.name}… quelques secondes.</div>
  }
  if (source.error) {
    return <div className="bandeau-source rouge" role="alert"><Icone nom="alertCircle" taille={15} /> Horaires indisponibles : {source.error}</div>
  }
  if (!source.real) {
    return <div className="bandeau-source" role="status"><Icone nom="flask" taille={15} /> Données de démonstration (fictives). Pas de transport réel.</div>
  }
  return <div className="bandeau-source ok" role="status"><Icone nom="checkCircle" taille={15} /> Données réelles : {source.name}. Horaires officiels et temps réel.</div>
}
