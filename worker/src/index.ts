import { HISTORY_CAP } from './constants'

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

async function writeBlob(kv: KVNamespace, key: string, value: unknown): Promise<void> {
  await kv.put(key, JSON.stringify(value))
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

  const existingFav = await readBlob(env.NICEMUSIC_KV, 'favorites', { tracks: [] })
  const favTracks = dedupeByIdKey([
    ...(payload.favorites ?? []),
    ...((existingFav.tracks as unknown[]) ?? [])
  ] as { deezerId?: number; title?: string; author?: string }[])
  await writeBlob(env.NICEMUSIC_KV, 'favorites', { tracks: favTracks })

  const existingHist = await readBlob(env.NICEMUSIC_KV, 'history', { tracks: [] })
  const histTracks = dedupeByIdKey([
    ...(payload.history ?? []),
    ...((existingHist.tracks as unknown[]) ?? [])
  ] as { deezerId?: number; title?: string; author?: string }[]).slice(0, HISTORY_CAP)
  await writeBlob(env.NICEMUSIC_KV, 'history', { tracks: histTracks })

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
      // Blobs KV (GET = lecture, POST = remplacement complet)
      const blobRoutes: Record<string, { key: string; fallback: AnyBlob }> = {
        '/api/favorites': { key: 'favorites', fallback: { tracks: [] } },
        '/api/history': { key: 'history', fallback: { tracks: [] } },
        '/api/playlists': { key: 'playlists', fallback: { playlists: [] } },
        '/api/settings': { key: 'settings', fallback: {} }
      }
      const blobRoute = blobRoutes[path]
      if (blobRoute) {
        if (method === 'GET') return getBlob(env, blobRoute.key, blobRoute.fallback)
        if (method === 'POST' || method === 'PUT') return putBlob(env, blobRoute.key, await request.json())
        return error(`Méthode non supportée : ${method} ${path}`, 405)
      }

      // Import Deezer
      if (path === '/api/import/deezer' && method === 'POST') {
        return await importDeezer(env, await request.json())
      }

      // Santé
      if (path === '/api/health' && method === 'GET') {
        return json({ ok: true, name: 'nicemusic-api' })
      }

      return error(`Route inconnue : ${method} ${path}`, 404)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erreur interne'
      return error(msg, 500)
    }
  }
}
