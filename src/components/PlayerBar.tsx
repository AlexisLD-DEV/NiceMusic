import { useState } from 'react'
import { usePlayer, YT_PLAYER_ID } from '../stores/player'
import { formatDuration } from '../lib/utils'
import { MusicIcon, NextIcon, PauseIcon, PlayIcon, PrevIcon, CloseIcon, VolumeIcon, VolumeMuteIcon } from './icons'

/** Barre de lecture persistante, au-dessus de la navigation. */
export function PlayerBar() {
  const { current, isPlaying, loading, currentTime, duration, error, queue, index, mode, volume, setVolume } =
    usePlayer()
  const [showVideo, setShowVideo] = useState(false)
  const [volOpen, setVolOpen] = useState(false)

  if (!current) return null

  const max = duration || 0
  const isYoutube = mode === 'youtube'
  const muted = volume <= 0.01

  return (
    <div className="relative border-t border-border bg-surface px-3 pb-1.5 pt-2">
      {/* Lecteur YouTube (officiel) — masqué par défaut, affichable à la demande */}
      {isYoutube && (
        <div
          className={
            showVideo
              ? 'fixed bottom-40 right-3 z-50 w-72 overflow-hidden rounded-xl border border-border bg-black shadow-2xl'
              : 'pointer-events-none fixed -left-[9999px] top-0 w-72'
          }
          aria-hidden={!showVideo}
        >
          <div id={YT_PLAYER_ID} className="aspect-video w-full" />
          {showVideo && (
            <button
              onClick={() => setShowVideo(false)}
              className="absolute right-1.5 top-1.5 rounded-full bg-black/70 p-1 text-white"
              aria-label="Masquer la vidéo"
            >
              <CloseIcon width={14} height={14} />
            </button>
          )}
        </div>
      )}

      {/* Popover volume */}
      {volOpen && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setVolOpen(false)} aria-hidden="true" />
          <div className="absolute -top-14 right-2 z-30 flex items-center gap-2 rounded-xl border border-border bg-surface2 px-3 py-2 shadow-xl">
            {muted ? (
              <VolumeMuteIcon width={18} height={18} className="shrink-0 text-muted" />
            ) : (
              <VolumeIcon width={18} height={18} className="shrink-0 text-muted" />
            )}
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(volume * 100)}
              onChange={(e) => setVolume(Number(e.target.value) / 100)}
              className="player-range w-28"
              aria-label="Volume"
            />
          </div>
        </>
      )}

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

        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium leading-tight">{current.title}</p>
            <p className="truncate text-xs text-muted">{current.author}</p>
          </div>
          {isPlaying && (
            <div className="eq shrink-0" aria-label="En lecture">
              <span />
              <span />
              <span />
              <span />
            </div>
          )}
        </div>

        {queue.length > 1 && (
          <span className="shrink-0 text-[10px] tabular-nums text-muted">
            {index + 1}/{queue.length}
          </span>
        )}

        {isYoutube && (
          <button
            onClick={() => setShowVideo((v) => !v)}
            className={`shrink-0 rounded-full border border-border px-2.5 py-1 text-[10px] transition active:scale-95 ${
              showVideo ? 'btn-accent text-white' : 'bg-surface2 text-muted'
            }`}
            aria-label={showVideo ? 'Masquer la vidéo' : 'Afficher la vidéo'}
          >
            {showVideo ? 'Vidéo ✓' : 'Vidéo'}
          </button>
        )}

        <button
          onClick={() => setVolOpen((v) => !v)}
          className="shrink-0 rounded-full p-1.5 text-muted transition active:scale-90"
          aria-label="Volume"
        >
          {muted ? <VolumeMuteIcon width={20} height={20} /> : <VolumeIcon width={20} height={20} />}
        </button>

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
            className="btn-accent rounded-full p-2 text-white transition active:scale-90"
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
