import { create } from 'zustand'
import { getHistory, getMappings, putHistory, putMappings } from '../api/client'
import { listStreamCandidates, searchTracks } from '../lib/invidious'
import type { Track } from '../lib/types'
import { updateMediaSession } from '../lib/mediaSession'

/**
 * Store du lecteur.
 *
 * Le stream audio est lu en direct depuis l'instance Invidious via un élément
 * <audio> unique (module-level) : la lecture continue quand l'écran se verrouille,
 * et les contrôles passent par la Media Session API (voir mediaSession.ts).
 *
 * Performance : les sources de flux sont sondées EN PARALLÈLE (quelques
 * secondes max) au lieu d'être essayées une par une ; le mapping
 * Deezer→YouTube est mis en cache (KV) pour ne relancer une recherche YouTube
 * qu'une seule fois par titre.
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
  /** true pendant la résolution (recherche YouTube / sondage des sources) */
  loading: boolean
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

let currentTryingUrl = ''
let remainingCandidates: string[] = []
let lastRecordedId: string | null = null
/** moment de la dernière écriture d'historique (debounce anti-quota) */
let lastHistoryWrite = 0

// ---------------------------------------------------------------------------
// Cache de mapping Deezer→YouTube (in-memory + KV)
// ---------------------------------------------------------------------------

const mapCache = new Map<string, Track>()
let mappingsLoaded = false

async function loadMappings(): Promise<void> {
  if (mappingsLoaded) return
  mappingsLoaded = true
  try {
    const { mappings } = await getMappings()
    for (const [key, value] of Object.entries(mappings)) {
      if (value && value.id) mapCache.set(key, value as Track)
    }
  } catch {
    /* hors ligne : on cherchera à chaque fois */
  }
}

async function saveMapping(key: string, resolved: Track): Promise<void> {
  pendingMappings.set(key, {
    id: resolved.id,
    title: resolved.title,
    author: resolved.author,
    duration: resolved.duration,
    thumbnail: resolved.thumbnail
  })
  scheduleMappingsFlush()
}

/** Mappings en attente d'écriture (batch : 1 écriture KV pour N titres). */
const pendingMappings = new Map<string, Partial<Track>>()
let mappingsFlushTimer: number | null = null

function scheduleMappingsFlush(): void {
  if (mappingsFlushTimer !== null) return
  mappingsFlushTimer = window.setTimeout(() => {
    mappingsFlushTimer = null
    void flushMappings()
  }, 30_000)
}

async function flushMappings(): Promise<void> {
  if (pendingMappings.size === 0) return
  const batch = new Map(pendingMappings)
  pendingMappings.clear()
  try {
    const { mappings } = await getMappings()
    for (const [key, value] of batch) mappings[key] = value
    await putMappings({ mappings })
  } catch {
    // échec (hors ligne ou quota) : on remet en attente pour le prochain flush
    for (const [key, value] of batch) pendingMappings.set(key, value)
  }
}

// À la fermeture de l'app, on tente un dernier flush
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    if (pendingMappings.size > 0) void flushMappings()
  })
}

/** Résout le videoId YouTube d'un titre (cache KV → recherche sinon). */
async function resolveVideoId(track: Track): Promise<Track> {
  if (!track.unmapped) return track
  await loadMappings()
  const cached = mapCache.get(track.id)
  if (cached?.id) {
    return { ...track, ...cached, unmapped: false }
  }
  const items = await searchTracks(`${track.title} ${track.author}`)
  const first = pickBestMatch(items, track)
  if (!first) throw new Error(`Aucun résultat YouTube pour « ${track.title} »`)
  const resolved: Track = {
    ...track,
    id: first.id,
    title: first.title,
    author: first.author,
    duration: first.duration,
    thumbnail: first.thumbnail,
    unmapped: false
  }
  mapCache.set(track.id, resolved)
  void saveMapping(track.id, resolved)
  return resolved
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

/** Ajoute le titre à l'historique (KV) — seulement après 20 s d'écoute,
 *  dédupliqué par id et espacé d'au moins 30 s (économie du quota KV). */
async function recordHistory(track: Track): Promise<void> {
  if (!track || !track.id || track.id === lastRecordedId) return
  const now = Date.now()
  if (now - lastHistoryWrite < 30_000) return
  lastRecordedId = track.id
  lastHistoryWrite = now
  try {
    const { tracks } = await getHistory()
    const next = [track, ...tracks.filter((t) => t.id !== track.id)].slice(0, 100)
    await putHistory({ tracks: next })
  } catch {
    /* échec silencieux : l'historique n'est pas critique */
  }
}

// ---------------------------------------------------------------------------
// Sondage parallèle des sources
// ---------------------------------------------------------------------------

/**
 * Sonde des URLs de flux en parallèle (éléments <audio> temporaires) et
 * renvoie la première qui charge ses métadonnées. Rapide : on ne perd pas de
 * temps sur des sources mortes séquentiellement.
 */
function probeStreams(urls: string[], timeoutMs: number): Promise<string | null> {
  return new Promise((resolve) => {
    if (urls.length === 0) {
      resolve(null)
      return
    }
    let pending = urls.length
    let settled = false

    const finish = (url: string | null): void => {
      if (settled) return
      settled = true
      resolve(url)
    }

    for (const url of urls) {
      const probe = new Audio()
      const fail = (): void => {
        probe.src = ''
        pending--
        if (pending === 0) finish(null)
      }
      const t = window.setTimeout(fail, timeoutMs)
      probe.onloadedmetadata = () => {
        window.clearTimeout(t)
        probe.src = ''
        finish(url)
      }
      probe.onerror = () => {
        window.clearTimeout(t)
        fail()
      }
      probe.src = url
    }
  })
}

function streamError(): string {
  return 'Lecture impossible : les sources Invidious sont indisponibles pour le moment. Réessayez dans quelques secondes.'
}

/** Joue le titre à l'index donné de la file, en résolvant le flux. */
async function loadAndPlay(track: Track): Promise<void> {
  const resolved = await resolveVideoId(track)

  usePlayer.setState({ current: resolved, error: null, isPlaying: false, loading: true })
  updateMediaSession(resolved)

  // Sondage parallèle : d'abord les companions (fiables), puis le reste.
  const candidates = listStreamCandidates(resolved.id)
  remainingCandidates = candidates.slice(6)
  const url =
    (await probeStreams(candidates.slice(0, 6), 3_500)) ??
    (await probeStreams(remainingCandidates.splice(0, 6), 3_000))

  if (!url) {
    usePlayer.setState({ isPlaying: false, loading: false, error: streamError() })
    return
  }
  playUrl(url)
}

/** Joue une URL de flux ; les échecs ultérieurs sont gérés par onAudioError. */
function playUrl(url: string): void {
  if (!audio) return
  currentTryingUrl = url
  audio.src = url
  audio.play().catch(() => {
    /* l'événement 'error' prend le relais (onAudioError) */
  })
}

function onAudioError(): void {
  const { current } = usePlayer.getState()
  if (!audio || !current) return
  // Ignore les événements obsolètes (une autre source est déjà chargée)
  if (audio.src !== currentTryingUrl) return

  // Re-sonde ce qui reste (par petits lots), sinon erreur claire.
  void (async () => {
    const url = await probeStreams(remainingCandidates.splice(0, 4), 2_500)
    if (url) {
      playUrl(url)
      return
    }
    usePlayer.setState({ isPlaying: false, loading: false, error: streamError() })
  })()
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
    // Historique : uniquement une fois qu'on écoute vraiment (≥ 20 s)
    const { current } = usePlayer.getState()
    if (current && audio.currentTime >= 20) void recordHistory(current)
  })
  audio.addEventListener('play', () => {
    usePlayer.setState({ isPlaying: true, loading: false })
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing'
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
  loading: false,
  currentTime: 0,
  duration: 0,
  error: null,

  async play(track, queue) {
    const q = queue ?? (get().queue.some((t) => t.id === track.id) ? get().queue : [track])
    const index = Math.max(0, q.findIndex((t) => t.id === track.id))
    set({ queue: q, index, current: track, error: null, loading: true })
    try {
      await loadAndPlay(track)
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Lecture impossible', loading: false })
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
    loadAndPlay(track).catch(() => set({ error: 'Lecture impossible', loading: false }))
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
    loadAndPlay(track).catch(() => set({ error: 'Lecture impossible', loading: false }))
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
    set({ isPlaying: false, currentTime: 0, loading: false })
  }
}))
