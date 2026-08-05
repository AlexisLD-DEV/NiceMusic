import { useMemo, useState } from 'react'
import { useFavorites, useHistory } from '../api/queries'
import { TrackList } from '../components/TrackList'
import { SearchBar } from '../components/SearchBar'
import { useBackfillState, usePlayer } from '../stores/player'
import { ShuffleIcon } from '../components/icons'

/**
 * Page d'accueil, façon Deezer : recherche en haut, section « Favoris »
 * (triés du plus récent au plus vieux) puis section « Récemment écoutés ».
 */
export default function Favorites() {
  const { query, toggleFavorite } = useFavorites()
  const history = useHistory()
  const backfill = useBackfillState()
  const [search, setSearch] = useState('')

  const tracks = query.data?.tracks ?? []
  const recents = history.query.data?.tracks ?? []

  // Trie les favoris par date de publication YouTube (récent → vieux) ;
  // les titres sans date (pas encore résolus) vont en fin de liste, stables.
  const sortedTracks = useMemo(() => {
    return [...tracks].sort((a, b) => {
      const pa = a.publishedAt ?? 0
      const pb = b.publishedAt ?? 0
      if (pa !== pb) return pb - pa
      return 0
    })
  }, [tracks])

  // Filtre client sur titre + artiste (insensible à la casse).
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return sortedTracks
    return sortedTracks.filter(
      (t) => t.title.toLowerCase().includes(q) || t.author.toLowerCase().includes(q)
    )
  }, [sortedTracks, search])

  /** Active le mode aléatoire et lance la lecture sur la liste affichée (filtrée). */
  const shufflePlay = (): void => {
    if (filtered.length === 0) return
    usePlayer.getState().setShuffle(true)
    const start = filtered[Math.floor(Math.random() * filtered.length)]!
    void usePlayer.getState().play(start, filtered)
  }

  return (
    <div className="safe-top px-4 pb-6 pt-4">
      <header className="mb-3">
        <h1 className="text-2xl font-bold tracking-tight">Favoris</h1>
        <p className="text-sm text-muted">{tracks.length} titre(s) enregistré(s).</p>
      </header>

      {/* Recherche en haut des favoris */}
      <div className="mb-3">
        <SearchBar value={search} onChange={setSearch} placeholder="Rechercher dans vos favoris…" />
      </div>

      {/* Progression de la résolution des liens YouTube */}
      {backfill.running && backfill.remaining > 0 && (
        <p className="mb-3 rounded-xl bg-surface px-3 py-2 text-xs text-muted">
          Résolution des liens YouTube… {backfill.remaining} restant(s)
          {backfill.failed > 0 ? ` · ${backfill.failed} en échec (réessai plus tard)` : ''}
        </p>
      )}

      {/* Bouton lecture aléatoire (sur la liste filtrée) */}
      {filtered.length > 0 && (
        <button
          onClick={shufflePlay}
          className="mb-4 flex w-full items-center justify-center gap-2 rounded-full border border-border bg-surface py-3 font-medium text-text shadow-sm transition active:scale-[0.98]"
          aria-label="Lecture aléatoire des favoris"
        >
          <ShuffleIcon width={18} height={18} className="text-accent" />
          Lecture aléatoire
        </button>
      )}

      {/* Section : tous les favoris (filtrés + triés) */}
      <section className="mb-6">
        {tracks.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted">
            Aucun favori. Touchez le cœur sur un titre (recherche) pour le garder ici.
          </p>
        ) : filtered.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted">Aucun favori ne correspond à « {search} ».</p>
        ) : (
          <TrackList
            tracks={filtered}
            playQueue={filtered}
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
