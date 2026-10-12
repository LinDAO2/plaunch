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
function stamp(grid, x, y, cell) {
  const rows = grid || []
  const sy = stretch > 1.02 ? 0.8 : 1
  const sx = stretch > 1.02 ? 1.2 : 1
  for (let j = 0; j < rows.length; j++) {
    const row = String(rows[j] || '')
    for (let i = 0; i < row.length; i++) {
      const ch = row[i]
      if (ch === '.' || ch === ' ') continue
      const w = Math.max(1, cell - 1)
      const h = Math.max(1, cell - 1)
      const edge = Math.min(3, Math.max(2, Math.round(cell * 0.18)))
      const px = x + i * cell
      const py = y + j * cell
      drawRect({ pos: vec2(px + 1, py + 3), width: w * sx, height: h * sy, color: rgb(90, 96, 120) })
      drawRect({ pos: vec2(px - edge, py - edge + 2), width: w * sx + edge * 2, height: h * sy + edge * 2, color: rgb(27, 27, 47) })
      drawRect({ pos: vec2(px, py), width: w * sx, height: h * sy, color: ink(THEME.palette[ch] || THEME.palette.accent) })
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
  window.__state.score = Math.max(window.__state.score || 0, n)
  window.__posted = true
  pops.push({ text: '+' + n, x: 200 + Math.random() * 80, y: 180, life: 0.5 })
  burst(240, 200, ink(THEME.palette.accent))
  stretch = 1.2
  try { shake(4) } catch (err) {}
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
    setup()
    onUpdate(function () {
      const jump = !!(held[' '] || held.ArrowUp || held.w || held.W)
      if (jump && !stretchHeld) stretch = 1.2
      stretchHeld = jump
      stretch += (1 - stretch) * Math.min(1, dt() * 12)
      stepJuice(dt())
    })
    onDraw(function () {
      drawRect({ pos: vec2(150, 10), width: 180, height: 28, color: rgb(27, 27, 47) })
      label(String(window.__state.score || 0), 16, 168, 16, rgb(244, 247, 251), numberFace)
      drawCircle({ pos: vec2(86, 438), radius: 28, color: rgb(27, 27, 47) })
      drawRect({ pos: vec2(170, 416), width: 140, height: 48, color: rgb(255, 210, 63) })
      drawRect({ pos: vec2(170, 460), width: 140, height: 4, color: rgb(184, 134, 11) })
      drawCircle({ pos: vec2(394, 438), radius: 28, color: rgb(27, 27, 47) })
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
      label(THEME.names.over, 36, 24, 120, rgb(244, 247, 251), displayFace)
      label('Score ' + shown, 28, 24, 180, rgb(255, 210, 63), numberFace)
      label(finalScore > 0 ? 'Close. One more run.' : 'First run is the warmup.', 16, 24, 230, rgb(244, 247, 251), numberFace)
      label(window.__share ? String(window.__share) : ('Score ' + finalScore), 14, 24, 270, rgb(227, 179, 65), numberFace)
      label('Tap or press a key', 14, 24, 320, rgb(244, 247, 251), numberFace)
      drawJuice()
    })
    onKeyPress(function () { ended = false; window.__share = ''; go('start') })
    onClick(function () { ended = false; window.__share = ''; go('start') })
  })
  go('start')
  window.__state.phase = 'start'
}
`
