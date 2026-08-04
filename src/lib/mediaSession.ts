import type { Track } from './types'

/**
 * Media Session API : contrôles play/pause/précédent/suivant sur l'écran
 * verrouillé Android (et dans le centre de notifications), pendant que la
 * musique tourne. À appeler une fois au montage de l'app.
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
    navigator.mediaSession.playbackState = 'paused'
  } catch {
    /* ignoré */
  }
}
