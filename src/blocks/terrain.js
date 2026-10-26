import {
  AIR, BIOMES, CANOPY, CANDY, CHUNK, CLAY, COBBLE, DOOR, DUNE, FROST, GLOW, PETAL, PLANKS, POOL, ROCK, SOIL,
  STRUCTURES, TIMBER, TURF, WINDOW, WORLD_HEIGHT, WORLD_SIZES, blockHex, isSolid
} from './blocks.js'

export const WATER = 7
const ROLLING_CAP = 18
const LANDFORMS = new Set(['rolling', 'forest', 'mountains', 'lake', 'beach', 'peaks', 'canyon'])

export const SKY = {
  grassland: '#87b8f0',
  desert: '#f2c48a',
  snow: '#d5e4ef',
  candy: '#f2a0cc',
  moon: '#243c78'
}

const LEAF = { grassland: CANOPY, desert: CANOPY, snow: FROST, candy: CANDY, moon: CANOPY }
const WOOD = { grassland: TIMBER, desert: TIMBER, snow: TIMBER, candy: GLOW, moon: TIMBER }

export function hash2(x, z, seed) {
  let n = Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263) ^ Math.imul(seed | 0, 1442695041)
  n = Math.imul(n ^ (n >>> 13), 1274126177)
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296
}

function fade(t) {
  return t * t * (3 - 2 * t)
}

function noise(x, z, seed) {
  const x0 = Math.floor(x)
  const z0 = Math.floor(z)
  const fx = fade(x - x0)
  const fz = fade(z - z0)
  const a = hash2(x0, z0, seed)
  const b = hash2(x0 + 1, z0, seed)
  const c = hash2(x0, z0 + 1, seed)
  const d = hash2(x0 + 1, z0 + 1, seed)
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz
}

export function worldFromSpec(spec = {}) {
  const biome = BIOMES.includes(spec.biome) ? spec.biome : 'grassland'
  const sizeName = Object.prototype.hasOwnProperty.call(WORLD_SIZES, spec.worldSize) ? spec.worldSize : 'medium'
  const structure = STRUCTURES.includes(spec.structure) ? spec.structure : 'none'
  let seed = Number(spec.terrainSeed)
  if (!Number.isInteger(seed) || seed < 0 || seed > 1_000_000_000) seed = 1
  const terrain = spec.terrain && typeof spec.terrain === 'object' ? spec.terrain : {}
  const prefabs = Array.isArray(spec.prefabs)
    ? spec.prefabs.filter((item) => item && typeof item.kind === 'string').slice(0, 6)
    : []
  const landform = LANDFORMS.has(terrain.landform) ? terrain.landform : 'rolling'
  return {
    biome,
    sizeName,
    size: WORLD_SIZES[sizeName],
    structure,
    seed,
    height: WORLD_HEIGHT,
    chunk: CHUNK,
    islands: terrain.islands === true,
    caves: terrain.caves === true,
    landform,
    prefabs
  }
}

function clampHeight(h, cap) {
  if (h < 3) h = 3
  if (h > cap) h = cap
  return h
}

function islandProfile(x, z, world) {
  const cx = (world.size - 1) / 2
  const cz = (world.size - 1) / 2
  const blobs = [
    [cx, cz, world.size * 0.2],
    [cx - world.size * 0.2, cz + world.size * 0.14, world.size * 0.11],
    [cx + world.size * 0.16, cz - world.size * 0.16, world.size * 0.1]
  ]
  let best = 0
  for (const [bx, bz, radius] of blobs) {
    const dist = Math.hypot(x - bx, z - bz) / radius
    if (dist < 1) best = Math.max(best, 1 - dist * dist)
  }
  if (best < 0.12) return { top: 2, bottom: 1, air: false }
  const top = Math.round(14 + best * 8)
  const thick = Math.max(3, Math.round(2 + best * 4))
  return { top, bottom: Math.max(8, top - thick), air: true }
}

function islandFalloff(h, x, z, world) {
  if (!world.islands) return h
  return islandProfile(x, z, world).top
}

function rollingHeight(x, z, world) {
  const { seed, biome } = world
  let n = noise(x / 9, z / 9, seed) * 0.62 + noise(x / 4, z / 4, seed + 11) * 0.38
  if (biome === 'desert') n = noise(x / 12, z / 12, seed) * 0.75 + noise(x / 5, z / 5, seed + 5) * 0.25
  if (biome === 'moon') n = noise(x / 7, z / 7, seed) * 0.55 + (noise(x / 2.4, z / 2.4, seed + 4) > 0.72 ? -0.22 : 0.05)
  if (biome === 'candy') n = noise(x / 7, z / 7, seed + 2)
  if (biome === 'snow') n = noise(x / 10, z / 10, seed + 8) * 0.8 + 0.08
  const amp = biome === 'moon' ? 5 : biome === 'grassland' ? 3 : 6
  const base = biome === 'grassland' ? 12 : 8
  let h = Math.round(base + (n - 0.42) * amp)
  h = clampHeight(h, ROLLING_CAP)
  return islandFalloff(h, x, z, world)
}

function landformHeight(x, z, world) {
  const { seed, size, landform } = world
  const cx = (size - 1) / 2
  const cz = (size - 1) / 2
  const dx = (x - cx) / size
  const dz = (z - cz) / size
  const dist = Math.hypot(dx, dz)
  const n = noise(x / 14, z / 14, seed)
  const n2 = noise(x / 6, z / 6, seed + 19)
  let h = 10
  if (landform === 'forest') {
    h = Math.round(11 + (n - 0.5) * 3 + (n2 - 0.5) * 2)
    const south = (z - cz) / size
    if (south > 0.16) h += Math.round((south - 0.16) * 34)
  } else if (landform === 'mountains') {
    const ridge = Math.pow(Math.abs(Math.sin(x * 0.16 + z * 0.05 + seed)), 0.65)
    h = Math.round(8 + n * 18 + ridge * 12 + n2 * 4)
    if (Math.abs(z - cz) < 1.8) h = Math.min(h, WATER)
  } else if (landform === 'lake') {
    if (dist < 0.16) h = 4
    else if (dist < 0.26) h = Math.round(4 + ((dist - 0.16) / 0.1) * 3)
    else if (dist < 0.4) h = WATER + (dist > 0.32 ? 1 : 0)
    else h = Math.round(WATER + 3 + n * 8 + Math.max(0, dist - 0.38) * 26)
  } else if (landform === 'beach') {
    const shore = z / size
    const along = Math.abs(x - cx) / size
    if (shore < 0.22) h = 3
    else if (shore < 0.5 && along < 0.28) h = 4
    else if (shore < 0.66) h = WATER + 1
    else h = Math.round(WATER + 4 + (shore - 0.66) * 46 + (n - 0.5) * 3)
  } else if (landform === 'peaks') {
    const north = 1 - z / size
    const ridge = Math.pow(n, 0.75)
    h = Math.round(12 + ridge * 16 + north * 12 + n2 * 4)
  } else if (landform === 'canyon') {
    const gorge = Math.abs((x - cx) + Math.sin(z * 0.11 + seed) * 2.2)
    if (gorge < 8) h = 8
    else if (gorge < 13) h = Math.round(8 + ((gorge - 8) / 5) * (14 + n * 6))
    else h = Math.round(24 + n * 8 + n2 * 3)
  }
  h = clampHeight(h, WORLD_HEIGHT - 10)
  return islandFalloff(h, x, z, world)
}

export function surfaceY(x, z, world) {
  if (!world._height) world._height = new Map()
  const cached = world._height.get(`${x},${z}`)
  if (cached !== undefined) return cached
  const form = world.landform || 'rolling'
  let h = form === 'rolling' ? rollingHeight(x, z, world) : landformHeight(x, z, world)
  if (world.structure === 'village') {
    const origin = structureOrigin(world)
    const dx = Math.abs(x - origin.x)
    const dz = z - origin.z
    const pad = dx <= 16 && dz >= -18 && dz <= 6
    const lane = dx <= 8 && dz >= 0 && dz <= 22
    if (pad || lane) h = world.biome === 'snow' ? 14 : 12
  }
  world._height.set(`${x},${z}`, h)
  return h
}

function center(world) {
  return { cx: world.size >> 1, cz: world.size >> 1 }
}

function distFromCenter(x, z, world) {
  const { cx, cz } = center(world)
  return Math.hypot(x - cx, z - cz) / world.size
}

function nearStructure(x, z, world) {
  if (world.structure === 'none') return false
  const origin = structureOrigin(world)
  if (world.structure === 'village') {
    const dx = Math.abs(x - origin.x)
    const dz = z - origin.z
    if (dx <= 16 && dz >= -18 && dz <= 8) return true
    if (dx <= 8 && dz >= 0 && dz <= 24) return true
    return false
  }
  const reach = world.structure === 'waterfall' || world.structure === 'oasis' ? 8
    : world.structure === 'dock' ? 11
      : world.structure === 'ruins' ? 5
        : 4
  return Math.abs(x - origin.x) <= reach && Math.abs(z - origin.z) <= reach
}

function hasTree(x, z, world) {
  if (!world._trees) world._trees = new Map()
  const key = `${x},${z}`
  if (world._trees.has(key)) return world._trees.get(key)
  const answer = treeHere(x, z, world)
  world._trees.set(key, answer)
  return answer
}

function shapedLand(world) {
  const form = world.landform || 'rolling'
  return form !== 'rolling'
}

function forestGlade(world) {
  const { cx, cz } = center(world)
  return { x: cx, z: Math.max(8, cz - 8) }
}

function inGlade(x, z, world) {
  if (world.landform !== 'forest') return false
  const glade = forestGlade(world)
  return Math.abs(x - glade.x) <= 8 && Math.abs(z - glade.z) <= 8
}

function lakeOverlook(x, z, world) {
  if (world.landform !== 'lake') return false
  const { cx, cz } = center(world)
  if (z < cz + Math.round(world.size * 0.38)) return false
  if (Math.abs(x - cx) > 6) return false
  const h = surfaceY(x, z, world)
  return h >= 12 && h <= 18
}

function treeHere(x, z, world) {
  if (x < 2 || z < 2 || x >= world.size - 2 || z >= world.size - 2) return false
  if (nearStructure(x, z, world)) return false
  if (inGlade(x, z, world) || lakeOverlook(x, z, world)) return false
  if (!shapedLand(world)) {
    if (world.biome === 'desert' || world.biome === 'moon') return false
    const h = surfaceY(x, z, world)
    if (h <= WATER + 1) return false
    const chance = world.biome === 'snow' ? 0.988 : world.biome === 'candy' ? 0.93 : 0.972
    return hash2(x, z, world.seed + 91) > chance
  }
  if (world.landform === 'canyon' || world.biome === 'moon') return false
  if (world.biome === 'desert' && world.landform !== 'beach') return false
  const spacing = world.landform === 'forest' ? 5 : world.landform === 'lake' ? 6 : 5
  const gx = Math.floor(x / spacing)
  const gz = Math.floor(z / spacing)
  const ox = Math.floor(hash2(gx, gz, world.seed + 5) * spacing)
  const oz = Math.floor(hash2(gx, gz, world.seed + 9) * spacing)
  if (x !== gx * spacing + ox || z !== gz * spacing + oz) return false
  const h = surfaceY(x, z, world)
  if (h <= WATER + 1) return false
  if (world.landform === 'beach' && z < world.size * 0.48) return false
  if (world.landform === 'forest' && h >= 16) return false
  if ((world.landform === 'peaks' || world.landform === 'mountains') && h > 24) return false
  if (world.landform === 'lake' && (h < WATER + 2 || distFromCenter(x, z, world) < 0.42)) return false
  return true
}

function classicTreeBlock(x, y, z, world) {
  const leaf = LEAF[world.biome] || CANOPY
  const wood = WOOD[world.biome] || TIMBER
  for (let dx = -2; dx <= 2; dx++) {
    for (let dz = -2; dz <= 2; dz++) {
      const tx = x + dx
      const tz = z + dz
      if (!hasTree(tx, tz, world)) continue
      const h = surfaceY(tx, tz, world)
      const dy = y - h
      if (dx === 0 && dz === 0 && dy >= 1 && dy <= 4) return wood
      const reach = dy === 5 ? 2 : dy === 4 || dy === 6 ? 1 : 0
      if (!reach || Math.abs(dx) + Math.abs(dz) > reach) continue
      if (dx === 0 && dz === 0) continue
      return leaf
    }
  }
  return 0
}

function shapedTreeBlock(x, y, z, world) {
  const leaf = world.biome === 'candy' ? CANDY : CANOPY
  const wood = world.biome === 'candy' ? GLOW : TIMBER
  for (let dx = -4; dx <= 4; dx++) {
    for (let dz = -4; dz <= 4; dz++) {
      const tx = x + dx
      const tz = z + dz
      if (!hasTree(tx, tz, world)) continue
      const h = surfaceY(tx, tz, world)
      const roll = hash2(tx, tz, world.seed + 17)
      const pine = world.biome === 'snow' || world.landform === 'peaks' || (world.landform === 'mountains' && roll > 0.4) || roll > 0.84
      const extra = 0
      if (pine) {
        const trunk = 7 + extra + Math.floor(hash2(tx, tz, world.seed + 23) * 4)
        const top = trunk + 7
        if (dx === 0 && dz === 0 && y > h && y <= h + trunk) return wood
        const dy = y - h
        if (dy >= trunk - 1 && dy <= top) {
          const tier = top - dy
          const rad = Math.max(1, Math.ceil(tier * 0.42))
          if (dx === 0 && dz === 0) return dy < top ? wood : 0
          if (Math.max(Math.abs(dx), Math.abs(dz)) <= rad && !(Math.abs(dx) === rad && Math.abs(dz) === rad && tier % 2 === 0)) return leaf
        }
        continue
      }
      const trunk = (world.landform === 'forest' ? 5 : 6) + extra + Math.floor(hash2(tx, tz, world.seed + 29) * 2)
      if (dx === 0 && dz === 0 && y > h && y <= h + trunk) return wood
      const branch = h + trunk
      if (y === branch && ((dz === 0 && Math.abs(dx) === 1) || (dx === 0 && Math.abs(dz) === 1))) return wood
      const dy = y - (h + trunk)
      const stacks = world.landform === 'forest'
        ? [
            [1, 2, 2, 2, 1],
            [1, 2, 2, 1, 1],
            [1, 2, 2, 1]
          ]
        : [
            [1, 2, 2, 1],
            [1, 2, 2, 1, 1],
            [1, 2, 2, 1]
          ]
      const radii = stacks[Math.floor(roll * stacks.length) % stacks.length]
      if (dy >= 0 && dy < radii.length) {
        const rad = radii[dy]
        if (dx === 0 && dz === 0) return leaf
        if (Math.max(Math.abs(dx), Math.abs(dz)) <= rad && !(Math.abs(dx) === rad && Math.abs(dz) === rad)) return leaf
      }
    }
  }
  return 0
}

function treeBlock(x, y, z, world) {
  if (!shapedLand(world)) return classicTreeBlock(x, y, z, world)
  return shapedTreeBlock(x, y, z, world)
}

function dryStep(world, cx, cz, dir) {
  for (let step = 0; step < world.size; step++) {
    const z = cz + dir * step
    if (z < 2 || z > world.size - 5) break
    if (surfaceY(cx, z, world) >= WATER + 1) return z
  }
  return null
}

function shoreLine(world, cx, cz) {
  const dir = world.landform === 'beach' ? 1 : -1
  const shore = dryStep(world, cx, cz, dir) ?? dryStep(world, cx, cz, -dir)
  if (shore == null) return { shore: Math.min(world.size - 5, cz + 6), face: 1 }
  return { shore, face: -dir }
}

export function structureOrigin(world) {
  if (world._origin) return world._origin
  const { cx, cz } = center(world)
  let origin = { x: cx, z: cz }
  const kind = world.structure
  if (kind === 'cabin' || kind === 'dock' || kind === 'lighthouse') {
    const { shore, face } = shoreLine(world, cx, cz)
    world._face = face
    const inland = Math.min(world.size - 5, Math.max(3, shore - face))
    if (kind === 'dock') origin = { x: Math.max(4, cx - 5), z: shore }
    else if (kind === 'cabin') origin = { x: Math.min(world.size - 5, cx + 4), z: inland }
    else origin = { x: Math.min(world.size - 5, cx + 6), z: inland }
  }
  world._origin = origin
  return origin
}

const VILLAGE_PITCH = -4 * Math.PI / 180

function houseShell(x, y, z, ox, oz, h, world) {
  const dx = x - ox
  const dz = z - oz
  const ax = Math.abs(dx)
  const az = Math.abs(dz)
  const roof = world.biome === 'snow' ? FROST : COBBLE
  if (y === h + 5 && ax <= 4 && az <= 4 && (ax === 4 || az === 4)) return roof
  if (ax <= 3 && az <= 3 && y >= h && y <= h + 5) {
    if (y === h + 5) return roof
    if (y === h) return PLANKS
    const wall = ax === 3 || az === 3
    if (!wall) return AIR
    if (z === oz + 3 && x === ox && (y === h + 1 || y === h + 2)) return DOOR
    if (y === h + 2 && ((ax === 3 && az <= 1) || (az === 3 && ax <= 1))) return WINDOW
    return PLANKS
  }
  return null
}

function villageSites(world) {
  const origin = structureOrigin(world)
  const spots = [[-11, -1], [0, -3], [11, -1], [-7, -13], [7, -13]]
  return spots.map(([dx, dz]) => ({
    x: Math.max(4, Math.min(world.size - 5, origin.x + dx)),
    z: Math.max(4, Math.min(world.size - 5, origin.z + dz))
  }))
}

function structureAt(x, y, z, world) {
  if (world.structure === 'none') return null
  const origin = structureOrigin(world)
  const ox = origin.x
  const oz = origin.z
  const h = surfaceY(ox, oz, world)
  const dx = x - ox
  const dz = z - oz
  const ax = Math.abs(dx)
  const az = Math.abs(dz)
  if (world.structure === 'dock') {
    const face = world._face || 1
    const along = dz * face
    if (ax > 1 || along < 0 || along > 9) return null
    if (y === WATER) return TIMBER
    if (dx === 0 && along % 3 === 0) {
      const bed = surfaceY(x, z, world)
      if (y > bed && y < WATER) return TIMBER
    }
    return null
  }
  if (world.structure === 'cabin') {
    if (x === ox + 1 && z === oz && y > h + 4 && y <= h + 6) return ROCK
    if (ax > 2 || az > 2 || y < h || y > h + 4) return null
    if (y === h + 4) return ax <= 1 && az <= 1 ? ROCK : null
    if (y === h + 3) return ROCK
    if (y === h) return TIMBER
    const wall = ax === 2 || az === 2
    const face = world._face || 1
    if (wall && !(z === oz + face * 2 && x === ox && y > h && y < h + 3)) return TIMBER
    return AIR
  }
  if (world.structure === 'lighthouse') {
    if (ax > 1 || az > 1 || y < h || y > h + 11) return null
    if (y >= h + 9) return GLOW
    if (ax === 1 || az === 1 || y === h) return ROCK
    return AIR
  }
  if (world.structure === 'watchtower') {
    if (ax > 1 || az > 1 || y < h || y > h + 8) return null
    if (y === h + 8) return world.biome === 'snow' ? FROST : ROCK
    if (y === h + 7) return TIMBER
    return ROCK
  }
  if (world.structure === 'ruins') {
    if (ax > 3 || az > 2 || y < h || y > h + 3) return null
    const wall = ax === 3 || az === 2
    if (!wall) return y === h && hash2(x, z, world.seed + 11) > 0.45 ? ROCK : null
    if (hash2(x, y, world.seed + z) > 0.62) return null
    if (y > h + 1 && hash2(x, z, world.seed + 3) > 0.55) return null
    return ROCK
  }
  if (world.structure === 'tower') {
    // Three blocks tall so a player on the ground can stack the goal on top.
    if (ax <= 1 && az <= 1 && y >= h && y <= h + 2) {
      if (ax === 1 && az === 1) return TIMBER
      if (y === h + 2) return world.biome === 'candy' ? CANDY : TURF
      return ROCK
    }
    // Plank steps just outside the goal columns. The top step is high enough
    // to look down onto the fourth block of the raise.
    const step = x - (ox + 2)
    if (z === oz && step >= 0 && step <= 3) {
      const local = surfaceY(x, z, world)
      const top = h + 1 + step
      if (y > local && y <= top) return PLANKS
    }
    return null
  }
  if (world.structure === 'house') {
    return houseShell(x, y, z, ox, oz, h, world)
  }
  if (world.structure === 'village') {
    for (const site of villageSites(world)) {
      const ground = surfaceY(site.x, site.z, world)
      const placed = houseShell(x, y, z, site.x, site.z, ground, world)
      if (placed !== null) return placed
    }
    return null
  }
  if (world.structure === 'waterfall') {
    const lip = h + 8
    if (x === ox + 1 && z === oz && y > h && y <= lip) return POOL
    if (Math.abs(x - (ox + 1)) <= 2 && Math.abs(z - oz) <= 2 && y === h) return POOL
    if (Math.abs(x - (ox + 1)) <= 2 && Math.abs(z - oz) <= 2 && y === h - 1) return ROCK
    if (ax <= 2 && az <= 1 && y >= h && y <= lip) return ROCK
    return null
  }
  if (world.structure === 'oasis') {
    if (ax <= 3 && az <= 2 && y === h) return POOL
    const palms = [[4, 0], [-4, 1], [1, 4], [3, -3]]
    for (const [px, pz] of palms) {
      const tx = ox + px
      const tz = oz + pz
      if (x === tx && z === tz && y > h && y <= h + 5) return TIMBER
      const ldx = x - tx
      const ldz = z - tz
      if (Math.abs(ldx) + Math.abs(ldz) <= 1 && y >= h + 5 && y <= h + 6) {
        if (ldx === 0 && ldz === 0 && y === h + 5) continue
        return CANOPY
      }
    }
    return null
  }
  if (world.structure !== 'pyramid') return null
  const layer = y - h
  if (layer < 0 || layer > 5) return null
  const rad = 5 - layer
  if (ax <= rad && az <= rad) {
    if (world.biome === 'candy') return layer % 2 ? PETAL : CANDY
    if (world.biome === 'desert') return DUNE
    return ROCK
  }
  return null
}

function surfaceBlock(world, x, z, h) {
  const { biome, seed, landform } = world
  if (landform === 'canyon') return h < 9 ? DUNE : ROCK
  if (landform === 'peaks') {
    const gully = noise(x / 3.2, z / 4.6, seed + 4)
    if (h < 22 || gully < 0.24) return ROCK
    return FROST
  }
  if (landform === 'beach') return h <= WATER + 2 ? DUNE : TURF
  if (landform === 'lake' && h <= WATER + 1) return DUNE
  if ((landform === 'mountains' || landform === 'lake') && h >= 20) return ROCK
  if (h <= WATER) return DUNE
  if (biome === 'desert') return DUNE
  if (biome === 'snow') return FROST
  if (biome === 'moon') return hash2(x, z, seed + 3) > 0.55 ? FROST : ROCK
  if (biome === 'candy') {
    const n = hash2(x, z, seed + 3)
    if (n > 0.66) return CANDY
    if (n > 0.33) return PETAL
    return GLOW
  }
  if (h <= WATER + 1 && shoreSand(world, x, z)) return DUNE
  if (hash2(x, z, seed + 7) > 0.93) return CLAY
  return TURF
}

function shoreSand(world, x, z) {
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = x + dx
    const nz = z + dz
    if (nx < 0 || nz < 0 || nx >= world.size || nz >= world.size) continue
    if (surfaceY(nx, nz, world) < WATER) return true
  }
  return false
}

function fillBlock(world, depth) {
  if (world.landform === 'canyon' || world.landform === 'peaks' || world.landform === 'mountains') return ROCK
  if (world.biome === 'desert') return depth < 3 ? DUNE : ROCK
  if (world.biome === 'candy') return depth < 2 ? PETAL : ROCK
  if (world.biome === 'moon') return ROCK
  if (world.biome === 'snow' && depth === 1) return FROST
  return depth < 4 ? SOIL : ROCK
}

function prefabBlock(x, y, z, world) {
  if (!world.prefabs?.length) return null
  const h = surfaceY(x, z, world)
  const { cx, cz } = center(world)
  for (let i = 0; i < world.prefabs.length; i++) {
    const kind = world.prefabs[i].kind
    const bx = Math.min(world.size - 2, Math.max(1, cx + 5 + i * 2))
    const bz = Math.min(world.size - 2, Math.max(1, cz - 4))
    if (kind === 'beacon' && x === bx && z === bz && y > h && y <= h + 4) return GLOW
    if (kind === 'arch' && z === bz && y === h + 3 && Math.abs(x - bx) <= 2) return ROCK
    if (kind === 'bridge' && y === WATER && Math.abs(z - cz) <= 1 && x > 2 && x < world.size - 2 && Math.abs(x - cx) <= 6) return TIMBER
  }
  return null
}

export function naturalAt(x, y, z, world) {
  if (y === 0) return ROCK
  const shaped = structureAt(x, y, z, world)
  if (shaped !== null) return shaped
  const built = prefabBlock(x, y, z, world)
  if (built) return built
  const tree = treeBlock(x, y, z, world)
  if (tree) return tree
  if (world.islands) return islandColumn(x, y, z, world)
  const h = surfaceY(x, z, world)
  if (world.caves && y > 1 && y < h - 2 && hash2(x + y * 13, z + y * 7, world.seed + 91) > 0.58) return AIR
  if (y > h && y <= WATER && h < WATER) return POOL
  if (y > h) return AIR
  if (y === h) return surfaceBlock(world, x, z, h)
  return fillBlock(world, h - y)
}

function islandColumn(x, y, z, world) {
  const profile = islandProfile(x, z, world)
  const h = profile.top
  if (world.caves && profile.air && y > profile.bottom && y < h - 2 && hash2(x + y * 13, z + y * 7, world.seed + 91) > 0.58) return AIR
  if (!profile.air) {
    if (y > h && y <= WATER) return POOL
    if (y > h) return AIR
    if (y === h) return DUNE
    return fillBlock(world, h - y)
  }
  if (y > h) return AIR
  if (y === h) return surfaceBlock(world, x, z, h)
  if (y >= profile.bottom) return fillBlock(world, h - y)
  return AIR
}

export function blockAt(x, y, z, world, edits) {
  if (x < 0 || z < 0 || y < 0 || x >= world.size || z >= world.size || y >= world.height) return AIR
  if (edits) {
    const key = `${x},${y},${z}`
    const value = typeof edits.get === 'function' ? edits.get(key) : edits[key]
    if (value !== undefined && value !== null) return value
  }
  return naturalAt(x, y, z, world)
}

export function groundY(world, x, z, edits) {
  for (let y = world.height - 1; y >= 0; y--) {
    if (isSolid(blockAt(x, y, z, world, edits))) return y
  }
  return 0
}

function columnClear(world, edits, x, z, gy) {
  for (let k = 1; k <= 3; k++) {
    if (blockAt(x, gy + k, z, world, edits)) return false
  }
  return true
}

const LOOK_PITCH = -13 * Math.PI / 180

export function vistaGlance(world, x, feetY, z) {
  const { cx, cz } = center(world)
  const gy = Math.floor(feetY) - 1
  const yaw = Math.atan2(cx - x, cz - z)
  const eyeY = feetY + 1.62
  const out = { water: 0, leaf: 0, wood: 0, sand: 0, snow: 0, drop: 0 }
  const pitches = [0.1, -0.06, -0.2, -0.36]
  const offsets = [-0.32, -0.16, 0, 0.16, 0.32]
  for (const pitch of pitches) {
    for (const off of offsets) {
      const cp = Math.cos(pitch)
      const dx = Math.sin(yaw + off) * cp
      const dy = Math.sin(pitch)
      const dz = Math.cos(yaw + off) * cp
      for (let t = 3; t <= 32; t += 2) {
        const bx = Math.floor(x + dx * t)
        const by = Math.floor(eyeY + dy * t)
        const bz = Math.floor(z + dz * t)
        if (bx < 0 || bz < 0 || bx >= world.size || bz >= world.size || by < 0 || by >= world.height) break
        const id = blockAt(bx, by, bz, world)
        if (id === POOL) out.water += 1
        else if (id === CANOPY) out.leaf += 1
        else if (id === TIMBER) out.wood += 1
        else if (id === DUNE) out.sand += 1
        else if (id === FROST) out.snow += 1
        if (isSolid(id)) break
      }
      const gx = Math.floor(x + Math.sin(yaw + off) * 10)
      const gz = Math.floor(z + Math.cos(yaw + off) * 10)
      if (gx > 1 && gz > 1 && gx < world.size - 1 && gz < world.size - 1) {
        if (gy - surfaceY(gx, gz, world) > 6) out.drop += 1
      }
    }
  }
  return out
}

function lookReach(world, edits, x, z, gy, cx, cz) {
  const yaw = Math.atan2(cx - (x + 0.5), cz - (z + 0.5))
  const cp = Math.cos(LOOK_PITCH)
  const dx = Math.sin(yaw) * cp
  const dy = Math.sin(LOOK_PITCH)
  const dz = Math.cos(yaw) * cp
  const eyeY = gy + 1 + 1.62
  for (let t = 1; t <= 28; t += 0.5) {
    const bx = Math.floor(x + 0.5 + dx * t)
    const by = Math.floor(eyeY + dy * t)
    const bz = Math.floor(z + 0.5 + dz * t)
    if (by < 0 || by >= world.height) return 0
    if (isSolid(blockAt(bx, by, bz, world, edits))) return t
  }
  return 0
}

function vistaHeight(world, edits, x, z) {
  if (x < 2 || z < 2 || x >= world.size - 2 || z >= world.size - 2) return null
  const gy = surfaceY(x, z, world)
  if (gy < WATER) return null
  if (!columnClear(world, edits, x, z, gy)) return null
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      if (!dx && !dz) continue
      const ny = surfaceY(x + dx, z + dz, world)
      if (ny > gy + 1 || gy - ny > 3) return null
      if (!columnClear(world, edits, x + dx, z + dz, gy)) return null
    }
  }
  return gy
}

function southOverlook(world, edits) {
  const { cx, cz } = center(world)
  const origin = structureOrigin(world)
  let best = null
  let bestScore = -1e9
  const minZ = cz + Math.round(world.size * 0.38)
  for (let z = world.size - 3; z >= minZ; z--) {
    for (let x = cx - 4; x <= cx + 4; x++) {
      const gy = vistaHeight(world, edits, x, z)
      if (gy === null || gy < 12) continue
      const view = vistaGlance(world, x + 0.5, gy + 1, z + 0.5)
      if (view.water < 4) continue
      const score = view.water + gy - Math.abs(x + 0.5 - origin.x) * 3
      if (score > bestScore) {
        bestScore = score
        best = { x: x + 0.5, y: gy + 1, z: z + 0.5 }
      }
    }
  }
  return best
}

function villageOverlook(world, edits) {
  const origin = structureOrigin(world)
  const z = Math.max(4, Math.min(world.size - 5, origin.z + 12))
  for (const dx of [0, 1, -1, 2, -2, 3, -3]) {
    const x = Math.max(4, Math.min(world.size - 5, origin.x + dx))
    const gy = groundY(world, x, z, edits)
    if (gy < WATER || !columnClear(world, edits, x, z, gy)) continue
    return { x: x + 0.5, y: gy + 1, z: z + 0.5, pitch: VILLAGE_PITCH }
  }
  return null
}

export function spawnPoint(world, edits) {
  if (world.structure === 'village') {
    const pad = villageOverlook(world, edits)
    if (pad) return pad
  }
  if (world.landform === 'lake') {
    const pad = southOverlook(world, edits)
    if (pad) return pad
  }
  const { cx, cz } = center(world)
  const minDist = world.structure === 'pyramid' ? 9 : 7
  const prefer = world.size * 0.3
  let best = null
  let bestScore = -1e9
  const consider = (x, z, bonus) => {
    const dist = Math.hypot(x - cx, z - cz)
    if (dist < minDist) return
    const gy = vistaHeight(world, edits, x, z)
    if (gy === null) return
    const reach = lookReach(world, edits, x, z, gy, cx, cz)
    const view = vistaGlance(world, x + 0.5, gy + 1, z + 0.5)
    let score = bonus - Math.abs(dist - prefer) * 0.35
    if (reach >= 5 && reach <= 34) score += 24 + Math.min(gy, 24) * 0.08
    else score += gy * 0.04
    if (world.landform === 'lake') {
      score += view.water * 14 + view.sand * 2
      if (z > cz + world.size * 0.38 && gy >= 12) score += 90
    } else if (world.landform === 'forest') {
      score += view.leaf * 9 + view.wood * 4
      const glade = forestGlade(world)
      if (Math.abs(x - glade.x) <= 3 && Math.abs(z - glade.z) <= 3) score += 160
      if (gy >= 16) score -= 80
    }
    else if (world.landform === 'beach') score += view.water * 10 + view.sand * 3
    else if (world.landform === 'peaks') score += view.snow * 7
    else if (world.landform === 'canyon') score += view.sand * 12 + view.drop * 4
    if (score > bestScore) {
      bestScore = score
      best = { x, z, y: gy }
    }
  }
  const reach = Math.min(world.size / 2 - 2, Math.round(world.size * 0.42))
  for (let r = minDist; r <= reach; r++) {
    for (let dx = -10; dx <= 10; dx += 2) {
      consider(cx + dx, cz + r, 8)
      consider(cx + dx, cz - r, 2)
      consider(cx + r, cz + dx, 3)
      consider(cx - r, cz + dx, 3)
    }
  }
  if (!best) {
    for (let z = 2; z < world.size - 2; z += 2) {
      for (let x = 2; x < world.size - 2; x += 2) consider(x, z, z > cz ? 2 : 0)
    }
  }
  if (!best) {
    for (let r = minDist; r < world.size / 2; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue
          const x = cx + dx
          const z = cz + dz
          const gy = groundY(world, x, z, edits)
          if (gy < WATER) continue
          if (!columnClear(world, edits, x, z, gy)) continue
          return { x: x + 0.5, y: gy + 1, z: z + 0.5 }
        }
      }
    }
    return { x: cx + 0.5, y: 12, z: Math.min(world.size - 3, cz + minDist) + 0.5 }
  }
  return { x: best.x + 0.5, y: best.y + 1, z: best.z + 0.5 }
}

export function columnTop(world, x, z, edits) {
  for (let y = world.height - 1; y >= 0; y--) {
    const id = blockAt(x, y, z, world, edits)
    if (id) return { y, id, color: blockHex(id) }
  }
  return { y: 0, id: ROCK, color: blockHex(ROCK) }
}

export function skyHex(biome) {
  return SKY[biome] || SKY.grassland
}
