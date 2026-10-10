import { HttpError } from '../errors.js'
import { generateWorldIdea, wantsWorld } from '../blocks/spec.js'
import { heuristicTier } from './classify.js'
import { generateFreeform } from './freeform.js'
import { generateTemplateGame } from '../templates/generate.js'
import { aiStatus, generateGame, requestModelText } from './generate.js'
import { resolveProvider } from './providers.js'

const TIER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['tier'],
  properties: {
    tier: { type: 'string', description: 'spec or freeform' }
  }
}

const TIER_PROMPT = `You choose a generator tier for one game idea. Return JSON only: {"tier":"spec"} or {"tier":"freeform"}.
Use spec only when a simple arcade runtime can play it: tap, click, reaction, guess, dodge, falling objects, whack-a-mole, chase, shooting upward, a short platform jump, or a maze.
Use freeform when the idea needs custom rules, physics, levels, a runner, a board, cards, a story, or anything that runtime cannot express.
Prefer freeform when you are unsure.`

async function classifyWithModel(prompt, env, fetchImpl) {
  const provider = resolveProvider(env)
  const raw = await requestModelText(provider, [
    { role: 'system', content: TIER_PROMPT },
    { role: 'user', content: `Player idea:\n${prompt}` }
  ], fetchImpl, { schema: TIER_SCHEMA, maxOutputTokens: 64, noRetry: true })
  let tier = ''
  try {
    tier = JSON.parse(String(raw).trim()).tier
  } catch {
    tier = ''
  }
  return tier === 'spec' || tier === 'freeform' ? tier : 'freeform'
}

export async function generateIdea({ prompt, tier, env, fetchImpl }) {
  const explicit = tier === 'spec' || tier === 'freeform' || tier === undefined || tier === null || tier === '' || tier === 'auto'
    ? (tier === 'spec' || tier === 'freeform' ? tier : 'auto')
    : null
  if (!explicit) throw new HttpError(400, 'Generator tier must be auto, spec, or freeform', 'validation_error')
  if (wantsWorld(prompt) && explicit !== 'freeform') return generateWorldIdea(prompt)
  if (explicit !== 'spec') {
    const templated = await generateTemplateGame({ prompt, env, fetchImpl })
    if (templated) return templated
  }
  let choice = explicit === 'auto' ? heuristicTier(prompt) : explicit
  let via = explicit === 'auto' ? 'heuristic' : 'studio'
  if (choice === 'uncertain') {
    if (aiStatus(env).mode === 'ai') {
      try {
        choice = await classifyWithModel(prompt, env, fetchImpl)
        via = 'model'
      } catch {
        choice = 'freeform'
      }
    } else {
      choice = 'freeform'
    }
  }
  if (choice === 'freeform') {
    const result = await generateFreeform({ prompt, env, fetchImpl })
    if (explicit === 'freeform') result.tierReason = 'Freeform sandbox, chosen in the studio.'
    else if (via === 'model') result.tierReason = 'Auto asked the model. It picked the freeform sandbox because this idea needs its own rules.'
    return result
  }
  const result = await generateGame({ prompt, env, fetchImpl })
  return {
    ...result,
    tier: 'spec',
    html: null,
    tierReason: explicit === 'spec'
      ? 'Arcade spec, chosen in the studio.'
      : via === 'model'
        ? 'Auto asked the model. It picked the arcade spec for this simple game.'
        : 'Auto picked the arcade spec. This idea fits a tap, dodge, reaction, guess, or arcade game.'
  }
}
