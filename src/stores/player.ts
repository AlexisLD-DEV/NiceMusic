import { create } from 'zustand'
import { getHistory, putHistory } from '../api/client'
import { listStreamCandidates, searchTracks } from '../lib/invidious'
import type { Track } from '../lib/types'
import { updateMediaSession } from '../lib/mediaSession'

/**
 * Store du lecteur.
 *
 * Le stream audio est lu en direct depuis l'instance Invidious via un élément
 * <audio> unique (module-level) : la lecture continue quand l'écran se verrouille,
 * et les contrôles passent par la Media Session API (voir mediaSession.ts).
 */

// ---------------------------------------------------------------------------
// Élément audio unique
// ---------------------------------------------------------------------------

const audio: HTMLAudioElement | null = typeof window !== 'undefined' ? new Audio() : null
if (audio) {
  audio.preload = 'auto'
}

interface PlayerState {
  queue: Track[]
  index: number
  current: Track | null
  isPlaying: boolean
  currentTime: number
  duration: number
  error: string | null
  play: (track: Track, queue?: Track[]) => Promise<void>
  toggle: () => Promise<void>
  next: () => void
  prev: () => void
  seek: (time: number) => void
  stop: () => void
}

let streamCandidates: string[] = []
let candidateIndex = 0
let lastRecordedId: string | null = null

/** Recherche YouTube pour un titre non mappé (issu de l'export Deezer). */
async function resolveVideoId(track: Track): Promise<Track> {
  if (!track.unmapped) return track
  const items = await searchTracks(`${track.title} ${track.author}`)
  const first = pickBestMatch(items, track)
  if (!first) throw new Error(`Aucun résultat YouTube pour « ${track.title} »`)
  return {
    ...track,
    id: first.id,
    title: first.title,
    author: first.author,
    duration: first.duration,
    thumbnail: first.thumbnail,
    unmapped: false
  }
}

/**
 * Choisit le résultat le plus pertinent : titre identique (insensible à la
 * casse) d'abord, puis contenant le titre, puis contenant « official » /
 * « audio » ; sinon le premier résultat.
 */
function pickBestMatch(items: Track[], track: Track): Track | undefined {
  if (items.length === 0) return undefined
  const qTitle = track.title.toLowerCase()
  const qArtist = track.author.toLowerCase()

  const score = (t: Track): number => {
    const title = t.title.toLowerCase()
    const artist = t.author.toLowerCase()
    let s = 0
    if (title === qTitle) s += 100
    if (title.includes(qTitle) && qTitle.length > 3) s += 40
    if (artist.includes(qArtist) || qArtist.includes(artist)) s += 30
    if (title.includes('official audio')) s += 20
    if (title.includes('official video')) s += 15
    if (title.includes('lyrics')) s -= 5
    if (title.includes('slowed') || title.includes('reverb') || title.includes('remix')) s -= 25
    return s
  }
  return [...items].sort((a, b) => score(b) - score(a))[0]
}

/** Ajoute le titre à l'historique (KV) — fire-and-forget, dédupliqué par id. */
async function recordHistory(track: Track): Promise<void> {
  if (!track || !track.id || track.id === lastRecordedId) return
  lastRecordedId = track.id
  try {
    const { tracks } = await getHistory()
    const next = [track, ...tracks.filter((t) => t.id !== track.id)].slice(0, 100)
    await putHistory({ tracks: next })
  } catch {
    /* échec silencieux : l'historique n'est pas critique */
  }
}

/** Joue le titre à l'index donné de la file, en résolvant le flux. */
async function loadAndPlay(track: Track): Promise<void> {
  const resolved = await resolveVideoId(track)

  usePlayer.setState({ current: resolved, error: null, isPlaying: false })
  updateMediaSession(resolved)

  // URLs companion directes (jouées sans redirection ni CORS) ; en cas
  // d'erreur on essaie la candidate suivante (voir onAudioError).
  streamCandidates = listStreamCandidates(resolved.id)
  candidateIndex = 0
  await playCandidate()
}

async function playCandidate(): Promise<void> {
  const url = streamCandidates[candidateIndex]
  if (!url || !audio) throw new Error('Aucune source audio disponible')
  audio.src = url
  await audio.play()
}

function onAudioError(): void {
  const { current } = usePlayer.getState()
  if (!audio || !current) return

  // Les companions étant instables, on rejoue la même candidate une fois
  // (délai court) avant de passer à la suivante…
  if (candidateIndex < streamCandidates.length) {
    const url = streamCandidates[candidateIndex]!
    candidateIndex++
    const retrySame = `${url}${url.includes('?') ? '&' : '?'}r=${candidateIndex}`
    audio.src = retrySame
    setTimeout(() => {
      audio.play().catch(() => {
        const next = streamCandidates[candidateIndex]
        if (next) {
          audio.src = next
          void audio.play()
        } else {
          usePlayer.getState().next()
        }
      })
    }, 800)
    return
  }
  // …sinon passer au titre suivant
  usePlayer.getState().next()
}

// ---------------------------------------------------------------------------
// Événements de l'élément audio
// ---------------------------------------------------------------------------

if (audio) {
  audio.addEventListener('ended', () => usePlayer.getState().next())
  audio.addEventListener('timeupdate', () => {
    usePlayer.setState({
      currentTime: audio.currentTime,
      duration: audio.duration && Number.isFinite(audio.duration) ? audio.duration : 0
    })
  })
  audio.addEventListener('play', () => {
    usePlayer.setState({ isPlaying: true })
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing'
    recordHistory(usePlayer.getState().current!)
  })
  audio.addEventListener('pause', () => {
    usePlayer.setState({ isPlaying: false })
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused'
  })
  audio.addEventListener('error', onAudioError)
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const usePlayer = create<PlayerState>()((set, get) => ({
  queue: [],
  index: 0,
  current: null,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  error: null,

  async play(track, queue) {
    const q = queue ?? (get().queue.some((t) => t.id === track.id) ? get().queue : [track])
    const index = Math.max(0, q.findIndex((t) => t.id === track.id))
    set({ queue: q, index, current: track, error: null })
    try {
      await loadAndPlay(track)
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Lecture impossible' })
    }
  },

  async toggle() {
    if (!get().current) return
    if (audio?.paused) {
      await audio.play()
    } else {
      audio?.pause()
    }
  },

  next() {
    const { queue, index } = get()
    if (!queue.length) return
    const nextIndex = (index + 1) % queue.length
    const track = queue[nextIndex]!
    set({ index: nextIndex })
    loadAndPlay(track).catch(() => set({ error: 'Lecture impossible' }))
  },

  prev() {
    const { queue, index, currentTime } = get()
    if (!queue.length) return
    if (currentTime > 3) {
      get().seek(0)
      return
    }
    const prevIndex = (index - 1 + queue.length) % queue.length
    const track = queue[prevIndex]!
    set({ index: prevIndex })
    loadAndPlay(track).catch(() => set({ error: 'Lecture impossible' }))
  },

  seek(time) {
    if (audio) {
      audio.currentTime = time
      set({ currentTime: time })
    }
  },

  stop() {
    if (audio) {
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
    }
    set({ isPlaying: false, currentTime: 0 })
  }
}))
