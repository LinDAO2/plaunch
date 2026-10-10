import { BIOMES, STRUCTURES, WORLD_SIZES } from './blocks.js'
import { goalCopy } from './goals.js'
import { worldFromSpec } from './terrain.js'

const PALETTES = {
  grassland: ['#5ea84a', '#8a5a32', '#8d8f96', '#3aa0c8'],
  desert: ['#e2c56a', '#c46a4a', '#8d8f96', '#f2d48a'],
  snow: ['#d7eef8', '#8d8f96', '#e7e9ea', '#8a5a32'],
  candy: ['#ff5aa5', '#e6ff3a', '#f2a3c7', '#7ad0ff'],
  moon: ['#8d8f96', '#d7eef8', '#2a2e35', '#e6ff3a']
}

const KEYS = ['version', 'name', 'description', 'theme', 'runtime', 'duration', 'accent', 'scoring', 'difficulty', 'controls', 'safety', 'palette', 'biome', 'terrainSeed', 'worldSize', 'structure', 'goal']
const DIFFICULTIES = ['easy', 'normal', 'hard']

export function wantsWorld(prompt) {
  const text = String(prompt || '').toLowerCase()
  return /\bminecraft\b|\bvoxel\b|block building|block world|build a castle|castle together/.test(text)
}

function isObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function assertOnly(obj, keys, label) {
  for (const key of Object.keys(obj)) {
    if (!keys.includes(key)) throw new Error(`${label} has unexpected field ${key}`)
  }
}

function text(value, label, min, max) {
  if (typeof value !== 'string') throw new Error(`${label} must be a string`)
  const clean = value.replace(/[\u0000-\u001F\u007F]/g, '').trim()
  if (clean.length < min || clean.length > max) throw new Error(`${label} must be ${min}–${max} characters`)
  return clean
}

function hex(value, label) {
  const color = typeof value === 'string' ? value.trim() : ''
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) throw new Error(`${label} must be a #RRGGBB color`)
  return color.toLowerCase()
}

function hashString(value) {
  let h = 2166136261
  const str = String(value || '')
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619)
  return h >>> 0
}

export function chooseWorld(prompt) {
  const p = String(prompt || '').toLowerCase()
  let biome = 'grassland'
  if (/candy|sweet/.test(p)) biome = 'candy'
  else if (/moon|lunar/.test(p)) biome = 'moon'
  else if (/snow|ice|frost|winter/.test(p)) biome = 'snow'
  else if (/desert|dune|sand/.test(p)) biome = 'desert'
  let structure = 'none'
  if (/pyramid/.test(p)) structure = 'pyramid'
  else if (/house|cabin|cottage/.test(p)) structure = 'house'
  else if (/castle|tower/.test(p)) structure = 'tower'
  else if (/\bminecraft\b|\bvoxel\b|block building|block world/.test(p)) structure = 'house'
  const castle = /castle/.test(p)
  const name = castle ? 'Castle Blocks'
    : biome === 'candy' ? 'Candy Blocks'
      : biome === 'moon' ? 'Moon Blocks'
        : biome === 'snow' ? 'Frost Blocks'
          : biome === 'desert' ? 'Dune Blocks'
            : 'Block World'
  const goal = castle
    ? 'Build a castle together.'
    : 'Shape this world. Everyone here shares it.'
  const size = /tiny|small/.test(p) ? 'small' : /huge|large/.test(p) ? 'large' : 'medium'
  return {
    name,
    description: goal,
    theme: `${biome} blocks`,
    biome,
    structure,
    worldSize: size,
    terrainSeed: (hashString(p) % 100000) + 1,
    palette: PALETTES[biome].slice(),
    accent: PALETTES[biome][0],
    goal
  }
}

export function validateWorldSpec(input) {
  if (!isObject(input)) throw new Error('Game spec must be an object')
  if (JSON.stringify(input).length > 12000) throw new Error('Game spec is too large')
  assertOnly(input, KEYS, 'Game spec')
  if (input.version !== '1.2') throw new Error('Game spec version must be 1.2')
  if (input.runtime !== 'world') throw new Error('Game spec runtime is invalid')
  if (!BIOMES.includes(input.biome)) throw new Error('biome is invalid')
  if (!STRUCTURES.includes(input.structure)) throw new Error('structure is invalid')
  if (!Object.prototype.hasOwnProperty.call(WORLD_SIZES, input.worldSize)) throw new Error('worldSize is invalid')
  if (!Number.isInteger(input.terrainSeed) || input.terrainSeed < 0 || input.terrainSeed > 1_000_000_000) {
    throw new Error('terrainSeed is invalid')
  }
  if (!DIFFICULTIES.includes(input.difficulty)) throw new Error('Game spec difficulty is invalid')
  const duration = Number(input.duration)
  if (!Number.isInteger(duration) || duration < 5 || duration > 60) throw new Error('duration must be an integer from 5 to 60')
  if (!isObject(input.scoring)) throw new Error('Game spec scoring is required')
  assertOnly(input.scoring, ['direction', 'label', 'unit'], 'scoring')
  if (input.scoring.direction !== 'higher') throw new Error('scoring.direction must be higher for world')
  if (!isObject(input.controls)) throw new Error('Game spec controls are required')
  assertOnly(input.controls, ['keyboard', 'touch'], 'controls')
  if (!isObject(input.safety)) throw new Error('Game spec safety is required')
  assertOnly(input.safety, ['audience', 'notes'], 'safety')
  if (input.safety.audience !== 'general') throw new Error('safety.audience must be general')
  if (!Array.isArray(input.palette) || input.palette.length < 2 || input.palette.length > 6) {
    throw new Error('palette must be 2–6 colors')
  }
  const palette = input.palette.map((color, index) => hex(color, `palette[${index}]`))
  const notes = input.safety.notes === undefined ? '' : text(input.safety.notes, 'safety.notes', 0, 200)
  return {
    version: '1.2',
    name: text(input.name, 'name', 2, 45),
    description: text(input.description ?? '', 'description', 0, 180),
    theme: text(input.theme, 'theme', 1, 80),
    runtime: 'world',
    duration,
    accent: hex(input.accent, 'accent'),
    scoring: {
      direction: 'higher',
      label: text(input.scoring.label, 'scoring.label', 1, 40),
      unit: text(input.scoring.unit, 'scoring.unit', 1, 20)
    },
    difficulty: input.difficulty,
    controls: {
      keyboard: text(input.controls.keyboard, 'controls.keyboard', 1, 120),
      touch: text(input.controls.touch, 'controls.touch', 1, 120)
    },
    safety: { audience: 'general', notes },
    palette,
    biome: input.biome,
    terrainSeed: input.terrainSeed,
    worldSize: input.worldSize,
    structure: input.structure,
    goal: text(input.goal, 'goal', 1, 140)
  }
}

const CONTROLS = {
  keyboard: 'Click or drag to look. WASD moves, space jumps, click breaks, E places.',
  touch: 'Left stick moves. Drag the right side to look. Tap breaks. Place and jump buttons.'
}

export function worldSpecFromFields(game = {}) {
  const biome = BIOMES.includes(game.biome) ? game.biome : 'grassland'
  const palette = Array.isArray(game.palette) && game.palette.length >= 2 ? game.palette : PALETTES[biome]
  const accent = typeof game.accent === 'string' && /^#[0-9a-fA-F]{6}$/.test(game.accent) ? game.accent : palette[0]
  return validateWorldSpec({
    version: '1.2',
    name: game.name || 'Block World',
    description: game.description || game.goal || 'A shared block world.',
    theme: game.theme || `${biome} blocks`,
    runtime: 'world',
    duration: Number(game.duration) || 60,
    accent,
    scoring: { direction: 'higher', label: 'Blocks', unit: 'placed' },
    difficulty: game.difficulty || 'normal',
    controls: CONTROLS,
    safety: { audience: 'general', notes: 'Shared world. The server checks every edit.' },
    palette,
    biome,
    terrainSeed: Number.isInteger(game.terrainSeed) ? game.terrainSeed : 1,
    worldSize: game.worldSize || 'medium',
    structure: game.structure || 'none',
    goal: game.goal || 'Shape this world. Everyone here shares it.'
  })
}

export function ensureWorldSpec(game, spec) {
  const base = spec?.runtime === 'world' ? spec : chooseWorld(game?.name || 'block world')
  const size = game?.difficulty === 'easy' ? 'small' : game?.difficulty === 'hard' ? 'large' : (base.worldSize || 'medium')
  return worldSpecFromFields({
    ...base,
    ...game,
    name: game?.name && game.name.length >= 2 ? game.name : (base.name || 'Block World'),
    difficulty: game?.difficulty || base.difficulty || 'normal',
    worldSize: spec?.runtime === 'world' && game?.difficulty ? size : (base.worldSize || size),
    biome: base.biome,
    structure: base.structure,
    terrainSeed: base.terrainSeed,
    palette: base.palette,
    goal: base.goal,
    theme: base.theme
  })
}

export function generateWorldIdea(prompt) {
  const choice = chooseWorld(prompt)
  const spec = worldSpecFromFields({ ...choice, duration: 60, difficulty: 'normal' })
  const game = {
    name: spec.name,
    description: spec.description,
    type: 'world',
    duration: spec.duration,
    accent: spec.accent,
    generation: 'rule-based-template',
    notice: 'This is a shared block world. Everyone who opens it edits the same place.'
  }
  return {
    mode: 'template',
    provider: null,
    model: null,
    game,
    spec,
    notice: game.notice,
    tier: 'spec',
    html: null,
    tierReason: 'Block world. This idea uses the shared voxel runtime.'
  }
}

export function lookFor(id) {
  if (id === 'blocks-candy-moon') {
    return { biome: 'candy', terrainSeed: 9041, worldSize: 'medium', structure: 'pyramid' }
  }
  return { biome: 'grassland', terrainSeed: 1107, worldSize: 'medium', structure: 'tower' }
}

export function featuredWorlds() {
  const grassCopy = goalCopy(worldFromSpec({ biome: 'grassland', terrainSeed: 1107, worldSize: 'medium', structure: 'tower' }))
  const candyCopy = goalCopy(worldFromSpec({ biome: 'candy', terrainSeed: 9041, worldSize: 'medium', structure: 'pyramid' }))
  const grassland = worldSpecFromFields({
    name: 'Blocks: Grassland',
    description: grassCopy.description,
    theme: 'grassland blocks',
    biome: 'grassland',
    terrainSeed: 1107,
    worldSize: 'medium',
    structure: 'tower',
    goal: grassCopy.goal,
    duration: 60,
    difficulty: 'normal',
    accent: PALETTES.grassland[0],
    palette: PALETTES.grassland
  })
  const candy = worldSpecFromFields({
    name: 'Blocks: Candy Moon',
    description: candyCopy.description,
    theme: 'candy moon',
    biome: 'candy',
    terrainSeed: 9041,
    worldSize: 'medium',
    structure: 'pyramid',
    goal: candyCopy.goal,
    duration: 60,
    difficulty: 'normal',
    accent: PALETTES.candy[0],
    palette: PALETTES.candy
  })
  return [
    { id: 'blocks-grassland', name: grassland.name, description: grassland.description, type: 'world', duration: 60, accent: grassland.accent, spec: grassland, featured: true },
    { id: 'blocks-candy-moon', name: candy.name, description: candy.description, type: 'world', duration: 60, accent: candy.accent, spec: candy, featured: true }
  ]
}
