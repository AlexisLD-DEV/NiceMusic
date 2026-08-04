/**
 * Wrapper minimal de l'IFrame API YouTube (lecteur officiel).
 *
 * Permet de lire l'audio/vidéo d'une vidéo YouTube sans dépendre des sources
 * Invidious : le player YouTube officiel gère lui-même la lecture en
 * arrière-plan et les contrôles d'écran verrouillé sur Android.
 *
 * Le conteneur <div> doit exister dans le DOM (voir PlayerBar). La vidéo est
 * jouée par le player officiel ; l'app ne contrôle que la file (loadVideoById)
 * et l'état (lecture/pause/position).
 */

let player: YT.Player | null = null
let containerEl: HTMLElement | null = null
let apiLoaded = false
let apiLoading: Promise<void> | null = null

declare global {
  interface Window {
    onYouTubeIframeAPIReady?: () => void
  }
}

export type YTPlaybackState = -1 | 0 | 1 | 2 | 3 | 5 // -1 non démarré, 0 fini, 1 lecture, 2 pause, 3 buffer, 5 prêt

export interface YTPlayerCallbacks {
  onReady?: () => void
  onStateChange?: (state: YTPlaybackState) => void
  onError?: (code: number) => void
}

function loadApi(): Promise<void> {
  if (apiLoaded) return Promise.resolve()
  if (apiLoading) return apiLoading
  // API déjà chargée (ou pré-chargée par le host/test)
  if (window.YT?.Player) {
    apiLoaded = true
    return Promise.resolve()
  }
  apiLoading = new Promise((resolve, reject) => {
    const prev = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      apiLoaded = true
      prev?.()
      resolve()
    }
    const tag = document.createElement('script')
    tag.src = 'https://www.youtube.com/iframe_api'
    tag.async = true
    tag.onerror = () => reject(new Error('Impossible de charger le lecteur YouTube'))
    document.head.appendChild(tag)
    // Filet de sécurité : si l'API ne charge pas (YouTube bloqué), on échoue
    window.setTimeout(() => {
      if (!apiLoaded) reject(new Error('Timeout de chargement du lecteur YouTube'))
    }, 15_000)
  })
  return apiLoading
}

/** Crée (ou recrée) le player YouTube dans le conteneur donné. */
export async function createYTPlayer(el: HTMLElement, callbacks: YTPlayerCallbacks): Promise<void> {
  containerEl = el
  await loadApi()
  if (player) {
    player.destroy()
    player = null
  }
  player = new YT.Player(el, {
    width: '100%',
    height: '100%',
    videoId: '',
    playerVars: {
      playsinline: 1,
      controls: 0,
      disablekb: 1,
      rel: 0,
      iv_load_policy: 3,
      modestbranding: 1,
      origin: window.location.origin
    },
    events: {
      onReady: () => callbacks.onReady?.(),
      onStateChange: (e: YT.OnStateChangeEvent) => callbacks.onStateChange?.(e.data as YTPlaybackState),
      onError: (e: YT.OnErrorEvent) => callbacks.onError?.(e.data)
    }
  })
}

export function ytPlayVideo(id: string): void {
  if (!player) return
  try {
    player.loadVideoById(id)
  } catch {
    /* ignoré : l'état onStateChange prendra le relais */
  }
}

export function ytPause(): void {
  player?.pauseVideo()
}

export function ytResume(): void {
  player?.playVideo()
}

export function ytSeek(time: number): void {
  player?.seekTo(time, true)
}

/** Volume 0..1 → setVolume(0..100) du lecteur YouTube. */
export function ytSetVolume(v: number): void {
  player?.setVolume(Math.round(Math.min(1, Math.max(0, v)) * 100))
}

export function ytCurrentTime(): number {
  return player?.getCurrentTime() ?? 0
}

export function ytDuration(): number {
  return player?.getDuration() ?? 0
}

export function destroyYTPlayer(): void {
  player?.destroy()
  player = null
  containerEl = null
}

export function ytContainerReady(): boolean {
  return !!containerEl
}
