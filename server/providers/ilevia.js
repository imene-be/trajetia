// Données RÉELLES et OUVERTES du réseau Ilévia (Lille), sans clé :
// flux temps réel GTFS-RT publié par transport.data.gouv.fr.
// Sert ici à mesurer la FRAÎCHEUR des données (votre 1re incertitude technique).
import GtfsRt from 'gtfs-realtime-bindings'

export const URL_ILEVIA_RT = 'https://proxy.transport.data.gouv.fr/resource/ilevia-lille-gtfs-rt'

export async function fraicheurIlevia(fetchImpl = fetch, maintenant = Date.now()) {
  const rep = await fetchImpl(URL_ILEVIA_RT, { signal: AbortSignal.timeout(10000) })
  if (!rep.ok) throw new Error('ilevia_rt_http_' + rep.status)
  const flux = GtfsRt.transit_realtime.FeedMessage.decode(new Uint8Array(await rep.arrayBuffer()))
  const horodatage = Number(flux.header.timestamp) * 1000
  return {
    reseau: 'Ilévia (Lille)',
    source: URL_ILEVIA_RT,
    horodatageFlux: new Date(horodatage).toISOString(),
    ageSecondes: Math.max(0, Math.round((maintenant - horodatage) / 1000)),
    entites: flux.entity.length,
    miseAJourDeCourses: flux.entity.filter((e) => e.tripUpdate).length,
    alertes: flux.entity.filter((e) => e.alert).length,
  }
}
