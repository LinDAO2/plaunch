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
  const input = { left: false, right: false, pointerX: null, taps: [] }
  let raf = 0
  let prev = performance.now()
  let stopped = false

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
    input.left = hooks.keys?.has('ArrowLeft') || hooks.keys?.has('a') || false
    input.right = hooks.keys?.has('ArrowRight') || hooks.keys?.has('d') || false
    const snap = sim.tick(dt, input)
    input.taps = []
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
  ctx.clearRect(0, 0, width, height)
  ctx.fillStyle = '#120f1c'
  ctx.fillRect(0, 0, width, height)
  ctx.fillStyle = spec.palette?.[1] || spec.accent || '#a88bff'
  ctx.globalAlpha = 0.18
  ctx.fillRect(0, 0, width, height)
  ctx.globalAlpha = 1
  ctx.font = '28px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  if (spec.controls?.scheme !== 'tap') {
    ctx.fillText(spec.player?.sprite || '●', (snap.playerX / 100) * width, height * 0.84)
  }
  for (const entity of snap.entities) {
    ctx.fillText(entity.sprite || '●', (entity.x / 100) * width, (entity.y / 100) * height)
  }
  ctx.font = '14px sans-serif'
  ctx.fillStyle = '#f9f7ff'
  ctx.textAlign = 'left'
  ctx.fillText(String(snap.score), 12, 18)
  ctx.textAlign = 'right'
  ctx.fillText(`lives ${snap.lives}`, width - 12, 18)
}
