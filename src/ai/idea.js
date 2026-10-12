import { HttpError } from '../errors.js'
import { wantsWorld } from '../blocks/spec.js'
import { researchWorld } from './voxel-research.js'
import { generateWorldFromPrompt } from './worldgen.js'
import { heuristicTier } from './classify.js'
import { generateFreeform } from './freeform.js'
import { generateTemplateGame } from '../templates/generate.js'
import { aiStatus, generateGame, requestModelText } from './generate.js'
import { resolveProvider } from './providers.js'
import { briefNote, researchEnabled, researchPrompt, strategyLabel } from './research.js'

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

function viewResearch(research, strategy, builtOn) {
  if (!research) return null
  const nextBuilt = builtOn || research.builtOn
  const next = strategy || research.strategy
  return {
    strategy: next,
    label: strategyLabel(next, nextBuilt),
    brief: research.brief,
    inspiredBy: research.inspiredBy || [],
    builtOn: nextBuilt,
    ms: research.ms,
    cached: research.cached === true
  }
}

async function worldIdea({ prompt, env, fetchImpl, onProgress, published }) {
  onProgress?.({ phase: 'researching', outputTokens: 0, label: 'Matching block worlds…' })
  const research = researchWorld({ prompt, published })
  const idea = await generateWorldFromPrompt({ prompt, env, fetchImpl, onProgress })
  const builtOn = research.builtOn
  return {
    ...idea,
    research: {
      strategy: 'world',
      label: 'Using the Blocks runtime',
      brief: research.brief,
      inspiredBy: research.inspiredBy,
      builtOn,
      ms: research.ms,
      cached: false
    },
    credit: {
      author: '',
      license: '',
      source: '',
      sha: '',
      origin: 'research',
      copyleftConfirmed: false,
      permissionConfirmed: false,
      licenseText: '',
      builtOn,
      inspiredBy: research.inspiredBy
    }
  }
}

export async function generateIdea({ prompt, tier, env, fetchImpl, onProgress, published, kind }) {
  if (kind === 'world') return worldIdea({ prompt, env, fetchImpl, onProgress, published })
  const explicit = tier === 'spec' || tier === 'freeform' || tier === undefined || tier === null || tier === '' || tier === 'auto'
    ? (tier === 'spec' || tier === 'freeform' ? tier : 'auto')
    : null
  if (!explicit) throw new HttpError(400, 'Generator tier must be auto, spec, or freeform', 'validation_error')
  if (wantsWorld(prompt) && explicit !== 'freeform') {
    return worldIdea({ prompt, env, fetchImpl, onProgress, published })
  }
  const research = researchEnabled(env)
    ? await researchPrompt({ prompt, env, fetchImpl, onProgress, published, allowAdapt: explicit === 'auto' })
    : null
  const note = briefNote(research?.brief)
  if (research?.strategy === 'adapt' && research.html && explicit === 'auto') {
    onProgress?.({ phase: 'writing', outputTokens: 0, label: `${research.label}…` })
    const game = {
      name: research.builtOn?.name || 'Adapted game',
      description: String(prompt || '').replace(/\s+/g, ' ').trim().slice(0, 180),
      type: 'arcade',
      duration: 60,
      accent: '#e6ff3a',
      tokenInterest: false,
      generation: 'import',
      notice: `Adapted from ${research.builtOn?.name || 'an open-source game'}${research.builtOn?.author ? ` by ${research.builtOn.author}` : ''} (${research.builtOn?.license || 'permissive'}). The license file stays with the game.`
    }
    return {
      mode: 'import',
      tier: 'freeform',
      provider: null,
      model: null,
      game,
      spec: null,
      html: research.html,
      notice: game.notice,
      tierReason: research.label,
      research: viewResearch(research),
      credit: research.credit
    }
  }
  if (explicit !== 'spec') {
    onProgress?.({ phase: 'choosing', outputTokens: 0, label: research?.strategy === 'remix' ? `${research.label}…` : 'Choosing a template…' })
    const templated = await generateTemplateGame({ prompt, env, fetchImpl, onProgress, brief: note })
    if (templated) {
      const builtOn = { name: templated.templateName, author: 'Playground', license: 'MIT', source: '' }
      const inspiredBy = (research?.inspiredBy || []).filter((item) => item.name !== templated.templateName)
      templated.research = viewResearch(research, 'remix', builtOn)
      if (templated.research) templated.research.inspiredBy = inspiredBy
      templated.credit = {
        ...(research?.credit || {}),
        author: '',
        license: '',
        source: '',
        sha: '',
        origin: '',
        licenseText: '',
        builtOn,
        inspiredBy
      }
      templated.tierReason = `Remixing the ${templated.templateName} template.`
      return templated
    }
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
    onProgress?.({ phase: 'writing', outputTokens: 0, label: research ? 'Writing from references…' : 'Writing the game…' })
    const result = await generateFreeform({ prompt, env, fetchImpl, onProgress, brief: note })
    onProgress?.({ phase: 'checking', outputTokens: 0, label: 'Checking the game…' })
    if (explicit === 'freeform') result.tierReason = 'Freeform sandbox, chosen in the studio.'
    else if (via === 'model') result.tierReason = 'Auto asked the model. It picked the freeform sandbox because this idea needs its own rules.'
    if (research) {
      result.research = viewResearch(research, 'freeform', null)
      result.credit = inspirationCredit(research)
    }
    return result
  }
  const result = await generateGame({ prompt, env, fetchImpl, brief: note })
  return {
    ...result,
    tier: 'spec',
    html: null,
    tierReason: explicit === 'spec'
      ? 'Arcade spec, chosen in the studio.'
      : via === 'model'
        ? 'Auto asked the model. It picked the arcade spec for this simple game.'
        : 'Auto picked the arcade spec. This idea fits a tap, dodge, reaction, guess, or arcade game.',
    research: viewResearch(research, 'spec', null),
    credit: research ? inspirationCredit(research) : null
  }
}

function inspirationCredit(research) {
  return {
    author: '',
    license: '',
    source: '',
    sha: '',
    origin: '',
    copyleftConfirmed: false,
    permissionConfirmed: false,
    licenseText: '',
    builtOn: null,
    inspiredBy: research?.inspiredBy || []
  }
}
