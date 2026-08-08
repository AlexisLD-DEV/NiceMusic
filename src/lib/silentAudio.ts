/**
 * Contournement Media Session : Chrome Android/Brave priorise la session de
 * l'iframe YouTube (play/pause seuls) sur celle de la page (prev/next/seek).
 *
 * Solution : un <audio> silencieux invisible dans la page principale.
 * Dès qu'il est en lecture, Chrome rend NOTRE Media Session "active"
 * → les boutons précédent/suivant apparaissent sur le widget.
 *
 * L'audio silencieux est synchronisé avec le player YouTube :
 * - YouTube play  → audio.play()
 * - YouTube pause → audio.pause()
 *
 * Le fichier WAV est un silence de ~0.2s en boucle (data URI inline,
 * aucune requête réseau).
 */

// WAV 22050 Hz 16-bit mono, 0.2 seconde de silence
const SILENT_WAV = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA='

let audioEl: HTMLAudioElement | null = null
let synced = false

/** Crée l'élément audio silencieux (une seule fois). */
function ensureAudio(): HTMLAudioElement {
  if (!audioEl) {
    audioEl = new Audio(SILENT_WAV)
    audioEl.loop = true
    audioEl.volume = 0.001 // quasi inaudible, mais pas mute (mute peut être ignoré)
    audioEl.setAttribute('data-nicemusic-silent', '1')
    // Ne pas afficher dans les contrôles média du navigateur (si supporté)
    audioEl.style.display = 'none'
    document.body.appendChild(audioEl)
  }
  return audioEl
}

/** Appeler quand le player YouTube démarre la lecture. */
export function silentAudioPlay(): void {
  const a = ensureAudio()
  // play() peut être rejeté si pas de geste utilisateur — c'est OK,
  // le prochain appel (après interaction) fonctionnera
  a.play().catch(() => {})
  synced = true
}

/** Appeler quand le player YouTube se met en pause. */
export function silentAudioPause(): void {
  if (!audioEl) return
  audioEl.pause()
  synced = false
}

/** true si l'audio silencieux est en cours de lecture. */
export function isSilentAudioPlaying(): boolean {
  return synced && audioEl !== null && !audioEl.paused
}

/** Nettoie (au stop/destroy du player). */
export function silentAudioStop(): void {
  if (!audioEl) return
  try {
    audioEl.pause()
    audioEl.remove()
  } catch { /* ignoré */ }
  audioEl = null
  synced = false
}
