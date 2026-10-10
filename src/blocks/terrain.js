import {
  AIR, BIOMES, CANOPY, CANDY, CHUNK, CLAY, DUNE, FROST, GLOW, PETAL, POOL, ROCK, SOIL,
  STRUCTURES, TIMBER, TURF, WORLD_HEIGHT, WORLD_SIZES, blockHex, isSolid
} from './blocks.js'

export const WATER = 7

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
  return {
    biome,
    sizeName,
    size: WORLD_SIZES[sizeName],
    structure,
    seed,
    height: WORLD_HEIGHT,
    chunk: CHUNK
  }
}

export function surfaceY(x, z, world) {
  if (!world._height) world._height = new Map()
  const cached = world._height.get(`${x},${z}`)
  if (cached !== undefined) return cached
  const { seed, biome } = world
  let n = noise(x / 9, z / 9, seed) * 0.62 + noise(x / 4, z / 4, seed + 11) * 0.38
  if (biome === 'desert') n = noise(x / 12, z / 12, seed) * 0.75 + noise(x / 5, z / 5, seed + 5) * 0.25
  if (biome === 'moon') n = noise(x / 7, z / 7, seed) * 0.55 + (noise(x / 2.4, z / 2.4, seed + 4) > 0.72 ? -0.22 : 0.05)
  if (biome === 'candy') n = noise(x / 7, z / 7, seed + 2)
  if (biome === 'snow') n = noise(x / 10, z / 10, seed + 8) * 0.8 + 0.08
  const amp = biome === 'moon' ? 5 : 6
  let h = Math.round(8 + (n - 0.42) * amp)
  if (h < 3) h = 3
  if (h > WORLD_HEIGHT - 6) h = WORLD_HEIGHT - 6
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

function treeHere(x, z, world) {
  if (world.biome === 'desert' || world.biome === 'moon') return false
  if (x < 2 || z < 2 || x >= world.size - 2 || z >= world.size - 2) return false
  if (nearStructure(x, z, world)) return false
  const h = surfaceY(x, z, world)
  if (h <= WATER + 1) return false
  const chance = world.biome === 'snow' ? 0.988 : world.biome === 'candy' ? 0.93 : 0.972
  return hash2(x, z, world.seed + 91) > chance
}

function treeBlock(x, y, z, world) {
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
  const { biome, seed } = world
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
  if (world.biome === 'desert') return depth < 3 ? DUNE : ROCK
  if (world.biome === 'candy') return depth < 2 ? PETAL : ROCK
  if (world.biome === 'moon') return ROCK
  if (world.biome === 'snow' && depth === 1) return FROST
  return depth < 4 ? SOIL : ROCK
}

export function naturalAt(x, y, z, world) {
  if (y === 0) return ROCK
  const shaped = structureAt(x, y, z, world)
  if (shaped !== null) return shaped
  const tree = treeBlock(x, y, z, world)
  if (tree) return tree
  const h = surfaceY(x, z, world)
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

export function spawnPoint(world, edits) {
  const { cx, cz } = center(world)
  const start = world.structure === 'pyramid' ? 8 : 5
  for (let r = start; r < world.size / 2; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue
        const x = cx + dx
        const z = cz + dz
        if (x < 2 || z < 2 || x >= world.size - 2 || z >= world.size - 2) continue
        const y = groundY(world, x, z, edits)
        if (y < WATER) continue
        if (blockAt(x, y + 1, z, world, edits) || blockAt(x, y + 2, z, world, edits)) continue
        return { x: x + 0.5, y: y + 1, z: z + 0.5 }
      }
    }
  }
  return { x: cx + 0.5, y: 12, z: cz + 0.5 }
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
