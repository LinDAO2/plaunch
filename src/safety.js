import { requestModelText } from './ai/generate.js'
import { resolveProviderChain } from './ai/providers.js'
import { safetyModelOnPublish } from './config.js'

const RULES = [
  { category: 'sexual content involving minors', pattern: /\b(csam|child\s*porn|underage\s*(?:sex|porn)|loli|shota)\b/i },
  { category: 'sexual content', pattern: /\b(porn|pornography|hentai|xxx|nsfw|sex\s*tape)\b/i },
  { category: 'hate', pattern: /\b(nigger|faggot|kike)\b/i },
  { category: 'self-harm', pattern: /\b(kill\s+yourself|kys)\b/i },
  { category: 'scam', pattern: /\b(phishing\s+kit|steal\s+passwords)\b/i }
]

const SAFETY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['flag', 'reason'],
  properties: {
    flag: { type: 'boolean' },
    reason: { type: 'string' }
  }
}

const SAFETY_PROMPT = `You review a game title, description, and prompt for a general-audience site. Return JSON only: {"flag":false,"reason":""} or {"flag":true,"reason":"short category"}.
Flag sexual content, sexual content involving minors, hate, graphic gore as the point of the game, real-world scams, and instructions for real-world harm.
Do not flag ordinary game play: dodging, tapping, cartoon fighting, arcade shooting, or puzzles.
reason is a short category, at most 80 characters.`

export function blocklistReason(text) {
  const sample = String(text || '').slice(0, 20_000)
  for (const rule of RULES) {
    if (rule.pattern.test(sample)) return rule.category
  }
  return ''
}

function cleanReason(value, fallback) {
  const reason = String(value || fallback || 'policy').replace(/\s+/g, ' ').trim().slice(0, 80)
  return reason || fallback || 'policy'
}

export async function classifySafety({ text, env = {}, fetchImpl, model }) {
  const local = blocklistReason(text)
  if (local) return { flagged: true, reason: local, source: 'blocklist' }
  const enabled = model === undefined ? safetyModelOnPublish(env) : Boolean(model)
  if (!enabled) return { flagged: false, reason: '', source: 'skipped' }
  const chain = resolveProviderChain(env, 'safety')
  let provider = chain[0]
  if (!provider) return { flagged: false, reason: '', source: 'none' }
  try {
    const raw = await requestModelText(provider, [
      { role: 'system', content: SAFETY_PROMPT },
      { role: 'user', content: String(text || '').slice(0, 4000) }
    ], fetchImpl, { schema: SAFETY_SCHEMA, schemaName: 'safety_review', maxOutputTokens: 128, fallbacks: chain.slice(1), onUse: (item) => { provider = item } })
    let parsed = {}
    try { parsed = JSON.parse(String(raw).trim()) } catch { parsed = {} }
    if (parsed.flag === true) {
      return { flagged: true, reason: cleanReason(parsed.reason, 'policy'), source: provider.id }
    }
    return { flagged: false, reason: '', source: provider.id }
  } catch {
    return { flagged: false, reason: '', source: `${provider.id}-unavailable` }
  }
}
