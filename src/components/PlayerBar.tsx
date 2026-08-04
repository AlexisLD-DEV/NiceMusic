import { usePlayer } from '../stores/player'
import { formatDuration } from '../lib/utils'
import { MusicIcon, NextIcon, PauseIcon, PlayIcon, PrevIcon } from './icons'

/** Barre de lecture persistante, au-dessus de la navigation. */
export function PlayerBar() {
  const { current, isPlaying, loading, currentTime, duration, error, queue, index } = usePlayer()

  if (!current) return null

  const max = duration || 0

  return (
    <div className="border-t border-border bg-surface px-3 pb-1.5 pt-2">
      {error ? (
        <p className="mb-1 truncate text-xs text-red-400">{error}</p>
      ) : loading ? (
        <p className="mb-1 text-xs text-muted">Chargement…</p>
      ) : null}
      <div className="flex items-center gap-3">
        {current.thumbnail ? (
          <img src={current.thumbnail} alt="" className="h-11 w-11 rounded-md object-cover" loading="lazy" />
        ) : (
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-surface2 text-muted">
            <MusicIcon width={20} height={20} />
          </div>
        )}

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium leading-tight">{current.title}</p>
          <p className="truncate text-xs text-muted">{current.author}</p>
        </div>

        {queue.length > 1 && (
          <span className="shrink-0 text-[10px] tabular-nums text-muted">
            {index + 1}/{queue.length}
          </span>
        )}

        <div className="flex shrink-0 items-center gap-1.5">
          <button
            onClick={() => usePlayer.getState().prev()}
            className="rounded-full p-1.5 transition active:scale-90"
            aria-label="Précédent"
          >
            <PrevIcon width={22} height={22} />
          </button>
          <button
            onClick={() => void usePlayer.getState().toggle()}
            className="rounded-full bg-accent p-2 text-white transition active:scale-90"
            aria-label={isPlaying ? 'Pause' : 'Lecture'}
          >
            {isPlaying ? <PauseIcon width={22} height={22} /> : <PlayIcon width={22} height={22} />}
          </button>
          <button
            onClick={() => usePlayer.getState().next()}
            className="rounded-full p-1.5 transition active:scale-90"
            aria-label="Suivant"
          >
            <NextIcon width={22} height={22} />
          </button>
        </div>
      </div>

      <input
        type="range"
        min={0}
        max={max}
        step={0.5}
        value={Math.min(currentTime, max)}
        onChange={(e) => usePlayer.getState().seek(Number(e.target.value))}
        className="player-range mt-1.5 w-full"
        aria-label="Progression"
      />
      <div className="flex justify-between text-[10px] tabular-nums text-muted">
        <span>{formatDuration(currentTime)}</span>
        <span>{formatDuration(duration)}</span>
      </div>
    </div>
  )
}
