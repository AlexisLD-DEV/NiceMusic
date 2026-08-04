import { useFavorites } from '../api/queries'
import { usePlayer } from '../stores/player'
import { formatDuration } from '../lib/utils'
import {
  ChevronDownIcon,
  HeartFilledIcon,
  HeartIcon,
  MusicIcon,
  NextIcon,
  PauseIcon,
  PlayIcon,
  PrevIcon,
  RepeatIcon,
  RepeatOneIcon,
  ShuffleIcon,
  VolumeIcon,
  VolumeMuteIcon
} from './icons'

/** Écran « En lecture » plein écran (agencement façon Deezer). */
export function NowPlaying({ onClose }: { onClose: () => void }) {
  const {
    current,
    isPlaying,
    currentTime,
    duration,
    error,
    queue,
    index,
    volume,
    setVolume,
    shuffle,
    setShuffle,
    repeat,
    setRepeat
  } = usePlayer()
  const { isFavorite, toggleFavorite } = useFavorites()

  if (!current) return null
  const max = duration || 0
  const muted = volume <= 0.01

  return (
    <div className="now-playing safe-top fixed inset-0 z-50 flex flex-col bg-bg px-6 pb-8">
      {/* Barre du haut */}
      <div className="flex items-center justify-between py-2">
        <button onClick={onClose} className="rounded-full p-2 text-muted transition active:scale-90" aria-label="Fermer">
          <ChevronDownIcon width={26} height={26} />
        </button>
        <span className="text-xs font-semibold uppercase tracking-widest text-muted">En lecture</span>
        <span className="w-9" />
      </div>

      {error && <p className="mb-1 truncate text-center text-xs text-red-400">{error}</p>}

      <div className="flex flex-1 flex-col items-center justify-center gap-5">
        {/* 1. Pochette / miniature YouTube */}
        {current.thumbnail ? (
          <img
            src={current.thumbnail}
            alt=""
            className="aspect-square w-full max-w-xs shrink-0 rounded-2xl object-cover shadow-2xl"
            loading="lazy"
          />
        ) : (
          <div className="flex aspect-square w-full max-w-xs shrink-0 items-center justify-center rounded-2xl bg-surface text-muted">
            <MusicIcon width={80} height={80} />
          </div>
        )}

        {/* Titre + artiste */}
        <div className="w-full max-w-sm text-center">
          <div className="flex items-center justify-center gap-2">
            <h2 className="min-w-0 truncate text-xl font-bold">{current.title}</h2>
            {isPlaying && (
              <span className="eq shrink-0" aria-hidden="true">
                <span />
                <span />
                <span />
                <span />
              </span>
            )}
          </div>
          <p className="truncate text-sm text-muted">{current.author}</p>
        </div>

        {/* 2. Bouton favoris */}
        <button
          onClick={() => toggleFavorite(current)}
          className="rounded-full p-2 transition active:scale-90"
          aria-label="J'aime"
        >
          {isFavorite(current.id) ? (
            <HeartFilledIcon width={30} height={30} className="text-accent2" />
          ) : (
            <HeartIcon width={30} height={30} className="text-text" />
          )}
        </button>

        {/* 3. Barre de lecture (progression) */}
        <div className="w-full max-w-sm">
          <input
            type="range"
            min={0}
            max={max}
            step={0.5}
            value={Math.min(currentTime, max)}
            onChange={(e) => usePlayer.getState().seek(Number(e.target.value))}
            className="player-range w-full"
            aria-label="Progression"
          />
          <div className="flex justify-between text-xs tabular-nums text-muted">
            <span>{formatDuration(currentTime)}</span>
            <span>{formatDuration(duration)}</span>
          </div>
        </div>

        {/* 4. Précédent / Pause / Suivant */}
        <div className="flex w-full max-w-sm items-center justify-center gap-8">
          <button
            onClick={() => usePlayer.getState().prev()}
            className="rounded-full p-2 text-text transition active:scale-90"
            aria-label="Précédent"
          >
            <PrevIcon width={30} height={30} />
          </button>
          <button
            onClick={() => void usePlayer.getState().toggle()}
            className="btn-accent rounded-full p-4 text-white transition active:scale-90"
            aria-label={isPlaying ? 'Pause' : 'Lecture'}
          >
            {isPlaying ? <PauseIcon width={32} height={32} /> : <PlayIcon width={32} height={32} />}
          </button>
          <button
            onClick={() => usePlayer.getState().next()}
            className="rounded-full p-2 text-text transition active:scale-90"
            aria-label="Suivant"
          >
            <NextIcon width={30} height={30} />
          </button>
        </div>

        {/* 5. Aléatoire + répéter */}
        <div className="flex w-full max-w-sm items-center justify-center gap-10">
          <button
            onClick={() => setShuffle(!shuffle)}
            className={`rounded-full p-2.5 transition active:scale-90 ${shuffle ? 'text-accent' : 'text-muted'}`}
            aria-label="Aléatoire"
          >
            <ShuffleIcon width={24} height={24} />
          </button>
          <button
            onClick={() => setRepeat(repeat === 'off' ? 'all' : repeat === 'all' ? 'one' : 'off')}
            className={`rounded-full p-2.5 transition active:scale-90 ${repeat !== 'off' ? 'text-accent' : 'text-muted'}`}
            aria-label="Répéter"
          >
            {repeat === 'one' ? <RepeatOneIcon width={24} height={24} /> : <RepeatIcon width={24} height={24} />}
          </button>
        </div>

        {/* 6. Volume */}
        <div className="flex w-full max-w-sm items-center gap-3 text-muted">
          {muted ? (
            <VolumeMuteIcon width={20} height={20} className="shrink-0" />
          ) : (
            <VolumeIcon width={20} height={20} className="shrink-0" />
          )}
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(volume * 100)}
            onChange={(e) => setVolume(Number(e.target.value) / 100)}
            className="player-range w-full"
            aria-label="Volume"
          />
        </div>

        {queue.length > 1 && (
          <p className="-mt-2 text-xs tabular-nums text-muted">
            {index + 1} / {queue.length}
          </p>
        )}
      </div>
    </div>
  )
}
