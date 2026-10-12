import { generateWorldIdea, repairWorldSpec } from '../blocks/spec.js'
import { aiStatus, parseModelJson, requestModelText } from './generate.js'
import { resolveProviderChain } from './providers.js'

const WORLD_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['version', 'name', 'description', 'theme', 'runtime', 'biome', 'terrainSeed', 'worldSize', 'structure', 'goal', 'palette', 'accent', 'terrain', 'blockSet', 'prefabs', 'quests', 'npcs', 'music', 'cycle'],
  properties: {
    version: { type: 'string' },
    name: { type: 'string' },
    description: { type: 'string' },
    theme: { type: 'string' },
    runtime: { type: 'string' },
    biome: { type: 'string' },
    terrainSeed: { type: 'integer' },
    worldSize: { type: 'string' },
    structure: { type: 'string' },
    goal: { type: 'string' },
    palette: { type: 'array', items: { type: 'string' } },
    accent: { type: 'string' },
    terrain: {
      type: 'object',
      additionalProperties: false,
      required: ['islands', 'caves', 'sky', 'landform'],
      properties: {
        islands: { type: 'boolean' },
        caves: { type: 'boolean' },
        sky: { type: 'string' },
        landform: { type: 'string' }
      }
    },
    blockSet: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'color', 'texture'],
        properties: {
          name: { type: 'string' },
          color: { type: 'string' },
          texture: { type: 'string' }
        }
      }
    },
    prefabs: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['kind'],
        properties: { kind: { type: 'string' } }
      }
    },
    quests: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['kind', 'text'],
        properties: {
          kind: { type: 'string' },
          text: { type: 'string' }
        }
      }
    },
    npcs: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'flavor'],
        properties: {
          name: { type: 'string' },
          flavor: { type: 'string' }
        }
      }
    },
    music: { type: 'string' },
    cycle: { type: 'string' }
  }
}

const WORLD_PROMPT = `You design one shared Minecraft-style voxel world for a browser. Return JSON only, matching the schema.
Rules:
- version is "1.2" and runtime is "world"
- biome is grassland, desert, snow, candy, or moon
- structure is tower, house, pyramid, or none
- worldSize is small, medium, or large
- terrainSeed is an integer from 1 to 100000
- terrain.islands and terrain.caves are booleans. terrain.sky is day, dusk, night, or cycle
- terrain.landform is rolling, forest, mountains, lake, beach, peaks, or canyon. Match the idea: forest, mountains with a lake, beach, snowy peaks, or desert canyon must not all become rolling grassland
- cycle matches terrain.sky
- palette is 2 to 6 #RRGGBB colors. accent is one of them
- blockSet is 2 to 6 blocks. texture is solid, speckle, stripe, brick, or dots
- Prefer block names Turf, Soil, Rock, Dune, Pool, Timber, Canopy, Petal, Candy, Frost, Clay, Glow
- prefabs are 0 to 4 of tower, house, pyramid, bridge, arch, beacon
- quests are 1 to 3 of collect, build, find, race, survive. Keep them friendly
- npcs are 0 to 2 friendly characters with a one-sentence flavor. No violence
- music is bright, calm, playful, night, or tense
- goal is one sentence about the shared build
- No code, URLs, trademarks, or executable text`

function ideaFrom(spec, extra = {}) {
  const idea = generateWorldIdea(spec.name || 'block world')
  idea.spec = spec
  idea.game = {
    ...idea.game,
    name: spec.name,
    description: spec.description,
    accent: spec.accent,
    duration: spec.duration,
    generation: extra.provider ? 'ai' : 'rule-based-template'
  }
  idea.provider = extra.provider || null
  idea.model = extra.model || null
  idea.mode = extra.provider ? 'ai' : 'template'
  idea.fallback = Boolean(extra.fallback)
  idea.tierReason = extra.provider
    ? 'Block world written by the model and checked against the world schema.'
    : 'Block world. This idea uses the shared voxel runtime.'
  return idea
}

export async function generateWorldFromPrompt({ prompt, env, fetchImpl, onProgress }) {
  const rule = () => ideaFrom(repairWorldSpec(null, prompt), { fallback: aiStatus(env).mode === 'ai' })
  if (aiStatus(env).mode !== 'ai') return ideaFrom(repairWorldSpec(null, prompt))
  const chain = resolveProviderChain(env, 'spec')
  if (!chain.length) return rule()
  onProgress?.({ phase: 'writing', outputTokens: 0, label: 'Writing the world…' })
  try {
    const text = await requestModelText(chain[0], [
      { role: 'system', content: WORLD_PROMPT },
      { role: 'user', content: `Player idea:\n${String(prompt || '').slice(0, 600)}` }
    ], fetchImpl, {
      schema: WORLD_SCHEMA,
      maxOutputTokens: 1600,
      fallbacks: chain.slice(1),
      onProgress
    })
    const spec = repairWorldSpec(parseModelJson(text), prompt)
    return ideaFrom(spec, { provider: chain[0].id, model: chain[0].model })
  } catch {
    return rule()
  }
}
