import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { searchTracks } from '../lib/invidious'
import { SearchBar } from '../components/SearchBar'
import { TrackList } from '../components/TrackList'
import { MusicIcon } from '../components/icons'

export default function Home() {
  const [q, setQ] = useState('')
  const [debounced, setDebounced] = useState('')

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 450)
    return () => clearTimeout(t)
  }, [q])

  const searching = debounced.length > 1
  const { data, isFetching, isError } = useQuery({
    queryKey: ['search', debounced],
    queryFn: () => searchTracks(debounced),
    enabled: searching
  })

  const results = data ?? []

  return (
    <div className="safe-top px-4 pb-6 pt-4">
      <header className="mb-4">
        <h1 className="text-gradient text-2xl font-bold tracking-tight">NiceMusic</h1>
        <p className="text-sm text-muted">Cherchez, écoutez, retrouvez — partout.</p>
      </header>

      <div className="mb-4">
        <SearchBar value={q} onChange={setQ} />
      </div>

      {!searching && (
        <div className="flex flex-col items-center gap-3 py-14 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-surface text-muted">
            <MusicIcon width={28} height={28} />
          </div>
          <p className="max-w-60 text-sm text-muted">
            Tapez un titre ou un artiste pour chercher sur YouTube (via Invidious).
          </p>
        </div>
      )}

      {searching && isFetching && <p className="py-8 text-center text-sm text-muted">Recherche…</p>}
      {searching && !isFetching && isError && (
        <p className="py-8 text-center text-sm text-red-400">
          Recherche impossible : toutes les instances Invidious sont injoignables. Réessayez plus tard.
        </p>
      )}
      {searching && !isFetching && !isError && (
        <TrackList tracks={results} emptyMessage="Aucun résultat trouvé." playQueue={results} />
      )}
    </div>
  )
}
