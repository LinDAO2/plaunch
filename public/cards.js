import { icon } from '/icons.js'

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

function paint(item, now) {
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
  disc(ctx, px, py, 34, '#e6ff3a')
  ctx.fillStyle = '#000000'
  ctx.font = '40px sans-serif'
  ctx.fillText(cast.player, px, py + 2)
}

function loop(now) {
  for (const item of posters) paint(item, now)
  frame = requestAnimationFrame(loop)
}

export function livePoster(game) {
  const canvas = document.createElement('canvas')
  canvas.className = 'live-poster'
  canvas.width = 640
  canvas.height = 360
  canvas.setAttribute('aria-hidden', 'true')
  const accent = /^#[0-9a-fA-F]{6}$/.test(game.accent || '') ? game.accent : '#e6ff3a'
  posters.add({ canvas, accent, seed: hash(game.id || game.name), cast: castFor(game) })
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
  const link = document.createElement('a')
  link.className = 'card-link'
  link.href = playHref || `/play/${game.id}`
  const frameEl = document.createElement('div')
  frameEl.className = 'card-frame'
  frameEl.append(livePoster(game))
  const body = document.createElement('div')
  body.className = 'card-body'
  const kind = document.createElement('p')
  kind.className = 'mini'
  kind.textContent = label
  const title = document.createElement('h3')
  title.textContent = game.name
  const desc = document.createElement('p')
  desc.textContent = game.description
  const bottom = document.createElement('div')
  bottom.className = 'card-bottom'
  body.append(kind, title, desc, bottom)
  link.append(frameEl, body)
  const share = document.createElement('button')
  share.type = 'button'
  share.className = 'card-share'
  share.setAttribute('aria-label', 'Share')
  share.append(icon('share'))
  card.append(link, share)
  return { card, bottom, share, link }
}
