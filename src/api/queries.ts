import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { FavoritesBlob, HistoryBlob, PlaylistsBlob } from '../lib/types'
import * as api from './client'
import type { Playlist, Track } from '../lib/types'
import { dedupeTracks } from '../lib/deezer-import'
import { uid } from '../lib/utils'

/**
 * Hooks de données : favoris, historique, playlists.
 * Optimistic updates : l'UI change immédiatement, l'écriture KV suit en
 * arrière-plan (le free tier KV limite les écritures, on reste léger).
 */

// ---------------------------------------------------------------------------
// Favoris
// ---------------------------------------------------------------------------

export function useFavorites() {
  const qc = useQueryClient()
  const query = useQuery({ queryKey: ['favorites'], queryFn: api.getFavorites })

  const isFavorite = (id: string): boolean => {
    const data = (qc.getQueryData<FavoritesBlob>(['favorites']) ?? query.data) ?? { tracks: [] }
    return data.tracks.some((t) => t.id === id)
  }

  const toggleFavorite = (track: Track): void => {
    const current = (qc.getQueryData<FavoritesBlob>(['favorites']) ?? query.data) ?? { tracks: [] }
    const exists = current.tracks.some((t) => t.id === track.id)
    const next = exists ? current.tracks.filter((t) => t.id !== track.id) : dedupeTracks([track, ...current.tracks])
    qc.setQueryData<FavoritesBlob>(['favorites'], { tracks: next })
    void api.putFavorites({ tracks: next }).catch(() => qc.invalidateQueries({ queryKey: ['favorites'] }))
  }

  return { query, isFavorite, toggleFavorite }
}

// ---------------------------------------------------------------------------
// Historique
// ---------------------------------------------------------------------------

export function useHistory() {
  const qc = useQueryClient()
  const query = useQuery({ queryKey: ['history'], queryFn: api.getHistory })

  const clear = (): void => {
    qc.setQueryData<HistoryBlob>(['history'], { tracks: [] })
    void api.putHistory({ tracks: [] }).catch(() => qc.invalidateQueries({ queryKey: ['history'] }))
  }

  return { query, clear }
}

// ---------------------------------------------------------------------------
// Playlists
// ---------------------------------------------------------------------------

export function usePlaylists() {
  const qc = useQueryClient()
  const query = useQuery({ queryKey: ['playlists'], queryFn: api.getPlaylists })
  const playlists = (query.data ?? { playlists: [] }).playlists

  const commit = (next: Playlist[]): void => {
    qc.setQueryData<PlaylistsBlob>(['playlists'], { playlists: next })
    void api.putPlaylists({ playlists: next }).catch(() => qc.invalidateQueries({ queryKey: ['playlists'] }))
  }

  const create = (name: string): void => {
    commit([...playlists, { id: uid(), name, tracks: [], createdAt: Date.now() }])
  }

  const remove = (id: string): void => {
    commit(playlists.filter((p) => p.id !== id))
  }

  const removeTrack = (id: string, trackId: string): void => {
    commit(playlists.map((p) => (p.id === id ? { ...p, tracks: p.tracks.filter((t) => t.id !== trackId) } : p)))
  }

  const addTracks = (id: string, tracks: Track[]): void => {
    commit(playlists.map((p) => (p.id === id ? { ...p, tracks: dedupeTracks([...p.tracks, ...tracks]) } : p)))
  }

  return { query, playlists, create, remove, removeTrack, addTracks }
}

// ---------------------------------------------------------------------------
// Import Deezer (mutation)
// ---------------------------------------------------------------------------

export function useImportDeezer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.importDeezer,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['favorites'] })
      qc.invalidateQueries({ queryKey: ['history'] })
      qc.invalidateQueries({ queryKey: ['playlists'] })
    }
  })
}
