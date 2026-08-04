import type { Track } from './types'

/**
 * Accès aux instances Invidious depuis le navigateur.
 *
 * Contexte 2026 : les instances publiques bloquent (soft-block : 200 + HTML)
 * les IP de datacenter (Cloudflare) et servent du HTML aux User-Agents
 * navigateur. La recherche passe donc par un relais de lecture (Jina Reader,
 * r.jina.ai) qui proxifie depuis ses propres IP avec CORS ouvert, avec repli
 * sur un appel direct (si une instance l'autorise un jour).
 *
 * La lecture utilise les URLs « companion » directes (déterministes par
 * instance) : l'élément <audio> les joue sans CORS ni redirection (les
 * chaînes 302 sont bloquées par Chrome — ORB). Les companions étant instables
 * selon la vidéo, le lecteur essaie chaque candidate à tour de rôle.
 */

/** Instances Invidious publiques — à maintenir ; la rotation ignore les mortes. */
export const INSTANCES: string[] = [
  'https://inv.zoomerville.com',
  'https://invidious.materialio.us',
  'https://invidious.f5.si',
  'https://invidious.tiekoetter.com',
  'https://yewtu.be',
  'https://invidious.nerdvpn.de'
]

/**
 * Hôtes « companion » (proxy de flux des instances) — maintenable.
 * Ordre = fiabilité observée. Format :
 * {host}/companion/latest_version?id=VIDEO&itag=ITAG&local=true
 */
export const COMPANIONS: string[] = [
  'https://inv.zoomerville.com',
  'https://jp1-cmp.invidious.f5.si',
  'https://eu-de1.companion.invidious.tiekoetter.com'
]

/** index de la dernière instance qui a répondu (rotation recherche). */
let lastGood = -1

interface InvidiousItem {
  type?: string
  videoId?: string
  title?: string
  author?: string
  lengthSeconds?: number
}

function toTrack(v: InvidiousItem): Track {
  return {
    id: v.videoId ?? '',
    title: v.title ?? 'Sans titre',
    author: v.author ?? 'Inconnu',
    duration: v.lengthSeconds,
    // Thumbnail via le CDN officiel YouTube (les URLs d'instances utilisent
    // parfois un port interne :3000 injoignable depuis le navigateur)
    thumbnail: v.videoId ? `https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg` : undefined
  }
}

function mapItems(body: unknown): Track[] {
  if (!Array.isArray(body)) return []
  return body
    .filter((v): v is InvidiousItem => !!v && typeof v === 'object' && (v as InvidiousItem).type === 'video' && !!(v as InvidiousItem).videoId)
    .map(toTrack)
}

/** Jina enveloppe le contenu dans un préfixe markdown : on extrait le JSON. */
function unwrapJina(text: string): string {
  const marker = 'Markdown Content:'
  const i = text.indexOf(marker)
  return (i >= 0 ? text.slice(i + marker.length) : text).trim()
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    return await fetch(url, { signal: ctrl.signal })
  } finally {
    clearTimeout(t)
  }
}

// ---------------------------------------------------------------------------
// Recherche
// ---------------------------------------------------------------------------

/** Recherche YouTube (Invidious) : relais Jina d'abord, puis direct. */
export async function searchTracks(q: string): Promise<Track[]> {
  const query = q.trim()
  if (!query) return []

  // 1) Via le relais Jina (IP non bloquées, CORS ouvert)
  for (let i = 0; i < INSTANCES.length; i++) {
    const idx = (lastGood + 1 + i) % INSTANCES.length
    const base = INSTANCES[idx]!
    try {
      const target = `${base}/api/v1/search?q=${encodeURIComponent(query)}&type=video`
      const res = await fetchWithTimeout(`https://r.jina.ai/${target}`, 14_000)
      if (!res.ok) continue
      const text = await res.text()
      let items: Track[]
      try {
        items = mapItems(JSON.parse(unwrapJina(text)))
      } catch {
        continue // contenu non JSON (instance qui renvoie du HTML au relais)
      }
      if (items.length > 0) {
        lastGood = idx
        return items
      }
    } catch {
      /* relais injoignable, instance suivante */
    }
  }

  // 2) Direct (instances qui accepteraient le CORS navigateur)
  for (let i = 0; i < INSTANCES.length; i++) {
    const idx = (lastGood + 1 + i) % INSTANCES.length
    const base = INSTANCES[idx]!
    try {
      const res = await fetchWithTimeout(
        `${base}/api/v1/search?q=${encodeURIComponent(query)}&type=video`,
        8_000
      )
      const ct = res.headers.get('content-type') ?? ''
      if (!res.ok || !ct.includes('json')) continue
      const items = mapItems(await res.json())
      if (items.length > 0) {
        lastGood = idx
        return items
      }
    } catch {
      /* instance suivante */
    }
  }

  throw new Error('Recherche impossible : instances Invidious et relais injoignables')
}

// ---------------------------------------------------------------------------
// Flux audio
// ---------------------------------------------------------------------------

/**
 * Candidates d'URL de flux, par ordre de préférence :
 * URLs companion directes (jouées sans redirection, sans CORS) × itag
 * (140 = m4a 128k, 251 = opus 160k), puis chaînes /latest_version en dernier
 * recours. Deuxième passage avec cache-buster (les companions sont instables).
 */
export function listStreamCandidates(videoId: string): string[] {
  const id = encodeURIComponent(videoId)
  const urls: string[] = []
  for (const host of COMPANIONS) {
    for (const itag of [140, 251]) {
      urls.push(`${host}/companion/latest_version?id=${id}&itag=${itag}&local=true`)
    }
  }
  for (const base of INSTANCES) {
    urls.push(`${base}/latest_version?id=${id}&itag=140&local=true`)
  }
  return [...urls, ...urls.map((u, i) => `${u}${u.includes('?') ? '&' : '?'}r=${i}`)]
}

// ---------------------------------------------------------------------------
// Santé des instances (page Réglages)
// ---------------------------------------------------------------------------

export interface InstanceStatus {
  url: string
  ok: boolean
  latencyMs?: number
  error?: string
}

/** Pinge chaque instance (/api/v1/stats) depuis le navigateur. */
export async function checkInstances(): Promise<InstanceStatus[]> {
  return Promise.all(
    INSTANCES.map(async (base): Promise<InstanceStatus> => {
      const t0 = Date.now()
      try {
        const res = await fetchWithTimeout(`${base}/api/v1/stats`, 5_000)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const ct = res.headers.get('content-type') ?? ''
        if (!ct.includes('json')) throw new Error('non JSON')
        return { url: base, ok: true, latencyMs: Date.now() - t0 }
      } catch {
        return { url: base, ok: false, error: 'inaccessible' }
      }
    })
  )
}
