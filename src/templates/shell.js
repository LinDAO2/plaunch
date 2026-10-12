export const SHELL = `
const held = Object.create(null)
const pointer = { x: 240, y: 240, down: false }
function noteInput() { window.__state.input += 1 }
function ink(hex) {
  const raw = String(hex || '#e7e9ea').replace('#', '')
  const s = raw.length === 3 ? raw.split('').map(function (c) { return c + c }).join('') : raw
  return rgb(parseInt(s.slice(0, 2), 16) || 0, parseInt(s.slice(2, 4), 16) || 0, parseInt(s.slice(4, 6), 16) || 0)
}
function stamp(grid, x, y, cell) {
  const rows = grid || []
  for (let j = 0; j < rows.length; j++) {
    const row = String(rows[j] || '')
    for (let i = 0; i < row.length; i++) {
      const ch = row[i]
      if (ch === '.' || ch === ' ') continue
      const w = Math.max(1, cell - 1)
      const h = Math.max(1, cell - 1)
      const edge = Math.min(3, Math.max(1, Math.round(cell * 0.18)))
      drawRect({ pos: vec2(x + i * cell - edge, y + j * cell - edge + 2), width: w + edge * 2, height: h + edge * 2, color: rgb(27, 27, 47) })
      drawRect({ pos: vec2(x + i * cell, y + j * cell), width: w, height: h, color: ink(THEME.palette[ch] || THEME.palette.accent) })
    }
  }
}
function award(points) {
  const n = Math.max(0, Math.min(100000, Math.floor(Number(points) || 0)))
  window.__state.score = Math.max(window.__state.score || 0, n)
  window.__posted = true
  try { parent.postMessage({ type: 'playground-score', points: window.__state.score }, '*') } catch (err) {}
  try { zzfx(0.6, 0.05, n ? 880 : 180, 0.02, 0.04, 0.08, 0, 1.1, 0, 0, 0, 0, 0, 0, 0, 0, 0.08, 0.2, 0.02) } catch (err) {}
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
    onDraw(function () {
      drawRect({ pos: vec2(16, 416), width: 140, height: 44, color: ink(THEME.palette.mute) })
      drawRect({ pos: vec2(170, 416), width: 140, height: 44, color: ink(THEME.palette.accent) })
      drawRect({ pos: vec2(324, 416), width: 140, height: 44, color: ink(THEME.palette.mute) })
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
    add([text(THEME.names.title, { size: 36, width: 420 }), pos(240, 150), anchor('center'), color(ink(THEME.palette.ink))])
    add([text(THEME.names.hint, { size: 16, width: 400 }), pos(240, 210), anchor('center'), color(ink(THEME.palette.accent))])
    add([text('Tap, click, or press a key', { size: 14 }), pos(240, 260), anchor('center'), color(ink(THEME.palette.ink))])
    onDraw(function () { stamp(THEME.sprites.hero || THEME.sprites.bird || THEME.sprites.ship, 216, 300, 16) })
    onKeyPress(function () { arm() })
    onClick(function () { arm() })
    onTouchStart(function () { arm() })
  })
  scene('over', function (score) {
    award(score)
    window.__state.phase = 'over'
    add([text(THEME.names.over, { size: 36 }), pos(240, 170), anchor('center'), color(ink(THEME.palette.ink))])
    add([text('Score ' + score, { size: 22 }), pos(240, 220), anchor('center'), color(ink(THEME.palette.accent))])
    add([text('Tap or press a key', { size: 14 }), pos(240, 270), anchor('center'), color(ink(THEME.palette.ink))])
    onKeyPress(function () { ended = false; go('start') })
    onClick(function () { ended = false; go('start') })
  })
  go('start')
  window.__state.phase = 'start'
}
`
