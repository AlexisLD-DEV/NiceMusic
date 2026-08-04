import type { Track } from './types'

/**
 * Media Session API : contrôles play/pause/précédent/suivant/seek sur l'écran
 * verrouillé Android (et dans le centre de notifications), pendant que la
 * musique tourne (lecteur YouTube officiel).
 */
export function setupMediaSession(handlers: {
  onPlay: () => void
  onPause: () => void
  onNext: () => void
  onPrev: () => void
  onSeek: (time: number) => void
}): void {
  if (!('mediaSession' in navigator)) return
  const ms = navigator.mediaSession
  try {
    ms.setActionHandler('play', handlers.onPlay)
    ms.setActionHandler('pause', handlers.onPause)
    ms.setActionHandler('previoustrack', handlers.onPrev)
    ms.setActionHandler('nexttrack', handlers.onNext)
    ms.setActionHandler('seekto', (details) => {
      if (details.seekTime != null) handlers.onSeek(details.seekTime)
    })
    ms.setActionHandler('stop', () => handlers.onPause())
  } catch {
    /* certains navigateurs n'implémentent pas tous les handlers */
  }
}

/** Met à jour les métadonnées affichées sur l'écran verrouillé. */
export function updateMediaSession(track: Track): void {
  if (!('mediaSession' in navigator)) return
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.author,
      album: 'NiceMusic',
      artwork: [
        {
          src: `https://i.ytimg.com/vi/${track.id}/maxresdefault.jpg`,
          sizes: '512x512',
          type: 'image/jpeg'
        }
      ]
    })
  } catch {
    /* ignoré */
  }
}

/** Met à jour l'état de lecture (playing/paused) sur l'écran verrouillé. */
export function setMediaSessionPlaybackState(state: 'playing' | 'paused'): void {
  if (!('mediaSession' in navigator)) return
  try {
    navigator.mediaSession.playbackState = state
  } catch {
    /* ignoré */
  }
}

/** Met à jour la position (progression) sur l'écran verrouillé. */
export function updateMediaSessionPosition(position: number, duration: number): void {
  if (!('mediaSession' in navigator)) return
  if (duration <= 0 || !Number.isFinite(position) || !Number.isFinite(duration)) return
  try {
    navigator.mediaSession.setPositionState({
      duration,
      playbackRate: 1,
      position: Math.min(position, duration)
    })
  } catch {
    /* non supporté / état invalide : ignoré */
  }
}
