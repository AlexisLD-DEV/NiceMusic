/**
 * Cache localStorage des snapshots KV (favoris / historique / playlists).
 *
 * But : au rechargement de la page, la liste s'affiche instantanément depuis
 * le cache au lieu d'attendre le réseau ; la fraîcheur est ensuite rétablie
 * en arrière-plan par la mise à jour de TanStack Query.
 */

const PREFIX = 'nicemusic.snap.'
const CACHE_TTL_DAYS = 7

function read(key: string): unknown {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { v: number; t: number }
    // Mise en cache limitée dans le temps (ex. 7 jours) pour ne pas afficher
    // indéfiniment des données très anciennes si l'utilisateur ne revient pas.
    if (Date.now() - parsed.t > CACHE_TTL_DAYS * 24 * 60 * 60 * 1000) return null
    return parsed.v
  } catch (error) {
    console.error('[SnapshotCache] Failed to read snapshot:', error)
    return null
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify({ v: value, t: Date.now() }))
  } catch (error) {
    console.error('[SnapshotCache] Failed to write snapshot:', error)
  }
}

function remove(key: string): void {
  try {
    localStorage.removeItem(PREFIX + key)
  } catch (error) {
    console.error('[SnapshotCache] Failed to remove snapshot:', error)
  }
}

/**
 * Charge un blob en favorisant le cache : renvoie d'abord le snapshot local
 * (si dispo) puis actualise depuis le réseau, et met à jour le cache à chaque
 * succès. Le réseau gagne toujours (dernier mot) ; on évite juste l'attente.
 */
export async function cachedGet<T>(key: string, fetchRemote: () => Promise<T>): Promise<T> {
  const local = read(key) as T | null
  const remote = await fetchRemote()
  write(key, remote)
  if (local !== null) return local
  return remote
}

/** Invalide le cache local (après une écriture KV réussie, par ex.). */
export function invalidateSnapshot(key: string): void {
  remove(key)
}

/** Lit le snapshot local sans aller sur le réseau (pour placeholderData). */
export function readSnapshot<T>(key: string): T | null {
  return read(key) as T | null
}

/** Met directement à jour le cache local (après une écriture optimiste). */
export function touchSnapshot(key: string, value: unknown): void {
  write(key, value)
}
