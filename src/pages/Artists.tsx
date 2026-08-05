import { useMemo, useState } from 'react'
import { useFavorites } from '../api/queries'
import type { Track } from '../lib/types'
import { TrackList } from '../components/TrackList'
import { ArtistIcon, ChevronLeftIcon, PlayIcon } from '../components/icons'
import { usePlayer } from '../stores/player'

/** Groupe un ensemble de titres sous un artiste (clé normalisée). */
interface ArtistGroup {
  key: string
  name: string
  tracks: Track[]
}

/**
 * Normalise un nom d'artiste pour regrouper les variantes YouTube :
 * - minuscules, sans espaces/ponctuation superflus
 * - retire les suffixes fréquents : « officiel », « - topic », « c.c »,
 *   « and », « vevo », « - topic », « aka ... » etc.
 * Ex. « GAZO OFFICIEL » → « gazo », « Ziak C.C » → « ziak ».
 */
function normalizeArtist(raw: string): string {
  let s = raw.toLowerCase()
  // retire tout ce qui suit « aka » / « - topic » / « officiel »
  s = s
    .replace(/\bofficial\b/g, ' ')
    .replace(/\bofficiel\b/g, ' ')
    .replace(/\bvevo\b/g, ' ')
    .replace(/-\s*topic\b/g, ' ')
    .replace(/\baka[^a-z0-9].*$/gi, ' ')
    .replace(/c\.?c\.?$/g, ' ')
    .replace(/ and /g, ' ')
    .replace(/ & /g, ' ')
    // retire les caractères non alphanumériques
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
  return s || raw.toLowerCase()
}

/** Page « Artiste » : liste les artistes des favoris, chacun regroupant ses musiques. */
export default function Artists() {
  const { query, toggleFavorite } = useFavorites()
  const tracks = query.data?.tracks ?? []
  const [selectedKey, setSelectedKey] = useState<string | null>(null)

  // Regroupe les favoris par artiste normalisé (fusionne les variantes).
  const groups: ArtistGroup[] = useMemo(() => {
    const map = new Map<string, { name: string; tracks: Track[] }>()
    for (const t of tracks) {
      const raw = t.author?.trim() || 'Artiste inconnu'
      const key = normalizeArtist(raw)
      const g = map.get(key)
      if (g) {
        g.tracks.push(t)
        // Nom canonique : le plus court (généralement le vrai nom, sans suffixe)
        if (raw.length < g.name.length) g.name = raw
      } else {
        map.set(key, { name: raw, tracks: [t] })
      }
    }
    return [...map.values()]
      .map((g) => ({ key: normalizeArtist(g.name), name: g.name, tracks: g.tracks }))
      // Tri par nombre de titres décroissant, puis alphabétique.
      .sort((a, b) => b.tracks.length - a.tracks.length || a.name.localeCompare(b.name))
  }, [tracks])

  const artist = selectedKey ? groups.find((g) => g.key === selectedKey) ?? null : null

  return (
    <div className="safe-top px-4 pb-6 pt-4">
      {artist ? (
        // --- Vue par artiste : ses musiques ---
        <>
          <header className="mb-3 flex items-center gap-2">
            <button
              onClick={() => setSelectedKey(null)}
              className="rounded-full p-1.5 text-muted transition active:scale-90"
              aria-label="Retour aux artistes"
            >
              <ChevronLeftIcon width={22} height={22} />
            </button>
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-bold tracking-tight">{artist.name}</h1>
              <p className="text-sm text-muted">{artist.tracks.length} titre(s)</p>
            </div>
          </header>

          {/* Lecture de tout l'artiste en aléatoire */}
          <button
            onClick={() => {
              const q = artist.tracks
              usePlayer.getState().setShuffle(true)
              const start = q[Math.floor(Math.random() * q.length)]!
              void usePlayer.getState().play(start, q)
            }}
            className="mb-3 flex w-full items-center justify-center gap-2 rounded-full border border-border bg-surface py-3 font-medium text-text shadow-sm transition active:scale-[0.98]"
            aria-label={`Lecture aléatoire de ${artist.name}`}
          >
            Lecture aléatoire
          </button>

          <TrackList
            tracks={artist.tracks}
            playQueue={artist.tracks}
            showFavorites={false}
            onRemove={(t) => toggleFavorite(t)}
          />
        </>
      ) : (
        // --- Liste des artistes ---
        <>
          <header className="mb-3">
            <h1 className="text-2xl font-bold tracking-tight">Artistes</h1>
            <p className="text-sm text-muted">{groups.length} artiste(s) dans vos favoris.</p>
          </header>

          {groups.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted">
              Ajoutez des favoris pour voir vos artistes regroupés ici.
            </p>
          ) : (
            <ul className="flex flex-col">
              {groups.map((g) => (
                <li key={g.key} className="flex items-center gap-3 border-b border-border/60 px-1 py-2.5">
                  <button
                    onClick={() => setSelectedKey(g.key)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    aria-label={`Voir ${g.name}`}
                  >
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-surface2 to-bg text-muted">
                      {g.tracks[0]?.thumbnail ? (
                        <img src={g.tracks[0].thumbnail} alt="" className="h-full w-full rounded-full object-cover" loading="lazy" />
                      ) : (
                        <ArtistIcon width={20} height={20} />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{g.name}</p>
                      <p className="text-xs text-muted">{g.tracks.length} titre(s)</p>
                    </div>
                  </button>
                  <button
                    onClick={() => {
                      const q = g.tracks
                      void usePlayer.getState().play(q[0]!, q)
                    }}
                    className="flex shrink-0 items-center gap-1 rounded-full bg-accent px-3.5 py-2 text-xs font-semibold text-white transition active:scale-95"
                    aria-label={`Lire ${g.name}`}
                  >
                    <PlayIcon width={14} height={14} />
                    Lecture
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
