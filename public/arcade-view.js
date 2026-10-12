import { createSimulation } from '/arcade-sim.js'

const HINT_MS = 3500
const DISC = { hazard: '#FF2E63', obstacle: '#FF2E63', collectible: '#FFD23F', target: '#3FB950' }

export function mountArcade(field, spec, hooks) {
  const canvas = document.createElement('canvas')
  canvas.className = 'arcade-canvas'
  canvas.width = 480
  canvas.height = 320
  field.replaceChildren(canvas)
  field.style.pointerEvents = 'auto'
  const ctx = canvas.getContext('2d')
  const seed = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0
  const sim = createSimulation(spec, seed || 1)
  const primitives = new Set(spec.primitives || ['fall'])
  const scheme = spec.controls?.scheme || 'keys'
  const input = { left: false, right: false, up: false, down: false, pointerX: null, pointerY: null, taps: [], fire: false, jump: false }
  const view = { width: 480, height: 320, dpr: 1, hint: '' }
  let raf = 0
  let prev = performance.now()
  let stopped = false
  let jumpQueued = false
  const bits = []
  let squash = 0
  let prevY = null
  let prevScore = 0

  // Match the drawing buffer to the on-screen size so sprites are not stretched
  // and stay sharp on Retina screens. Game logic works in percentages.
  function fit() {
    const rect = canvas.getBoundingClientRect()
    if (!rect.width || !rect.height) return
    const dpr = Math.min(3, Math.max(1, window.devicePixelRatio || 1))
    view.width = rect.width
    view.height = rect.height
    view.dpr = dpr
    canvas.width = Math.round(rect.width * dpr)
    canvas.height = Math.round(rect.height * dpr)
  }
  fit()
  const resizer = typeof ResizeObserver === 'function' ? new ResizeObserver(fit) : null
  resizer?.observe(canvas)

  function worldPoint(event) {
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((event.clientX - rect.left) / Math.max(rect.width, 1)) * 100,
      y: ((event.clientY - rect.top) / Math.max(rect.height, 1)) * 100
    }
  }

  function onPointer(event) {
    if (stopped) return
    const point = worldPoint(event)
    if (scheme === 'tap') {
      if (event.type === 'pointerdown') input.taps.push(point)
    } else {
      // Keys and drag games both follow the mouse or trackpad (no button needed)
      // and a finger drag on touch screens.
      input.pointerX = point.x
      input.pointerY = point.y
    }
    if (event.type === 'pointerdown' && primitives.has('platform') && point.y < 42) jumpQueued = true
    if (event.type === 'pointerdown' && primitives.has('shoot') && scheme !== 'tap') input.fire = true
  }

  canvas.addEventListener('pointerdown', onPointer)
  canvas.addEventListener('pointermove', onPointer)

  function stop() {
    if (stopped) return
    stopped = true
    cancelAnimationFrame(raf)
    resizer?.disconnect()
    canvas.removeEventListener('pointerdown', onPointer)
    canvas.removeEventListener('pointermove', onPointer)
  }

  function frame(now) {
    if (stopped) return
    const dt = Math.min(40, Math.max(0, now - prev))
    prev = now
    const keys = hooks.keys
    input.left = keys?.has('ArrowLeft') || keys?.has('a') || false
    input.right = keys?.has('ArrowRight') || keys?.has('d') || false
    input.up = keys?.has('ArrowUp') || keys?.has('w') || false
    input.down = keys?.has('ArrowDown') || keys?.has('s') || false
    // A key press takes over from the pointer until the pointer moves again.
    if (input.left || input.right || input.up || input.down) {
      input.pointerX = null
      input.pointerY = null
    }
    input.jump = jumpQueued || (primitives.has('platform') && (keys?.has(' ') || input.up))
    if (primitives.has('shoot') && (keys?.has(' ') || keys?.has('f'))) input.fire = true
    jumpQueued = false
    const snap = sim.tick(dt, input)
    input.taps = []
    input.fire = false
    if (snap.score > prevScore) {
      const px = (snap.playerX / 100) * view.width
      const py = ((Number.isFinite(snap.playerY) ? snap.playerY : 70) / 100) * view.height
      for (let i = 0; i < 8; i++) {
        bits.push({ x: px, y: py, vx: (Math.random() - 0.5) * 90, vy: -20 - Math.random() * 50, life: 0.45 })
      }
    }
    const pyNow = Number.isFinite(snap.playerY) ? snap.playerY : null
    if (pyNow != null && prevY != null && (pyNow < prevY - 0.35 || (pyNow > prevY + 0.8 && prevY < 78))) squash = 80
    prevY = pyNow
    prevScore = snap.score
    squash = Math.max(0, squash - dt)
    const step = dt / 1000
    for (let i = bits.length - 1; i >= 0; i--) {
      const bit = bits[i]
      bit.life -= step
      bit.x += bit.vx * step
      bit.y += bit.vy * step
      bit.vy += 140 * step
      if (bit.life <= 0) bits.splice(i, 1)
    }
    draw(ctx, spec, snap, view, { bits, squash })
    hooks.onScore?.(snap)
    if (snap.over) {
      stop()
      hooks.onEnd?.(snap)
      return
    }
    raf = requestAnimationFrame(frame)
  }

  raf = requestAnimationFrame(frame)
  return { stop }
}

function draw(ctx, spec, snap, view, juice = { bits: [], squash: 0 }) {
  const { width, height, dpr } = view
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  const unit = Math.max(0.9, Math.min(2.6, Math.min(width / 420, height / 320)))
  const primitives = new Set(spec.primitives || [])
  ctx.clearRect(0, 0, width, height)
  ctx.fillStyle = '#4FB3FF'
  ctx.fillRect(0, 0, width, height * 0.55)
  ctx.fillStyle = '#CDEBFF'
  ctx.fillRect(0, height * 0.55, width, height * 0.45)
  ctx.fillStyle = spec.accent || '#FF5A3C'
  ctx.globalAlpha = 0.16
  ctx.beginPath()
  ctx.arc(width * 0.82, height * 0.22, Math.max(28, width * 0.08), 0, Math.PI * 2)
  ctx.fill()
  ctx.globalAlpha = 1
  if (snap.walls?.length) {
    ctx.fillStyle = spec.palette?.[2] || '#2a2440'
    for (const wall of snap.walls) {
      ctx.fillRect(wall.c * width / 8, wall.r * height / 6, width / 8 - 1, height / 6 - 1)
    }
  }
  if (snap.platforms?.length) {
    ctx.fillStyle = spec.palette?.[2] || '#d9fff3'
    for (const plat of snap.platforms) {
      ctx.fillRect((plat.x / 100) * width, (plat.y / 100) * height, (plat.w / 100) * width, 8)
    }
    ctx.fillRect(0, (84 / 100) * height, width, 8)
  }
  const size = Math.round(36 * unit)
  ctx.font = `${size}px sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (const shot of snap.shots || []) {
    ctx.fillStyle = '#fff7d6'
    ctx.beginPath()
    ctx.arc((shot.x / 100) * width, (shot.y / 100) * height, 4, 0, Math.PI * 2)
    ctx.fill()
  }
  if (spec.controls?.scheme !== 'tap') {
    const py = Number.isFinite(snap.playerY) ? snap.playerY : 84
    const squashed = juice.squash > 0
    sprite(ctx, spec.player?.sprite || '●', (snap.playerX / 100) * width, (py / 100) * height, size, '#FFD23F', squashed ? 1.2 : 1, squashed ? 0.8 : 1)
  }
  for (const entity of snap.entities) {
    sprite(ctx, entity.sprite || '●', (entity.x / 100) * width, (entity.y / 100) * height, size, DISC[entity.kind] || '#2F7BFF')
  }
  for (const bit of juice.bits) {
    ctx.fillStyle = '#FFD23F'
    ctx.fillRect(bit.x, bit.y, 5, 5)
  }
  ctx.font = `700 ${Math.round(14 * unit)}px Rubik, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const scoreLabel = String(snap.score)
  const scoreWidth = Math.min(200, Math.max(64, ctx.measureText(scoreLabel).width + 28))
  ctx.fillStyle = '#1B1B2F'
  ctx.fillRect((width - scoreWidth) / 2, 12, scoreWidth, 32)
  ctx.fillStyle = '#FFD23F'
  ctx.fillText(scoreLabel, width / 2, 28)
  ctx.textAlign = 'left'
  ctx.fillStyle = '#1B1B2F'
  const livesLabel = `♥ ${snap.lives}`
  const livesWidth = Math.max(44, ctx.measureText(livesLabel).width + 16)
  ctx.fillRect(12, 12, livesWidth, 32)
  ctx.fillStyle = '#F4F7FB'
  ctx.fillText(livesLabel, 12 + livesWidth / 2, 28)
  if (snap.time < HINT_MS && view.hint) {
    ctx.globalAlpha = Math.min(1, (HINT_MS - snap.time) / 600)
    ctx.font = `600 ${Math.round(15 * unit)}px sans-serif`
    ctx.textAlign = 'center'
    const textWidth = ctx.measureText(view.hint).width
    ctx.fillStyle = '#000000a0'
    ctx.fillRect(width / 2 - textWidth / 2 - 14, height * 0.42 - 18 * unit, textWidth + 28, 36 * unit)
    ctx.fillStyle = '#ffffff'
    ctx.fillText(view.hint, width / 2, height * 0.42)
    ctx.globalAlpha = 1
  }
}

// A soft colored disc behind every sprite keeps it visible even when the
// glyph renders as a dark monochrome symbol (for example ☄ on many systems).
function sprite(ctx, glyph, x, y, size, color, sx = 1, sy = 1) {
  const rx = size * 0.62 * sx
  const ry = size * 0.62 * sy
  ctx.fillStyle = '#1B1B2F'
  ctx.beginPath()
  ctx.ellipse(x, y + 3, rx + 3, ry + 3, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#ffffff'
  ctx.fillText(glyph, x, y)
}
