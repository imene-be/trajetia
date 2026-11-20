// Carte (Leaflet + OpenStreetMap) : repère « Vous êtes ici », départ (A), arrivée (B) et bouton « Me localiser ».
// La position reste dans le navigateur : elle n'est jamais envoyée à l'IA.
import React, { useEffect, useRef } from 'react'
import L from 'leaflet'
import { Icone } from './Icones.jsx'
import 'leaflet/dist/leaflet.css'

const LILLE = [50.6365, 3.0635]

const repere = (classe, texte) => L.divIcon({ className: '', html: `<div class="repere ${classe}">${texte}</div>`, iconSize: [28, 28], iconAnchor: [14, 14] })

export default function Carte({ position, depart, arrivee, onLocaliser, localisation }) {
  const conteneur = useRef(null)
  const carte = useRef(null)
  const couches = useRef({})
  const centreInitial = useRef(false)

  useEffect(() => {
    const m = L.map(conteneur.current, { zoomControl: false, attributionControl: true }).setView(LILLE, 13)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(m)
    L.control.zoom({ position: 'topleft' }).addTo(m)
    carte.current = m
    return () => { m.remove(); carte.current = null; couches.current = {}; centreInitial.current = false }
  }, [])

  // Met à jour (ou retire) un repère
  const placer = (cle, coord, icone, etiquette) => {
    const m = carte.current
    if (!m) return
    const ancien = couches.current[cle]
    if (!coord) { if (ancien) { m.removeLayer(ancien); delete couches.current[cle] } return }
    if (ancien) { ancien.setLatLng(coord) } else {
      const marqueur = L.marker(coord, { icon: icone, keyboard: false }).addTo(m)
      if (etiquette) marqueur.bindTooltip(etiquette, { permanent: true, direction: 'top', offset: [0, -12], className: 'info-repere' })
      couches.current[cle] = marqueur
    }
  }

  const aCoord = (l) => (l && Number.isFinite(l.lat) && Number.isFinite(l.lon) ? [l.lat, l.lon] : null)

  useEffect(() => {
    const m = carte.current
    if (!m) return
    const moi = position ? [position.lat, position.lon] : null
    placer('moi', moi, repere('moi', ''), 'Vous êtes ici')
    placer('depart', aCoord(depart), repere('a', 'A'), null)
    placer('arrivee', aCoord(arrivee), repere('b', 'B'), null)
    const points = [moi, aCoord(depart), aCoord(arrivee)].filter(Boolean)
    if (points.length > 1) m.fitBounds(L.latLngBounds(points), { padding: [36, 36], maxZoom: 15 })
    else if (points.length === 1) m.setView(points[0], 15)
    centreInitial.current = true
  }, [position?.lat, position?.lon, depart?.id, depart?.lat, arrivee?.id, arrivee?.lat])

  // Quand on touche « Me localiser », on recentre sur la position même si rien d'autre n'a changé
  useEffect(() => {
    if (localisation && position && carte.current) carte.current.setView([position.lat, position.lon], 16)
  }, [localisation])

  return (
    <div className="carte-zone">
      <div ref={conteneur} className="carte-leaflet" role="application" aria-label="Carte" />
      <button type="button" className="me-localiser" onClick={onLocaliser}><Icone nom="locate" taille={15} /> Me localiser</button>
    </div>
  )
}
