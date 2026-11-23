// Carte (Leaflet + OpenStreetMap) : repère « Vous êtes ici », départ (A), arrivée (B), bouton « Me localiser »
// et tracé du trajet choisi : lignes aux couleurs du réseau avec leurs arrêts, marche en pointillés.
// La position reste dans le navigateur : elle n'est jamais envoyée à l'IA.
import React, { useEffect, useRef } from 'react'
import L from 'leaflet'
import { Icone } from './Icones.jsx'
import { api } from './api.js'
import 'leaflet/dist/leaflet.css'

const LILLE = [50.6365, 3.0635]
// Couleur par mode si le réseau n'en fournit pas pour la ligne
const COULEUR_MODE = { metro: '#d6001c', tram: '#0f766e', bus: '#1d4ed8', train: '#6b21a8' }

const repere = (classe, texte) => L.divIcon({ className: '', html: `<div class="repere ${classe}">${texte}</div>`, iconSize: [28, 28], iconAnchor: [14, 14] })

const distanceM = ([a, b], [c, d]) => {
  const r = Math.PI / 180
  const x = Math.sin(((c - a) * r) / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(((d - b) * r) / 2) ** 2
  return 6371000 * 2 * Math.asin(Math.sqrt(x))
}
const longueur = (chemin) => chemin.slice(1).reduce((s, p, i) => s + distanceM(chemin[i], p), 0)
const echapper = (s) => String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

// Identifiant stable d'un trajet affiché (pour ne pas redessiner à chaque rendu)
const cleTrajet = (t) => (t ? t.id + ':' + t.arrivee + ':' + t.etapes.map((e) => e.texte).join('|') : '')

export default function Carte({ position, depart, arrivee, onLocaliser, localisation, trajet }) {
  const conteneur = useRef(null)
  const carte = useRef(null)
  const couches = useRef({})
  const trace = useRef(null) // groupe de calques du trajet
  const generation = useRef(0) // ignore les tracés « sur les rues » arrivés après un changement de trajet

  useEffect(() => {
    const m = L.map(conteneur.current, { zoomControl: false, attributionControl: true }).setView(LILLE, 13)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(m)
    L.control.zoom({ position: 'topleft' }).addTo(m)
    trace.current = L.layerGroup().addTo(m)
    carte.current = m
    return () => { m.remove(); carte.current = null; couches.current = {}; trace.current = null }
  }, [])

  // Met à jour (ou retire) un repère
  const placer = (cle, coord, icone, etiquette) => {
    const m = carte.current
    if (!m) return
    const ancien = couches.current[cle]
    if (!coord) { if (ancien) { m.removeLayer(ancien); delete couches.current[cle] } return }
    if (ancien) { ancien.setLatLng(coord) } else {
      const marqueur = L.marker(coord, { icon: icone, keyboard: false, zIndexOffset: 1000 }).addTo(m)
      if (etiquette) marqueur.bindTooltip(etiquette, { permanent: true, direction: 'top', offset: [0, -12], className: 'info-repere' })
      couches.current[cle] = marqueur
    }
  }

  const aCoord = (l) => (l && Number.isFinite(l.lat) && Number.isFinite(l.lon) ? [l.lat, l.lon] : null)

  // Cadre la carte sur ce qui est affiché : le trajet s'il y en a un, sinon la position et les lieux A et B
  const cadrer = () => {
    const m = carte.current
    if (!m) return
    const points = [position ? [position.lat, position.lon] : null, aCoord(depart), aCoord(arrivee)].filter(Boolean)
    for (const e of trajet?.etapes || []) if (e.chemin) points.push(...e.chemin)
    if (points.length > 1) m.fitBounds(L.latLngBounds(points), { padding: [30, 30], maxZoom: 16 })
    else if (points.length === 1) m.setView(points[0], 15)
  }

  useEffect(() => {
    const moi = position ? [position.lat, position.lon] : null
    placer('moi', moi, repere('moi', ''), 'Vous êtes ici')
    placer('depart', aCoord(depart), repere('a', 'A'), null)
    placer('arrivee', aCoord(arrivee), repere('b', 'B'), null)
    cadrer()
  }, [position?.lat, position?.lon, depart?.id, depart?.lat, arrivee?.id, arrivee?.lat])

  // Tracé du trajet
  const cle = cleTrajet(trajet)
  useEffect(() => {
    const groupe = trace.current
    if (!groupe) return
    groupe.clearLayers()
    const numero = ++generation.current
    if (!trajet) return

    for (const e of trajet.etapes) {
      const chemin = e.chemin
      if (!chemin || chemin.length < 2) continue

      if (e.mode === 'marche') {
        if (longueur(chemin) < 15) continue // changement de quai au même endroit : rien à dessiner
        const ligne = L.polyline(chemin, { color: '#475569', weight: 4, opacity: 0.9, dashArray: '1 9', lineCap: 'round', interactive: false }).addTo(groupe)
        // Tracé réel à pied par les rues ; à défaut, la ligne droite reste (estimation, comme le calcul)
        api.rues('foot', [chemin[0], chemin[chemin.length - 1]]).then((r) => {
          if (numero === generation.current && r.path?.length > 1) ligne.setLatLngs([chemin[0], ...r.path, chemin[chemin.length - 1]])
        }).catch(() => {})
        continue
      }

      const couleur = e.couleur || COULEUR_MODE[e.mode] || COULEUR_MODE.bus
      const contour = L.polyline(chemin, { color: '#fff', weight: 10, opacity: 0.95, interactive: false }).addTo(groupe)
      const ligne = L.polyline(chemin, { color: couleur, weight: 6, opacity: 0.95 }).addTo(groupe)
      ligne.bindTooltip(echapper(e.ligne) + (e.vers ? ' → ' + echapper(e.vers) : ''), { sticky: true })

      // Arrêts : petits ronds pour les arrêts intermédiaires, plus grands pour la montée et la descente
      chemin.forEach((p, i) => {
        const extremite = i === 0 || i === chemin.length - 1
        const arret = L.circleMarker(p, { radius: extremite ? 6 : 3.5, color: couleur, weight: extremite ? 3 : 2, fillColor: '#fff', fillOpacity: 1 }).addTo(groupe)
        if (i === 0) arret.bindTooltip(`<b class="pastille-ligne" style="background:${couleur}">${echapper(e.ligne)}</b> ${echapper(e.de || '')}`, { permanent: true, direction: 'right', offset: [8, 0], className: 'info-ligne' })
      })

      // Bus et tram suivent la voirie : on cale le tracé sur les rues, si le résultat reste plausible
      // (le métro est souterrain : le trajet d'une station à l'autre reste en ligne droite)
      if ((e.mode === 'bus' || e.mode === 'tram') && chemin.length <= 60) {
        api.rues('car', chemin).then((r) => {
          if (numero !== generation.current || !(r.path?.length > 1)) return
          if (r.distanceM > longueur(chemin) * 1.6 + 300) return // détour improbable (voies réservées, sens unique…) : on garde arrêt par arrêt
          contour.setLatLngs(r.path)
          ligne.setLatLngs(r.path)
        }).catch(() => {})
      }
    }
    cadrer()
  }, [cle])

  // Quand on touche « Me localiser », on recentre sur la position même si rien d'autre n'a changé
  useEffect(() => {
    if (localisation && position && carte.current) carte.current.setView([position.lat, position.lon], 16)
  }, [localisation])

  return (
    <div className="carte-zone">
      <div ref={conteneur} className="carte-leaflet" role="application" aria-label="Carte du trajet" />
      <button type="button" className="me-localiser" onClick={onLocaliser}><Icone nom="locate" taille={15} /> Me localiser</button>
    </div>
  )
}
