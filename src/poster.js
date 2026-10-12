import { deflateSync } from 'node:zlib'
import { blockHex } from './blocks/blocks.js'
import { lookFor } from './blocks/spec.js'
import { blockAt, skyHex, worldFromSpec } from './blocks/terrain.js'

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

function tint(color, amount) {
  return color.map((channel) => Math.round(channel * amount))
}

function fillCircle(rgb, cx, cy, radius, color) {
  const r = Math.max(1, radius | 0)
  const x0 = Math.max(0, (cx - r) | 0)
  const y0 = Math.max(0, (cy - r) | 0)
  const x1 = Math.min(SIZE, (cx + r) | 0)
  const y1 = Math.min(SIZE, (cy + r) | 0)
  const [cr, cg, cb] = color
  const rr = r * r
  for (let yy = y0; yy < y1; yy++) {
    const dy = yy - cy
    let i = (yy * SIZE + x0) * 3
    for (let xx = x0; xx < x1; xx++) {
      const dx = xx - cx
      if (dx * dx + dy * dy <= rr) {
        rgb[i] = cr
        rgb[i + 1] = cg
        rgb[i + 2] = cb
      }
      i += 3
    }
  }
}

function disc(rgb, x, y, radius, fill) {
  fillCircle(rgb, x, y + 4, radius, [27, 27, 47])
  fillCircle(rgb, x, y, radius + 4, [27, 27, 47])
  fillCircle(rgb, x, y, radius, fill)
}

function paintAction(rgb, id, type, accent, yellow) {
  const hazard = [255, 46, 99]
  const hot = accent
  if (id === 'lane-harvest' || id === 'mole-garden') {
    for (let col = 0; col < 3; col++) {
      for (let row = 0; row < 3; row++) {
        disc(rgb, 280 + col * 320, 280 + row * 180, row === 1 && col === 1 ? 54 : 36, (row + col) % 2 ? yellow : hot)
      }
    }
    return
  }
  if (id === 'lightning-reflex') {
    disc(rgb, 600, 560, 120, [63, 185, 80])
    return
  }
  if (id === 'lucky-seven' || type === 'guess') {
    for (let i = 0; i < 3; i++) disc(rgb, 360 + i * 240, 620, 70, i === 1 ? yellow : [244, 247, 251])
    return
  }
  if (id === 'click-frenzy' || type === 'tap') {
    disc(rgb, 600, 640, 150, yellow)
    disc(rgb, 820, 420, 48, hot)
    return
  }
  if (id === 'shadow-chase' || id === 'homing-gems') {
    disc(rgb, 460, 700, 48, yellow)
    disc(rgb, 760, 460, 40, hot)
    disc(rgb, 900, 620, 28, [47, 123, 255])
    return
  }
  if (id === 'zigzag-orbs') {
    for (let i = 0; i < 7; i++) disc(rgb, 180 + i * 140, 420 + Math.round(Math.sin(i) * 160), 34, i % 2 ? hazard : yellow)
    return
  }
  disc(rgb, 600, 860, 52, yellow)
  for (let i = 0; i < 5; i++) disc(rgb, 200 + i * 200, 220 + (i % 3) * 140, 36, i % 2 ? hazard : hot)
}

function drawIso(rgb, x, y, z, color) {
  const s = 26
  const cx = 600 + (x - z) * s
  const cy = 700 + (x + z) * 12 - (y - 6) * 16
  const top = color.map((channel) => Math.min(255, Math.round(channel * 1.08)))
  const left = color.map((channel) => Math.round(channel * 0.72))
  const right = color.map((channel) => Math.round(channel * 0.48))
  fillRect(rgb, cx - s, cy - 8, s, 20, left)
  fillRect(rgb, cx, cy - 8, s, 20, right)
  fillRect(rgb, cx - s / 2, cy - 26, s, 14, top)
}

function renderWorldPoster(game) {
  const rgb = Buffer.alloc(SIZE * SIZE * 3)
  const look = game.spec?.runtime === 'world' ? game.spec : lookFor(game.id)
  const world = worldFromSpec(look)
  const sky = hexColor(skyHex(world.biome))
  const horizon = sky.map((channel) => Math.min(255, Math.round(channel * 0.55 + 120)))
  const ink = world.biome === 'moon' ? [231, 233, 234] : [27, 27, 47]
  fillRect(rgb, 0, 0, SIZE, Math.round(SIZE * 0.58), sky)
  fillRect(rgb, 0, Math.round(SIZE * 0.58), SIZE, SIZE, horizon)
  const originX = (world.size >> 1) - 7
  const originZ = (world.size >> 1) - 7
  const cols = []
  for (let z = originZ; z < originZ + 14; z++) {
    for (let x = originX; x < originX + 14; x++) {
      let top = 0
      for (let y = world.height - 1; y >= 0; y--) {
        if (blockAt(x, y, z, world)) { top = y; break }
      }
      for (let y = Math.max(0, top - 2); y <= top; y++) {
        const id = blockAt(x, y, z, world)
        if (id) cols.push({ x: x - originX, z: z - originZ, y, color: hexColor(blockHex(id)) })
      }
    }
  }
  cols.sort((a, b) => (a.x + a.z) - (b.x + b.z) || a.y - b.y)
  for (const col of cols) drawIso(rgb, col.x, col.y, col.z, col.color)
  disc(rgb, 600, 760, 36, [255, 210, 63])
  disc(rgb, 470, 640, 16, [255, 210, 63])
  disc(rgb, 760, 680, 16, [255, 90, 60])
  const title = label(game.name, 18)
  const scale = title.length > 14 ? 7 : 9
  const titleWidth = title.length * 6 * scale
  drawText(rgb, title, Math.max(48, Math.round((SIZE - titleWidth) / 2)), 56, scale, ink)
  return encodePng(SIZE, SIZE, rgb)
}

export function renderPoster(game) {
  if (game.type === 'world') return renderWorldPoster(game)
  const rgb = Buffer.alloc(SIZE * SIZE * 3)
  const accent = hexColor(game.accent)
  const yellow = [255, 210, 63]
  fillRect(rgb, 0, 0, SIZE, Math.round(SIZE * 0.62), [79, 179, 255])
  fillRect(rgb, 0, Math.round(SIZE * 0.62), SIZE, SIZE, [205, 235, 255])
  fillRect(rgb, 0, Math.round(SIZE * 0.78), SIZE, SIZE, [123, 200, 108])
  paintAction(rgb, game.id || '', game.type || '', accent, yellow)
  fillRect(rgb, SIZE / 2 - 90, 36, 180, 48, [27, 27, 47])
  drawText(rgb, '128', SIZE / 2 - 36, 48, 5, yellow)
  if (game.credit?.author) {
    const credit = label(`${game.credit.author} ${game.credit.license || ''}`, 28)
    drawText(rgb, credit, 48, 48, 3, [244, 247, 251])
  }
  return encodePng(SIZE, SIZE, rgb)
}

export function posterPng(game) {
  const key = `${game.id}|${game.updatedAt}|${game.name}|${game.accent}|${game.type}|${game.credit?.author || ''}|${game.credit?.license || ''}`
  const cached = cache.get(key)
  if (cached) return cached
  const png = renderPoster(game)
  cache.set(key, png)
  if (cache.size > 32) cache.delete(cache.keys().next().value)
  return png
}

export const POSTER_SIZE = SIZE
