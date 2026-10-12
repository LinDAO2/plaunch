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

function stars(rgb, n, tint) {
  for (let i = 0; i < n; i++) {
    fillCircle(rgb, (i * 173) % SIZE, (i * 97) % (SIZE - 80), i % 4 === 0 ? 8 : 4, tint)
  }
}

function ship(rgb, x, y, fill) {
  fillRect(rgb, x - 36, y - 8, 78, 28, [27, 27, 47])
  fillRect(rgb, x - 28, y - 2, 62, 18, fill)
  fillRect(rgb, x + 22, y - 22, 18, 20, [255, 46, 99])
  fillCircle(rgb, x - 6, y + 6, 7, [244, 247, 251])
}

function meteorRock(rgb, x, y, r) {
  fillRect(rgb, x - r * 2, y - 6, r * 2, 12, [255, 186, 72])
  disc(rgb, x, y, r, [196, 78, 36])
  fillCircle(rgb, x - r * 0.25, y - r * 0.22, r * 0.32, [255, 168, 90])
}

function gem(rgb, x, y, r, fill) {
  fillRect(rgb, x - r * 0.45, y - r, r * 0.9, r * 2, [27, 27, 47])
  fillRect(rgb, x - r, y - r * 0.45, r * 2, r * 0.9, [27, 27, 47])
  fillRect(rgb, x - r * 0.32, y - r * 0.72, r * 0.64, r * 1.44, fill)
  fillRect(rgb, x - r * 0.72, y - r * 0.32, r * 1.44, r * 0.64, fill)
  fillCircle(rgb, x - r * 0.15, y - r * 0.2, r * 0.18, [244, 247, 251])
}

function paintArcade(rgb, id) {
  if (id === 'meteor-rain' || id === 'meteor-dodge') {
    const night = id === 'meteor-rain'
    fillRect(rgb, 0, 0, SIZE, SIZE, night ? [16, 10, 42] : [28, 18, 64])
    fillRect(rgb, 0, 0, SIZE, 280, night ? [48, 24, 96] : [64, 32, 120])
    stars(rgb, 40, night ? [255, 244, 210] : [255, 210, 63])
    meteorRock(rgb, 280, 260, 70)
    meteorRock(rgb, 620, 180, 48)
    meteorRock(rgb, 900, 340, 86)
    meteorRock(rgb, 460, 480, 36)
    ship(rgb, 600, 980, night ? [255, 210, 63] : [255, 122, 168])
    return true
  }
  if (id === 'homing-gems') {
    fillRect(rgb, 0, 0, SIZE, SIZE, [8, 48, 58])
    fillRect(rgb, 0, 820, SIZE, 380, [6, 32, 40])
    for (let i = 0; i < 6; i++) fillRect(rgb, 80 + i * 180, 200 + (i % 2) * 80, 40, 520, [12, 70, 82])
    gem(rgb, 320, 360, 70, [80, 220, 230])
    gem(rgb, 640, 280, 90, [255, 210, 63])
    gem(rgb, 900, 480, 60, [255, 90, 140])
    ship(rgb, 600, 980, [63, 185, 210])
    return true
  }
  if (id === 'lane-harvest') {
    fillRect(rgb, 0, 0, SIZE, 520, [126, 196, 255])
    fillRect(rgb, 0, 520, SIZE, 680, [232, 168, 96])
    fillCircle(rgb, 180, 160, 70, [255, 248, 230])
    for (let lane = 0; lane < 3; lane++) fillRect(rgb, 180 + lane * 300, 540, 160, 620, [90, 150, 48])
    for (let i = 0; i < 6; i++) disc(rgb, 260 + (i % 3) * 300, 640 + Math.floor(i / 3) * 180, 36, i % 2 ? [255, 46, 99] : [255, 90, 60])
    fillRect(rgb, 500, 980, 200, 90, [140, 78, 36])
    fillRect(rgb, 470, 960, 260, 28, [184, 110, 48])
    return true
  }
  if (id === 'mole-garden') {
    fillRect(rgb, 0, 0, SIZE, 280, [126, 200, 255])
    fillRect(rgb, 0, 280, SIZE, 920, [122, 168, 72])
    fillRect(rgb, 0, 460, SIZE, 740, [138, 92, 48])
    for (let i = 0; i < 6; i++) {
      const x = 220 + (i % 3) * 320
      const y = 560 + Math.floor(i / 3) * 280
      disc(rgb, x, y + 20, 70, [96, 62, 32])
      if (i !== 4) disc(rgb, x, y - 10, 36, [92, 58, 36])
    }
    disc(rgb, 860, 820, 48, [120, 72, 40])
    fillCircle(rgb, 844, 804, 8, [244, 247, 251])
    fillCircle(rgb, 876, 804, 8, [244, 247, 251])
    fillCircle(rgb, 860, 828, 8, [255, 120, 140])
    fillRect(rgb, 520, 700, 28, 160, [90, 96, 110])
    fillRect(rgb, 470, 690, 120, 28, [200, 80, 60])
    return true
  }
  if (id === 'shadow-chase') {
    fillRect(rgb, 0, 0, SIZE, SIZE, [18, 12, 40])
    fillRect(rgb, 0, 860, SIZE, 340, [40, 24, 72])
    for (let i = 0; i < 8; i++) fillRect(rgb, 80, 160 + i * 110, SIZE - 160, 8, [36, 22, 70])
    disc(rgb, 360, 780, 54, [255, 210, 63])
    disc(rgb, 820, 420, 70, [90, 40, 140])
    fillCircle(rgb, 800, 400, 12, [244, 247, 251])
    fillCircle(rgb, 848, 400, 12, [244, 247, 251])
    disc(rgb, 560, 300, 22, [255, 210, 63])
    disc(rgb, 700, 620, 18, [255, 210, 63])
    return true
  }
  if (id === 'zigzag-orbs') {
    fillRect(rgb, 0, 0, SIZE, SIZE, [24, 12, 64])
    fillRect(rgb, 0, 0, SIZE, 220, [90, 40, 160])
    for (let i = 0; i < 8; i++) {
      const x = 140 + i * 130
      const y = 360 + ((i % 2) ? 180 : -40)
      disc(rgb, x, y, 40, i % 2 ? [255, 46, 140] : [255, 210, 63])
      if (i) fillRect(rgb, x - 130, Math.min(y, 360 + (((i - 1) % 2) ? 180 : -40)), 130, 16, [180, 120, 255])
    }
    ship(rgb, 220, 980, [196, 120, 255])
    return true
  }
  if (id === 'click-frenzy') {
    fillRect(rgb, 0, 0, SIZE, SIZE, [255, 122, 168])
    fillRect(rgb, 0, 780, SIZE, 420, [255, 196, 72])
    fillCircle(rgb, 180, 180, 80, [255, 255, 255])
    disc(rgb, 600, 620, 160, [255, 210, 63])
    disc(rgb, 280, 420, 48, [47, 123, 255])
    disc(rgb, 920, 380, 64, [63, 185, 80])
    disc(rgb, 860, 760, 36, [255, 90, 60])
    return true
  }
  if (id === 'lightning-reflex') {
    fillRect(rgb, 0, 0, SIZE, SIZE, [10, 36, 28])
    fillRect(rgb, 0, 0, SIZE, 360, [18, 70, 48])
    fillRect(rgb, 470, 160, 260, 720, [27, 27, 47])
    fillRect(rgb, 500, 190, 200, 520, [63, 185, 80])
    fillCircle(rgb, 600, 980, 70, [255, 210, 63])
    fillRect(rgb, 560, 940, 80, 24, [27, 27, 47])
    return true
  }
  if (id === 'lucky-seven') {
    fillRect(rgb, 0, 0, SIZE, SIZE, [10, 48, 36])
    fillRect(rgb, 80, 160, SIZE - 160, SIZE - 280, [14, 92, 64])
    fillRect(rgb, 80, 160, SIZE - 160, 24, [212, 168, 72])
    fillRect(rgb, 80, SIZE - 144, SIZE - 160, 24, [212, 168, 72])
    for (let i = 0; i < 3; i++) {
      fillRect(rgb, 220 + i * 270, 340, 200, 280, [244, 247, 251])
      fillRect(rgb, 236 + i * 270, 356, 168, 248, i === 1 ? [255, 210, 63] : [255, 90, 60])
    }
    fillCircle(rgb, 600, 860, 18, [255, 248, 230])
    return true
  }
  return false
}

function paintAction(rgb, id, type, accent, yellow) {
  if (paintArcade(rgb, id)) return
  const hazard = [255, 46, 99]
  disc(rgb, 600, 860, 52, yellow)
  for (let i = 0; i < 5; i++) disc(rgb, 200 + i * 200, 220 + (i % 3) * 140, 36, i % 2 ? hazard : accent)
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
  if (paintArcade(rgb, game.id || '')) {
    fillRect(rgb, SIZE / 2 - 90, 36, 180, 48, [27, 27, 47])
    drawText(rgb, '128', SIZE / 2 - 36, 48, 5, yellow)
    return encodePng(SIZE, SIZE, rgb)
  }
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
