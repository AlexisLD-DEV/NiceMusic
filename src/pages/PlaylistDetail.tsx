import { Link, useNavigate, useParams } from 'react-router-dom'
import { usePlaylists } from '../api/queries'
import { TrackList } from '../components/TrackList'
import { usePlayer } from '../stores/player'
import { ChevronLeftIcon, MusicIcon, PlayIcon, TrashIcon } from '../components/icons'

export default function PlaylistDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { playlists, remove, removeTrack } = usePlaylists()
  const playlist = playlists.find((p) => p.id === id)

  if (!playlist) {
    return (
      <div className="safe-top px-4 pb-6 pt-4">
        <Link to="/playlists" className="flex items-center gap-1 text-sm text-accent">
          <ChevronLeftIcon width={18} height={18} /> Playlists
        </Link>
        <p className="py-10 text-center text-sm text-muted">Playlist introuvable.</p>
      </div>
    )
  }

  return (
    <div className="safe-top px-4 pb-6 pt-4">
      <header className="mb-4">
        <Link to="/playlists" className="mb-3 flex items-center gap-1 text-sm text-muted">
          <ChevronLeftIcon width={18} height={18} /> Playlists
        </Link>

        <div className="flex items-center gap-3">
          {playlist.tracks[0]?.thumbnail ? (
            <img src={playlist.tracks[0].thumbnail} alt="" className="h-16 w-16 rounded-xl object-cover" />
          ) : (
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-surface text-muted">
              <MusicIcon width={28} height={28} />
            </div>
          )}
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold">{playlist.name}</h1>
            <p className="text-sm text-muted">
              {playlist.tracks.length} titre(s)
              {playlist.description ? ` · ${playlist.description}` : ''}
            </p>
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          <button
            onClick={() => {
              if (playlist.tracks.length > 0) void usePlayer.getState().play(playlist.tracks[0]!, playlist.tracks)
            }}
            disabled={playlist.tracks.length === 0}
            className="flex flex-1 items-center justify-center gap-2 rounded-full bg-accent py-2.5 text-sm font-semibold text-white transition active:scale-[0.98] disabled:opacity-50"
          >
            <PlayIcon width={18} height={18} /> Tout lire
          </button>
          <button
            onClick={() => {
              remove(playlist.id)
              navigate('/playlists')
            }}
            className="flex items-center justify-center rounded-full border border-border bg-surface2 px-4 text-muted transition active:scale-95"
            aria-label="Supprimer la playlist"
          >
            <TrashIcon width={18} height={18} />
          </button>
        </div>
      </header>

      <TrackList
        tracks={playlist.tracks}
        playQueue={playlist.tracks}
        emptyMessage="Cette playlist est vide. Ajoutez des titres depuis la recherche ou vos favoris."
        onRemove={(t) => removeTrack(playlist.id, t.id)}
        showFavorites={false}
      />
    </div>
  )
}
