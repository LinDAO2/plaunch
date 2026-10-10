import { icon } from '/icons.js'

const posters = new Set()
let frame = 0

function paint(item, now) {
  const { canvas, accent, seed } = item
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const w = canvas.width
  const h = canvas.height
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = accent
  for (let i = 0; i < 6; i++) {
    const y = ((now / 16 + i * 48 + seed) % (h + 24)) - 24
    const x = (seed * 13 + i * 67) % (w - 18)
    ctx.fillRect(x, y, i % 2 ? 14 : 8, i % 2 ? 8 : 14)
  }
  ctx.fillStyle = '#e6ff3a'
  ctx.fillRect(0, h - 4, w, 4)
}

function loop(now) {
  for (const item of posters) paint(item, now)
  frame = requestAnimationFrame(loop)
}

export function livePoster(accent, seed) {
  const canvas = document.createElement('canvas')
  canvas.className = 'live-poster'
  canvas.width = 480
  canvas.height = 270
  canvas.setAttribute('aria-hidden', 'true')
  posters.add({ canvas, accent: /^#[0-9a-fA-F]{6}$/.test(accent || '') ? accent : '#e6ff3a', seed: Number(seed) || 1 })
  if (!frame) frame = requestAnimationFrame(loop)
  return canvas
}

function hash(value) {
  let h = 0
  const text = String(value || '')
  for (let i = 0; i < text.length; i++) h = (h * 33 + text.charCodeAt(i)) >>> 0
  return h % 997
}

export function gameCard(game, { label, onPlay, playHref }) {
  const card = document.createElement('article')
  card.className = 'card'
  const frameEl = document.createElement('div')
  frameEl.className = 'card-frame'
  frameEl.append(livePoster(game.accent, hash(game.id)))
  const body = document.createElement('div')
  body.className = 'card-body'
  const kind = document.createElement('p')
  kind.className = 'mini'
  kind.textContent = label
  const title = document.createElement('h3')
  title.textContent = game.name
  const desc = document.createElement('p')
  desc.textContent = game.description
  const tags = document.createElement('p')
  tags.className = 'tag-list'
  tags.textContent = (game.tags || []).join(' · ')
  const bottom = document.createElement('div')
  bottom.className = 'card-bottom'
  body.append(kind, title, desc, tags, bottom)
  card.append(frameEl, body)

  const play = onPlay ? document.createElement('button') : document.createElement('a')
  play.className = 'outline play-link'
  if (onPlay) {
    play.type = 'button'
    play.addEventListener('click', onPlay)
  } else {
    play.href = playHref
  }
  play.append(icon('play'), document.createTextNode(' Play'))
  return { card, bottom, play }
}
