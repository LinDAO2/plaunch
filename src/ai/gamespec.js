const CLASSIC = ['tap', 'reaction', 'guess', 'dodge']
const RUNTIMES = [...CLASSIC, 'arcade']
const DIFFICULTIES = ['easy', 'normal', 'hard']
const V1_KINDS = ['target', 'obstacle', 'player', 'signal']
const V11_KINDS = [...V1_KINDS, 'hazard', 'collectible']
const PATTERNS = ['rain', 'waves', 'burst', 'lanes']
const MOVEMENTS = ['straight', 'zigzag', 'homing', 'bounce']
const SCHEMES = ['drag', 'tap', 'keys']
const WINS = ['survive', 'score', 'lives']
const SHAPES = ['circle', 'square', 'triangle']
const BANNED_KEY = /^(script|code|js|javascript|html|eval|srcdoc|onclick)$/i
const BANNED_TEXT = /<\s*\/?\s*script|javascript:/i
const SPEC_KEYS = ['version', 'name', 'description', 'theme', 'runtime', 'duration', 'accent', 'scoring', 'difficulty', 'controls', 'entities', 'spawn', 'safety']
const V11_KEYS = [...SPEC_KEYS, 'movement', 'rules', 'scoreRules', 'palette', 'player']

const SCORING = {
  tap: { direction: 'higher', label: 'Score', unit: 'taps' },
  reaction: { direction: 'lower', label: 'Reaction', unit: 'ms' },
  guess: { direction: 'higher', label: 'Score', unit: 'pts' },
  dodge: { direction: 'higher', label: 'Score', unit: 'pts' },
  arcade: { direction: 'higher', label: 'Score', unit: 'pts' }
}

const CONTROLS = {
  tap: { keyboard: 'Enter or click the button', touch: 'Tap the button' },
  reaction: { keyboard: 'Press the button when the signal turns green', touch: 'Tap when the signal turns green' },
  guess: { keyboard: 'Type a number from 1 to 10 and press Enter', touch: 'Type a number and tap Guess' },
  dodge: { keyboard: 'Arrow keys or A and D', touch: 'On-screen left and right buttons' },
  arcade: { keyboard: 'Arrow keys or A and D', touch: 'Drag across the arena', scheme: 'keys' }
}

const ENTITIES = {
  tap: [{ kind: 'target', label: 'Button' }],
  reaction: [{ kind: 'signal', label: 'Signal' }],
  guess: [{ kind: 'target', label: 'Secret number' }],
  dodge: [{ kind: 'player', label: 'Player' }, { kind: 'obstacle', label: 'Meteor' }]
}

function rejectExecutable(value, path = 'spec') {
  if (Array.isArray(value)) {
    value.forEach((item, index) => rejectExecutable(item, `${path}[${index}]`))
    return
  }
  if (!value || typeof value !== 'object') return
  for (const [key, child] of Object.entries(value)) {
    if (BANNED_KEY.test(key)) throw new Error(`Executable field "${key}" is not allowed`)
    if (typeof child === 'string' && BANNED_TEXT.test(child)) {
      throw new Error(`Executable content is not allowed at ${path}.${key}`)
    }
    rejectExecutable(child, `${path}.${key}`)
  }
}

function isObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function assertOnly(obj, keys, label) {
  for (const key of Object.keys(obj)) {
    if (!keys.includes(key)) throw new Error(`${label} has unexpected field ${key}`)
  }
}

function stringField(value, label, min, max) {
  if (typeof value !== 'string') throw new Error(`${label} must be a string`)
  const text = value.replace(/[\u0000-\u001F\u007F]/g, '').trim()
  if (text.length < min || text.length > max) throw new Error(`${label} must be ${min}–${max} characters`)
  return text
}

function hexColor(value, label) {
  const color = typeof value === 'string' ? value.trim() : ''
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) throw new Error(`${label} must be a #RRGGBB color`)
  return color.toLowerCase()
}

// Schema sent to Gemini. JSON Schema subset: no $ref, oneOf, anyOf, pattern, or minLength.
export function geminiResponseSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['version', 'name', 'description', 'theme', 'runtime', 'duration', 'accent', 'scoring', 'difficulty', 'controls', 'entities', 'spawn', 'safety'],
    properties: {
      version: { type: 'string', enum: ['1', '1.1'], description: 'Use 1.1 for a new arcade game.' },
      name: { type: 'string', description: 'Short game title, 2 to 45 characters.' },
      description: { type: 'string', description: 'One sentence, up to 180 characters.' },
      theme: { type: 'string', description: 'Visual theme, up to 80 characters.' },
      runtime: { type: 'string', enum: RUNTIMES, description: 'Use arcade for a new game.' },
      duration: { type: 'integer', minimum: 5, maximum: 60 },
      accent: { type: 'string', description: 'Hex color like #a88bff.' },
      scoring: {
        type: 'object',
        additionalProperties: false,
        required: ['direction', 'label', 'unit'],
        properties: {
          direction: { type: 'string', enum: ['higher', 'lower'], description: 'higher for arcade. lower only for reaction.' },
          label: { type: 'string' },
          unit: { type: 'string' }
        }
      },
      difficulty: { type: 'string', enum: DIFFICULTIES },
      controls: {
        type: 'object',
        additionalProperties: false,
        required: ['keyboard', 'touch'],
        properties: {
          keyboard: { type: 'string' },
          touch: { type: 'string' },
          scheme: { type: 'string', enum: SCHEMES, description: 'drag, tap, or keys.' }
        }
      },
      entities: {
        type: 'array',
        maxItems: 8,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['kind', 'label'],
          properties: {
            kind: { type: 'string', enum: V11_KINDS },
            label: { type: 'string' },
            sprite: { type: 'string', description: 'One emoji.' },
            points: { type: 'integer', minimum: 0, maximum: 100 },
            speed: { type: 'number', minimum: 0.2, maximum: 3 },
            shape: { type: 'string', enum: SHAPES }
          }
        }
      },
      spawn: {
        type: 'object',
        additionalProperties: false,
        required: ['rate'],
        properties: {
          rate: { type: 'number', minimum: 0, maximum: 5 },
          pattern: { type: 'string', enum: PATTERNS, description: 'rain, waves, burst (a random burst), or lanes.' }
        }
      },
      safety: {
        type: 'object',
        additionalProperties: false,
        required: ['audience'],
        properties: {
          audience: { type: 'string', enum: ['general'] },
          notes: { type: 'string' }
        }
      },
      movement: { type: 'string', enum: MOVEMENTS },
      rules: {
        type: 'object',
        additionalProperties: false,
        properties: {
          win: { type: 'string', enum: WINS },
          seconds: { type: 'integer', minimum: 5, maximum: 60 },
          lives: { type: 'integer', minimum: 1, maximum: 9 },
          targetScore: { type: 'integer', minimum: 1, maximum: 5000 }
        }
      },
      scoreRules: {
        type: 'object',
        additionalProperties: false,
        properties: {
          pointsPerEntity: { type: 'integer', minimum: 1, maximum: 100 },
          comboMultiplier: { type: 'integer', minimum: 1, maximum: 5 }
        }
      },
      palette: {
        type: 'array',
        maxItems: 6,
        items: { type: 'string', description: 'Hex color like #a88bff.' }
      },
      player: {
        type: 'object',
        additionalProperties: false,
        properties: {
          sprite: { type: 'string', description: 'One emoji for the player.' },
          scheme: { type: 'string', enum: SCHEMES }
        }
      }
    }
  }
}

function readEntities(input, kinds, modern) {
  if (!Array.isArray(input.entities) || input.entities.length < 1 || input.entities.length > 8) {
    throw new Error('Game spec entities are invalid')
  }
  return input.entities.map((entity, index) => {
    if (!isObject(entity)) throw new Error(`entities[${index}] must be an object`)
    const keys = modern ? ['kind', 'label', 'sprite', 'points', 'speed', 'shape'] : ['kind', 'label']
    assertOnly(entity, keys, `entities[${index}]`)
    if (!kinds.includes(entity.kind)) throw new Error(`entities[${index}].kind is invalid`)
    const out = { kind: entity.kind, label: stringField(entity.label, `entities[${index}].label`, 1, 40) }
    if (!modern) return out
    out.sprite = entity.sprite === undefined ? '' : stringField(entity.sprite, `entities[${index}].sprite`, 1, 8)
    if (entity.points === undefined) out.points = entity.kind === 'hazard' || entity.kind === 'obstacle' ? 0 : 10
    else {
      const points = Number(entity.points)
      if (!Number.isInteger(points) || points < 0 || points > 100) throw new Error(`entities[${index}].points must be 0–100`)
      out.points = points
    }
    if (entity.speed === undefined) out.speed = 1
    else {
      const speed = Number(entity.speed)
      if (!Number.isFinite(speed) || speed < 0.2 || speed > 3) throw new Error(`entities[${index}].speed must be 0.2–3`)
      out.speed = speed
    }
    if (entity.shape === undefined) out.shape = 'circle'
    else if (!SHAPES.includes(entity.shape)) throw new Error(`entities[${index}].shape is invalid`)
    else out.shape = entity.shape
    return out
  })
}

function readRules(input, duration, required) {
  if (!isObject(input.rules)) {
    if (required) throw new Error('rules are required for arcade')
    return { win: 'survive', seconds: duration, lives: 3, targetScore: 40 }
  }
  assertOnly(input.rules, ['win', 'seconds', 'lives', 'targetScore'], 'rules')
  const win = input.rules.win || (required ? '' : 'survive')
  if (!WINS.includes(win)) throw new Error('rules.win is invalid')
  const seconds = input.rules.seconds === undefined ? duration : Number(input.rules.seconds)
  if (!Number.isInteger(seconds) || seconds < 5 || seconds > 60) throw new Error('rules.seconds must be 5–60')
  const lives = input.rules.lives === undefined ? 3 : Number(input.rules.lives)
  if (!Number.isInteger(lives) || lives < 1 || lives > 9) throw new Error('rules.lives must be 1–9')
  const targetScore = input.rules.targetScore === undefined ? 40 : Number(input.rules.targetScore)
  if (!Number.isInteger(targetScore) || targetScore < 1 || targetScore > 5000) throw new Error('rules.targetScore must be 1–5000')
  return { win, seconds, lives, targetScore }
}

function readScoreRules(input, required) {
  if (!isObject(input.scoreRules)) {
    if (required) throw new Error('scoreRules are required for arcade')
    return { pointsPerEntity: 10, comboMultiplier: 1 }
  }
  assertOnly(input.scoreRules, ['pointsPerEntity', 'comboMultiplier'], 'scoreRules')
  const pointsPerEntity = input.scoreRules.pointsPerEntity === undefined ? 10 : Number(input.scoreRules.pointsPerEntity)
  if (!Number.isInteger(pointsPerEntity) || pointsPerEntity < 1 || pointsPerEntity > 100) {
    throw new Error('scoreRules.pointsPerEntity must be 1–100')
  }
  const comboMultiplier = input.scoreRules.comboMultiplier === undefined ? 1 : Number(input.scoreRules.comboMultiplier)
  if (!Number.isInteger(comboMultiplier) || comboMultiplier < 1 || comboMultiplier > 5) {
    throw new Error('scoreRules.comboMultiplier must be 1–5')
  }
  return { pointsPerEntity, comboMultiplier }
}

function readPalette(input, accent, required) {
  if (input.palette === undefined) {
    if (required) throw new Error('palette is required for arcade')
    return [accent]
  }
  if (!Array.isArray(input.palette) || input.palette.length < 1 || input.palette.length > 6) {
    throw new Error('palette must contain 1–6 colors')
  }
  return input.palette.map((color, index) => hexColor(color, `palette[${index}]`))
}

export function validateGameSpec(input) {
  if (!isObject(input)) throw new Error('Game spec must be an object')
  if (JSON.stringify(input).length > 12000) throw new Error('Game spec is too large')
  rejectExecutable(input)
  const modern = input.version === '1.1'
  if (input.version !== '1' && !modern) throw new Error('Game spec version must be 1')
  assertOnly(input, modern ? V11_KEYS : SPEC_KEYS, 'Game spec')
  const runtime = input.runtime
  const allowed = modern ? RUNTIMES : CLASSIC
  if (!allowed.includes(runtime)) throw new Error('Game spec runtime is invalid')
  const arcade = runtime === 'arcade'
  if (!isObject(input.scoring)) throw new Error('Game spec scoring is required')
  assertOnly(input.scoring, ['direction', 'label', 'unit'], 'scoring')
  const expectedDirection = runtime === 'reaction' ? 'lower' : 'higher'
  if (input.scoring.direction !== expectedDirection) {
    throw new Error(`scoring.direction must be ${expectedDirection} for ${runtime}`)
  }
  if (!isObject(input.controls)) throw new Error('Game spec controls are required')
  assertOnly(input.controls, modern ? ['keyboard', 'touch', 'scheme'] : ['keyboard', 'touch'], 'controls')
  const scheme = input.controls.scheme || (arcade ? '' : 'keys')
  if (modern && input.controls.scheme !== undefined && !SCHEMES.includes(input.controls.scheme)) {
    throw new Error('controls.scheme is invalid')
  }
  if (arcade && !SCHEMES.includes(scheme)) throw new Error('controls.scheme is required for arcade')
  const entities = readEntities(input, modern ? V11_KINDS : V1_KINDS, modern)
  if (arcade && !entities.some((entity) => entity.kind !== 'player')) {
    throw new Error('arcade specs need a target, hazard, or collectible')
  }
  if (!isObject(input.spawn)) throw new Error('Game spec spawn is required')
  assertOnly(input.spawn, modern ? ['rate', 'pattern'] : ['rate'], 'spawn')
  const rate = Number(input.spawn.rate)
  if (!Number.isFinite(rate) || rate < 0 || rate > 5) throw new Error('spawn.rate must be from 0 to 5')
  const pattern = input.spawn.pattern || (arcade ? '' : 'rain')
  if (modern && input.spawn.pattern !== undefined && !PATTERNS.includes(input.spawn.pattern)) {
    throw new Error('spawn.pattern is invalid')
  }
  if (arcade && !PATTERNS.includes(pattern)) throw new Error('spawn.pattern is required for arcade')
  if (!isObject(input.safety)) throw new Error('Game spec safety is required')
  assertOnly(input.safety, ['audience', 'notes'], 'safety')
  if (input.safety.audience !== 'general') throw new Error('safety.audience must be general')
  if (!DIFFICULTIES.includes(input.difficulty)) throw new Error('Game spec difficulty is invalid')
  const duration = Number(input.duration)
  if (!Number.isInteger(duration) || duration < 5 || duration > 60) throw new Error('duration must be an integer from 5 to 60')
  const accent = hexColor(input.accent, 'accent')
  const notes = input.safety.notes === undefined ? '' : stringField(input.safety.notes, 'safety.notes', 0, 200)
  const movement = input.movement || (arcade ? '' : 'straight')
  if (modern && input.movement !== undefined && !MOVEMENTS.includes(input.movement)) throw new Error('movement is invalid')
  if (arcade && !MOVEMENTS.includes(movement)) throw new Error('movement is required for arcade')
  const base = {
    version: modern ? '1.1' : '1',
    name: stringField(input.name, 'name', 2, 45),
    description: stringField(input.description ?? '', 'description', 0, 180),
    theme: stringField(input.theme, 'theme', 1, 80),
    runtime,
    duration,
    accent,
    scoring: {
      direction: expectedDirection,
      label: stringField(input.scoring.label, 'scoring.label', 1, 40),
      unit: stringField(input.scoring.unit, 'scoring.unit', 1, 20)
    },
    difficulty: input.difficulty,
    controls: {
      keyboard: stringField(input.controls.keyboard, 'controls.keyboard', 1, 120),
      touch: stringField(input.controls.touch, 'controls.touch', 1, 120)
    },
    entities,
    spawn: { rate },
    safety: { audience: 'general', notes }
  }
  if (!modern) return base
  base.controls.scheme = SCHEMES.includes(scheme) ? scheme : 'keys'
  base.spawn.pattern = PATTERNS.includes(pattern) ? pattern : 'rain'
  base.movement = MOVEMENTS.includes(movement) ? movement : 'straight'
  base.rules = readRules(input, duration, arcade)
  base.scoreRules = readScoreRules(input, arcade)
  base.palette = readPalette(input, accent, arcade)
  const player = isObject(input.player) ? input.player : {}
  if (modern && input.player !== undefined) assertOnly(player, ['sprite', 'scheme'], 'player')
  const sprite = player.sprite === undefined ? (arcade ? '' : '●') : stringField(player.sprite, 'player.sprite', 1, 8)
  if (arcade && !sprite) throw new Error('player.sprite is required for arcade')
  if (player.scheme !== undefined && !SCHEMES.includes(player.scheme)) throw new Error('player.scheme is invalid')
  base.player = { sprite: sprite || '●', scheme: player.scheme || base.controls.scheme }
  return base
}

export function specFromGame(game, extras = {}) {
  const runtime = game.type || game.runtime
  if (runtime === 'arcade') return defaultArcadeSpec(game, extras)
  return validateGameSpec({
    version: '1',
    name: game.name,
    description: game.description || '',
    theme: extras.theme || runtime,
    runtime,
    duration: Number(game.duration),
    accent: game.accent,
    scoring: SCORING[runtime],
    difficulty: extras.difficulty || 'normal',
    controls: CONTROLS[runtime],
    entities: ENTITIES[runtime],
    spawn: { rate: extras.spawnRate ?? 1 },
    safety: { audience: 'general', notes: 'No executable content.' }
  })
}

function defaultArcadeSpec(game, extras) {
  const accent = typeof game.accent === 'string' && /^#[0-9a-fA-F]{6}$/.test(game.accent) ? game.accent : '#a88bff'
  const duration = Number(game.duration) || 20
  return validateGameSpec({
    version: '1.1',
    name: game.name,
    description: game.description || '',
    theme: extras.theme || 'arcade',
    runtime: 'arcade',
    duration,
    accent,
    scoring: SCORING.arcade,
    difficulty: extras.difficulty || 'normal',
    controls: CONTROLS.arcade,
    entities: [
      { kind: 'hazard', label: 'Hazard', sprite: '💥', points: 0, speed: 1.1, shape: 'circle' },
      { kind: 'collectible', label: 'Gem', sprite: '💎', points: 10, speed: 0.8, shape: 'circle' }
    ],
    spawn: { rate: extras.spawnRate ?? 1.2, pattern: 'rain' },
    movement: 'straight',
    rules: { win: 'survive', seconds: duration, lives: 3, targetScore: 40 },
    scoreRules: { pointsPerEntity: 10, comboMultiplier: 2 },
    palette: [accent, '#4adeb9', '#ffbd70'],
    player: { sprite: '🕹️', scheme: 'keys' },
    safety: { audience: 'general', notes: 'No executable content.' }
  })
}

export function gameFromSpec(spec) {
  return {
    name: spec.name,
    description: spec.description,
    type: spec.runtime,
    duration: spec.duration,
    accent: spec.accent,
    tokenInterest: false
  }
}
