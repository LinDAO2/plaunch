import { HttpError } from '../errors.js'
import { normalizeTier } from './classify.js'
import { generateFreeform } from './freeform.js'
import { generateGame } from './generate.js'

export async function generateIdea({ prompt, tier, env, fetchImpl }) {
  const choice = normalizeTier(tier, prompt)
  if (!choice) throw new HttpError(400, 'Generator tier must be auto, spec, or freeform', 'validation_error')
  if (choice === 'freeform') {
    const result = await generateFreeform({ prompt, env, fetchImpl })
    if (tier === 'freeform') result.tierReason = 'Freeform sandbox, chosen in the studio.'
    return result
  }
  const result = await generateGame({ prompt, env, fetchImpl })
  return {
    ...result,
    tier: 'spec',
    html: null,
    tierReason: tier === 'spec'
      ? 'Arcade spec, chosen in the studio.'
      : 'Auto picked the arcade spec. This idea fits a tap, dodge, reaction, guess, or arcade game.'
  }
}
