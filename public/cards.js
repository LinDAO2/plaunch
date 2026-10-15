import { icon } from '/icons.js'
import { lookFor } from '/blocks/spec.js'
import { goalTargets } from '/blocks/goals.js'
import { blockAt, skyHex, worldFromSpec } from '/blocks/terrain.js'
import { blockHex } from '/blocks/blocks.js'

const posters = new Set()
let frame = 0

const CASTS = {
  'click-frenzy': { player: '👆', sprites: ['＋', '＋', '＋'] },
  'lightning-reflex': { player: '🟢', sprites: ['●', '●'] },
  'lucky-seven': { player: '7', sprites: ['?', '?', '7'] },
  'meteor-dodge': { player: '🚀', sprites: ['☄', '☄', '⭐', '☄'] },
  'meteor-rain': { player: '🚀', sprites: ['☄', '⭐', '☄', '⭐'] },
  'lane-harvest': { player: '🧺', sprites: ['🍓', '🐛', '🍓', '🫐'] },
  'zigzag-orbs': { player: '🛸', sprites: ['✨', '✨', '🔮', '✨'] },
  'homing-gems': { player: '🧲', sprites: ['💎', '🔺', '💎', '🔺'] },
  'mole-garden': { player: '🔨', sprites: ['🐹', '🌿', '🐹', '🐹'] },
  'shadow-chase': { player: '🏃', sprites: ['👻', '🪙', '👻', '🪙'] }
}

const BY_TYPE = {
  tap: { player: '👆', sprites: ['＋', '＋', '＋'] },
  reaction: { player: '🟢', sprites: ['●', '●', '●'] },
  guess: { player: '?', sprites: ['7', '3', '9'] },
  dodge: { player: '🚀', sprites: ['☄', '⭐', '☄', '☄'] },
  arcade: { player: '🛸', sprites: ['⭐', '💎', '🔺', '🪙'] }
}

function castFor(game) {
  return CASTS[game.id] || BY_TYPE[game.type] || BY_TYPE.arcade
}

function disc(ctx, x, y, radius, color) {
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, Math.PI * 2)
  ctx.fill()
}

function shadeHex(hex, factor) {
  const n = Number.parseInt(String(hex).slice(1), 16)
  const channel = (shift) => Math.max(0, Math.min(255, Math.round(((n >> shift) & 255) * factor)))
  return `rgb(${channel(16)},${channel(8)},${channel(0)})`
}

function isoCube(ctx, x, y, color) {
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(x + 18, y + 9)
  ctx.lineTo(x, y + 18)
  ctx.lineTo(x - 18, y + 9)
  ctx.closePath()
  ctx.fillStyle = shadeHex(color, 1.08)
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(x - 18, y + 9)
  ctx.lineTo(x, y + 18)
  ctx.lineTo(x, y + 32)
  ctx.lineTo(x - 18, y + 23)
  ctx.closePath()
  ctx.fillStyle = shadeHex(color, 0.72)
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(x + 18, y + 9)
  ctx.lineTo(x, y + 18)
  ctx.lineTo(x, y + 32)
  ctx.lineTo(x + 18, y + 23)
  ctx.closePath()
  ctx.fillStyle = shadeHex(color, 0.5)
  ctx.fill()
}

function worldColumns(world) {
  const cols = []
  const x0 = (world.size >> 1) - 5
  const z0 = (world.size >> 1) - 5
  for (let z = z0; z < z0 + 10; z++) {
    for (let x = x0; x < x0 + 10; x++) {
      let top = 0
      let id = 0
      for (let y = world.height - 1; y >= 0; y--) {
        const block = blockAt(x, y, z, world)
        if (block) { top = y; id = block; break }
      }
      if (id) cols.push({ x, z, y: top, color: blockHex(id) })
    }
  }
  cols.sort((a, b) => (a.x + a.z) - (b.x + b.z))
  return cols
}

function paintWorld(item, now) {
  const { canvas, world } = item
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  if (!item.columns) item.columns = worldColumns(world)
  const w = canvas.width
  const h = canvas.height
  const bob = Math.sin(now / 700) * 8
  ctx.fillStyle = skyHex(world.biome)
  ctx.fillRect(0, 0, w, h)
  ctx.strokeStyle = '#000000'
  ctx.lineWidth = 10
  ctx.strokeRect(8, 8, w - 16, h - 16)
  for (const col of item.columns) {
    const sx = w / 2 + (col.x - col.z) * 16
    const sy = 70 + (col.x + col.z) * 7 - col.y * 8 + bob
    isoCube(ctx, sx, sy, col.color)
  }
  isoCube(ctx, w / 2 + Math.sin(now / 500) * 24, h - 78, '#e6ff3a')
  const targets = goalTargets(world)
  ctx.fillStyle = '#e6ff3a'
  for (let i = 0; i < 3; i++) {
    const bob = Math.sin(now / 480 + i) * 5
    ctx.fillRect(36 + i * 22, 36 + bob, 10, 10)
  }
  ctx.fillStyle = '#000000'
  ctx.fillRect(16, h - 52, w - 32, 36)
  ctx.fillStyle = '#e6ff3a'
  ctx.font = '22px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(`${targets.label} +${targets.raise}  ·  ${targets.sparks} sparks`, w / 2, h - 34)
}

function paint(item, now) {
  if (item.kind === 'world') {
    paintWorld(item, now)
    return
  }
  const { canvas, accent, seed, cast } = item
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const w = canvas.width
  const h = canvas.height
  ctx.clearRect(0, 0, w, h)
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = accent
  ctx.globalAlpha = 0.28
  ctx.fillRect(0, 0, w, h)
  ctx.globalAlpha = 1
  ctx.strokeStyle = accent
  ctx.lineWidth = 10
  ctx.strokeRect(8, 8, w - 16, h - 16)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  cast.sprites.forEach((glyph, i) => {
    const span = h / Math.max(cast.sprites.length, 1)
    const y = ((now / 14 + i * span + seed) % (h + 70)) - 36
    const x = 64 + ((seed * 19 + i * 110) % (w - 128))
    disc(ctx, x, y, 26, i % 2 ? '#ffffff' : accent)
    ctx.fillStyle = '#000000'
    ctx.font = '36px sans-serif'
    ctx.fillText(glyph, x, y + 2)
  })
  const px = w / 2 + Math.sin(now / 380 + seed) * (w * 0.28)
  const py = h - 58
  disc(ctx, px, py, 34, accent)
  ctx.fillStyle = '#000000'
  ctx.font = '40px sans-serif'
  ctx.fillText(cast.player, px, py + 2)
}

function loop(now) {
  for (const item of posters) paint(item, now)
  frame = requestAnimationFrame(loop)
}

function posterView(game) {
  if (game.poster === 'shot' || game.poster === 'card') {
    const img = document.createElement('img')
    img.className = 'poster-shot'
    img.alt = ''
    img.setAttribute('aria-hidden', 'true')
    img.src = `/api/games/${game.id}/poster.png`
    return img
  }
  return livePoster(game)
}

export function livePoster(game) {
  const canvas = document.createElement('canvas')
  canvas.className = 'live-poster'
  canvas.width = 640
  canvas.height = 400
  canvas.setAttribute('aria-hidden', 'true')
  const accent = /^#[0-9a-fA-F]{6}$/.test(game.accent || '') ? game.accent : '#e6ff3a'
  const kind = game.type === 'world' ? 'world' : 'arcade'
  const world = kind === 'world' ? worldFromSpec(game.spec?.runtime === 'world' ? game.spec : lookFor(game.id)) : null
  posters.add({ canvas, accent, seed: hash(game.id || game.name), cast: castFor(game), kind, world, columns: null })
  if (!frame) frame = requestAnimationFrame(loop)
  return canvas
}

function hash(value) {
  let h = 0
  const text = String(value || '')
  for (let i = 0; i < text.length; i++) h = (h * 33 + text.charCodeAt(i)) >>> 0
  return h % 997
}

export function gameCard(game, { label, playHref }) {
  const card = document.createElement('article')
  card.className = 'card'
  if (/^#[0-9a-fA-F]{6}$/.test(game.accent || '')) card.style.borderTopColor = game.accent
  const link = document.createElement('a')
  link.className = 'card-link'
  link.href = playHref || `/play/${game.id}`
  const frameEl = document.createElement('div')
  frameEl.className = 'card-frame'
  frameEl.append(posterView(game))
  const body = document.createElement('div')
  body.className = 'card-body'
  const kind = document.createElement('p')
  kind.className = 'mini'
  kind.textContent = label
  const title = document.createElement('h3')
  title.textContent = game.name
  const desc = document.createElement('p')
  desc.textContent = game.description
  const play = document.createElement('span')
  play.className = 'card-play'
  play.textContent = 'Play now →'
  const bottom = document.createElement('div')
  bottom.className = 'card-bottom'
  bottom.append(play)
  body.append(kind, title, desc, bottom)
  link.append(frameEl, body)
  const share = document.createElement('button')
  share.type = 'button'
  share.className = 'card-share'
  share.setAttribute('aria-label', 'Share')
  share.append(icon('share'))
  card.append(link, share)
  if (game.credit?.author) {
    const credit = document.createElement('p')
    credit.className = 'card-credit'
    const license = game.credit.license || 'unspecified'
    credit.append(document.createTextNode(`Original by ${game.credit.author} (${license}) - `))
    if (typeof game.credit.source === 'string' && /^https:\/\/\S+$/.test(game.credit.source)) {
      const source = document.createElement('a')
      source.href = game.credit.source
      source.textContent = 'source'
      source.target = '_blank'
      source.rel = 'noreferrer'
      credit.append(source)
    }
    card.append(credit)
  }
  return { card, bottom, share, link }
}
