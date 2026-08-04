import { useFavorites } from '../api/queries'
import { TrackList } from '../components/TrackList'
import { usePlayer } from '../stores/player'
import { ShuffleIcon } from '../components/icons'

/** Page principale : les favoris, avec lecture aléatoire en une touche. */
export default function Favorites() {
  const { query, toggleFavorite } = useFavorites()
  const tracks = query.data?.tracks ?? []

  /** Active le mode aléatoire et lance la lecture sur tous les favoris. */
  const shufflePlay = (): void => {
    if (tracks.length === 0) return
    usePlayer.getState().setShuffle(true)
    const start = tracks[Math.floor(Math.random() * tracks.length)]!
    void usePlayer.getState().play(start, tracks)
  }

  return (
    <div className="safe-top px-4 pb-6 pt-4">
      <header className="mb-3">
        <h1 className="text-2xl font-bold tracking-tight">Favoris</h1>
        <p className="text-sm text-muted">{tracks.length} titre(s) enregistré(s).</p>
      </header>

      {/* Bouton lecture aléatoire */}
      {tracks.length > 0 && (
        <button
          onClick={shufflePlay}
          className="mb-4 flex w-full items-center justify-center gap-2 rounded-full border border-border bg-surface py-3 font-medium text-text shadow-sm transition active:scale-[0.98]"
          aria-label="Lecture aléatoire des favoris"
        >
          <ShuffleIcon width={18} height={18} className="text-accent" />
          Lecture aléatoire
        </button>
      )}

      <TrackList
        tracks={tracks}
        emptyMessage="Aucun favori. Touchez le cœur sur un titre (recherche) pour le garder ici."
        playQueue={tracks}
        showFavorites={false}
        showAddToPlaylist
        onRemove={(t) => toggleFavorite(t)}
      />
    </div>
  )
}
