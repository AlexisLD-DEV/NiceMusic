import type { FavoritesBlob, HistoryBlob, Playlist, PlaylistsBlob, SettingsBlob, Track } from '../lib/types'

/**
 * Client API — appelle le Worker Cloudflare.
 * En dev : proxifié par Vite vers le Worker local (wrangler dev).
 * En prod : VITE_API_BASE pointe vers l'URL du Worker déployé.
 */
const BASE = import.meta.env.VITE_API_BASE ?? '/api'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init
  })
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
// Recherche & vidéos (proxy Invidious via le Worker)
// ---------------------------------------------------------------------------

export interface SearchResult {
  id: string
  title: string
  author: string
  duration?: number
  thumbnail?: string
}

export function searchTracks(q: string): Promise<{ items: SearchResult[] }> {
  return request(`/search?q=${encodeURIComponent(q)}`)
}

export interface VideoInfo {
  videoId: string
  title: string
  author: string
  thumbnail?: string
  /** formats audio uniquement, triés par préférence (itag 140, 251, …) */
  formats: { itag: number; mimeType: string; bitrate?: number; url: string }[]
}

export function getVideo(id: string): Promise<VideoInfo> {
  return request(`/video/${encodeURIComponent(id)}`)
}

// ---------------------------------------------------------------------------
// Favoris / historique / playlists (KV)
// ---------------------------------------------------------------------------

export function getFavorites(): Promise<FavoritesBlob> {
  return request('/favorites')
}
export function putFavorites(blob: FavoritesBlob): Promise<{ ok: true }> {
  return request('/favorites', { method: 'PUT', body: JSON.stringify(blob) })
}

export function getHistory(): Promise<HistoryBlob> {
  return request('/history')
}
export function putHistory(blob: HistoryBlob): Promise<{ ok: true }> {
  return request('/history', { method: 'PUT', body: JSON.stringify(blob) })
}

export function getPlaylists(): Promise<PlaylistsBlob> {
  return request('/playlists')
}
export function putPlaylists(blob: PlaylistsBlob): Promise<{ ok: true }> {
  return request('/playlists', { method: 'PUT', body: JSON.stringify(blob) })
}

export function getSettings(): Promise<SettingsBlob> {
  return request('/settings')
}
export function putSettings(blob: SettingsBlob): Promise<{ ok: true }> {
  return request('/settings', { method: 'PUT', body: JSON.stringify(blob) })
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

// ---------------------------------------------------------------------------
// Santé des instances (page Réglages)
// ---------------------------------------------------------------------------

export interface InstanceStatus {
  url: string
  ok: boolean
  latencyMs?: number
  error?: string
}

export function getInstances(): Promise<{ instances: InstanceStatus[] }> {
  return request('/instances')
}
