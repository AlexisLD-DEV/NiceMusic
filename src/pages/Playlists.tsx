import { useState } from 'react'
import { Link } from 'react-router-dom'
import { usePlaylists } from '../api/queries'
import { ListIcon, MusicIcon, PlusIcon } from '../components/icons'

export default function Playlists() {
  const { playlists, create } = usePlaylists()
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')

  const MAX_PLAYLIST_NAME_LENGTH = 100

  function submit() {
    const n = name.trim()
    if (!n) return
    if (n.length > MAX_PLAYLIST_NAME_LENGTH) {
      alert(`Le nom de la playlist dépasse les ${MAX_PLAYLIST_NAME_LENGTH} caractères`)
      return
    }
    create(n)
    setName('')
    setCreating(false)
  }

  return (
    <div className="safe-top px-4 pb-6 pt-4">
      <header className="mb-3 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Playlists</h1>
          <p className="text-sm text-muted">{playlists.length} playlist(s).</p>
        </div>
        {!creating && (
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-1 rounded-full bg-accent px-3.5 py-2 text-xs font-semibold text-white transition active:scale-95"
          >
            <PlusIcon width={15} height={15} /> Nouvelle
          </button>
        )}
      </header>

      {creating && (
        <div className="mb-4 flex gap-2 rounded-2xl border border-border bg-surface p-3">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="Nom de la playlist"
            className="min-w-0 flex-1 rounded-full bg-surface2 px-4 py-2 text-sm outline-none placeholder:text-muted"
          />
          <button onClick={submit} className="rounded-full bg-accent px-4 text-sm font-semibold text-white" disabled={!name.trim()}>
            Créer
          </button>
        </div>
      )}

      {playlists.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted">
          Aucune playlist. Créez-en une, puis ajoutez des titres avec le bouton « + ».
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-3">
          {playlists.map((p) => (
            <li key={p.id}>
              <Link to={`/playlists/${p.id}`} className="block overflow-hidden rounded-2xl border border-border bg-surface transition active:scale-[0.98]">
                <div className="flex h-20 items-center justify-center bg-gradient-to-br from-surface2 to-bg text-muted">
                  {p.tracks[0]?.thumbnail ? (
                    <img src={p.tracks[0].thumbnail} alt="" className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <MusicIcon width={26} height={26} />
                  )}
                </div>
                <div className="px-3 py-2.5">
                  <p className="truncate text-sm font-medium">{p.name}</p>
                  <p className="text-xs text-muted">{p.tracks.length} titre(s)</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {playlists.length > 0 && (
        <p className="mt-4 flex items-center gap-1.5 text-[11px] text-muted">
          <ListIcon width={14} height={14} /> Les playlists importées de Deezer sont marquées « Deezer » à la lecture tant
          qu'elles ne sont pas mappées vers YouTube.
        </p>
      )}
    </div>
  )
}
