import { useState } from 'react'
import type { Track } from '../lib/types'
import { useFavorites, usePlaylists } from '../api/queries'
import { getMappedTrack, useMappingsVersionValue, usePlayer } from '../stores/player'
import { formatDuration } from '../lib/utils'
import {
  CheckIcon,
  HeartFilledIcon,
  HeartIcon,
  MusicIcon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  TrashIcon
} from './icons'

interface Props {
  tracks: Track[]
  emptyMessage?: string
  showFavorites?: boolean
  showAddToPlaylist?: boolean
  /** file utilisée pour le bouton play (défaut : les tracks affichées) */
  playQueue?: Track[]
  /** bouton de retrait (ex. playlist / historique) */
  onRemove?: (track: Track) => void
  /** remplace l'action play (ex. lecture aléatoire) */
  onPlay?: (track: Track) => void
}

export function TrackList({
  tracks,
  emptyMessage = 'Rien à afficher ici pour le moment.',
  showFavorites = true,
  showAddToPlaylist = true,
  playQueue,
  onRemove,
  onPlay
}: Props) {
  // Re-rend quand le cache de mapping Deezer→YouTube se remplit (miniatures)
  useMappingsVersionValue()

  const queue = playQueue ?? tracks

  if (tracks.length === 0) {
    return <p className="px-4 py-10 text-center text-sm text-muted">{emptyMessage}</p>
  }

  return (
    <ul className="flex flex-col">
      {tracks.map((track, i) => (
        <TrackRow
          key={`${track.id}-${i}`}
          track={track}
          onPlay={() => onPlay ? onPlay(track) : void usePlayer.getState().play(track, queue)}
          showFavorites={showFavorites}
          showAddToPlaylist={showAddToPlaylist}
          onRemove={onRemove}
        />
      ))}
    </ul>
  )
}

function TrackRow({
  track,
  onPlay,
  showFavorites,
  showAddToPlaylist,
  onRemove
}: {
  track: Track
  onPlay: () => void
  showFavorites: boolean
  showAddToPlaylist: boolean
  onRemove?: (track: Track) => void
}) {
  const { isFavorite, toggleFavorite } = useFavorites()
  const { playlists, addTracks } = usePlaylists()
  const { current, isPlaying } = usePlayer()
  const [menuOpen, setMenuOpen] = useState(false)

  // Affichage enrichi : si le titre Deezer a été mappé, on montre la version YouTube
  const t = getMappedTrack(track)
  const isCurrent = current?.id === t.id

  return (
    <li className="relative flex items-center gap-3 px-4 py-2">
      <button onClick={onPlay} className="group relative shrink-0" aria-label={`Lire ${t.title}`}>
        {t.thumbnail ? (
          <img src={t.thumbnail} alt="" className="h-11 w-11 rounded-md object-cover" loading="lazy" />
        ) : (
          <div className="flex h-11 w-11 items-center justify-center rounded-md bg-surface2 text-muted">
            <MusicIcon width={20} height={20} />
          </div>
        )}
        <span
          className={`absolute inset-0 flex items-center justify-center rounded-md bg-black/50 text-white transition ${
            isCurrent ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-active:opacity-100'
          }`}
        >
          {isCurrent && isPlaying ? <PauseIcon width={18} height={18} /> : <PlayIcon width={18} height={18} />}
        </span>
      </button>

      <button onClick={onPlay} className="min-w-0 flex-1 text-left">
        <p className={`flex items-center gap-1.5 ${isCurrent ? 'text-accent' : ''}`}>
          {isCurrent && isPlaying && (
            <span className="eq shrink-0" aria-hidden="true">
              <span />
              <span />
              <span />
              <span />
            </span>
          )}
          <span className="truncate text-sm">{t.title}</span>
        </p>
        <p className="flex items-center gap-1.5 truncate text-xs text-muted">
          {track.unmapped && t.unmapped && (
            <span className="rounded bg-surface2 px-1 py-px text-[9px] uppercase tracking-wide text-muted">Deezer</span>
          )}
          {t.author}
          {t.duration ? <span className="tabular-nums">· {formatDuration(t.duration)}</span> : null}
        </p>
      </button>

      {showFavorites && (
        <button
          onClick={() => toggleFavorite(track)}
          className={`shrink-0 p-1.5 transition active:scale-90 ${isFavorite(track.id) ? 'text-accent2' : 'text-muted'}`}
          aria-label={isFavorite(track.id) ? 'Retirer des favoris' : 'Ajouter aux favoris'}
        >
          {isFavorite(track.id) ? <HeartFilledIcon width={20} height={20} /> : <HeartIcon width={20} height={20} />}
        </button>
      )}

      {showAddToPlaylist && (
        <div className="relative shrink-0">
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className={`p-1.5 transition active:scale-90 ${menuOpen ? 'text-accent' : 'text-muted'}`}
            aria-label="Ajouter à une playlist"
          >
            <PlusIcon width={20} height={20} />
          </button>

          {menuOpen && (
            <>
              <div className="fixed inset-0 z-20" onClick={() => setMenuOpen(false)} aria-hidden="true" />
              <div className="absolute right-0 top-full z-30 mt-1 max-h-64 w-56 overflow-y-auto rounded-xl border border-border bg-surface2 py-1 shadow-xl">
                <p className="px-3 py-1.5 text-[10px] uppercase tracking-wide text-muted">Ajouter à…</p>
                {playlists.length === 0 && (
                  <p className="px-3 py-2 text-xs text-muted">Créez d'abord une playlist (onglet Playlists).</p>
                )}
                {playlists.map((p) => {
                  const added = p.tracks.some((t) => t.id === track.id)
                  return (
                    <button
                      key={p.id}
                      onClick={() => {
                        if (!added) addTracks(p.id, [track])
                        setMenuOpen(false)
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface"
                    >
                      <span className="min-w-0 flex-1 truncate">{p.name}</span>
                      {added && <CheckIcon width={16} height={16} className="shrink-0 text-accent" />}
                    </button>
                  )
                })}
              </div>
            </>
          )}
        </div>
      )}

      {onRemove && (
        <button onClick={() => onRemove(track)} className="shrink-0 p-1.5 text-muted transition active:scale-90" aria-label="Retirer">
          <TrashIcon width={18} height={18} />
        </button>
      )}
    </li>
  )
}
