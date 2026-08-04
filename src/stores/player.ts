import { create } from 'zustand'
import { getHistory, getMappings, getSettings, putHistory, putMappings, putSettings } from '../api/client'
import { listStreamCandidates, searchTracks } from '../lib/invidious'
import {
  createYTPlayer,
  destroyYTPlayer,
  ytCurrentTime,
  ytDuration,
  ytPause,
  ytPlayVideo,
  ytResume,
  ytSeek,
  ytSetVolume,
  type YTPlaybackState
} from '../lib/ytPlayer'
import type { Track } from '../lib/types'
import {
  setMediaSessionPlaybackState,
  updateMediaSession,
  updateMediaSessionPosition
} from '../lib/mediaSession'

/**
 * Store du lecteur — deux backends de lecture :
 *
 * 1) 'youtube' (défaut) : lecteur officiel YouTube (IFrame API). Fiable, la
 *    lecture continue en arrière-plan et les contrôles d'écran verrouillé sont
 *    fournis par le player YouTube lui-même. La vidéo peut être masquée.
 * 2) 'audio' : flux audio seul via Invidious (élément <audio> + Media Session).
 *
 * Le mapping Deezer→YouTube est mis en cache (KV, batché) pour ne relancer une
 * recherche YouTube qu'une seule fois par titre.
 */

export type PlaybackMode = 'youtube' | 'audio'

const MODE_KEY = 'nicemusic.mode'
const VOLUME_KEY = 'nicemusic.volume'
const SHUFFLE_KEY = 'nicemusic.shuffle'
const REPEAT_KEY = 'nicemusic.repeat'

export type RepeatMode = 'off' | 'all' | 'one'

function initialMode(): PlaybackMode {
  try {
    return localStorage.getItem(MODE_KEY) === 'audio' ? 'audio' : 'youtube'
  } catch {
    return 'youtube'
  }
}

function initialVolume(): number {
  try {
    const v = Number(localStorage.getItem(VOLUME_KEY))
    if (Number.isFinite(v) && v >= 0 && v <= 1) return v
  } catch {
    /* défaut */
  }
  return 0.8
}

// ---------------------------------------------------------------------------
// Élément audio unique (backend 'audio')
// ---------------------------------------------------------------------------

const audio: HTMLAudioElement | null = typeof window !== 'undefined' ? new Audio() : null
if (audio) {
  audio.preload = 'auto'
  audio.volume = initialVolume()
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
  volume: number
  setVolume: (v: number) => void
  shuffle: boolean
  setShuffle: (v: boolean) => void
  repeat: RepeatMode
  setRepeat: (r: RepeatMode) => void
  mode: PlaybackMode
  setMode: (mode: PlaybackMode) => void
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

/** Version du cache de mappings (pour re-rendre les listes quand il change). */
const useMappingsVersion = create<{ v: number; bump: () => void }>()((set) => ({
  v: 0,
  bump: () => set((s) => ({ v: s.v + 1 }))
}))

/** Version du cache de mappings (hook UI : miniatures des titres mappés). */
export function useMappingsVersionValue(): number {
  return useMappingsVersion((s) => s.v)
}

/** Enrichit un titre non mappé avec sa résolution YouTube mise en cache (si dispo). */
export function getMappedTrack(track: Track): Track {
  if (!track.unmapped) return track
  const cached = mapCache.get(track.id)
  return cached?.id ? { ...track, ...cached, unmapped: false } : track
}

async function loadMappings(): Promise<void> {
  if (mappingsLoaded) return
  mappingsLoaded = true
  try {
    const { mappings } = await getMappings()
    for (const [key, value] of Object.entries(mappings)) {
      if (value && value.id) mapCache.set(key, value as Track)
    }
    useMappingsVersion.getState().bump()
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
    for (const [key, value] of batch) pendingMappings.set(key, value)
  }
}

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
  useMappingsVersion.getState().bump()
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
// Backend 'audio' : sondage parallèle des sources Invidious
// ---------------------------------------------------------------------------

/** Dernière URL qui a réellement joué (rotation : on la retente en premier). */
let lastWorkingUrl: string | null = null

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
      probe.preload = 'auto'
      let timer = 0
      let poll = 0

      const cleanup = (): void => {
        if (timer) window.clearTimeout(timer)
        if (poll) window.clearInterval(poll)
        probe.src = ''
      }
      const ok = (): void => {
        cleanup()
        finish(url)
      }
      const fail = (): void => {
        cleanup()
        pending--
        if (pending === 0) finish(null)
      }

      timer = window.setTimeout(fail, timeoutMs)
      probe.onloadedmetadata = ok
      probe.onloadeddata = ok
      probe.oncanplay = ok
      probe.onerror = fail
      poll = window.setInterval(() => {
        if (!settled && probe.readyState >= 2) ok()
      }, 200)
      probe.src = url
    }
  })
}

function reorderCandidates(candidates: string[]): string[] {
  if (!lastWorkingUrl) return candidates
  const rest = candidates.filter((u) => u !== lastWorkingUrl)
  return [lastWorkingUrl!, ...rest]
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => window.setTimeout(r, ms))
}

/** Index aléatoire différent de l'index courant (mode aléatoire). */
function randomOtherIndex(current: number, length: number): number {
  if (length <= 1) return 0
  let i = current
  while (i === current) i = Math.floor(Math.random() * length)
  return i
}

function streamError(): string {
  return 'Lecture impossible : les sources Invidious sont indisponibles pour le moment. Réessayez dans quelques secondes.'
}

async function playAudioTrack(track: Track): Promise<void> {
  const resolved = await resolveVideoId(track)

  usePlayer.setState({ current: resolved, error: null, isPlaying: false, loading: true })
  updateMediaSession(resolved)

  const candidates = reorderCandidates(listStreamCandidates(resolved.id))
  remainingCandidates = candidates
  let url = await probeStreams(candidates, 4_500)
  if (!url) {
    await sleep(4_000)
    url = await probeStreams(candidates, 4_500)
  }

  if (!url) {
    usePlayer.setState({ isPlaying: false, loading: false, error: streamError() })
    return
  }
  playUrl(url)
}

function playUrl(url: string): void {
  if (!audio) return
  currentTryingUrl = url
  lastWorkingUrl = url
  audio.src = url
  audio.play().catch(() => {
    /* l'événement 'error' prend le relais (onAudioError) */
  })
}

function onAudioError(): void {
  const { current } = usePlayer.getState()
  if (!audio || !current) return
  if (audio.src !== currentTryingUrl) return

  void (async () => {
    const url = await probeStreams(reorderCandidates(remainingCandidates), 3_500)
    if (url) {
      playUrl(url)
      return
    }
    usePlayer.setState({ isPlaying: false, loading: false, error: streamError() })
  })()
}

if (audio) {
  audio.addEventListener('ended', () => usePlayer.getState().next())
  audio.addEventListener('timeupdate', () => {
    usePlayer.setState({
      currentTime: audio.currentTime,
      duration: audio.duration && Number.isFinite(audio.duration) ? audio.duration : 0
    })
    updateMediaSessionPosition(audio.currentTime, audio.duration || 0)
    const { current } = usePlayer.getState()
    if (current && audio.currentTime >= 20) void recordHistory(current)
  })
  audio.addEventListener('play', () => {
    usePlayer.setState({ isPlaying: true, loading: false })
    setMediaSessionPlaybackState('playing')
  })
  audio.addEventListener('pause', () => {
    usePlayer.setState({ isPlaying: false })
    setMediaSessionPlaybackState('paused')
  })
  audio.addEventListener('error', onAudioError)
}

// ---------------------------------------------------------------------------
// Backend 'youtube' : lecteur officiel (IFrame API)
// ---------------------------------------------------------------------------

let ytReady = false
let ytPending: string | null = null
let ytPoll: number | null = null

function startYtPoll(): void {
  if (ytPoll !== null) return
  ytPoll = window.setInterval(() => {
    const t = ytCurrentTime()
    const d = ytDuration()
    usePlayer.setState({ currentTime: t, duration: d })
    updateMediaSessionPosition(t, d)
    const { current } = usePlayer.getState()
    if (current && t >= 20) void recordHistory(current)
  }, 500)
}

function stopYtPoll(): void {
  if (ytPoll !== null) {
    window.clearInterval(ytPoll)
    ytPoll = null
  }
}

const YT_PLAYER_ID = 'yt-player-container'

/** Repli automatique : le lecteur YouTube est indisponible → mode audio. */
function ytFallbackToAudio(): void {
  stopYtPoll()
  const { current } = usePlayer.getState()
  if (!current) {
    usePlayer.setState({ isPlaying: false, loading: false, error: 'Lecteur YouTube indisponible.' })
    return
  }
  usePlayer.setState({
    error: 'Lecteur YouTube indisponible — lecture audio de secours.',
    loading: false,
    isPlaying: false
  })
  void playAudioTrack(current)
}

async function playYtTrack(track: Track): Promise<void> {
  const resolved = await resolveVideoId(track)
  usePlayer.setState({ current: resolved, error: null, isPlaying: false, loading: true })
  // Métadonnées + contrôles sur l'écran verrouillé (play/pause/précédent/suivant)
  updateMediaSession(resolved)

  try {
    if (!ytReady) {
      const el = document.getElementById(YT_PLAYER_ID)
      if (!el) throw new Error('Conteneur du lecteur YouTube introuvable')
      await createYTPlayer(el, {
        onReady: () => {
          ytReady = true
          if (ytPending) {
            ytPlayVideo(ytPending)
            ytPending = null
          }
        },
        onStateChange: (state: YTPlaybackState) => {
          if (state === 1) {
            usePlayer.setState({ isPlaying: true, loading: false })
            setMediaSessionPlaybackState('playing')
            startYtPoll()
          } else if (state === 2) {
            usePlayer.setState({ isPlaying: false })
            setMediaSessionPlaybackState('paused')
            stopYtPoll()
          } else if (state === 0) {
            stopYtPoll()
            usePlayer.getState().next()
          }
        },
        onError: () => ytFallbackToAudio()
      })
      // Applique le volume courant au lecteur YouTube
      ytSetVolume(usePlayer.getState().volume)
    }
    ytPending = resolved.id
    if (ytReady) {
      ytPlayVideo(resolved.id)
    }
  } catch {
    ytFallbackToAudio()
  }
}

/** Dispatcher : joue le titre avec le backend actif. */
async function loadAndPlay(track: Track): Promise<void> {
  if (usePlayer.getState().mode === 'youtube') {
    await playYtTrack(track)
  } else {
    await playAudioTrack(track)
  }
}

// Synchronise le mode depuis les réglages KV (si pas de choix local explicite)
async function syncModeFromSettings(): Promise<void> {
  try {
    const hasLocal = (() => {
      try {
        return localStorage.getItem(MODE_KEY) !== null
      } catch {
        return false
      }
    })()
    if (hasLocal) return
    const settings = await getSettings()
    if (settings.playbackMode === 'youtube' || settings.playbackMode === 'audio') {
      try {
        localStorage.setItem(MODE_KEY, settings.playbackMode)
      } catch {
        /* ignoré */
      }
      usePlayer.setState({ mode: settings.playbackMode })
    }
  } catch {
    /* hors ligne : on garde le défaut */
  }
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
  volume: initialVolume(),
  shuffle: (() => {
    try {
      return localStorage.getItem(SHUFFLE_KEY) === '1'
    } catch {
      return false
    }
  })(),
  repeat: (() => {
    try {
      const r = localStorage.getItem(REPEAT_KEY)
      return r === 'all' || r === 'one' ? r : 'off'
    } catch {
      return 'off'
    }
  })(),
  mode: initialMode(),

  setVolume(v) {
    const clamped = Math.min(1, Math.max(0, v))
    try {
      localStorage.setItem(VOLUME_KEY, String(clamped))
    } catch {
      /* ignoré */
    }
    set({ volume: clamped })
    if (audio) audio.volume = clamped
    ytSetVolume(clamped)
  },

  setShuffle(v) {
    try {
      localStorage.setItem(SHUFFLE_KEY, v ? '1' : '0')
    } catch {
      /* ignoré */
    }
    set({ shuffle: v })
  },

  setRepeat(r) {
    try {
      localStorage.setItem(REPEAT_KEY, r)
    } catch {
      /* ignoré */
    }
    set({ repeat: r })
  },

  setMode(mode) {
    if (get().mode === mode) return
    try {
      localStorage.setItem(MODE_KEY, mode)
    } catch {
      /* ignoré */
    }
    set({ mode })
    if (mode === 'audio') {
      // Libère le lecteur YouTube (le conteneur va être démonté par l'UI)
      destroyYTPlayer()
      ytReady = false
      ytPending = null
    }
    // Persiste dans les réglages (synchro entre appareils) — fire-and-forget
    void (async () => {
      try {
        const settings = await getSettings()
        await putSettings({ ...settings, playbackMode: mode })
      } catch {
        /* silencieux */
      }
    })()
    // Relance le titre courant dans le nouveau mode
    const { current, queue } = get()
    if (current) {
      stopCurrentPlayback()
      void get().play(current, queue)
    }
  },

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
    if (get().mode === 'youtube') {
      if (get().isPlaying) {
        ytPause()
      } else {
        ytResume()
      }
      return
    }
    if (audio?.paused) {
      await audio.play()
    } else {
      audio?.pause()
    }
  },

  next() {
    const { queue, index, shuffle, repeat } = get()
    if (!queue.length) return

    // Répéter le titre courant (mode « répéter un seul »)
    if (repeat === 'one') {
      get().seek(0)
      if (get().mode === 'youtube') {
        ytResume()
      } else {
        audio?.play().catch(() => {})
      }
      return
    }

    // Fin de file sans répétition → on s'arrête
    if (!shuffle && repeat !== 'all' && index === queue.length - 1) {
      stopCurrentPlayback()
      set({ isPlaying: false, currentTime: 0 })
      return
    }

    const nextIndex = shuffle
      ? randomOtherIndex(index, queue.length)
      : (index + 1) % queue.length
    const track = queue[nextIndex]!
    set({ index: nextIndex })
    loadAndPlay(track).catch(() => set({ error: 'Lecture impossible', loading: false }))
  },

  prev() {
    const { queue, index, currentTime, shuffle } = get()
    if (!queue.length) return
    if (currentTime > 3) {
      get().seek(0)
      return
    }
    const prevIndex = shuffle
      ? randomOtherIndex(index, queue.length)
      : (index - 1 + queue.length) % queue.length
    const track = queue[prevIndex]!
    set({ index: prevIndex })
    loadAndPlay(track).catch(() => set({ error: 'Lecture impossible', loading: false }))
  },

  seek(time) {
    if (get().mode === 'youtube') {
      ytSeek(time)
    } else if (audio) {
      audio.currentTime = time
    }
    set({ currentTime: time })
  },

  stop() {
    stopCurrentPlayback()
    set({ isPlaying: false, currentTime: 0, loading: false })
  }
}))

/** Arrête la lecture courante sur les deux backends. */
function stopCurrentPlayback(): void {
  if (audio) {
    audio.pause()
    audio.removeAttribute('src')
    audio.load()
  }
  ytPause()
  stopYtPoll()
}

if (typeof window !== 'undefined') {
  void syncModeFromSettings()
  window.addEventListener('pagehide', () => {
    destroyYTPlayer()
  })
}

export { YT_PLAYER_ID }
