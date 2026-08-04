import { useEffect } from 'react'
import { useFavorites, useHistory } from '../api/queries'
import { TrackList } from '../components/TrackList'
import { startFavoritesBackfill, usePlayer } from '../stores/player'
import { ShuffleIcon } from '../components/icons'

/**
 * Page d'accueil, façon Deezer : une section « Favoris » (avec lecture
 * aléatoire) puis une section « Récemment écoutés ».
 */
export default function Favorites() {
  const { query, toggleFavorite } = useFavorites()
  const history = useHistory()
  const tracks = query.data?.tracks ?? []
  const recents = history.query.data?.tracks ?? []

  // Pré-mappe progressivement les favoris (résout leurs vidéoId YouTube en
  // arrière-plan) — une seule fois une fois la liste chargée.
  useEffect(() => {
    if (tracks.length > 0) startFavoritesBackfill(tracks)
  }, [tracks])

  /** Active le mode aléatoire et lance la lecture sur tous les favoris. */
  const shufflePlay = (): void => {
    if (tracks.length === 0) return
    usePlayer.getState().setShuffle(true)
    const start = tracks[Math.floor(Math.random() * tracks.length)]!
    void usePlayer.getState().play(start, tracks)
  }

  return (
    <div className="safe-top px-4 pb-6 pt-4">
      <header className="mb-4">
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

      {/* Section : tous les favoris */}
      <section className="mb-6">
        {tracks.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted">
            Aucun favori. Touchez le cœur sur un titre (recherche) pour le garder ici.
          </p>
        ) : (
          <TrackList
            tracks={tracks}
            playQueue={tracks}
            showFavorites={false}
            showAddToPlaylist
            onRemove={(t) => toggleFavorite(t)}
          />
        )}
      </section>

      {/* Section : récemment écoutés */}
      {recents.length > 0 && (
        <section>
          <h2 className="mb-1 px-4 text-sm font-semibold uppercase tracking-wide text-muted">
            Récemment écoutés
          </h2>
          <TrackList
            tracks={recents.slice(0, 20)}
            emptyMessage=""
            playQueue={recents}
            showFavorites={false}
            showAddToPlaylist
          />
        </section>
      )}
    </div>
  )
}
