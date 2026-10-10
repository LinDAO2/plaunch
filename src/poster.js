import { deflateSync } from 'node:zlib'

const SIZE = 1200
const cache = new Map()

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1)
    table[n] = c >>> 0
  }
  return table
})()

const GLYPHS = {
  ' ': [0, 0, 0, 0, 0, 0, 0],
  '-': [0, 0, 0, 31, 0, 0, 0],
  '.': [0, 0, 0, 0, 0, 12, 12],
  '!': [4, 4, 4, 4, 4, 0, 4],
  '?': [14, 17, 1, 6, 4, 0, 4],
  A: [14, 17, 17, 31, 17, 17, 17],
  B: [30, 17, 17, 30, 17, 17, 30],
  C: [15, 16, 16, 16, 16, 16, 15],
  D: [30, 17, 17, 17, 17, 17, 30],
  E: [31, 16, 16, 30, 16, 16, 31],
  F: [31, 16, 16, 30, 16, 16, 16],
  G: [15, 16, 16, 19, 17, 17, 15],
  H: [17, 17, 17, 31, 17, 17, 17],
  I: [31, 4, 4, 4, 4, 4, 31],
  J: [7, 2, 2, 2, 2, 18, 12],
  K: [17, 18, 20, 24, 20, 18, 17],
  L: [16, 16, 16, 16, 16, 16, 31],
  M: [17, 27, 21, 21, 17, 17, 17],
  N: [17, 25, 21, 19, 17, 17, 17],
  O: [14, 17, 17, 17, 17, 17, 14],
  P: [30, 17, 17, 30, 16, 16, 16],
  Q: [14, 17, 17, 17, 21, 18, 13],
  R: [30, 17, 17, 30, 20, 18, 17],
  S: [15, 16, 16, 14, 1, 1, 30],
  T: [31, 4, 4, 4, 4, 4, 4],
  U: [17, 17, 17, 17, 17, 17, 14],
  V: [17, 17, 17, 17, 17, 10, 4],
  W: [17, 17, 17, 21, 21, 21, 10],
  X: [17, 17, 10, 4, 10, 17, 17],
  Y: [17, 17, 10, 4, 4, 4, 4],
  Z: [31, 1, 2, 4, 8, 16, 31],
  0: [14, 17, 19, 21, 25, 17, 14],
  1: [4, 12, 4, 4, 4, 4, 14],
  2: [14, 17, 1, 6, 8, 16, 31],
  3: [30, 1, 1, 14, 1, 1, 30],
  4: [2, 6, 10, 18, 31, 2, 2],
  5: [31, 16, 30, 1, 1, 17, 14],
  6: [6, 8, 16, 30, 17, 17, 14],
  7: [31, 1, 2, 4, 8, 8, 8],
  8: [14, 17, 17, 14, 17, 17, 14],
  9: [14, 17, 17, 15, 1, 2, 12]
}

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data])
  const out = Buffer.alloc(12 + data.length)
  out.writeUInt32BE(data.length, 0)
  body.copy(out, 4)
  out.writeUInt32BE(crc32(body), 8 + data.length)
  return out
}

export function encodePng(width, height, rgb) {
  const stride = width * 3
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    const dest = y * (stride + 1)
    raw[dest] = 0
    rgb.copy(raw, dest + 1, y * stride, y * stride + stride)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const compressed = deflateSync(raw, { level: 6 })
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0))
  ])
}

function hexColor(value) {
  const match = /^#?([0-9a-fA-F]{6})$/.exec(String(value || ''))
  if (!match) return [230, 255, 58]
  const n = Number.parseInt(match[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function fillRect(rgb, x, y, w, h, color) {
  const x0 = Math.max(0, x | 0)
  const y0 = Math.max(0, y | 0)
  const x1 = Math.min(SIZE, (x + w) | 0)
  const y1 = Math.min(SIZE, (y + h) | 0)
  const [r, g, b] = color
  for (let yy = y0; yy < y1; yy++) {
    let i = (yy * SIZE + x0) * 3
    for (let xx = x0; xx < x1; xx++) {
      rgb[i++] = r
      rgb[i++] = g
      rgb[i++] = b
    }
  }
}

function hashString(value) {
  let h = 2166136261
  const text = String(value || '')
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return h >>> 0
}

function drawText(rgb, text, x, y, scale, color) {
  let cursor = x
  for (const char of text) {
    const rows = GLYPHS[char]
    if (!rows) {
      cursor += 6 * scale
      continue
    }
    for (let row = 0; row < 7; row++) {
      const bits = rows[row]
      for (let col = 0; col < 5; col++) {
        if ((bits & (1 << (4 - col))) === 0) continue
        fillRect(rgb, cursor + col * scale, y + row * scale, Math.max(1, scale - 1), Math.max(1, scale - 1), color)
      }
    }
    cursor += 6 * scale
  }
  return cursor - x
}

function label(value, max) {
  return String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ?!.-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max) || 'GAME'
}

export function renderPoster(game) {
  const rgb = Buffer.alloc(SIZE * SIZE * 3)
  const accent = hexColor(game.accent)
  const paper = [231, 233, 234]
  const yellow = [230, 255, 58]
  fillRect(rgb, 0, 0, SIZE, SIZE, [0, 0, 0])
  const seed = hashString(game.id || game.name)
  fillRect(rgb, 0, 0, 48, SIZE, accent)
  for (let i = 0; i < 5; i++) {
    const x = 120 + ((seed >> (i * 3)) % 760)
    const y = 160 + ((seed >> (i + 2)) % 520)
    fillRect(rgb, x, y, i % 2 ? 72 : 36, i % 2 ? 36 : 72, accent)
  }
  fillRect(rgb, 0, 0, SIZE, 16, yellow)
  const title = label(game.name, 16)
  const scale = title.length > 12 ? 10 : 13
  const titleWidth = title.length * 6 * scale
  drawText(rgb, title, Math.max(96, Math.round((SIZE - titleWidth) / 2)), 520, scale, paper)
  const mechanic = label(game.type, 12)
  const mechanicWidth = mechanic.length * 6 * 8
  drawText(rgb, mechanic, Math.max(96, Math.round((SIZE - mechanicWidth) / 2)), 680, 8, yellow)
  fillRect(rgb, 0, SIZE - 16, SIZE, 16, yellow)
  return encodePng(SIZE, SIZE, rgb)
}

export function posterPng(game) {
  const key = `${game.id}|${game.updatedAt}|${game.name}|${game.accent}|${game.type}`
  const cached = cache.get(key)
  if (cached) return cached
  const png = renderPoster(game)
  cache.set(key, png)
  if (cache.size > 32) cache.delete(cache.keys().next().value)
  return png
}

export const POSTER_SIZE = SIZE
