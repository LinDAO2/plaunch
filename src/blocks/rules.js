import { knownBlock } from './blocks.js'

export const REACH = 5.5
export const EDIT_RATE = 6
export const EDIT_BURST = 6
export const MOVE_SPEED = 14

export function takeToken(bucket, now, rate = EDIT_RATE, burst = EDIT_BURST) {
  const elapsed = Math.max(0, (now - bucket.t) / 1000)
  bucket.t = now
  bucket.tokens = Math.min(burst, bucket.tokens + elapsed * rate)
  if (bucket.tokens < 1) return false
  bucket.tokens -= 1
  return true
}

export function inBounds(x, y, z, world) {
  return Number.isInteger(x) && Number.isInteger(y) && Number.isInteger(z)
    && x >= 0 && y >= 0 && z >= 0
    && x < world.size && z < world.size && y < world.height
}

// Looking up at a side face stacks on that block. Looking down keeps the
// air cell the ray crossed, which is the top of the block.
export function placeTarget({ eye, dir, pitch, sample, reach = 5.2 } = {}) {
  if (!eye || !dir || typeof sample !== 'function') return null
  const limit = Number.isFinite(reach) ? reach : 5.2
  let prev = null
  for (let t = 0; t <= limit; t += 0.08) {
    const x = eye.x + dir.x * t
    const y = eye.y + dir.y * t
    const z = eye.z + dir.z * t
    const bx = Math.floor(x)
    const by = Math.floor(y)
    const bz = Math.floor(z)
    if (sample(bx, by, bz)) {
      if (!prev) return null
      const above = { x: bx, y: by + 1, z: bz }
      if (pitch > 0.08 && prev.y === by && sample(above.x, above.y, above.z) === 0) return above
      if (sample(prev.x, prev.y, prev.z) === 0) return prev
      return null
    }
    if (!prev || prev.x !== bx || prev.y !== by || prev.z !== bz) prev = { x: bx, y: by, z: bz }
  }
  return null
}

export function inReach(eye, x, y, z) {
  const dx = (x + 0.5) - eye.x
  const dy = (y + 0.5) - eye.y
  const dz = (z + 0.5) - eye.z
  return dx * dx + dy * dy + dz * dz <= REACH * REACH
}

function finite(n) {
  return typeof n === 'number' && Number.isFinite(n)
}

export function acceptPosition(prev, next, dt, world) {
  if (!finite(next?.x) || !finite(next?.y) || !finite(next?.z)) return prev
  const margin = 0.35
  let x = Math.min(world.size - margin, Math.max(margin, next.x))
  let y = Math.min(world.height - 0.2, Math.max(0, next.y))
  let z = Math.min(world.size - margin, Math.max(margin, next.z))
  const yaw = finite(next.yaw) ? next.yaw : prev.yaw
  const pitch = finite(next.pitch) ? Math.max(-1.2, Math.min(1.2, next.pitch)) : prev.pitch
  const dx = x - prev.x
  const dy = y - prev.y
  const dz = z - prev.z
  const dist = Math.hypot(dx, dy, dz)
  const max = MOVE_SPEED * Math.max(dt, 0.05)
  if (dist > max && dist > 0) {
    const scale = max / dist
    x = prev.x + dx * scale
    y = prev.y + dy * scale
    z = prev.z + dz * scale
  }
  return { x, y, z, yaw, pitch }
}

export function validateEdit({ x, y, z, block, eye, world, now, bucket }) {
  if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(z)) {
    return { ok: false, reason: 'coordinates' }
  }
  if (!inBounds(x, y, z, world)) return { ok: false, reason: 'bounds' }
  if (!knownBlock(block)) return { ok: false, reason: 'block' }
  if (!eye || !inReach(eye, x, y, z)) return { ok: false, reason: 'reach' }
  if (!takeToken(bucket, now)) return { ok: false, reason: 'rate' }
  return { ok: true }
}
