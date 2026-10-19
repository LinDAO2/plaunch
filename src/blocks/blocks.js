// Original block set for the Blocks runtime. Names and colors are ours.
export const AIR = 0
export const TURF = 1
export const SOIL = 2
export const ROCK = 3
export const DUNE = 4
export const POOL = 5
export const TIMBER = 6
export const CANOPY = 7
export const PETAL = 8
export const CANDY = 9
export const FROST = 10
export const CLAY = 11
export const GLOW = 12
export const PLANKS = 13
export const COBBLE = 14
export const WINDOW = 15
export const DOOR = 16

export const BLOCKS = [
  { id: AIR, name: 'Air', solid: false, color: '#000000' },
  { id: TURF, name: 'Turf', solid: true, color: '#5ea84a' },
  { id: SOIL, name: 'Soil', solid: true, color: '#8a5a32' },
  { id: ROCK, name: 'Rock', solid: true, color: '#8d8f96' },
  { id: DUNE, name: 'Dune', solid: true, color: '#e2c56a' },
  { id: POOL, name: 'Pool', solid: false, color: '#3aa0c8' },
  { id: TIMBER, name: 'Timber', solid: true, color: '#a56a3a' },
  { id: CANOPY, name: 'Canopy', solid: true, color: '#2f8a45' },
  { id: PETAL, name: 'Petal', solid: true, color: '#f2a3c7' },
  { id: CANDY, name: 'Candy', solid: true, color: '#ff5aa5' },
  { id: FROST, name: 'Frost', solid: true, color: '#d7eef8' },
  { id: CLAY, name: 'Clay', solid: true, color: '#c46a4a' },
  { id: GLOW, name: 'Glow', solid: true, color: '#e6ff3a' },
  { id: PLANKS, name: 'Planks', solid: true, color: '#a67c52' },
  { id: COBBLE, name: 'Cobble', solid: true, color: '#8a8680' },
  { id: WINDOW, name: 'Window', solid: true, color: '#d5e6f2' },
  { id: DOOR, name: 'Door', solid: true, color: '#6b4428' }
]

export const HOTBAR = [TURF, SOIL, ROCK, DUNE, TIMBER, CANOPY, PETAL, CANDY, FROST]

export function hotbarFor(biome) {
  if (biome === 'candy') return [CANDY, PETAL, GLOW, TURF, SOIL, ROCK, DUNE, TIMBER, CANOPY, FROST]
  return HOTBAR.filter((id) => id !== PETAL && id !== CANDY)
}

export const BIOMES = ['grassland', 'desert', 'snow', 'candy', 'moon']
export const STRUCTURES = ['tower', 'house', 'pyramid', 'cabin', 'dock', 'lighthouse', 'ruins', 'watchtower', 'village', 'waterfall', 'oasis', 'none']
export const WORLD_SIZES = { small: 32, medium: 48, large: 64 }
export const WORLD_HEIGHT = 48
export const CHUNK = 16

export function blockOf(id) {
  return BLOCKS[id] || BLOCKS[0]
}

export function isSolid(id) {
  return Boolean(BLOCKS[id]?.solid)
}

export function blockHex(id) {
  return blockOf(id).color
}

export function blockRgb(id) {
  const hex = blockHex(id)
  const n = Number.parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export function knownBlock(id) {
  return id === AIR || (Number.isInteger(id) && id >= 1 && id < BLOCKS.length && Boolean(BLOCKS[id]))
}
