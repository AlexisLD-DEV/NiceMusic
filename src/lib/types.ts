// Types partagés frontend <-> Worker API

/** Un titre tel qu'il est joué et stocké dans NiceMusic. */
export interface Track {
  /** id YouTube (videoId) une fois le titre mappé ; id Deezer avant import. */
  id: string
  title: string
  author: string
  /** durée en secondes, si connue */
  duration?: number
  /** URL d'image (thumbnail YouTube ou pochette Deezer) */
  thumbnail?: string
  /** id d'origine côté Deezer, si le titre vient d'un export */
  deezerId?: number
  /** true tant que le titre Deezer n'a pas été mappé vers YouTube */
  unmapped?: boolean
}

export interface Playlist {
  id: string
  name: string
  description?: string
  tracks: Track[]
  createdAt: number
}

export interface FavoritesBlob {
  tracks: Track[]
}

export interface HistoryBlob {
  /** ordre : plus récent en premier */
  tracks: Track[]
}

export interface PlaylistsBlob {
  playlists: Playlist[]
}

export interface SettingsBlob {
  /** instance Invidious préférée (si vide, auto) */
  instance?: string
}

// ---------------------------------------------------------------------------
// Export JSON officiel Deezer (données personnelles)
// ---------------------------------------------------------------------------

export interface DeezerPlaylist {
  id?: number | string
  name?: string
  title?: string
  description?: string
  creator?: { name?: string }
  tracks?: DeezerTrack[]
}

/** Champ tolérant : le format d'export Deezer varie selon les versions. */
export interface DeezerTrack {
  id?: number | string
  SNG_ID?: number | string
  title?: string
  SNG_TITLE?: string
  artist?: { name?: string }
  ART_NAME?: string
  album?: { title?: string }
  ALB_TITLE?: string
  duration?: number
  DURATION?: number
  ALB_PICTURE?: string
}

export interface DeezerExport {
  /** playlists.json */
  playlists?: DeezerPlaylist[] | { playlists?: DeezerPlaylist[]; data?: DeezerPlaylist[] }
  /** favorites.json */
  favorites?: { songs?: DeezerTrack[] } | DeezerTrack[]
  /** history.json */
  history?: { songs?: DeezerTrack[] } | DeezerTrack[]
  /** agrégat éventuel */
  songs?: DeezerTrack[]
}
