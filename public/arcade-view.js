import { createSimulation } from '/arcade-sim.js'

const HINT_MS = 3500
const DISC = { hazard: '#ff5c7a', obstacle: '#ff5c7a', collectible: '#ffd36b', target: '#ffd36b' }

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
    draw(ctx, spec, snap, view)
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

function draw(ctx, spec, snap, view) {
  const { width, height, dpr } = view
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  const unit = Math.max(0.7, Math.min(1.6, Math.min(width / 480, height / 360)))
  const primitives = new Set(spec.primitives || [])
  ctx.clearRect(0, 0, width, height)
  ctx.fillStyle = '#120f1c'
  ctx.fillRect(0, 0, width, height)
  ctx.fillStyle = spec.palette?.[1] || spec.accent || '#a88bff'
  ctx.globalAlpha = 0.18
  ctx.fillRect(0, 0, width, height)
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
  const size = Math.round(28 * unit)
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
    sprite(ctx, spec.player?.sprite || '●', (snap.playerX / 100) * width, (py / 100) * height, size, '#9affd9')
  }
  for (const entity of snap.entities) {
    sprite(ctx, entity.sprite || '●', (entity.x / 100) * width, (entity.y / 100) * height, size, DISC[entity.kind] || '#c9b6ff')
  }
  ctx.font = `${Math.round(14 * unit)}px sans-serif`
  ctx.fillStyle = '#f9f7ff'
  ctx.textAlign = 'left'
  ctx.fillText(String(snap.score), 12, 18 * unit)
  ctx.textAlign = 'right'
  const tag = primitives.has('maze') ? 'grid' : primitives.has('popup') ? 'hide' : ''
  ctx.fillText(tag ? `lives ${snap.lives} · ${tag}` : `lives ${snap.lives}`, width - 12, 18 * unit)
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
function sprite(ctx, glyph, x, y, size, color) {
  ctx.fillStyle = color
  ctx.globalAlpha = 0.35
  ctx.beginPath()
  ctx.arc(x, y, size * 0.62, 0, Math.PI * 2)
  ctx.fill()
  ctx.globalAlpha = 1
  ctx.fillStyle = '#ffffff'
  ctx.fillText(glyph, x, y)
}
