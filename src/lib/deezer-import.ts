import type { DeezerExport, DeezerPlaylist, DeezerTrack, Playlist, Track } from './types'

/**
 * Conversion de l'export JSON officiel Deezer (fichiers playlists.json,
 * favorites.json, history.json) vers le format interne NiceMusic.
 * Le parsing est volontairement tolérant : le format diffère selon les versions
 * de l'export (champs longs vs courts, structures imbriquées ou non).
 */

export interface DeezerImportResult {
  playlists: Playlist[]
  favorites: Track[]
  history: Track[]
}

function num(v: unknown): number | undefined {
  const n = typeof v === 'string' ? Number(v) : (v as number)
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined
}

function str(v: unknown): string | undefined {
  if (typeof v === 'string' && v.trim()) return v.trim()
  if (typeof v === 'number') return String(v)
  return undefined
}

/** Normalise un titre de l'export Deezer → Track interne. */
export function normalizeDeezerTrack(t: DeezerTrack): Track {
  const artist =
    str(t.artist?.name) ?? str(t.ART_NAME) ?? str((t as { artist_name?: string }).artist_name) ?? 'Artiste inconnu'
  const title = str(t.title) ?? str(t.SNG_TITLE) ?? 'Titre inconnu'
  const duration = num(t.duration) ?? num(t.DURATION) ?? undefined
  const deezerId = num(t.id) ?? num(t.SNG_ID) ?? undefined
  const picture = str(t.ALB_PICTURE)

  return {
    // id temporaire : sera remplacé par le videoId YouTube au moment du mapping
    id: deezerId ? `deezer:${deezerId}` : `deezer:${title}-${artist}`.replace(/[^a-zA-Z0-9:-]/g, '_'),
    title,
    author: artist,
    duration,
    thumbnail: picture ? `https://e-cdns-images.dzcdn.net/images/cover/${picture}/250x250-000000-80-0-0.jpg` : undefined,
    deezerId,
    unmapped: true
  }
}

function toTracks(list: unknown): Track[] {
  if (!Array.isArray(list)) return []
  return list.filter((t): t is DeezerTrack => !!t && typeof t === 'object').map(normalizeDeezerTrack)
}

function toPlaylists(list: unknown): Playlist[] {
  if (!Array.isArray(list)) return []
  return list
    .filter((p): p is DeezerPlaylist => !!p && typeof p === 'object')
    .map((p, i) => ({
      id: `deezer-${str(p.id) ?? String(i)}`,
      name: str(p.name) ?? str(p.title) ?? `Playlist ${i + 1}`,
      description: str(p.description),
      tracks: toTracks(p.tracks),
      createdAt: Date.now()
    }))
    .filter((p) => p.tracks.length > 0)
}

/** Transforme le contenu d'un export Deezer (un fichier JSON ou l'objet agrégé). */
export function parseDeezerExport(json: unknown): DeezerImportResult {
  const data = (json ?? {}) as DeezerExport

  // playlists : trois formes possibles
  let playlistsRaw: unknown
  if (Array.isArray(data.playlists)) playlistsRaw = data.playlists
  else if (data.playlists && typeof data.playlists === 'object') {
    const p = data.playlists as { playlists?: unknown; data?: unknown }
    playlistsRaw = p.playlists ?? p.data
  }
  const playlists = toPlaylists(playlistsRaw)

  // favorites : { songs: [...] } ou tableau direct
  let favRaw: unknown
  if (Array.isArray(data.favorites)) favRaw = data.favorites
  else if (data.favorites && typeof data.favorites === 'object') {
    favRaw = (data.favorites as { songs?: unknown }).songs
  }
  const favorites = toTracks(favRaw)

  // history : { songs: [...] } ou tableau direct
  let histRaw: unknown
  if (Array.isArray(data.history)) histRaw = data.history
  else if (data.history && typeof data.history === 'object') {
    histRaw = (data.history as { songs?: unknown }).songs
  }
  const history = toTracks(histRaw)

  return { playlists, favorites, history }
}

/** Déduplique par (titre, artiste) en ignorant la casse. */
export function dedupeTracks(tracks: Track[]): Track[] {
  const seen = new Set<string>()
  const out: Track[] = []
  for (const t of tracks) {
    const k = `${t.title}|${t.author}`.toLowerCase()
    if (!seen.has(k)) {
      seen.add(k)
      out.push(t)
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Export « favoris » au format CSV (tableau « mes favoris » de Deezer)
// En-têtes : Track name, Artist name, Album, Playlist name, Type, ISRC, Deezer - id
// ---------------------------------------------------------------------------

/** Parse CSV RFC 4180 (champs entre guillemets, `""` échappé, virgule + CRLF/LF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  const src = text.replace(/^\uFEFF/, '') // BOM éventuel

  for (let i = 0; i < src.length; i++) {
    const c = src[i]!
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += c
      }
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++
      row.push(field)
      field = ''
      rows.push(row)
      row = []
    } else {
      field += c
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

/** Convertit le CSV des favoris Deezer en titres NiceMusic (non mappés). */
export function parseDeezerFavoritesCsv(text: string): Track[] {
  const rows = parseCsv(text)
  if (rows.length < 2) return []

  const header = rows[0]!.map((h) => h.trim().toLowerCase())
  const idxTitle = header.indexOf('track name')
  const idxArtist = header.indexOf('artist name')
  const idxDeezerId = header.findIndex((h) => h.includes('deezer') && h.includes('id'))
  if (idxTitle === -1 || idxArtist === -1) return []

  const tracks: Track[] = []
  for (const r of rows.slice(1)) {
    const title = r[idxTitle]?.trim()
    const artist = r[idxArtist]?.trim()
    if (!title || !artist) continue
    const deezerIdRaw = idxDeezerId !== -1 ? r[idxDeezerId]?.trim() : undefined
    const deezerId = deezerIdRaw && /^\d+$/.test(deezerIdRaw) ? Number(deezerIdRaw) : undefined
    tracks.push({
      id: `deezer:${deezerIdRaw ?? `${title}-${artist}`}`,
      title,
      author: artist,
      deezerId,
      unmapped: true
    })
  }
  return dedupeTracks(tracks)
}
