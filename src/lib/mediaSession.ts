import type { Track } from './types'

/**
 * Media Session API : contrôles play/pause/précédent/suivant/seek sur l'écran
 * verrouillé Android (et dans le centre de notifications), pendant que la
 * musique tourne (lecteur YouTube officiel).
 *
 * Particularité : l'iframe YouTube réécrit elle-même la Media Session (avec
 * seulement play/pause) dès qu'une vidéo démarre, ce qui efface nos boutons
 * précédent/suivant. On doit donc ré-affirmer régulièrement nos métadonnées
 * et nos handlers pendant la lecture (voir reassertMediaSession).
 */

interface Handlers {
  onPlay: () => void
  onPause: () => void
  onNext: () => void
  onPrev: () => void
  onSeek: (time: number) => void
}

let currentHandlers: Handlers | null = null
let currentTrack: Track | null = null
let currentPosition = 0
let currentDuration = 0

/** Enregistre les handlers d'action (écran verrouillé). */
export function setupMediaSession(handlers: Handlers): void {
  currentHandlers = handlers
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
  currentTrack = track
  if (!('mediaSession' in navigator)) return
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.author,
      album: 'NiceMusic',
      artwork: [
        {
          // Pochette réelle (miniature YouTube) si disponible ; sinon le CDN
          // officiel YouTube (ne marche que si id = videoId).
          src: track.thumbnail ?? `https://i.ytimg.com/vi/${track.id}/maxresdefault.jpg`,
          sizes: '512x512',
          type: 'image/jpeg'
        }
      ]
    })
  } catch {
    /* ignoré */
  }
}

/**
 * Ré-affirme métadonnées + handlers + position : à appeler périodiquement
 * pendant la lecture, car l'iframe YouTube écrase la Media Session à chaque
 * nouvelle vidéo (ce qui fait disparaître les boutons précédent/suivant).
 *
 * IMPORTANT (Android Chrome/Brave) : l'écran de verrouillage n'affiche les
 * boutons précédent/suivant QUE si un `setPositionState` valide a été posé.
 * Ré-affirmer la position ici est donc indispensable, pas seulement les
 * handlers — sinon seuls play/pause restent visibles.
 */
export function reassertMediaSession(): void {
  if (!('mediaSession' in navigator)) return
  if (currentTrack) updateMediaSession(currentTrack)
  if (currentHandlers) setupMediaSession(currentHandlers)
  // Ré-affirme la position : c'est elle qui fait apparaître précédent/suivant
  // sur l'écran verrouillé Android.
  if (currentDuration > 0) {
    updateMediaSessionPosition(currentPosition, currentDuration)
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
  currentPosition = position
  currentDuration = duration
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
