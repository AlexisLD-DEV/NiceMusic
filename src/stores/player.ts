import { create } from 'zustand'
import {
  getFavorites,
  getHistory,
  getMappings,
  putFavorites,
  putHistory,
  putMappings
} from '../api/client'
import { fetchVideoInfo, searchTracks } from '../lib/invidious'
import {
  createYTPlayer,
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
  reassertMediaSession,
  setMediaSessionPlaybackState,
  updateMediaSession,
  updateMediaSessionPosition
} from '../lib/mediaSession'
import { silentAudioPlay, silentAudioStop } from '../lib/silentAudio'

/**
 * Store du lecteur — lecture via le lecteur officiel YouTube (IFrame API).
 *
 * Fiable : l'iframe gère nativement la lecture en arrière-plan et les
 * contrôles d'écran verrouillé (play/pause/précédent/suivant/seek) via la
 * Media Session, complétés par nos métadonnées. IMPORTANT : on ne détruit
 * jamais le player sur `pagehide` (sinon le widget disparaît et la lecture
 * repart de zéro au déverrouillage d'écran).
 *
 * Le mapping Deezer→YouTube est mis en cache (KV, batché) pour ne relancer
 * une recherche YouTube qu'une seule fois par titre.
 */

const VOLUME_KEY = 'nicemusic.volume'
const SHUFFLE_KEY = 'nicemusic.shuffle'
const REPEAT_KEY = 'nicemusic.repeat'

/** Timer de batch KV pour les mappings (30 secondes). */
const MAPPINGS_BATCH_FLUSH_MS = 30_000

/** Nombre max de tracks dans l'historique. */
const MAX_HISTORY_TRACKS = 100

/** Délai d'attente avant de réasserter la Media Session (12 secondes). */
const MEDIA_SESSION_REASSERT_MS = 12_000

export type RepeatMode = 'off' | 'all' | 'one'

function initialVolume(): number {
  try {
    const raw = localStorage.getItem(VOLUME_KEY)
    if (raw !== null) {
      const v = Number(raw)
      if (Number.isFinite(v) && v >= 0 && v <= 1) return v
    }
  } catch (error) {
    console.error('[Player] Failed to load volume:', error)
    /* défaut */
  }
  return 1 // volume par défaut à 100 %
}

interface PlayerState {
  queue: Track[]
  index: number
  current: Track | null
  isPlaying: boolean
  /** true pendant la résolution (recherche YouTube) */
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
  play: (track: Track, queue?: Track[]) => Promise<void>
  toggle: () => Promise<void>
  next: () => void
  prev: () => void
  seek: (time: number) => void
  stop: () => void
}

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
  } catch (error) {
    console.error('[Player] Failed to load mappings:', error)
    /* hors ligne : on cherchera à chaque fois */
  }
}

async function saveMapping(key: string, resolved: Track): Promise<void> {
  pendingMappings.set(key, {
    id: resolved.id,
    title: resolved.title,
    author: resolved.author,
    duration: resolved.duration,
    thumbnail: resolved.thumbnail,
    publishedAt: resolved.publishedAt
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
  }, MAPPINGS_BATCH_FLUSH_MS)
}

async function flushMappings(): Promise<void> {
  if (pendingMappings.size === 0) return
  const batch = new Map(pendingMappings)
  pendingMappings.clear()
  try {
    const { mappings } = await getMappings()
    for (const [key, value] of batch) mappings[key] = value
    await putMappings({ mappings })
  } catch (error) {
    console.error('[Player] Failed to flush mappings:', error)
    for (const [key, value] of batch) pendingMappings.set(key, value)
  }
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

  // Récupère la date de publication (échec toléré : sans date, on trie en fin).
  let publishedAt: number | undefined
  try {
    const info = await fetchVideoInfo(first.id)
    publishedAt = info.publishedAt
  } catch {
    /* pas de date : le titre restera en fin de tri */
  }

  const resolved: Track = {
    ...track,
    id: first.id,
    title: first.title,
    author: first.author,
    duration: first.duration,
    thumbnail: first.thumbnail,
    publishedAt,
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
    const next = [track, ...tracks.filter((t) => t.id !== track.id)].slice(0, MAX_HISTORY_TRACKS)
    await putHistory({ tracks: next })
  } catch (error) {
    console.error('[Player] Failed to save history:', error)
    /* échec silencieux : l'historique n'est pas critique */
  }
}

// ---------------------------------------------------------------------------
// Lecteur YouTube (IFrame API)
// ---------------------------------------------------------------------------

let ytReady = false
let ytPending: string | null = null
let ytPoll: number | null = null
/** Timer dédié à la réassertion de la Media Session (indépendant du poll). */
let msTimer: number | null = null

/** Tampon pour le watchdog anti-blocage (observe si le temps avance). */
let lastPollTime = -1
let lastPollTs = 0
const STALL_MS = MEDIA_SESSION_REASSERT_MS

function startYtPoll(): void {
  if (ytPoll !== null) return
  ytPoll = window.setInterval(() => {
    const t = ytCurrentTime()
    const d = ytDuration()
    usePlayer.setState({ currentTime: t, duration: d })
    updateMediaSessionPosition(t, d)
    // L'iframe YouTube écrase les handlers Media Session à chaque événement ;
    // réaffirmer ici (chaque seconde, pas seulement toutes les 2s) garantit
    // que les boutons précédent/suivant restent visibles sur le widget.
    reassertMediaSession()
    const { current } = usePlayer.getState()
    if (current && t >= 20) void recordHistory(current)

    // Avance à la fin de piste (détectée par le polling, fiable même écran
    // verrouillé, en complément de l'événement state===0 qui peut être raté
    // quand l'onglet passe en arrière-plan).
    if (d > 0 && t >= d - 1.5) {
      usePlayer.getState().next()
      return
    }

    // Watchdog : si on est censé jouer mais que le temps n'avance pas depuis
    // trop longtemps (et qu'on n'est pas à la fin), la lecture est bloquée
    // (iframe suspendue par l'OS) → on force le titre suivant.
    // IMPORTANT : désactivé quand la page est cachée (écran verrouillé) —
    // Chrome peut suspendre l'iframe un court instant ; forcer next() ici
    // couperait la musique en cours.
    if (document.hidden) {
      lastPollTs = 0
      return
    }
    const { isPlaying } = usePlayer.getState()
    if (isPlaying) {
      if (lastPollTs !== 0 && t === lastPollTime && Date.now() - lastPollTs > STALL_MS) {
        usePlayer.getState().next()
        return
      }
      lastPollTime = t
      lastPollTs = Date.now()
    } else {
      lastPollTs = 0
    }
  }, 500)
}

function stopYtPoll(): void {
  if (ytPoll !== null) {
    window.clearInterval(ytPoll)
    ytPoll = null
  }
}

// ---------------------------------------------------------------------------
// Réassertion Media Session (écran verrouillé)
//
// L'iframe YouTube écrase la Media Session (play/pause seuls, puis peut même
// la faire disparaître quand l'onglet passe en arrière-plan) : on ré-affirme
// nos métadonnées + handlers sur un timer DÉDIÉ, actif tant qu'un titre est
// chargé — indépendamment des états rapportés par l'iframe. C'est ce qui
// garantit que les boutons précédent/suivant restent et que l'interface ne
// disparaît pas pendant que la musique tourne.
// ---------------------------------------------------------------------------

function startMediaSessionTimer(): void {
  if (msTimer !== null) return
  msTimer = window.setInterval(() => {
    if (usePlayer.getState().current) reassertMediaSession()
  }, 2_000)

  // Écouteurs de touches physiques pour mobile (boutons Précédent/Suivant)
  // Sur mobile, la Media Session API ne montre pas toujours les boutons
  // précédent/suivant automatiquement. Les touches de navigation permettent
  // de les contrôler quand même.
  if ('ontouchstart' in window || 'ontouchend' in window) {
    window.addEventListener('keydown', handleMediaKey)
  }

  // Écouteur pour détecter les changements de visibilité (écran verrouillé/déverrouillé)
  // et réaffirmer la Media Session pour garantir que les boutons restent actifs.
  document.addEventListener('visibilitychange', handleVisibilityChange)
}

function stopMediaSessionTimer(): void {
  if (msTimer !== null) {
    window.clearInterval(msTimer)
    msTimer = null
  }
  // Nettoie les écouteurs de touches
  window.removeEventListener('keydown', handleMediaKey)
  // Nettoie l'écouteur de visibilité
  document.removeEventListener('visibilitychange', handleVisibilityChange)
}

/** Réaffirme la Media Session quand l'écran se verrouille/déverrouille. */
function handleVisibilityChange(): void {
  if (document.hidden) {
    // Écran verrouillé : réaffirmer la Media Session pour maintenir les contrôles
    if (usePlayer.getState().current) {
      reassertMediaSession()
      setMediaSessionPlaybackState(usePlayer.getState().isPlaying ? 'playing' : 'paused')
    }
  } else {
    // Écran déverrouillé : réaffirmer aussi pour s'assurer que les boutons sont actifs
    if (usePlayer.getState().current) {
      reassertMediaSession()
    }
  }
}

/** Gère les touches de navigation pour la Media Session sur mobile. */
function handleMediaKey(e: KeyboardEvent): void {
  switch (e.key) {
    case 'ArrowLeft':
    case 'MediaPreviousTrack':
      usePlayer.getState().prev()
      break
    case 'ArrowRight':
    case 'MediaNextTrack':
      usePlayer.getState().next()
      break
    case ' ':
    case 'MediaPlayPause':
      usePlayer.getState().toggle()
      break
  }
}

/** Conteneur du lecteur YouTube (iframe officielle). */
const YT_PLAYER_ID = 'yt-player-container'

/** Nombre max d'erreurs youtube consécutives avant de stopper (évite la boucle). */
const MAX_CONSECUTIVE_ERRORS = 3

/** Vidéos qui échouent d'affilée (reset dès qu'une vidéo démarre). */
let consecutiveErrors = 0

function ytError(): string {
  return 'Lecture impossible sur YouTube pour le moment. Réessayez dans quelques secondes.'
}

async function playYtTrack(track: Track): Promise<void> {
  // Affichage optimiste : on montre le titre tout de suite (titre/artiste),
  // puis on résout son vidéoId YouTube en arrière-plan.
  usePlayer.setState({ current: track, error: null, isPlaying: false, loading: true })
  updateMediaSession(track)
  let resolved: Track
  try {
    resolved = await resolveVideoId(track)
  } catch (e) {
    usePlayer.setState({ loading: false, error: e instanceof Error ? e.message : ytError() })
    return
  }
  usePlayer.setState({ current: resolved })
  // Métadonnées + contrôles sur l'écran verrouillé (play/pause/précédent/suivant)
  updateMediaSession(resolved)

  if (!ytReady) {
    const el = document.getElementById(YT_PLAYER_ID)
    if (!el) throw new Error('Conteneur du lecteur YouTube introuvable')
    await createYTPlayer(el, {
      onReady: () => {
        ytReady = true
        // Le player n'est fonctionnel qu'ici : applique le volume courant,
        // puis lance la vidéo en attente (si le tap a eu lieu pendant le chargement).
        ytSetVolume(usePlayer.getState().volume)
        if (ytPending) {
          ytPlayVideo(ytPending)
          ytPending = null
        }
      },
      onStateChange: (state: YTPlaybackState) => {
        if (state === 1) {
          silentAudioPlay()
          // Une vidéo a démarré : réinitialise le compteur d'erreurs consécutives
          consecutiveErrors = 0
          lastPollTime = -1
          lastPollTs = 0
          usePlayer.setState({ isPlaying: true, loading: false })
          setMediaSessionPlaybackState('playing')
          reassertMediaSession()
          startYtPoll()
          startMediaSessionTimer()
          void prefetchUpcoming()
        } else if (state === 2) {
          // Ne PAS arrêter l'audio silencieux — sinon le widget disparaît.
          // Seul le playbackState passe à "paused", le widget garde nos
          // handlers (prev/next/play).
          usePlayer.setState({ isPlaying: false })
          setMediaSessionPlaybackState('paused')
          // NOTE : on ne coupe pas le poll ici. L'iframe peut émettre un état
          // 2 (pause) sporadique quand l'onglet passe en arrière-plan sans
          // que la musique ne s'arrête réellement ; couper le poll arrêtait
          // la réassertion Media Session → interface verrouillée qui disparaît.
        } else if (state === 0) {
          stopYtPoll()
          usePlayer.getState().next()
        }
      },
      onError: () => {
        // Vidéo bloquée / supprimée / geoblock : on passe automatiquement au
        // titre suivant, sauf si trop de titres consécutifs échouent (évite de
        // boucler indéfiniment sur une file entièrement inaccessible).
        consecutiveErrors++
        usePlayer.setState({ isPlaying: false, loading: false })
        if (consecutiveErrors <= MAX_CONSECUTIVE_ERRORS) {
          usePlayer.getState().next()
        } else {
          usePlayer.setState({ error: ytError() })
          consecutiveErrors = 0
        }
      }
    })
  }
  ytPending = resolved.id
  if (ytReady) {
    ytPlayVideo(resolved.id)
    void prefetchUpcoming()
  }
}

// ---------------------------------------------------------------------------
// Préchargement : résout les vidéoId YouTube des titres à venir pendant que
// le titre courant joue, pour que « suivant » / « précédent » soient quasi
// instantanés (le vidéoId est déjà en cache, plus de recherche à l'appui).
// ---------------------------------------------------------------------------

let prefetching = false

async function prefetchUpcoming(): Promise<void> {
  const { queue, index, shuffle } = usePlayer.getState()
  if (!queue.length || prefetching) return
  prefetching = true
  try {
    // Enchaînement normal : on précharge les 2 suivants dans l'ordre.
    // En mode aléatoire : on précharge un petit lot tournant de titres
    // distincts pour maximiser la probabilité de tomber sur un déjà-caché.
    const targets: Track[] = []
    if (shuffle) {
      const seen = new Set<number>()
      for (let k = 0; k < queue.length && targets.length < 3; k++) {
        const i = randomOtherIndex(index, queue.length)
        if (seen.has(i)) continue
        seen.add(i)
        targets.push(queue[i]!)
      }
    } else {
      for (let k = 1; k <= 2; k++) targets.push(queue[(index + k) % queue.length]!)
    }
    await Promise.allSettled(targets.map((t) => resolveVideoId(t)))
  } finally {
    prefetching = false
  }
}

/** Index aléatoire différent de l'index courant (mode aléatoire). */
function randomOtherIndex(current: number, length: number): number {
  if (length <= 1) return 0
  let i = current
  while (i === current) i = Math.floor(Math.random() * length)
  return i
}

// ---------------------------------------------------------------------------
// Pré-mapping robuste des favoris (liens YouTube + date de publication)
// ---------------------------------------------------------------------------

let backfillStarted = false
let backfillRunning = false

const BACKFILL_KEYS = 'nicemusic.backfill.failed'
const BACKFILL_BATCH = 3
const BACKFILL_MAX_RETRIES = 3

interface BackfillState {
  total: number
  remaining: number
  failed: number
  running: boolean
}
const useBackfill = create<{ s: BackfillState }>()(() => ({
  s: { total: 0, remaining: 0, failed: 0, running: false }
}))

/** Hook UI : état de progression du pré-mapping des favoris. */
export function useBackfillState(): BackfillState {
  return useBackfill((x) => x.s)
}

function setBackfill(patch: Partial<BackfillState>): void {
  useBackfill.setState((cur) => ({ s: { ...cur.s, ...patch } }))
}

function readFailed(): Set<string> {
  try {
    const raw = localStorage.getItem(BACKFILL_KEYS)
    if (!raw) return new Set()
    const arr = JSON.parse(raw) as string[]
    return new Set(arr)
  } catch {
    return new Set()
  }
}

function writeFailed(ids: Set<string>): void {
  try {
    localStorage.setItem(BACKFILL_KEYS, JSON.stringify([...ids]))
  } catch {
    /* quota plein : on ignore */
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * Résout de façon robuste — retry + reprise inter-visites — le vidéoId
 * YouTube de tous les favoris non mappés, par petits lots. Les ids qui
 * échouent sont persistés en localStorage et retentés à la prochaine visite.
 * Chaque lot réussi réécrit le blob favorites (quota KV : 1 écriture/lot).
 */
export function startFavoritesBackfill(initialTracks: Track[]): void {
  if (backfillStarted || backfillRunning) return
  backfillStarted = true
  void (async () => {
    backfillRunning = true
    setBackfill({ running: true })
    try {
      // Charge l'état le plus récent des favoris (le blob a pu bouger).
      let current: Track[]
      try {
        const b = await getFavorites()
        current = b.tracks
      } catch {
        current = initialTracks
      }

      const failed = readFailed()
      const all = current
      const targets = all.filter((t) => (t.unmapped || failed.has(t.id)) && !mapCache.has(t.id))
      setBackfill({ total: targets.length, remaining: targets.length, failed: failed.size })

      // Phase 2 — rattrapage : les favoris déjà mappés mais sans date
      // de publication (pour le tri). On complète en arrière-plan.
      const datedMissing = all
        .filter((t) => !t.unmapped && !t.publishedAt && mapCache.get(t.id)?.publishedAt == null)
        .slice(0, 20)

      for (let i = 0; i < targets.length; i += BACKFILL_BATCH) {
        const batch = targets.slice(i, i + BACKFILL_BATCH)
        let batchResolved: Track[] = []
        for (const track of batch) {
          // Retry par titre
          for (let attempt = 0; attempt <= BACKFILL_MAX_RETRIES; attempt++) {
            try {
              const resolved = await resolveVideoId(track)
              mapCache.set(track.id, resolved)
              batchResolved.push(resolved)
              failed.delete(track.id)
              break
            } catch {
              if (attempt >= BACKFILL_MAX_RETRIES) {
                failed.add(track.id)
              }
              await sleep(1_000)
            }
          }
        }
        writeFailed(failed)

        // Réécrit le blob favorites avec les titres résolus (1 écriture/lot).
        if (batchResolved.length > 0) {
          try {
            const b = await getFavorites()
            const map = new Map(b.tracks.map((t) => [t.id, t]))
            for (const r of batchResolved) map.set(r.id, r)
            // Met aussi à jour les entrées par leur id Deezer d'origine porté
            // par le track (le blob favorites garde l'id deezer ou youtube).
            await putFavorites({ tracks: [...map.values()] })
          } catch {
            /* quota/erreur : on s'en remet au mapping KV + à la prochaine visite */
          }
        }

        setBackfill({ remaining: targets.length - (i + batch.length) })
        // Petite pause entre lots pour ne pas saturer le relais.
        await sleep(600)
      }

      // Rattrapage des dates manquantes
      for (let i = 0; i < datedMissing.length; i += BACKFILL_BATCH) {
        const batch = datedMissing.slice(i, i + BACKFILL_BATCH)
        let resolved: Track[] = []
        for (const track of batch) {
          const mapped = mapCache.get(track.id)
          if (mapped) {
            const info = await fetchVideoInfo(mapped.id).catch(() => null)
            if (info?.publishedAt) {
              const withDate = { ...track, ...mapped, publishedAt: info.publishedAt, unmapped: false }
              mapCache.set(track.id, withDate)
              resolved.push(withDate)
            }
          }
        }
        if (resolved.length > 0) {
          try {
            const b = await getFavorites()
            const map = new Map(b.tracks.map((t) => [t.id, t]))
            for (const r of resolved) map.set(r.id, r)
            await putFavorites({ tracks: [...map.values()] })
          } catch {
            /* ignoré */
          }
        }
        await sleep(400)
      }

      // Met à jour l'UI de mapping (miniatures / dates présentes sur la page).
      useMappingsVersion.getState().bump()
    } finally {
      backfillRunning = false
      setBackfill({ running: false })
    }
  })()
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

  setVolume(v) {
    const clamped = Math.min(1, Math.max(0, v))
    try {
      localStorage.setItem(VOLUME_KEY, String(clamped))
    } catch {
      /* ignoré */
    }
    set({ volume: clamped })
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

  async play(track, queue) {
    const q = queue ?? (get().queue.some((t) => t.id === track.id) ? get().queue : [track])
    const index = Math.max(0, q.findIndex((t) => t.id === track.id))
    set({ queue: q, index, current: track, error: null, loading: true })
    try {
      await playYtTrack(track)
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Lecture impossible', loading: false })
    }
  },

  async toggle() {
    if (!get().current) return
    if (get().isPlaying) {
      ytPause()
    } else {
      ytResume()
    }
  },

  next() {
    const { queue, index, shuffle, repeat } = get()
    if (!queue.length) return

    // Répéter le titre courant (mode « répéter un seul »)
    if (repeat === 'one') {
      get().seek(0)
      ytResume()
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
    void playYtTrack(track).catch(() => set({ error: 'Lecture impossible', loading: false }))
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
    void playYtTrack(track).catch(() => set({ error: 'Lecture impossible', loading: false }))
  },

  seek(time) {
    ytSeek(time)
    set({ currentTime: time })
  },

  stop() {
    stopCurrentPlayback()
    set({ isPlaying: false, currentTime: 0, loading: false })
  }
}))

/** Arrête la lecture courante. */
function stopCurrentPlayback(): void {
  ytPause()
  stopYtPoll()
  stopMediaSessionTimer()
  silentAudioStop()
}

if (typeof window !== 'undefined') {
  // IMPORTANT : ne PAS détruire le lecteur YouTube sur pagehide.
  // Sur Android, verrouiller l'écran fait passer la page en arrière-plan
  // (bfcache) et déclenche `pagehide` : si on détruit le player ici, le
  // widget d'écran verrouillé disparaît et, au déverrouillage, le lecteur
  // est réinitialisé → la musique repart du début. On laisse l'iframe
  // YouTube gérer nativement la lecture en arrière-plan.
  // On profite de `pageshow` pour re-synchroniser l'état UI si besoin.
  window.addEventListener('pagehide', () => {
    if (pendingMappings.size > 0) void flushMappings()
  })
  window.addEventListener('pageshow', (e) => {
    // Retour depuis le bfcache : réaffirme la Media Session et relance le
    // polling si une piste était en cours, sans toucher au player lui-même.
    const { current, isPlaying } = usePlayer.getState()
    if (!current) return
    if (e.persisted) {
      reassertMediaSession()
      setMediaSessionPlaybackState(isPlaying ? 'playing' : 'paused')
      if (isPlaying && ytPoll === null) startYtPoll()
    }
  })
}

export { YT_PLAYER_ID }
