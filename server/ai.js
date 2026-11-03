// Recommandation par une vraie IA (API Claude).
// Règles de l'architecture :
//  - l'IA ne reçoit que des itinéraires (aucune donnée personnelle) ;
//  - elle compare et recommande, elle n'invente ni trajet ni horaire ;
//  - le serveur vérifie sa réponse ; sinon, ou si elle dépasse le délai : plan B (secours) ;
//  - les résultats identiques sont réutilisés (coût).
import crypto from 'node:crypto'
import Anthropic from '@anthropic-ai/sdk'
import { Router } from 'express'
import rateLimit from 'express-rate-limit'

const MODES = new Set(['marche', 'metro', 'tram', 'bus', 'train'])
const FIABILITE = new Set(['high', 'medium', 'low'])

const SYSTEME = `Tu aides un voyageur dont le trajet est perturbé. Tu reçois une liste d'itinéraires alternatifs fournis par des opérateurs de transport, l'heure d'arrivée souhaitée et ses préférences.
Choisis l'itinéraire qui convient le mieux.
Règles strictes :
- choisis UNIQUEMENT parmi les identifiants fournis ;
- ne crée aucun itinéraire et n'invente aucun horaire ;
- n'écris dans la raison que des heures présentes dans les données (champ arrivalLabel) ;
- ne cite jamais les identifiants techniques (routeId) dans la raison : parle du trajet en termes simples (arrivée, correspondances, marche, fiabilité) ;
- réponds uniquement par un objet JSON : {"routeId": string, "claimedArrivalMin": number, "reason": string}.
La raison est une seule phrase en français, de 140 caractères maximum, qui explique le choix.`

const hhmm = (min) => `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`

// On ne garde que les champs attendus : rien d'autre ne peut partir vers l'IA
export function nettoyerDemande(corps) {
  const alternatives = Array.isArray(corps?.alternatives) ? corps.alternatives.slice(0, 8) : []
  const propres = alternatives.map((a) => ({
    id: String(a?.id ?? '').slice(0, 40),
    durationMin: Number(a?.durationMin),
    arrivalMin: Number(a?.arrivalMin),
    transfers: Number(a?.transfers),
    walkMin: Number(a?.walkMin),
    reliability: a?.reliability,
    modes: (Array.isArray(a?.modes) ? a.modes : []).filter((x) => MODES.has(x)).slice(0, 10),
  }))
  const valide = propres.length >= 1 && propres.every((a) =>
    a.id && [a.durationMin, a.arrivalMin, a.transfers, a.walkMin].every((n) => Number.isFinite(n) && n >= 0 && n < 3000) && FIABILITE.has(a.reliability))
  if (!valide) return null
  const prefs = corps.prefs || {}
  return {
    alternatives: propres.map((a) => ({ ...a, arrivalLabel: hhmm(a.arrivalMin) })),
    arriveByMin: Number.isFinite(Number(corps.arriveByMin)) ? Number(corps.arriveByMin) : null,
    continueArrivalMin: Number.isFinite(Number(corps.continueArrivalMin)) ? Number(corps.continueArrivalMin) : null,
    prefs: {
      priorite: ['arrivee', 'simplicite', 'confort'].includes(prefs.priorite) ? prefs.priorite : 'arrivee',
      arriverHeure: prefs.arriverHeure !== false,
      moinsChangements: prefs.moinsChangements === true,
      moinsMarche: prefs.moinsMarche === true,
      eviterRetards: prefs.eviterRetards === true,
    },
  }
}

// Contrôle par règles de la réponse de l'IA
export function verifierRecommandation(reco, alternatives) {
  if (!reco || typeof reco.routeId !== 'string' || typeof reco.reason !== 'string') return false
  const route = alternatives.find((a) => a.id === reco.routeId)
  if (!route) return false
  if (reco.claimedArrivalMin !== route.arrivalMin) return false
  const raison = reco.reason.trim()
  if (!raison || raison.length > 300) return false
  // Toute heure citée dans la phrase doit exister dans les données
  const autorisees = new Set(alternatives.map((a) => a.arrivalLabel))
  for (const h of raison.match(/\b\d{1,2}[:h]\d{2}\b/g) || []) {
    const normal = h.replace('h', ':').padStart(5, '0')
    if (!autorisees.has(normal)) return false
  }
  return true
}

function lireJson(texte) {
  const debut = texte.indexOf('{')
  const fin = texte.lastIndexOf('}')
  if (debut < 0 || fin <= debut) return null
  try { return JSON.parse(texte.slice(debut, fin + 1)) } catch { return null }
}

const RISQUE = { high: 0, medium: 3, low: 8 }

// Recommandation AUTOMATIQUE, gratuite : des règles, pas une IA générative.
// Elle choisit parmi les itinéraires fournis et rédige une phrase à partir des chiffres : rien n'est inventé.
export function recommandationLocale(d) {
  const p = d.prefs
  const note = (a) => {
    if (p.priorite === 'simplicite') return a.transfers * 10000 + a.arrivalMin
    if (p.priorite === 'confort') return (a.walkMin * 1.5 + RISQUE[a.reliability]) * 10000 + a.arrivalMin
    let s = a.arrivalMin
    if (p.arriverHeure && d.arriveByMin !== null && a.arrivalMin > d.arriveByMin) s += 20 + (a.arrivalMin - d.arriveByMin)
    if (p.moinsChangements) s += a.transfers * 4
    if (p.moinsMarche) s += a.walkMin * 0.5
    if (p.eviterRetards) s += RISQUE[a.reliability]
    return s
  }
  const meilleur = [...d.alternatives].sort((a, b) => note(a) - note(b))[0]
  const corr = meilleur.transfers === 0 ? 'sans correspondance' : meilleur.transfers === 1 ? 'avec 1 correspondance' : `avec ${meilleur.transfers} correspondances`
  const gain = d.continueArrivalMin !== null ? d.continueArrivalMin - meilleur.arrivalMin : 0
  const heureVoulue = d.arriveByMin === null ? null : meilleur.arrivalMin <= d.arriveByMin
  const h = hhmm(meilleur.arrivalMin)
  let raison
  if (p.priorite === 'simplicite') raison = `Le plus simple : ${meilleur.transfers === 0 ? 'trajet direct' : corr}, arrivée à ${h}.`
  else if (p.priorite === 'confort') raison = `Le plus confortable : ${meilleur.walkMin} min de marche, ${corr}, arrivée à ${h}.`
  else {
    raison = `Arrivée à ${h}${gain > 0 ? `, ${gain} min plus tôt que si vous continuez` : d.continueArrivalMin !== null ? ', pas plus tôt que si vous continuez' : ''}${heureVoulue === null ? '' : heureVoulue ? ', dans les temps' : ', après l’heure voulue'}, ${corr}.`
  }
  return { source: 'regles', routeId: meilleur.id, claimedArrivalMin: meilleur.arrivalMin, reason: raison }
}

// Appel du modèle : une seule fonction, quel que soit le fournisseur. Elle renvoie le texte de la réponse.
//  1. service compatible « OpenAI » (Groq, Gemini, OpenRouter, Ollama…) : gratuit possible ;
//  2. API Claude.
export function creerAppelModele(config, client) {
  if (!client && config.aiBaseUrl && config.aiModel) {
    const modeles = config.aiModels?.length ? config.aiModels : [config.aiModel]
    return {
      nom: new URL(config.aiBaseUrl).host,
      async appeler(demande, signal) {
        const entetes = { 'content-type': 'application/json', ...(config.aiApiKey ? { authorization: `Bearer ${config.aiApiKey}` } : {}) }
        const url = config.aiBaseUrl + '/chat/completions'
        const corps = (modele, avecFormat) => JSON.stringify({
          model: modele, temperature: 0, max_tokens: 300,
          messages: [{ role: 'system', content: SYSTEME }, { role: 'user', content: JSON.stringify(demande) }],
          ...(avecFormat ? { response_format: { type: 'json_object' } } : {}),
        })
        let derniere = 'ia_aucun_modele'
        // Les offres gratuites limitent le nombre de requêtes PAR MODÈLE et par jour (erreur 429) : on passe au modèle suivant
        for (const modele of modeles) {
          let rep = await fetch(url, { method: 'POST', headers: entetes, body: corps(modele, true), signal })
          if (rep.status === 400) rep = await fetch(url, { method: 'POST', headers: entetes, body: corps(modele, false), signal }) // certains services refusent response_format
          if (rep.status === 429 || rep.status >= 500) { derniere = 'ia_http_' + rep.status; continue }
          if (!rep.ok) throw new Error('ia_http_' + rep.status)
          const donnees = await rep.json()
          return { texte: donnees.choices?.[0]?.message?.content ?? '', modele }
        }
        throw new Error(derniere)
      },
    }
  }
  const claude = client || (process.env.ANTHROPIC_API_KEY && !config.aiBaseUrl ? new Anthropic() : null)
  if (!claude) return null
  return {
    nom: 'Claude',
    async appeler(demande, signal) {
      const message = await claude.messages.create(
        { model: config.aiModel, max_tokens: 600, system: SYSTEME, output_config: { effort: 'low' }, messages: [{ role: 'user', content: JSON.stringify(demande) }] },
        { signal, maxRetries: 0 },
      )
      return { texte: (message.content || []).filter((b) => b.type === 'text').map((b) => b.text).join(''), modele: config.aiModel }
    },
  }
}

export function creerRecommandeur({ db, config, client }) {
  const memoire = new Map() // résultat déjà calculé -> pas de 2e appel
  const modele = creerAppelModele(config, client)

  const journal = (outcome, ms, nomModele) => {
    try { db.prepare('INSERT INTO ai_calls (model, outcome, ms) VALUES (?, ?, ?)').run(nomModele || config.aiModel || 'regles', outcome, Math.round(ms)) } catch { /* journal facultatif */ }
  }
  const secours = (raison) => ({ source: 'secours', routeId: null, reason: '', cause: raison })

  return async function recommander(demande) {
    const debut = Date.now()
    // Aucune IA configurée : recommandation automatique par règles (gratuite), annoncée comme telle
    if (!modele) { journal('regles', 0); return recommandationLocale(demande) }

    const cle = crypto.createHash('sha256').update(JSON.stringify(demande)).digest('hex')
    if (memoire.has(cle)) { journal('cache', 0); return memoire.get(cle) }

    try {
      const { texte, modele: utilise } = await modele.appeler(demande, AbortSignal.timeout(config.aiTimeoutMs))
      const reco = lireJson(texte)
      if (!verifierRecommandation(reco, demande.alternatives)) {
        journal('refusee_par_le_controle', Date.now() - debut, utilise)
        return secours('refusee_par_le_controle')
      }
      const resultat = { source: 'ia', routeId: reco.routeId, claimedArrivalMin: reco.claimedArrivalMin, reason: reco.reason.trim() }
      memoire.set(cle, resultat)
      if (memoire.size > 200) memoire.delete(memoire.keys().next().value)
      journal('ok', Date.now() - debut, utilise)
      return resultat
    } catch (e) {
      const trop_lent = e?.name === 'TimeoutError' || e?.name === 'AbortError' || /abort|timeout/i.test(e?.message || '')
      journal(trop_lent ? 'trop_lent' : 'erreur', Date.now() - debut)
      return secours(trop_lent ? 'trop_lent' : 'erreur')
    }
  }
}

export function creerRoutesIa({ recommander }) {
  const router = Router()
  router.use('/recommend', rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: true, legacyHeaders: false }))
  router.post('/recommend', async (req, res) => {
    const demande = nettoyerDemande(req.body)
    if (!demande) return res.status(400).json({ error: 'requete_invalide', message: 'Alternatives invalides.' })
    res.json(await recommander(demande))
  })
  return router
}
