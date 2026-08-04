import { FETCH_TIMEOUT_MS, HISTORY_CAP, INSTANCES, SEARCH_CACHE_TTL_SECONDS } from './instances'

interface Env {
  NICEMUSIC_KV: KVNamespace
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400'
}

function json(data: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS, ...extra }
  })
}

function error(message: string, status = 500): Response {
  return json({ error: message }, status)
}

async function readBlob<T>(kv: KVNamespace, key: string, fallback: T): Promise<T> {
  const raw = await kv.get(key)
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

async function writeBlob(kv: KVNamespace, key: string, value: unknown, ttlSeconds?: number): Promise<void> {
  await kv.put(key, JSON.stringify(value), ttlSeconds ? { expirationTtl: ttlSeconds } : undefined)
}

// ---------------------------------------------------------------------------
// Rotation d'instances Invidious (fallback automatique)
// ---------------------------------------------------------------------------

/** index de la dernière instance qui a répondu (par isolate ; réinitialisé à froid). */
let lastGood = -1

function withTimeout(url: string, init: RequestInit = {}, ms = FETCH_TIMEOUT_MS): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(ms) })
}

/** Essaie chaque instance (en rotation depuis la dernière bonne) jusqu'au premier succès. */
async function invidiousFetch(path: string, init: RequestInit = {}): Promise<{ base: string; res: Response }> {
  const attempts: string[] = []
  for (let i = 0; i < INSTANCES.length; i++) {
    const idx = (lastGood + 1 + i) % INSTANCES.length
    const base = INSTANCES[idx]!
    attempts.push(base)
    try {
      const res = await withTimeout(`${base}${path}`, init)
      // Certaines instances renvoient une page HTML d'erreur avec un statut 200 :
      // on n'accepte que les réponses JSON.
      if (res.ok && (res.headers.get('content-type') ?? '').includes('json')) {
        lastGood = idx
        return { base, res }
      }
    } catch {
      /* instance injoignable, on continue */
    }
  }
  throw new Error(`Aucune instance Invidious disponible (essayées : ${attempts.join(', ')})`)
}

// ---------------------------------------------------------------------------
// Mapping Invidious → format NiceMusic
// ---------------------------------------------------------------------------

interface InvidiousVideo {
  type?: string
  videoId?: string
  title?: string
  author?: string
  lengthSeconds?: number
  videoThumbnails?: { quality?: string; url?: string }[]
}

function thumbnailOf(v: InvidiousVideo): string | undefined {
  const thumbs = v.videoThumbnails ?? []
  return (
    thumbs.find((t) => t.quality === 'medium')?.url ??
    thumbs.find((t) => t.quality === 'default')?.url ??
    thumbs[0]?.url
  )
}

function toTrack(v: InvidiousVideo) {
  return {
    id: v.videoId ?? '',
    title: v.title ?? 'Sans titre',
    author: v.author ?? 'Inconnu',
    duration: v.lengthSeconds,
    thumbnail: thumbnailOf(v)
  }
}

// ---------------------------------------------------------------------------
// Recherche
// ---------------------------------------------------------------------------

async function search(env: Env, q: string): Promise<Response> {
  const query = q.trim().toLowerCase()
  if (!query) return json({ items: [] })

  const cacheKey = `search:${query}`
  const cached = await env.NICEMUSIC_KV.get(cacheKey)
  if (cached) {
    return json({ items: JSON.parse(cached), cached: true }, 200, { 'Cache-Control': 'public, max-age=3600' })
  }

  const { res } = await invidiousFetch(`/api/v1/search?q=${encodeURIComponent(query)}&type=video`)
  const body = (await res.json()) as InvidiousVideo[]
  const items = Array.isArray(body)
    ? body.filter((v) => v?.type === 'video' && v.videoId).map(toTrack)
    : []

  // Cache 6 h (une écriture KV par nouvelle recherche : budget OK en usage perso)
  await writeBlob(env.NICEMUSIC_KV, cacheKey, items, SEARCH_CACHE_TTL_SECONDS)
  return json({ items }, 200, { 'Cache-Control': 'public, max-age=3600' })
}

// ---------------------------------------------------------------------------
// Détail vidéo → formats audio (itag 140 m4a, 251/250 opus, …)
// ---------------------------------------------------------------------------

const PREFERRED_ITAGS = [140, 251, 250, 171, 139]

interface InvidiousVideoDetail {
  videoId?: string
  title?: string
  author?: string
  videoThumbnails?: { quality?: string; url?: string }[]
  adaptiveFormats?: { itag?: number; type?: string; mimeType?: string; bitrate?: number; url?: string }[]
}

interface AudioFormat {
  itag: number
  mimeType: string
  bitrate?: number
  url: string
}

/**
 * Résout l'URL du flux audio.
 * 1) API complète /api/v1/videos (choix des formats, local=true).
 * 2) Repli /latest_version (stream direct, itag 140 puis 251) — plus tolérant,
 *    car le endpoint « videos » est souvent bloqué sur les instances publiques.
 */
async function resolveAudioFormats(id: string): Promise<AudioFormat[]> {
  // 1) API vidéo complète
  try {
    const { res } = await invidiousFetch(`/api/v1/videos/${encodeURIComponent(id)}?local=true`)
    const body = (await res.json()) as InvidiousVideoDetail
    const formats = (body.adaptiveFormats ?? [])
      .filter((f) => (f.type ?? '').startsWith('audio') || (f.mimeType ?? '').startsWith('audio/'))
      .filter((f) => f.url)
      .map((f) => ({
        itag: f.itag ?? 0,
        mimeType: f.mimeType ?? 'audio/mp4',
        bitrate: f.bitrate,
        url: (f.url ?? '').replace(/^http:\/\//, 'https://')
      }))
      .sort((a, b) => {
        const pa = PREFERRED_ITAGS.indexOf(a.itag)
        const pb = PREFERRED_ITAGS.indexOf(b.itag)
        if (pa !== -1 || pb !== -1) return (pa === -1 ? 99 : pa) - (pb === -1 ? 99 : pb)
        return (b.bitrate ?? 0) - (a.bitrate ?? 0)
      })
    if (formats.length > 0) return formats
  } catch {
    /* repli ci-dessous */
  }

  // 2) latest_version : 302 → URL du flux (on ne suit pas la redirection)
  for (const itag of [140, 251]) {
    const url = await latestVersionFetch(id, itag)
    if (url) {
      return [{ itag, mimeType: itag === 140 ? 'audio/mp4' : 'audio/webm', url }]
    }
  }
  return []
}

/**
 * Repli /latest_version : renvoie l'URL du flux (via l'en-tête Location d'une
 * 302, ou l'URL finale si la réponse est directement du contenu audio/vidéo).
 * Contourne le garde-fou JSON de invidiousFetch (une 302 n'est pas « ok »).
 * L'URL est pré-validée par une requête Range : les proxies « companion »
 * répondent parfois 400/500 selon la vidéo, on n'accepte qu'un flux réel.
 */
async function latestVersionFetch(id: string, itag: number): Promise<string | null> {
  for (const local of [true, false]) {
    for (let i = 0; i < INSTANCES.length; i++) {
      const idx = (lastGood + 1 + i) % INSTANCES.length
      const base = INSTANCES[idx]!
      try {
        const res = await withTimeout(
          `${base}/latest_version?id=${encodeURIComponent(id)}&itag=${itag}${local ? '&local=true' : ''}`,
          { redirect: 'manual' }
        )
        const location = res.headers.get('location')
        const candidate = location
          ? /^https?:/i.test(location)
            ? location.replace(/^http:\/\//, 'https://')
            : new URL(location, base).toString().replace(/^http:\/\//, 'https://')
          : res.ok && (res.headers.get('content-type') ?? '').startsWith('audio/')
            ? res.url.replace(/^http:\/\//, 'https://')
            : null

        if (candidate && (await isValidAudioStream(candidate))) {
          lastGood = idx
          return candidate
        }
      } catch {
        /* instance suivante */
      }
    }
  }
  return null
}

/** Requête Range (0-1023) : valide qu'une URL de flux sert bien de l'audio. */
async function isValidAudioStream(url: string): Promise<boolean> {
  try {
    const res = await withTimeout(
      url,
      { headers: { Range: 'bytes=0-1023' } },
      8_000
    )
    const ct = res.headers.get('content-type') ?? ''
    return (res.status === 200 || res.status === 206) && (ct.startsWith('audio/') || ct.startsWith('video/'))
  } catch {
    return false
  }
}

async function videoInfo(env: Env, id: string): Promise<Response> {
  const formats = await resolveAudioFormats(id)
  if (formats.length === 0) {
    return error("Aucune instance Invidious ne fournit de flux audio pour ce titre", 502)
  }
  return json({
    videoId: id,
    title: id,
    author: '',
    formats
  })
}

// ---------------------------------------------------------------------------
// KV : favoris / historique / playlists / réglages
// ---------------------------------------------------------------------------

type AnyBlob = Record<string, unknown>

async function getBlob(env: Env, key: string, fallback: AnyBlob): Promise<Response> {
  const data = await readBlob(env.NICEMUSIC_KV, key, fallback)
  return json(data, 200, { 'Cache-Control': 'no-store' })
}

async function putBlob(env: Env, key: string, body: unknown): Promise<Response> {
  const value = body as AnyBlob
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return error('Corps invalide : attendu un objet JSON', 400)
  }
  await writeBlob(env.NICEMUSIC_KV, key, value)
  return json({ ok: true })
}

// ---------------------------------------------------------------------------
// Import Deezer (fusion dans KV)
// ---------------------------------------------------------------------------

interface ImportPayload {
  playlists?: { id: string; name: string; tracks: unknown[] }[]
  favorites?: unknown[]
  history?: unknown[]
}

function dedupeByIdKey(tracks: { deezerId?: number; title?: string; author?: string }[]): unknown[] {
  const seen = new Set<string>()
  const out: unknown[] = []
  for (const t of tracks) {
    const k = t.deezerId ? `d:${t.deezerId}` : `${t.title ?? ''}|${t.author ?? ''}`.toLowerCase()
    if (!seen.has(k)) {
      seen.add(k)
      out.push(t)
    }
  }
  return out
}

async function importDeezer(env: Env, body: unknown): Promise<Response> {
  const payload = (body ?? {}) as ImportPayload

  // Favoris : fusion + dédupe (les titres déjà mappés sont conservés)
  const existingFav = await readBlob(env.NICEMUSIC_KV, 'favorites', { tracks: [] })
  const favTracks = dedupeByIdKey([
    ...(payload.favorites ?? []),
    ...((existingFav.tracks as unknown[]) ?? [])
  ] as { deezerId?: number; title?: string; author?: string }[])
  await writeBlob(env.NICEMUSIC_KV, 'favorites', { tracks: favTracks })

  // Historique : les nouveaux d'abord, plafonné
  const existingHist = await readBlob(env.NICEMUSIC_KV, 'history', { tracks: [] })
  const histTracks = dedupeByIdKey([
    ...(payload.history ?? []),
    ...((existingHist.tracks as unknown[]) ?? [])
  ] as { deezerId?: number; title?: string; author?: string }[]).slice(0, HISTORY_CAP)
  await writeBlob(env.NICEMUSIC_KV, 'history', { tracks: histTracks })

  // Playlists : les importées priment, les autres (créées dans l'app) sont conservées
  const existingPl = await readBlob(env.NICEMUSIC_KV, 'playlists', { playlists: [] })
  const imported = (payload.playlists ?? []).filter((p) => p?.id && p?.name)
  const importedIds = new Set(imported.map((p) => p.id))
  const kept = ((existingPl.playlists as { id?: string }[]) ?? []).filter((p) => !importedIds.has(p?.id ?? ''))
  await writeBlob(env.NICEMUSIC_KV, 'playlists', { playlists: [...imported, ...kept] })

  return json({
    ok: true,
    counts: { playlists: imported.length, favorites: favTracks.length, history: histTracks.length }
  })
}

// ---------------------------------------------------------------------------
// Santé des instances
// ---------------------------------------------------------------------------

async function instancesHealth(): Promise<Response> {
  const results = await Promise.allSettled(
    INSTANCES.map(async (base) => {
      const t0 = Date.now()
      const res = await withTimeout(`${base}/api/v1/stats`, {}, 4_000)
      return { url: base, ok: res.ok, latencyMs: Date.now() - t0 }
    })
  )
  const instances = results.map((r, i) =>
    r.status === 'fulfilled'
      ? { url: INSTANCES[i], ok: r.value.ok, latencyMs: r.value.latencyMs }
      : { url: INSTANCES[i], ok: false, error: 'timeout' }
  )
  return json({ instances })
}

// ---------------------------------------------------------------------------
// Routeur
// ---------------------------------------------------------------------------

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS })
    }

    const url = new URL(request.url)
    const path = url.pathname.replace(/\/+$/, '')
    const method = request.method

    try {
      // Recherche Invidious
      if (path === '/api/search' && method === 'GET') {
        return await search(env, url.searchParams.get('q') ?? '')
      }

      // Détail vidéo (formats audio)
      const videoMatch = path.match(/^\/api\/video\/([^/]+)$/)
      if (videoMatch && method === 'GET') {
        return await videoInfo(env, decodeURIComponent(videoMatch[1]!))
      }

      // Blobs KV
      if (path === '/api/favorites') return method === 'GET' ? getBlob(env, 'favorites', { tracks: [] }) : putBlob(env, 'favorites', await request.json())
      if (path === '/api/history') return method === 'GET' ? getBlob(env, 'history', { tracks: [] }) : putBlob(env, 'history', await request.json())
      if (path === '/api/playlists') return method === 'GET' ? getBlob(env, 'playlists', { playlists: [] }) : putBlob(env, 'playlists', await request.json())
      if (path === '/api/settings') return method === 'GET' ? getBlob(env, 'settings', {}) : putBlob(env, 'settings', await request.json())

      // Import Deezer
      if (path === '/api/import/deezer' && method === 'POST') {
        return await importDeezer(env, await request.json())
      }

      // Santé
      if (path === '/api/health' && method === 'GET') {
        return json({ ok: true, name: 'nicemusic-api' })
      }
      if (path === '/api/instances' && method === 'GET') {
        return await instancesHealth()
      }

      return error(`Route inconnue : ${method} ${path}`, 404)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erreur interne'
      return error(msg, 502)
    }
  }
}
