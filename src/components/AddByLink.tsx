import { useState } from 'react'
import { useFavorites } from '../api/queries'
import { fetchVideoInfo, parseYoutubeUrl } from '../lib/invidious'
import { CheckIcon, PlusIcon } from './icons'

/** Zone « coller un lien YouTube » — ajoute la vidéo aux favoris. */
export function AddByLink() {
  const { addFavorite } = useFavorites()
  const [url, setUrl] = useState('')
  const [status, setStatus] = useState<{ kind: 'idle' | 'loading' | 'ok' | 'warn' | 'err'; text: string }>({
    kind: 'idle',
    text: ''
  })

  async function submit(): Promise<void> {
    const videoId = parseYoutubeUrl(url)
    if (!videoId) {
      setStatus({ kind: 'err', text: 'Lien YouTube invalide.' })
      return
    }
    setStatus({ kind: 'loading', text: 'Récupération des informations…' })
    try {
      const info = await fetchVideoInfo(videoId)
      const track = { id: videoId, title: info.title, author: info.author, thumbnail: info.thumbnail, unmapped: false }
      const added = addFavorite(track)
      setUrl('')
      setStatus(
        added
          ? { kind: 'ok', text: `« ${info.title} » ajouté à vos favoris.` }
          : { kind: 'warn', text: 'Cette vidéo est déjà dans vos favoris.' }
      )
    } catch (e) {
      setStatus({ kind: 'err', text: e instanceof Error ? e.message : 'Impossible de récupérer la vidéo.' })
    }
  }

  const statusColor =
    status.kind === 'ok'
      ? 'text-emerald-400'
      : status.kind === 'warn'
        ? 'text-amber-400'
        : status.kind === 'err'
          ? 'text-red-400'
          : 'text-muted'

  return (
    <section className="rounded-2xl border border-border bg-surface p-4">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold">
        <PlusIcon width={18} height={18} className="text-accent" /> Ajouter une vidéo YouTube
      </h2>
      <p className="mb-3 text-xs text-muted">
        Collez un lien YouTube (youtube.com/watch, youtu.be, shorts…) : la vidéo est ajoutée automatiquement à vos
        favoris.
      </p>

      <div className="flex gap-2">
        <input
          value={url}
          onChange={(e) => {
            setUrl(e.target.value)
            if (status.kind !== 'idle' && status.kind !== 'loading') setStatus({ kind: 'idle', text: '' })
          }}
          onKeyDown={(e) => e.key === 'Enter' && void submit()}
          placeholder="https://www.youtube.com/watch?v=…"
          inputMode="url"
          enterKeyHint="go"
          className="min-w-0 flex-1 rounded-full bg-surface2 px-4 py-2.5 text-sm outline-none placeholder:text-muted"
        />
        <button
          onClick={() => void submit()}
          disabled={status.kind === 'loading' || !url.trim()}
          className="shrink-0 rounded-full bg-accent px-4 py-2.5 text-sm font-semibold text-white transition active:scale-95 disabled:opacity-50"
        >
          {status.kind === 'loading' ? '…' : 'Ajouter'}
        </button>
      </div>

      {status.kind !== 'idle' && (
        <p className={`mt-2 flex items-start gap-1.5 text-xs ${statusColor}`}>
          {status.kind === 'ok' && <CheckIcon width={14} height={14} className="mt-px shrink-0" />}
          {status.text}
        </p>
      )}
    </section>
  )
}
