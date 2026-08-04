/**
 * Génère les icônes PWA (192, 512, maskable 512) en PNG natif, sans dépendance.
 *   pnpm gen:icons
 *
 * Dessin : fond sombre #0f0f14 arrondi, disque accent rose et une note de
 * musique stylisée (tête + hampe + crochet) — rendu avec anti-aliasing 4x.
 */
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = join(__dirname, '..', 'public', 'icons')

const BG = [15, 15, 20] // #0f0f14
const ACCENT = [255, 90, 121] // #ff5a79
const WHITE = [242, 242, 245]

// ---------------------------------------------------------------------------
// PNG encoder minimal
// ---------------------------------------------------------------------------

const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c
})

function crc32(buf) {
  let c = -1
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type RGBA
  const stride = size * 4
  const raw = Buffer.alloc((stride + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0 // filter none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

// ---------------------------------------------------------------------------
// Dessin (coordonnées en unités 0..1, supersampling 4x)
// ---------------------------------------------------------------------------

function sample(x, y) {
  // Fond arrondi (rayon 22%)
  const r = 0.22
  const dx = Math.max(Math.abs(x - 0.5) - (0.5 - r), 0)
  const dy = Math.max(Math.abs(y - 0.5) - (0.5 - r), 0)
  const dist = Math.hypot(dx, dy)
  if (dist > 0.003) return null // hors icône

  let color = BG

  // Disque accent (pâle) derrière la note
  const dc = Math.hypot(x - 0.5, y - 0.52)
  if (dc < 0.4) color = [30, 24, 34]

  // Note de musique : deux têtes rondes, deux hampes, une barre
  const head = (hx, hy) => {
    const d = Math.hypot(x - hx, y - hy)
    if (d <= 0.075) return ACCENT
    if (d <= 0.082) return blend(ACCENT, color, 0.5)
    return null
  }
  const inStem = (sx) => x > sx - 0.016 && x < sx + 0.016 && y > 0.27 && y < 0.62
  const inBar = (y0) => y > y0 - 0.014 && y < y0 + 0.014 && x > 0.24 && x < 0.76

  const heads = head(0.32, 0.62) ?? head(0.62, 0.62)
  if (heads) color = heads
  else if (inStem(0.36) || inStem(0.66) || inBar(0.34) || inBar(0.27)) color = ACCENT

  return color
}

function render(size, maskable) {
  const ss = 4
  const px = Buffer.alloc(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let acc = [0, 0, 0, 0]
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const u = (x + (sx + 0.5) / ss) / size
          const v = (y + (sy + 0.5) / ss) / size
          // Icône maskable : on agrandit le dessin pour occuper ~80% du carré
          const uu = maskable ? 0.5 + (u - 0.5) / 0.8 : u
          const vv = maskable ? 0.5 + (v - 0.5) / 0.8 : v
          const c = sample(uu, vv)
          if (c) {
            acc[0] += c[0]
            acc[1] += c[1]
            acc[2] += c[2]
            acc[3] += 255
          }
        }
      }
      const i = (y * size + x) * 4
      const n = ss * ss
      px[i] = Math.round(acc[0] / n)
      px[i + 1] = Math.round(acc[1] / n)
      px[i + 2] = Math.round(acc[2] / n)
      px[i + 3] = Math.round(acc[3] / n)
    }
  }
  return encodePng(size, px)
}

function blend(a, b, t) {
  return a.map((v, i) => Math.round(v * (1 - t) + b[i] * t))
}

// ---------------------------------------------------------------------------

mkdirSync(OUT, { recursive: true })
for (const [file, size, maskable] of [
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['icon-maskable-512.png', 512, true]
]) {
  writeFileSync(join(OUT, file), render(size, maskable))
  console.log(`✓ ${file} (${size}x${size})`)
}
