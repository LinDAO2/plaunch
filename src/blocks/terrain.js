import {
  AIR, BIOMES, CANOPY, CANDY, CHUNK, CLAY, DUNE, FROST, GLOW, PETAL, POOL, ROCK, SOIL,
  STRUCTURES, TIMBER, TURF, WORLD_HEIGHT, WORLD_SIZES, blockHex, isSolid
} from './blocks.js'

export const WATER = 7
const ROLLING_CAP = 18
const LANDFORMS = new Set(['rolling', 'forest', 'mountains', 'lake', 'beach', 'peaks', 'canyon'])

export const SKY = {
  grassland: '#87b8f0',
  desert: '#f2c48a',
  snow: '#d5e4ef',
  candy: '#f2a0cc',
  moon: '#141820'
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

function islandFalloff(h, x, z, world) {
  if (!world.islands) return h
  const cx = (world.size - 1) / 2
  const cz = (world.size - 1) / 2
  const dx = (x - cx) / (world.size * 0.46)
  const dz = (z - cz) / (world.size * 0.46)
  const dist = Math.sqrt(dx * dx + dz * dz)
  return dist > 0.78 ? 2 : Math.max(4, Math.round(h * (1 - dist * 0.45)))
}

function rollingHeight(x, z, world) {
  const { seed, biome } = world
  let n = noise(x / 9, z / 9, seed) * 0.62 + noise(x / 4, z / 4, seed + 11) * 0.38
  if (biome === 'desert') n = noise(x / 12, z / 12, seed) * 0.75 + noise(x / 5, z / 5, seed + 5) * 0.25
  if (biome === 'moon') n = noise(x / 7, z / 7, seed) * 0.55 + (noise(x / 2.4, z / 2.4, seed + 4) > 0.72 ? -0.22 : 0.05)
  if (biome === 'candy') n = noise(x / 7, z / 7, seed + 2)
  if (biome === 'snow') n = noise(x / 10, z / 10, seed + 8) * 0.8 + 0.08
  const amp = biome === 'moon' ? 5 : 6
  let h = Math.round(8 + (n - 0.42) * amp)
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
    h = Math.round(10 + (n - 0.45) * 8 + (n2 - 0.5) * 3)
    const riverZ = cz + Math.sin(x * 0.33 + seed) * 3.2
    const river = Math.abs(z - riverZ)
    if (river < 1.7) h = WATER - 1
    else if (river < 3.1) h = WATER + 1
  } else if (landform === 'mountains') {
    const ridge = Math.pow(Math.abs(Math.sin(x * 0.16 + z * 0.05 + seed)), 0.65)
    h = Math.round(8 + n * 18 + ridge * 12 + n2 * 4)
    if (Math.abs(z - cz) < 1.8) h = Math.min(h, WATER)
  } else if (landform === 'lake') {
    const basin = dist < 0.16 ? 0 : dist < 0.3 ? (dist - 0.16) / 0.14 : 1
    h = Math.round(WATER - 2 + basin * (8 + n * 20 + (dist > 0.34 ? 8 : 0)))
    if (dist < 0.15) h = WATER - 2
  } else if (landform === 'beach') {
    const shore = z / size
    if (shore < 0.26) h = 3
    else if (shore < 0.42) h = Math.round(3 + ((shore - 0.26) / 0.16) * (WATER + 2))
    else h = Math.round(WATER + 3 + (shore - 0.42) * 22 + (n - 0.4) * 5)
  } else if (landform === 'peaks') {
    const north = 1 - z / size
    const ridge = Math.pow(n, 0.75)
    h = Math.round(12 + ridge * 16 + north * 12 + n2 * 4)
  } else if (landform === 'canyon') {
    const gorge = Math.abs((x - cx) + Math.sin(z * 0.18 + seed) * 3.5)
    if (gorge < 2.4) h = 4
    else if (gorge < 6.5) h = Math.round(4 + ((gorge - 2.4) / 4.1) * (16 + n * 8))
    else h = Math.round(20 + n * 8 + n2 * 3)
  }
  h = clampHeight(h, WORLD_HEIGHT - 10)
  return islandFalloff(h, x, z, world)
}

export function surfaceY(x, z, world) {
  if (!world._height) world._height = new Map()
  const cached = world._height.get(`${x},${z}`)
  if (cached !== undefined) return cached
  const form = world.landform || 'rolling'
  const h = form === 'rolling' ? rollingHeight(x, z, world) : landformHeight(x, z, world)
  world._height.set(`${x},${z}`, h)
  return h
}

function center(world) {
  return { cx: world.size >> 1, cz: world.size >> 1 }
}

function nearStructure(x, z, world) {
  if (world.structure === 'none') return false
  const { cx, cz } = center(world)
  return Math.abs(x - cx) <= 7 && Math.abs(z - cz) <= 7
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

function treeHere(x, z, world) {
  if (x < 2 || z < 2 || x >= world.size - 2 || z >= world.size - 2) return false
  if (nearStructure(x, z, world)) return false
  if (!shapedLand(world)) {
    if (world.biome === 'desert' || world.biome === 'moon') return false
    const h = surfaceY(x, z, world)
    if (h <= WATER + 1) return false
    const chance = world.biome === 'snow' ? 0.988 : world.biome === 'candy' ? 0.93 : 0.972
    return hash2(x, z, world.seed + 91) > chance
  }
  if (world.landform === 'canyon' || world.biome === 'moon') return false
  if (world.biome === 'desert' && world.landform !== 'beach') return false
  const spacing = world.landform === 'forest' ? 4 : 5
  const gx = Math.floor(x / spacing)
  const gz = Math.floor(z / spacing)
  const ox = Math.floor(hash2(gx, gz, world.seed + 5) * spacing)
  const oz = Math.floor(hash2(gx, gz, world.seed + 9) * spacing)
  if (x !== gx * spacing + ox || z !== gz * spacing + oz) return false
  const h = surfaceY(x, z, world)
  if (h <= WATER + 1) return false
  if (world.landform === 'beach' && z < world.size * 0.48) return false
  if ((world.landform === 'peaks' || world.landform === 'mountains') && h > 28) return false
  if (world.landform === 'lake' && h < WATER + 2) return false
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
      if (dx === 0 && dz === 0 && y > h && y <= h + 3) return wood
      const reach = y === h + 4 ? 1 : 2
      if (y >= h + 2 && y <= h + 4 && Math.abs(dx) + Math.abs(dz) <= reach) {
        if (dx === 0 && dz === 0 && y <= h + 3) continue
        return leaf
      }
    }
  }
  return 0
}

function shapedTreeBlock(x, y, z, world) {
  const leaf = LEAF[world.biome] || CANOPY
  const wood = WOOD[world.biome] || TIMBER
  const pine = world.biome === 'snow' || world.landform === 'peaks' || world.landform === 'mountains'
  for (let dx = -3; dx <= 3; dx++) {
    for (let dz = -3; dz <= 3; dz++) {
      const tx = x + dx
      const tz = z + dz
      if (!hasTree(tx, tz, world)) continue
      const h = surfaceY(tx, tz, world)
      const roll = hash2(tx, tz, world.seed + 17)
      if (pine || roll > 0.72) {
        const top = 11
        if (dx === 0 && dz === 0 && y > h && y <= h + 8) return wood
        const dy = y - h
        if (dy >= 4 && dy <= top) {
          const rad = Math.max(0, Math.ceil((top - dy) * 0.42))
          if (Math.abs(dx) + Math.abs(dz) <= rad && !(dx === 0 && dz === 0 && dy <= 8)) return leaf
        }
        continue
      }
      const trunk = 5
      if (dx === 0 && dz === 0 && y > h && y <= h + trunk) return wood
      const cy = h + 6.2
      const rr = (dx * dx) + ((y - cy) * (y - cy) * 0.82) + (dz * dz)
      if (y > h + 2 && rr <= 7.4 && !(dx === 0 && dz === 0 && y <= h + trunk)) return leaf
    }
  }
  return 0
}

function treeBlock(x, y, z, world) {
  if (!shapedLand(world)) return classicTreeBlock(x, y, z, world)
  return shapedTreeBlock(x, y, z, world)
}

function structureAt(x, y, z, world) {
  if (world.structure === 'none') return null
  const { cx, cz } = center(world)
  const h = surfaceY(cx, cz, world)
  const dx = Math.abs(x - cx)
  const dz = Math.abs(z - cz)
  if (world.structure === 'tower') {
    if (dx <= 1 && dz <= 1 && y >= h && y <= h + 7) {
      if (dx === 1 && dz === 1) return TIMBER
      if (y === h + 7) return world.biome === 'candy' ? CANDY : TURF
      return ROCK
    }
    return null
  }
  if (world.structure === 'house') {
    if (dx <= 2 && dz <= 2 && y >= h && y <= h + 3) {
      const wall = dx === 2 || dz === 2
      if (y === h + 3) return world.biome === 'snow' ? FROST : TURF
      if (y === h) return TIMBER
      if (wall && !(z === cz + 2 && x === cx && (y === h + 1 || y === h + 2))) return TIMBER
      return AIR
    }
    return null
  }
  const layer = y - h
  if (layer < 0 || layer > 5) return null
  const rad = 5 - layer
  if (dx <= rad && dz <= rad) {
    if (world.biome === 'candy') return layer % 2 ? PETAL : CANDY
    if (world.biome === 'desert') return DUNE
    return ROCK
  }
  return null
}

function surfaceBlock(world, x, z, h) {
  const { biome, seed, landform } = world
  if (landform === 'canyon') return h < 9 ? DUNE : ROCK
  if (landform === 'peaks') return h >= 22 ? FROST : ROCK
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
  if (h <= WATER + 1) return DUNE
  if (hash2(x, z, seed + 7) > 0.93) return CLAY
  return TURF
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
  const h = surfaceY(x, z, world)
  if (world.caves && y > 1 && y < h - 2 && hash2(x + y * 13, z + y * 7, world.seed + 91) > 0.58) return AIR
  if (y > h && y <= WATER && h < WATER) return POOL
  if (y > h) return AIR
  if (y === h) return surfaceBlock(world, x, z, h)
  return fillBlock(world, h - y)
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

function vistaHeight(world, edits, x, z) {
  if (x < 2 || z < 2 || x >= world.size - 2 || z >= world.size - 2) return null
  const gy = groundY(world, x, z, edits)
  if (gy < WATER) return null
  if (!columnClear(world, edits, x, z, gy)) return null
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      if (!dx && !dz) continue
      const ny = groundY(world, x + dx, z + dz, edits)
      if (ny > gy || gy - ny > 1) return null
      if (!columnClear(world, edits, x + dx, z + dz, gy)) return null
    }
  }
  return gy
}

export function spawnPoint(world, edits) {
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
    const score = gy * 4 + bonus - Math.abs(dist - prefer) * 0.35
    if (score > bestScore) {
      bestScore = score
      best = { x, z, y: gy }
    }
  }
  const reach = Math.min(world.size / 2 - 2, Math.round(world.size * 0.42))
  for (let r = minDist; r <= reach; r++) {
    for (let dx = -8; dx <= 8; dx++) consider(cx + dx, cz + r, 6)
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
