import { isSolid } from './blocks.js'
import { blockAt, hash2, surfaceY, WATER } from './terrain.js'

const COUNT = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine']

const NIGHT = {
  grassland: [26, 39, 68],
  desert: [58, 36, 24],
  snow: [28, 44, 64],
  candy: [50, 20, 56],
  moon: [5, 6, 12]
}

const DAY = {
  grassland: [135, 184, 240],
  desert: [242, 196, 138],
  snow: [213, 228, 239],
  candy: [242, 160, 204],
  moon: [20, 24, 32]
}

export const SPARK_REACH = 2.6
const CYCLE_MS = 72000

export function goalTargets(world) {
  if (world?.structure === 'pyramid') return { label: 'Pyramid', raise: 3, sparks: 8 }
  if (world?.structure === 'tower') return { label: 'Tower', raise: 4, sparks: 6 }
  if (world?.structure === 'house') return { label: 'House', raise: 4, sparks: 5 }
  if (world?.biome === 'candy') return { label: 'Pyramid', raise: 3, sparks: 8 }
  if (world?.biome === 'grassland') return { label: 'Tower', raise: 4, sparks: 6 }
  return { label: 'Landmark', raise: 4, sparks: 5 }
}

export function goalCopy(world) {
  const targets = goalTargets(world)
  const noun = targets.label.toLowerCase()
  const up = COUNT[targets.raise] || String(targets.raise)
  const sparks = COUNT[targets.sparks] || String(targets.sparks)
  return {
    goal: `Raise the ${noun} ${targets.raise} blocks and gather ${targets.sparks} sparks.`,
    description: `Raise the ${noun} ${up} blocks and gather ${sparks} sparks. The land is shared.`
  }
}

function footprint(world) {
  const cx = world.size >> 1
  const cz = world.size >> 1
  return { cx, cz, r: 1 }
}

function columnPeak(world, edits, x, z) {
  for (let y = world.height - 1; y >= 0; y--) {
    if (isSolid(blockAt(x, y, z, world, edits))) return y
  }
  return 0
}

export function goalProgress(world, edits, picked) {
  const { cx, cz, r } = footprint(world)
  const targets = goalTargets(world)
  let natural = 0
  let current = 0
  for (let x = cx - r; x <= cx + r; x++) {
    for (let z = cz - r; z <= cz + r; z++) {
      natural = Math.max(natural, columnPeak(world, null, x, z))
      current = Math.max(current, columnPeak(world, edits, x, z))
    }
  }
  const built = Math.max(0, current - natural)
  const have = picked instanceof Set ? picked.size : (Array.isArray(picked) ? picked.length : 0)
  const raisePart = Math.min(1, built / targets.raise)
  const sparkPart = Math.min(1, have / targets.sparks)
  return {
    label: targets.label,
    raise: targets.raise,
    sparks: targets.sparks,
    built,
    have,
    peak: natural,
    current,
    cx,
    cz,
    done: built >= targets.raise && have >= targets.sparks,
    ratio: (raisePart + sparkPart) / 2
  }
}

export function sparkSpots(world, count) {
  const n = count ?? goalTargets(world).sparks
  const spots = []
  const used = new Set()
  const cx = world.size >> 1
  const cz = world.size >> 1
  for (let i = 0; spots.length < n && i < 5000; i++) {
    const x = 2 + Math.floor(hash2(i, 17, world.seed + 404) * (world.size - 4))
    const z = 2 + Math.floor(hash2(i, 29, world.seed + 404) * (world.size - 4))
    const key = `${x},${z}`
    if (used.has(key)) continue
    if (Math.abs(x - cx) <= 8 && Math.abs(z - cz) <= 8) continue
    const h = surfaceY(x, z, world)
    if (h <= WATER) continue
    if (blockAt(x, h + 1, z, world) || blockAt(x, h + 2, z, world)) continue
    let crowded = false
    for (const spot of spots) {
      if (Math.abs(spot.x - (x + 0.5)) < 3 && Math.abs(spot.z - (z + 0.5)) < 3) crowded = true
    }
    if (crowded) continue
    used.add(key)
    spots.push({ id: spots.length, x: x + 0.5, y: h + 1.35, z: z + 0.5 })
  }
  return spots
}

export function sparkHit(spots, picked, id, pos) {
  if (!Number.isInteger(id) || id < 0 || id >= spots.length) return { ok: false, reason: 'spark' }
  if (picked?.has?.(id)) return { ok: false, reason: 'taken' }
  const spot = spots[id]
  const dx = pos.x - spot.x
  const dy = (pos.y + 0.9) - spot.y
  const dz = pos.z - spot.z
  if (dx * dx + dy * dy + dz * dz > SPARK_REACH * SPARK_REACH) return { ok: false, reason: 'reach' }
  return { ok: true, id }
}

export function lookYaw(world, x, z) {
  return Math.atan2((world.size / 2) - x, (world.size / 2) - z)
}

export function skyPhase(nowMs) {
  const t = Number(nowMs) || 0
  return ((t / CYCLE_MS) + 0.18) % 1
}

export function skyCycle(biome, phase) {
  const day = DAY[biome] || DAY.grassland
  const night = NIGHT[biome] || NIGHT.grassland
  const p = ((Number(phase) % 1) + 1) % 1
  const lift = 0.5 + 0.5 * Math.cos(p * Math.PI * 2)
  const mix = (a, b) => Math.round(a * lift + b * (1 - lift))
  const r = mix(day[0], night[0])
  const g = mix(day[1], night[1])
  const b = mix(day[2], night[2])
  const hex = `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`
  return { r, g, b, hex, light: 0.38 + 0.62 * lift, phase: p }
}
