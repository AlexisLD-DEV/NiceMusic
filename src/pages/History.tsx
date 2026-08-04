import { useHistory } from '../api/queries'
import { TrackList } from '../components/TrackList'
import { TrashIcon } from '../components/icons'

export default function History() {
  const { query, clear } = useHistory()
  const tracks = query.data?.tracks ?? []

  return (
    <div className="safe-top px-4 pb-6 pt-4">
      <header className="mb-3 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Historique</h1>
          <p className="text-sm text-muted">Vos dernières écoutes.</p>
        </div>
        {tracks.length > 0 && (
          <button
            onClick={clear}
            className="flex items-center gap-1 rounded-full border border-border bg-surface2 px-3 py-1.5 text-xs transition active:scale-95"
          >
            <TrashIcon width={14} height={14} /> Effacer
          </button>
        )}
      </header>
      <TrackList tracks={tracks} emptyMessage="Rien encore. Vos écoutes apparaîtront ici." playQueue={tracks} />
    </div>
  )
}
