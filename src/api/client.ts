import type { FavoritesBlob, HistoryBlob, Playlist, PlaylistsBlob, SettingsBlob, Track } from '../lib/types'

/**
 * Client API — appelle le Worker Cloudflare.
 * En dev : '/api' (proxifié par Vite vers wrangler dev, port 8787).
 * En prod : VITE_API_BASE si fourni, sinon origine du Worker (fallback
 * intégré — aucune variable d'environnement requise au build).
 *
 * Sans preflight CORS : GET sans en-tête, écritures en POST avec un corps
 * text/plain (safelisted) — le Worker parse le JSON via request.json().
 */
const BASE = import.meta.env.VITE_API_BASE
  ? `${import.meta.env.VITE_API_BASE}/api`
  : import.meta.env.DEV
    ? '/api'
    : 'https://nicemusic-api.alexisledeunf.workers.dev/api'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {}
  if (init?.body) headers['Content-Type'] = 'text/plain'
  const res = await fetch(`${BASE}${path}`, { ...init, headers })
  if (!res.ok) {
    let msg = `Erreur ${res.status}`
    try {
      const body = (await res.json()) as { error?: string }
      if (body.error) msg = body.error
    } catch {
      /* corps non JSON */
    }
    throw new ApiError(res.status, msg)
  }
  return (await res.json()) as T
}

// ---------------------------------------------------------------------------
// Favoris / historique / playlists (KV)
// ---------------------------------------------------------------------------

export function getFavorites(): Promise<FavoritesBlob> {
  return request('/favorites')
}
export function putFavorites(blob: FavoritesBlob): Promise<{ ok: true }> {
  return request('/favorites', { method: 'POST', body: JSON.stringify(blob) })
}

export function getHistory(): Promise<HistoryBlob> {
  return request('/history')
}
export function putHistory(blob: HistoryBlob): Promise<{ ok: true }> {
  return request('/history', { method: 'POST', body: JSON.stringify(blob) })
}

export function getPlaylists(): Promise<PlaylistsBlob> {
  return request('/playlists')
}
export function putPlaylists(blob: PlaylistsBlob): Promise<{ ok: true }> {
  return request('/playlists', { method: 'POST', body: JSON.stringify(blob) })
}

export function getSettings(): Promise<SettingsBlob> {
  return request('/settings')
}
export function putSettings(blob: SettingsBlob): Promise<{ ok: true }> {
  return request('/settings', { method: 'POST', body: JSON.stringify(blob) })
}

// ---------------------------------------------------------------------------
// Mapping Deezer→YouTube (cache, pour jouer les titres non mappés sans
// relancer une recherche YouTube à chaque lecture)
// ---------------------------------------------------------------------------

export interface MappingsBlob {
  mappings: Record<string, Partial<Track>>
}

export function getMappings(): Promise<MappingsBlob> {
  return request('/mappings')
}
export function putMappings(blob: MappingsBlob): Promise<{ ok: true }> {
  return request('/mappings', { method: 'POST', body: JSON.stringify(blob) })
}

// ---------------------------------------------------------------------------
// Import Deezer
// ---------------------------------------------------------------------------

export interface ImportPayload {
  playlists: Playlist[]
  favorites: Track[]
  history: Track[]
}

export function importDeezer(payload: ImportPayload): Promise<{ ok: true; counts: { playlists: number; favorites: number; history: number } }> {
  return request('/import/deezer', { method: 'POST', body: JSON.stringify(payload) })
}
