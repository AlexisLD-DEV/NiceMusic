/**
 * Instances Invidious publiques, avec bascule automatique (cf. index.ts).
 * Ordre = préférence : les instances qui répondent le mieux en pratique
 * (recherche JSON + stream via /latest_version) sont en tête.
 * Maintenable : ajoutez/retirez des entrées, la santé est vérifiée à l'usage.
 */
export const INSTANCES: string[] = [
  'https://invidious.materialio.us',
  'https://inv.zoomerville.com',
  'https://invidious.f5.si',
  'https://invidious.tiekoetter.com',
  'https://yewtu.be',
  'https://invidious.nerdvpn.de',
  'https://iv.melmac.space',
  'https://invidious.jing.rocks'
]

export const SEARCH_CACHE_TTL_SECONDS = 6 * 3600
export const HISTORY_CAP = 200
export const FETCH_TIMEOUT_MS = 10_000
