import { createSimulation } from '/arcade-sim.js'

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
  const input = { left: false, right: false, up: false, down: false, pointerX: null, taps: [], fire: false, jump: false }
  let raf = 0
  let prev = performance.now()
  let stopped = false
  let jumpQueued = false

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
    if (spec.controls?.scheme === 'tap') {
      if (event.type === 'pointerdown') input.taps.push(point)
    } else if (spec.controls?.scheme === 'drag') {
      input.pointerX = point.x
    }
    if (event.type === 'pointerdown' && primitives.has('platform') && point.y < 42) jumpQueued = true
    if (event.type === 'pointerdown' && primitives.has('shoot') && spec.controls?.scheme !== 'tap') input.fire = true
  }

  canvas.addEventListener('pointerdown', onPointer)
  canvas.addEventListener('pointermove', onPointer)

  function stop() {
    if (stopped) return
    stopped = true
    cancelAnimationFrame(raf)
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
    input.jump = jumpQueued || (primitives.has('platform') && (keys?.has(' ') || input.up))
    if (primitives.has('shoot') && (keys?.has(' ') || keys?.has('f'))) input.fire = true
    jumpQueued = false
    const snap = sim.tick(dt, input)
    input.taps = []
    input.fire = false
    draw(ctx, spec, snap)
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

function draw(ctx, spec, snap) {
  const width = ctx.canvas.width
  const height = ctx.canvas.height
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
  ctx.font = '28px sans-serif'
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
    ctx.fillText(spec.player?.sprite || '●', (snap.playerX / 100) * width, (py / 100) * height)
  }
  for (const entity of snap.entities) {
    ctx.fillText(entity.sprite || '●', (entity.x / 100) * width, (entity.y / 100) * height)
  }
  ctx.font = '14px sans-serif'
  ctx.fillStyle = '#f9f7ff'
  ctx.textAlign = 'left'
  ctx.fillText(String(snap.score), 12, 18)
  ctx.textAlign = 'right'
  const tag = primitives.has('maze') ? 'grid' : primitives.has('popup') ? 'hide' : ''
  ctx.fillText(tag ? `lives ${snap.lives} · ${tag}` : `lives ${snap.lives}`, width - 12, 18)
}
