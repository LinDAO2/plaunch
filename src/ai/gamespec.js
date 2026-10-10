const RUNTIMES = ['tap', 'reaction', 'guess', 'dodge']
const DIFFICULTIES = ['easy', 'normal', 'hard']
const ENTITY_KINDS = ['target', 'obstacle', 'player', 'signal']
const BANNED_KEY = /^(script|code|js|javascript|html|eval|srcdoc|onclick)$/i
const BANNED_TEXT = /<\s*\/?\s*script|javascript:/i

const SCORING = {
  tap: { direction: 'higher', label: 'Score', unit: 'taps' },
  reaction: { direction: 'lower', label: 'Reaction', unit: 'ms' },
  guess: { direction: 'higher', label: 'Score', unit: 'pts' },
  dodge: { direction: 'higher', label: 'Score', unit: 'pts' }
}

const CONTROLS = {
  tap: { keyboard: 'Enter or click the button', touch: 'Tap the button' },
  reaction: { keyboard: 'Press the button when the signal turns green', touch: 'Tap when the signal turns green' },
  guess: { keyboard: 'Type a number from 1 to 10 and press Enter', touch: 'Type a number and tap Guess' },
  dodge: { keyboard: 'Arrow keys or A and D', touch: 'On-screen left and right buttons' }
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

// Schema sent to Gemini. JSON Schema subset: no $ref, oneOf, anyOf, pattern, or minLength.
export function geminiResponseSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['version', 'name', 'description', 'theme', 'runtime', 'duration', 'accent', 'scoring', 'difficulty', 'controls', 'entities', 'spawn', 'safety'],
    properties: {
      version: { type: 'string', enum: ['1'], description: 'Spec version. Always 1.' },
      name: { type: 'string', description: 'Short game title, 2 to 45 characters.' },
      description: { type: 'string', description: 'One sentence, up to 180 characters.' },
      theme: { type: 'string', description: 'Visual theme, up to 80 characters.' },
      runtime: { type: 'string', enum: RUNTIMES, description: 'One of the four built-in mechanics.' },
      duration: { type: 'integer', minimum: 5, maximum: 60 },
      accent: { type: 'string', description: 'Hex color like #a88bff.' },
      scoring: {
        type: 'object',
        additionalProperties: false,
        required: ['direction', 'label', 'unit'],
        properties: {
          direction: { type: 'string', enum: ['higher', 'lower'], description: 'lower only for reaction.' },
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
          touch: { type: 'string' }
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
            kind: { type: 'string', enum: ENTITY_KINDS },
            label: { type: 'string' }
          }
        }
      },
      spawn: {
        type: 'object',
        additionalProperties: false,
        required: ['rate'],
        properties: {
          rate: { type: 'number', minimum: 0, maximum: 5 }
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
      }
    }
  }
}

export function validateGameSpec(input) {
  if (!isObject(input)) throw new Error('Game spec must be an object')
  if (JSON.stringify(input).length > 8000) throw new Error('Game spec is too large')
  rejectExecutable(input)
  assertOnly(input, ['version', 'name', 'description', 'theme', 'runtime', 'duration', 'accent', 'scoring', 'difficulty', 'controls', 'entities', 'spawn', 'safety'], 'Game spec')
  if (input.version !== '1') throw new Error('Game spec version must be 1')
  const runtime = input.runtime
  if (!RUNTIMES.includes(runtime)) throw new Error('Game spec runtime is invalid')
  if (!isObject(input.scoring)) throw new Error('Game spec scoring is required')
  assertOnly(input.scoring, ['direction', 'label', 'unit'], 'scoring')
  const expectedDirection = runtime === 'reaction' ? 'lower' : 'higher'
  if (input.scoring.direction !== expectedDirection) {
    throw new Error(`scoring.direction must be ${expectedDirection} for ${runtime}`)
  }
  if (!isObject(input.controls)) throw new Error('Game spec controls are required')
  assertOnly(input.controls, ['keyboard', 'touch'], 'controls')
  if (!Array.isArray(input.entities) || input.entities.length > 8) throw new Error('Game spec entities are invalid')
  const entities = input.entities.map((entity, index) => {
    if (!isObject(entity)) throw new Error(`entities[${index}] must be an object`)
    assertOnly(entity, ['kind', 'label'], `entities[${index}]`)
    if (!ENTITY_KINDS.includes(entity.kind)) throw new Error(`entities[${index}].kind is invalid`)
    return { kind: entity.kind, label: stringField(entity.label, `entities[${index}].label`, 1, 40) }
  })
  if (!isObject(input.spawn)) throw new Error('Game spec spawn is required')
  assertOnly(input.spawn, ['rate'], 'spawn')
  const rate = Number(input.spawn.rate)
  if (!Number.isFinite(rate) || rate < 0 || rate > 5) throw new Error('spawn.rate must be from 0 to 5')
  if (!isObject(input.safety)) throw new Error('Game spec safety is required')
  assertOnly(input.safety, ['audience', 'notes'], 'safety')
  if (input.safety.audience !== 'general') throw new Error('safety.audience must be general')
  if (!DIFFICULTIES.includes(input.difficulty)) throw new Error('Game spec difficulty is invalid')
  const duration = Number(input.duration)
  if (!Number.isInteger(duration) || duration < 5 || duration > 60) throw new Error('duration must be an integer from 5 to 60')
  const accent = typeof input.accent === 'string' ? input.accent.trim() : ''
  if (!/^#[0-9a-fA-F]{6}$/.test(accent)) throw new Error('accent must be a #RRGGBB color')
  const notes = input.safety.notes === undefined ? '' : stringField(input.safety.notes, 'safety.notes', 0, 200)
  return {
    version: '1',
    name: stringField(input.name, 'name', 2, 45),
    description: stringField(input.description ?? '', 'description', 0, 180),
    theme: stringField(input.theme, 'theme', 1, 80),
    runtime,
    duration,
    accent: accent.toLowerCase(),
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
}

export function specFromGame(game, extras = {}) {
  const runtime = game.type || game.runtime
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
