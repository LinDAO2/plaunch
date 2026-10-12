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

const KEYS = ['version', 'name', 'description', 'theme', 'runtime', 'duration', 'accent', 'scoring', 'difficulty', 'controls', 'safety', 'palette', 'biome', 'terrainSeed', 'worldSize', 'structure', 'goal', 'blockSet', 'terrain', 'prefabs', 'quests', 'npcs', 'music', 'cycle']
const DIFFICULTIES = ['easy', 'normal', 'hard']
const TEXTURES = ['solid', 'speckle', 'stripe', 'brick', 'dots']
const SKIES = ['day', 'dusk', 'night', 'cycle']
const QUEST_KINDS = ['collect', 'build', 'find', 'race', 'survive']
const PREFAB_KINDS = ['tower', 'house', 'pyramid', 'bridge', 'arch', 'beacon']
const MOODS = ['bright', 'calm', 'playful', 'night', 'tense']
const NPCS = {
  grassland: ['Bramble', 'Keeps the meadow and waves at builders.'],
  desert: ['Dune', 'Trades clay pots for stories.'],
  snow: ['Frost', 'Marks the safe path between drifts.'],
  candy: ['Sprinkle', 'Hides sweets under the pink hills.'],
  moon: ['Lumen', 'Hums when the beacon is lit.']
}

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
  const islands = /island|isle|atoll|archipelago|sky island/.test(p)
  const caves = /\bcaves?\b|\bcaverns?\b|\bmining\b|underground/.test(p)
  const sky = biome === 'moon' || /night/.test(p) ? 'night' : /dusk|sunset/.test(p) ? 'dusk' : /day and night|\bcycle\b/.test(p) ? 'cycle' : 'day'
  const questKind = /race/.test(p) ? 'race' : /survive/.test(p) ? 'survive' : /find|treasure|seek/.test(p) ? 'find' : /collect|gather|gem|spark/.test(p) ? 'collect' : 'build'
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
    goal,
    terrain: { islands, caves, sky },
    cycle: sky,
    music: musicFor(p, biome),
    quests: [{ kind: questKind, text: goal }],
    prefabs: prefabsFor(p, structure),
    npcs: [{ name: NPCS[biome][0], flavor: NPCS[biome][1] }],
    blockSet: defaultBlockSet(biome, PALETTES[biome])
  }
}

function musicFor(prompt, biome) {
  if (/spooky|horror|tense/.test(prompt)) return 'tense'
  if (/calm|quiet|soft|peace/.test(prompt)) return 'calm'
  if (biome === 'candy') return 'playful'
  if (biome === 'moon' || /night/.test(prompt)) return 'night'
  return 'bright'
}

function prefabsFor(prompt, structure) {
  const list = []
  if (PREFAB_KINDS.includes(structure)) list.push({ kind: structure })
  if (/beacon|lighthouse|glow/.test(prompt)) list.push({ kind: 'beacon' })
  if (/bridge/.test(prompt)) list.push({ kind: 'bridge' })
  if (/arch/.test(prompt)) list.push({ kind: 'arch' })
  return list.slice(0, 6)
}

function defaultBlockSet(biome, palette) {
  const names = {
    grassland: ['Turf', 'Soil', 'Rock', 'Pool'],
    desert: ['Dune', 'Clay', 'Rock', 'Pool'],
    snow: ['Frost', 'Rock', 'Timber', 'Pool'],
    candy: ['Candy', 'Petal', 'Glow', 'Pool'],
    moon: ['Rock', 'Frost', 'Glow', 'Pool']
  }
  const textures = ['speckle', 'brick', 'solid', 'solid']
  return (names[biome] || names.grassland).map((name, index) => ({
    name,
    color: palette[index] || palette[0],
    texture: textures[index]
  }))
}

function readBlockSet(value, spec) {
  if (value === undefined) return defaultBlockSet(spec.biome, spec.palette)
  if (!Array.isArray(value) || value.length < 1 || value.length > 8) throw new Error('blockSet must be 1–8 blocks')
  return value.map((block, index) => {
    if (!isObject(block)) throw new Error(`blockSet[${index}] must be an object`)
    assertOnly(block, ['name', 'color', 'texture'], `blockSet[${index}]`)
    const texture = block.texture === undefined ? 'speckle' : block.texture
    if (!TEXTURES.includes(texture)) throw new Error(`blockSet[${index}].texture is invalid`)
    return {
      name: text(block.name, `blockSet[${index}].name`, 1, 24),
      color: hex(block.color, `blockSet[${index}].color`),
      texture
    }
  })
}

function readTerrain(value) {
  if (value === undefined) return { islands: false, caves: false, sky: 'cycle' }
  if (!isObject(value)) throw new Error('terrain must be an object')
  assertOnly(value, ['islands', 'caves', 'sky'], 'terrain')
  const sky = value.sky === undefined ? 'cycle' : value.sky
  if (!SKIES.includes(sky)) throw new Error('terrain.sky is invalid')
  if (value.islands !== undefined && typeof value.islands !== 'boolean') throw new Error('terrain.islands must be a boolean')
  if (value.caves !== undefined && typeof value.caves !== 'boolean') throw new Error('terrain.caves must be a boolean')
  return { islands: value.islands === true, caves: value.caves === true, sky }
}

function readPrefabs(value) {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > 6) throw new Error('prefabs must be 0–6 items')
  return value.map((item, index) => {
    if (!isObject(item)) throw new Error(`prefabs[${index}] must be an object`)
    assertOnly(item, ['kind'], `prefabs[${index}]`)
    if (!PREFAB_KINDS.includes(item.kind)) throw new Error(`prefabs[${index}].kind is invalid`)
    return { kind: item.kind }
  })
}

function readQuests(value, spec) {
  if (value === undefined) {
    return [
      { kind: 'build', text: spec.goal },
      { kind: 'collect', text: 'Gather the sparks.' }
    ]
  }
  if (!Array.isArray(value) || value.length < 1 || value.length > 4) throw new Error('quests must be 1–4 items')
  return value.map((item, index) => {
    if (!isObject(item)) throw new Error(`quests[${index}] must be an object`)
    assertOnly(item, ['kind', 'text'], `quests[${index}]`)
    if (!QUEST_KINDS.includes(item.kind)) throw new Error(`quests[${index}].kind is invalid`)
    return { kind: item.kind, text: text(item.text, `quests[${index}].text`, 1, 120) }
  })
}

function readNpcs(value, biome) {
  if (value === undefined) {
    const pair = NPCS[biome] || NPCS.grassland
    return [{ name: pair[0], flavor: pair[1] }]
  }
  if (!Array.isArray(value) || value.length > 4) throw new Error('npcs must be 0–4 items')
  return value.map((item, index) => {
    if (!isObject(item)) throw new Error(`npcs[${index}] must be an object`)
    assertOnly(item, ['name', 'flavor'], `npcs[${index}]`)
    return {
      name: text(item.name, `npcs[${index}].name`, 1, 24),
      flavor: text(item.flavor, `npcs[${index}].flavor`, 1, 120)
    }
  })
}

function clip(value, min, max) {
  if (typeof value !== 'string') return ''
  const clean = value.replace(/[\u0000-\u001F\u007F]/g, '').trim()
  if (clean.length < min) return ''
  return clean.slice(0, max)
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
  const spec = {
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
  spec.blockSet = readBlockSet(input.blockSet, spec)
  spec.terrain = readTerrain(input.terrain)
  spec.prefabs = readPrefabs(input.prefabs)
  spec.quests = readQuests(input.quests, spec)
  spec.npcs = readNpcs(input.npcs, spec.biome)
  spec.music = readMusic(input.music, spec.biome)
  spec.cycle = readCycle(input.cycle, spec.terrain.sky)
  return spec
}

function readMusic(value, biome) {
  if (value === undefined) return biome === 'candy' ? 'playful' : biome === 'moon' ? 'night' : 'bright'
  const clean = text(value, 'music', 1, 40).toLowerCase()
  if (MOODS.includes(clean)) return clean
  if (/calm|soft|peace|quiet/.test(clean)) return 'calm'
  if (/night|moon|dark/.test(clean)) return 'night'
  if (/play|candy|sweet/.test(clean)) return 'playful'
  if (/tense|spook|horror/.test(clean)) return 'tense'
  return 'bright'
}

function readCycle(value, sky) {
  if (value === undefined) return SKIES.includes(sky) ? sky : 'cycle'
  if (!SKIES.includes(value)) throw new Error('cycle is invalid')
  return value
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
    goal: game.goal || 'Shape this world. Everyone here shares it.',
    blockSet: game.blockSet,
    terrain: game.terrain,
    prefabs: game.prefabs,
    quests: game.quests,
    npcs: game.npcs,
    music: game.music,
    cycle: game.cycle
  })
}

export function repairWorldSpec(raw, prompt = '') {
  const base = chooseWorld(prompt || (isObject(raw) ? raw.name : '') || 'block world')
  const src = isObject(raw) ? raw : {}
  const biome = BIOMES.includes(src.biome) ? src.biome : base.biome
  const structure = STRUCTURES.includes(src.structure) ? src.structure : base.structure
  const worldSize = Object.prototype.hasOwnProperty.call(WORLD_SIZES, src.worldSize) ? src.worldSize : base.worldSize
  let terrainSeed = Number(src.terrainSeed)
  if (!Number.isInteger(terrainSeed) || terrainSeed < 0 || terrainSeed > 1_000_000_000) terrainSeed = base.terrainSeed
  const palette = Array.isArray(src.palette)
    ? src.palette.filter((color) => /^#[0-9a-fA-F]{6}$/.test(String(color))).map((color) => String(color).toLowerCase()).slice(0, 6)
    : []
  const sky = SKIES.includes(src.cycle) ? src.cycle : SKIES.includes(src.terrain?.sky) ? src.terrain.sky : base.cycle
  const quests = Array.isArray(src.quests) ? src.quests.filter((item) => isObject(item) && QUEST_KINDS.includes(item.kind)).slice(0, 4) : base.quests
  const prefabs = Array.isArray(src.prefabs) ? src.prefabs.filter((item) => isObject(item) && PREFAB_KINDS.includes(item.kind)).slice(0, 6) : base.prefabs
  const npcs = Array.isArray(src.npcs) ? src.npcs.filter((item) => isObject(item)).slice(0, 4) : base.npcs
  const blockSet = Array.isArray(src.blockSet) ? src.blockSet.filter((item) => isObject(item)).slice(0, 8) : base.blockSet
  try {
    return validateWorldSpec({
      version: '1.2',
      name: clip(src.name, 2, 45) || base.name,
      description: clip(src.description, 0, 180) || base.description,
      theme: clip(src.theme, 1, 80) || `${biome} blocks`,
      runtime: 'world',
      duration: 60,
      accent: /^#[0-9a-fA-F]{6}$/.test(String(src.accent || '')) ? String(src.accent).toLowerCase() : (palette[0] || base.accent),
      scoring: { direction: 'higher', label: 'Blocks', unit: 'placed' },
      difficulty: DIFFICULTIES.includes(src.difficulty) ? src.difficulty : 'normal',
      controls: CONTROLS,
      safety: { audience: 'general', notes: 'Shared world. The server checks every edit.' },
      palette: palette.length >= 2 ? palette : PALETTES[biome],
      biome,
      terrainSeed,
      worldSize,
      structure,
      goal: clip(src.goal, 1, 140) || base.goal,
      blockSet,
      terrain: {
        islands: typeof src.terrain?.islands === 'boolean' ? src.terrain.islands : base.terrain.islands,
        caves: typeof src.terrain?.caves === 'boolean' ? src.terrain.caves : base.terrain.caves,
        sky
      },
      prefabs,
      quests: quests.length ? quests : base.quests,
      npcs,
      music: clip(src.music, 1, 40) || base.music,
      cycle: sky
    })
  } catch {
    return worldSpecFromFields({ ...base, duration: 60, difficulty: 'normal' })
  }
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
    theme: base.theme,
    blockSet: base.blockSet,
    terrain: base.terrain,
    prefabs: base.prefabs,
    quests: base.quests,
    npcs: base.npcs,
    music: base.music,
    cycle: base.cycle
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
