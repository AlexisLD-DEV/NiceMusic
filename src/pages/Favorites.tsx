import { useFavorites } from '../api/queries'
import { TrackList } from '../components/TrackList'

/** Page principale : les favoris. */
export default function Favorites() {
  const { query, toggleFavorite } = useFavorites()
  const tracks = query.data?.tracks ?? []

  return (
    <div className="safe-top px-4 pb-6 pt-4">
      <header className="mb-3">
        <h1 className="text-2xl font-bold tracking-tight">Favoris</h1>
        <p className="text-sm text-muted">{tracks.length} titre(s) enregistré(s).</p>
      </header>
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
