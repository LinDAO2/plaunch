// The shell hint bar is #FFD23F on #0B0F1A. Freeform games that never draw a how-to-play line get this same one-line overlay.
export const HOW_TO_PLAY_OVERLAY = '<p id="pg-how">How to play: Press Space, an arrow key, or tap.</p><style>#pg-how{position:fixed;left:12px;right:12px;bottom:12px;z-index:6;margin:0;padding:8px 12px;background:#0B0F1A;color:#FFD23F;font:14px/1.3 Rubik,sans-serif}</style>'

export const SHELL = `
const held = Object.create(null)
const pointer = { x: 240, y: 240, down: false }
function noteInput() { window.__state.input += 1 }
function ink(hex) {
  const raw = String(hex || '#e7e9ea').replace('#', '')
  const s = raw.length === 3 ? raw.split('').map(function (c) { return c + c }).join('') : raw
  return rgb(parseInt(s.slice(0, 2), 16) || 0, parseInt(s.slice(2, 4), 16) || 0, parseInt(s.slice(4, 6), 16) || 0)
}
const pops = []
const bits = []
let combo = 0
let comboAt = 0
let stretch = 1
let stretchHeld = false
let stretchUntil = 0
let freezeUntil = 0
function nowSec() {
  return (typeof time === 'function') ? time() : 0
}
function reducedMotion() {
  try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) } catch (err) { return false }
}
function squash() {
  stretch = 1.2
  stretchUntil = nowSec() + 0.08
}
let artReady = false
function coarsePointer() {
  try { return !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches) } catch (err) { return false }
}
function brick(x, y, w, h, color) {
  const edge = Math.max(2, Math.min(4, Math.round(Math.min(w, h) * 0.14)))
  drawRect({ pos: vec2(x + 2, y + 4), width: w, height: h, color: rgb(27, 27, 47) })
  drawRect({ pos: vec2(x - edge, y - edge), width: w + edge * 2, height: h + edge * 2, color: rgb(27, 27, 47) })
  drawRect({ pos: vec2(x, y), width: w, height: h, color: color })
  const shine = Math.max(4, Math.round(Math.min(w, h) * 0.32))
  drawRect({ pos: vec2(x + edge + 1, y + edge + 1), width: shine, height: Math.max(3, Math.round(shine * 0.4)), color: rgb(255, 248, 230) })
}
function tileSprite(frame, x, y, w, h) {
  if (!artReady) return false
  drawSprite({ sprite: 'tiles', frame: frame, pos: vec2(x, y), width: w, height: h })
  return true
}
function cast(frame, x, y, size) {
  if (!artReady) return false
  const s = size || 72
  drawSprite({ sprite: 'chars', frame: frame % 27, pos: vec2(x, y), width: s, height: s })
  return true
}
function ground(x, y, w, h) {
  const th = Math.max(22, h)
  if (artReady) {
    let i = 0
    while (i < w) {
      tileSprite(16, x + i, y, Math.min(36, w - i), th)
      i += 36
    }
    return
  }
  brick(x, y, w, th, rgb(90, 170, 70))
}
function drawWorld() {
  const title = (THEME.names && THEME.names.title) || ''
  const t = (typeof time === 'function') ? time() : 0
  if (title === 'Flap' || title === 'Platformer' || title === 'Endless Runner' || title === 'Jump Up') {
    drawRect({ pos: vec2(0, 0), width: 480, height: 280, color: rgb(79, 179, 255) })
    drawRect({ pos: vec2(0, 280), width: 480, height: 200, color: rgb(205, 235, 255) })
    const drift = (t * 22) % 560
    drawCircle({ pos: vec2(90 - drift + 560, 64), radius: 28, color: rgb(255, 255, 255) })
    drawCircle({ pos: vec2(250 - drift * 0.65, 108), radius: 18, color: rgb(255, 255, 255) })
    drawCircle({ pos: vec2(400 - drift * 0.4, 58), radius: 22, color: rgb(255, 255, 255) })
    drawCircle({ pos: vec2(70, 390), radius: 100, color: rgb(123, 200, 108) })
    drawCircle({ pos: vec2(230, 410), radius: 120, color: rgb(86, 176, 78) })
    drawCircle({ pos: vec2(410, 395), radius: 110, color: rgb(123, 200, 108) })
    drawRect({ pos: vec2(0, 430), width: 480, height: 50, color: rgb(74, 150, 62) })
    return
  }
  if (title === 'Space Shooter') {
    drawRect({ pos: vec2(0, 0), width: 480, height: 480, color: rgb(10, 14, 40) })
    drawRect({ pos: vec2(0, 0), width: 480, height: 150, color: rgb(28, 22, 78) })
    for (let i = 0; i < 36; i++) {
      const sx = (i * 97) % 480
      const sy = (i * 53 + t * (12 + (i % 5) * 4)) % 480
      drawCircle({ pos: vec2(sx, sy), radius: i % 5 === 0 ? 2.4 : 1.3, color: i % 3 ? rgb(255, 255, 255) : rgb(255, 210, 63) })
    }
    return
  }
  if (title === 'Breakout') {
    drawRect({ pos: vec2(0, 0), width: 480, height: 480, color: rgb(18, 22, 64) })
    drawRect({ pos: vec2(0, 360), width: 480, height: 120, color: rgb(32, 28, 88) })
    for (let i = 0; i < 24; i++) drawCircle({ pos: vec2((i * 83) % 480, (i * 47) % 340), radius: 1.6, color: rgb(255, 255, 255) })
    return
  }
  if (title === 'Snake') {
    drawRect({ pos: vec2(0, 0), width: 480, height: 480, color: rgb(126, 196, 86) })
    for (let i = 0; i < 8; i++) drawRect({ pos: vec2(0, i * 60), width: 480, height: 28, color: rgb(104, 176, 68) })
    return
  }
  if (title === 'Block Drop') {
    drawRect({ pos: vec2(0, 0), width: 480, height: 480, color: rgb(42, 28, 92) })
    for (let i = 0; i < 12; i++) drawRect({ pos: vec2(i * 40, 0), width: 2, height: 480, color: rgb(72, 48, 140) })
    drawRect({ pos: vec2(76, 40), width: 328, height: 418, color: rgb(255, 210, 63) })
    drawRect({ pos: vec2(86, 50), width: 308, height: 398, color: rgb(36, 24, 78) })
    return
  }
  if (title === 'Merge Tiles') {
    drawRect({ pos: vec2(0, 0), width: 480, height: 480, color: rgb(232, 214, 255) })
    drawCircle({ pos: vec2(48, 64), radius: 36, color: rgb(255, 210, 63) })
    drawCircle({ pos: vec2(430, 420), radius: 48, color: rgb(255, 140, 180) })
    return
  }
  if (title === 'Word Guess') {
    drawRect({ pos: vec2(0, 0), width: 480, height: 480, color: rgb(244, 232, 210) })
    drawRect({ pos: vec2(0, 0), width: 480, height: 64, color: rgb(255, 210, 63) })
    drawRect({ pos: vec2(0, 420), width: 480, height: 60, color: rgb(226, 206, 170) })
    return
  }
  if (title === 'Maze Chomper') {
    drawRect({ pos: vec2(0, 0), width: 480, height: 480, color: rgb(14, 22, 72) })
    drawRect({ pos: vec2(0, 0), width: 480, height: 36, color: rgb(28, 40, 110) })
    return
  }
  if (title === 'Match-3') {
    drawRect({ pos: vec2(0, 0), width: 480, height: 240, color: rgb(255, 122, 168) })
    drawRect({ pos: vec2(0, 240), width: 480, height: 240, color: rgb(255, 196, 72) })
    drawCircle({ pos: vec2(64, 52), radius: 22, color: rgb(255, 255, 255) })
    drawCircle({ pos: vec2(420, 400), radius: 28, color: rgb(255, 90, 122) })
    return
  }
  drawRect({ pos: vec2(0, 0), width: 480, height: 280, color: rgb(79, 179, 255) })
  drawRect({ pos: vec2(0, 280), width: 480, height: 200, color: rgb(205, 235, 255) })
}
function stamp(grid, x, y, cell) {
  const rows = grid || []
  const sy = stretch > 1.02 ? 0.8 : 1
  const sx = stretch > 1.02 ? 1.2 : 1
  const grown = Math.max(cell, 14)
  for (let j = 0; j < rows.length; j++) {
    const row = String(rows[j] || '')
    for (let i = 0; i < row.length; i++) {
      const ch = row[i]
      if (ch === '.' || ch === ' ') continue
      const w = Math.max(6, grown - 2)
      const h = Math.max(6, grown - 2)
      const px = x + i * grown
      const py = y + j * grown
      brick(px, py, w * sx, h * sy, ink(THEME.palette[ch] || THEME.palette.accent))
    }
  }
}
function burst(x, y, color) {
  for (let i = 0; i < 8; i++) {
    bits.push({ x: x, y: y, vx: (Math.random() - 0.5) * 180, vy: -40 - Math.random() * 140, life: 0.45, color: color })
  }
}
function stepJuice(dtSec) {
  const step = Math.min(0.05, dtSec || 0)
  for (let i = bits.length - 1; i >= 0; i--) {
    const bit = bits[i]
    bit.life -= step
    bit.x += bit.vx * step
    bit.y += bit.vy * step
    bit.vy += 280 * step
    if (bit.life <= 0) bits.splice(i, 1)
  }
  for (let i = pops.length - 1; i >= 0; i--) {
    const pop = pops[i]
    pop.life -= step
    pop.y -= 48 * step
    if (pop.life <= 0) pops.splice(i, 1)
  }
}
let displayFace = ''
let numberFace = ''
function label(text, size, x, y, color, face) {
  const opt = { text: String(text), size: size, pos: vec2(x, y), color: color }
  if (face) opt.font = face
  drawText(opt)
}
function drawJuice() {
  for (const bit of bits) drawRect({ pos: vec2(bit.x, bit.y), width: 5, height: 5, color: bit.color })
  for (const pop of pops) label(pop.text, 16, pop.x, pop.y, rgb(255, 210, 63), numberFace)
}
function award(points) {
  const n = Math.max(0, Math.min(100000, Math.floor(Number(points) || 0)))
  const now = (typeof time === 'function') ? time() : 0
  if (now - comboAt < 1.2) combo = Math.min(12, combo + 1)
  else combo = 1
  comboAt = now
  const prev = window.__state.score || 0
  const next = Math.max(prev, n)
  const gained = next > prev ? next - prev : n
  window.__state.score = next
  window.__posted = true
  pops.push({ text: '+' + gained, x: 200 + Math.random() * 80, y: 200, life: 0.5 })
  burst(240, 200, ink(THEME.palette.accent))
  squash()
  if (n > 0) freezeUntil = nowSec() + 0.04
  if (!reducedMotion()) { try { shake(6) } catch (err) {} }
  try { parent.postMessage({ type: 'playground-score', points: window.__state.score }, '*') } catch (err) {}
  const step = Math.pow(2, combo / 12)
  try { zzfx(0.6, 0.05, n ? 880 * step : 180, 0.02, 0.04, 0.08, 0, 1.1, 0, 0, 0, 0, 0, 0, 0, 0, 0.08, 0.2, 0.02) } catch (err) {}
}
let ended = false
function finish(score) {
  if (ended) return
  ended = true
  award(score)
  go('over', Math.max(0, Math.floor(Number(score) || 0)))
}
function pad() {
  if (nowSec() < freezeUntil) return { x: 0, y: 0, act: false }
  let x = 0
  let y = 0
  if (held.ArrowLeft || held.a || held.A) x -= 1
  if (held.ArrowRight || held.d || held.D) x += 1
  if (held.ArrowUp || held.w || held.W) y -= 1
  if (held.ArrowDown || held.s || held.S) y += 1
  let act = !!(held[' '] || held.Enter)
  if (pointer.down && pointer.y > 408) {
    if (pointer.x < 160) x -= 1
    else if (pointer.x > 320) x += 1
    else act = true
  }
  return { x: x, y: y, act: act }
}
function mapPointer(event) {
  const canvas = document.querySelector('#game')
  const rect = canvas.getBoundingClientRect()
  if (!rect.width || !rect.height) return
  pointer.x = ((event.clientX - rect.left) / rect.width) * 480
  pointer.y = ((event.clientY - rect.top) / rect.height) * 480
}
function arm() {
  if (window.__state.phase !== 'start') return
  window.__state.phase = 'arm'
  wait(0.05, function () { if (window.__state.phase === 'arm') go('play') })
}
function beginPlay(setup) {
  scene('play', function () {
    for (const key of Object.keys(held)) delete held[key]
    window.__state.phase = 'play'
    onDraw(function () { drawWorld() })
    setup()
    onUpdate(function () {
      const jump = !!(held[' '] || held.ArrowUp || held.w || held.W)
      if (jump && !stretchHeld) squash()
      if (!jump && stretchHeld) squash()
      stretchHeld = jump
      if (nowSec() > stretchUntil) stretch += (1 - stretch) * Math.min(1, dt() * 14)
      stepJuice(dt())
    })
    onDraw(function () {
      drawRect({ pos: vec2(150, 12), width: 180, height: 28, color: rgb(27, 27, 47) })
      drawRect({ pos: vec2(150, 40), width: 180, height: 4, color: rgb(255, 210, 63) })
      label(String(window.__state.score || 0), 16, 168, 16, rgb(255, 210, 63), numberFace)
      if (coarsePointer()) {
        drawCircle({ pos: vec2(86, 438), radius: 28, color: rgb(27, 27, 47) })
        drawRect({ pos: vec2(170, 416), width: 140, height: 48, color: rgb(255, 210, 63) })
        drawRect({ pos: vec2(170, 460), width: 140, height: 4, color: rgb(184, 134, 11) })
        drawCircle({ pos: vec2(394, 438), radius: 28, color: rgb(27, 27, 47) })
      }
      drawJuice()
    })
  })
}
function boot() {
  const canvas = document.querySelector('#game')
  kaplay({
    canvas: canvas,
    width: 480,
    height: 480,
    stretch: true,
    letterbox: true,
    crisp: true,
    pixelDensity: 1,
    debug: false,
    background: THEME.palette.bg,
    touchToMouse: true
  })
  window.__engine = 'kaplay'
  try {
    const display = loadFont('display', '/fonts/lilita-one-latin.woff2')
    const numbers = loadFont('num', '/fonts/rubik-latin-700.woff2')
    if (display && display.then) display.then(function () { displayFace = 'display' }).catch(function () {})
    if (numbers && numbers.then) numbers.then(function () { numberFace = 'num' }).catch(function () {})
    const chars = loadSprite('chars', '/sprites/kenney-chars.png', { sliceX: 9, sliceY: 3 })
    const tiles = loadSprite('tiles', '/sprites/kenney-tiles.png', { sliceX: 20, sliceY: 9 })
    const pending = [chars, tiles].filter(function (job) { return job && job.then })
    if (pending.length) Promise.all(pending).then(function () { artReady = true }).catch(function () {})
  } catch (err) {}
  addEventListener('keydown', function (event) {
    if (event.repeat) return
    held[event.key] = true
    noteInput()
    if (window.__state.phase === 'start') arm()
  })
  addEventListener('keyup', function (event) { delete held[event.key] })
  addEventListener('pointerdown', function (event) {
    mapPointer(event)
    pointer.down = true
    noteInput()
    if (window.__state.phase === 'start') arm()
  })
  addEventListener('pointermove', mapPointer)
  addEventListener('pointerup', function () { pointer.down = false })
  mount()
  scene('start', function () {
    window.__state.phase = 'start'
    let bob = 0
    onUpdate(function () { bob += dt() })
    onDraw(function () {
      drawRect({ pos: vec2(0, 0), width: 480, height: 260, color: rgb(79, 179, 255) })
      drawRect({ pos: vec2(0, 260), width: 480, height: 220, color: rgb(205, 235, 255) })
      drawCircle({ pos: vec2(80, 90 + Math.sin(bob) * 6), radius: 28, color: rgb(255, 255, 255) })
      drawCircle({ pos: vec2(400, 140), radius: 18, color: rgb(255, 210, 63) })
      stamp(THEME.sprites.hero || THEME.sprites.bird || THEME.sprites.ship, 216, 168 + Math.sin(bob * 2) * 6, 16)
      drawRect({ pos: vec2(0, 300), width: 480, height: 180, color: rgb(11, 15, 26) })
      label(THEME.names.title, 36, 24, 318, rgb(244, 247, 251), displayFace)
      label(THEME.names.hint, 14, 24, 362, rgb(255, 210, 63), numberFace)
      drawRect({ pos: vec2(140, 396), width: 200, height: 60, color: rgb(255, 210, 63) })
      drawRect({ pos: vec2(140, 452), width: 200, height: 4, color: rgb(184, 134, 11) })
      label('Play', 28, 204, 410, rgb(27, 27, 47), displayFace)
    })
    onKeyPress(function () { arm() })
    onClick(function () { arm() })
    onTouchStart(function () { arm() })
  })
  scene('over', function (score) {
    award(score)
    window.__state.phase = 'over'
    const finalScore = Math.max(0, Math.floor(Number(score) || 0))
    let shown = 0
    let age = 0
    for (let i = 0; i < 28; i++) burst(40 + Math.random() * 400, 40 + Math.random() * 200, i % 2 ? rgb(255, 210, 63) : ink(THEME.palette.accent))
    onUpdate(function () {
      age += dt()
      shown = Math.min(finalScore, Math.floor(finalScore * Math.min(1, age / 1.2)))
      stepJuice(dt())
    })
    onDraw(function () {
      drawRect({ pos: vec2(0, 0), width: 480, height: 480, color: rgb(27, 27, 47) })
      if (!window.__share) window.__share = 'Score ' + finalScore
      label(THEME.names.over, 36, 24, 96, rgb(244, 247, 251), displayFace)
      label('Score ' + shown, 28, 24, 156, rgb(255, 210, 63), numberFace)
      label(finalScore > 0 ? 'Close. One more run.' : 'First run is the warmup.', 16, 24, 206, rgb(244, 247, 251), numberFace)
      label(String(window.__share), 14, 24, 246, rgb(227, 179, 65), numberFace)
      label('Post to X', 16, 24, 286, rgb(255, 210, 63), displayFace)
      label('Play again', 16, 24, 322, rgb(244, 247, 251), displayFace)
      label('Remix this', 14, 24, 358, rgb(244, 247, 251), numberFace)
      drawJuice()
    })
    onKeyPress(function () { ended = false; window.__share = ''; go('start') })
    onClick(function () { ended = false; window.__share = ''; go('start') })
  })
  go('start')
  window.__state.phase = 'start'
}
`
