import { HttpError } from '../errors.js'
import { cleanText } from '../validate.js'
import { generateWorldIdea, wantsWorld } from '../blocks/spec.js'
import { gameFromSpec, specFromGame, validateGameSpec } from './gamespec.js'
import { DEFAULT_AI_TIMEOUT_MS, aiStatus, geminiRequest, geminiText, openAiRequest, openAiText, resolveProvider } from './providers.js'
import { generateTemplate, TEMPLATE_NOTICE } from '../template.js'
import { SAMPLE_SPECS } from './samples.js'

export { aiStatus }

const FEW_SHOTS = SAMPLE_SPECS.map((spec, index) => `Example ${index + 1}: ${JSON.stringify(spec)}`).join('\n')

export const SYSTEM_PROMPT = `You design one tiny browser game and return GameSpecV1 JSON only.
Rules:
- version is "1.1"
- runtime is "arcade"
- scoring.direction is "higher"
- duration is an integer from 5 to 60
- accent is a #RRGGBB color
- safety.audience is "general"
- entities use kind target, hazard, or collectible, plus an emoji sprite, points, and speed
- spawn.pattern is rain, waves, burst, or lanes. burst means a random cluster
- movement is straight, zigzag, homing, or bounce. Use homing when the idea is pursuit
- controls.scheme is drag, tap, or keys
- primitives is 1 to 3 of fall, popup, chase, shoot, platform, maze
- popup entities appear and hide after lifetimeMs (whack-a-mole). chase pursues the player. shoot fires upward. platform is gravity plus jump. maze is grid steps around walls. fall drops objects
- Do not always choose fall. Pick the primitive that changes how the game is played
- lifetimeMs is 0, or 200 to 8000 when something should hide
- rules.win is survive, score, or lives, with seconds, lives, and targetScore
- scoreRules includes pointsPerEntity and comboMultiplier
- palette is 2 to 4 separate strings, each exactly one #RRGGBB color
- player.sprite is an emoji
- Vary spawn.rate, entity speed, pointsPerEntity, comboMultiplier, lifetimeMs, lives, and targetScore so they fit this concept
- Do not reuse spawn.rate 2.5 or comboMultiplier 2 unless the idea truly needs those exact numbers
- Make the theme, sprites, pattern, movement, controls, win rule, and primitives specific to the prompt
- The examples below contrast on purpose. Do not copy one. Invent a different mix for the player's idea
${FEW_SHOTS}
- Do not include JavaScript, HTML, URLs, or executable code
- Do not wrap the JSON in markdown`

export function parseModelJson(raw) {
  if (typeof raw !== 'string' || !raw.trim() || raw.length > 12000) {
    throw new Error('Model output is empty or too large')
  }
  let text = raw.trim()
  if (text.startsWith('```')) {
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim()
  }
  let value
  try {
    value = JSON.parse(text)
  } catch {
    throw new Error('Model output is not valid JSON')
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Model output must be a JSON object')
  }
  return value
}

function retryDelay() {
  const n = Number(process.env.AI_RETRY_DELAY_MS)
  return Number.isFinite(n) && n >= 0 && n <= 30_000 ? n : 2_000
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function callProvider(provider, messages, fetchImpl, options = {}) {
  const request = provider.id === 'gemini' ? geminiRequest(provider, messages, options) : openAiRequest(provider, messages, options)
  let response
  try {
    response = await fetchImpl(request.url, {
      method: 'POST',
      headers: request.headers,
      body: JSON.stringify(request.body),
      signal: AbortSignal.timeout(provider.timeoutMs || DEFAULT_AI_TIMEOUT_MS)
    })
  } catch (err) {
    const error = new HttpError(502, err.name === 'TimeoutError' || err.name === 'AbortError' ? 'AI provider timed out' : 'AI provider request failed', 'ai_provider_error')
    error.retry = true
    throw error
  }
  const text = await response.text()
  if (text.length > (options.maxResponseChars || 20_000)) {
    const error = new HttpError(502, 'AI response too large', 'ai_provider_error')
    error.retry = false
    throw error
  }
  if (!response.ok) {
    const rejected = response.status === 401 || response.status === 403
    const quota = response.status === 429
    const busy = response.status === 503 || response.status === 500
    const message = rejected ? 'AI provider rejected the API key'
      : quota ? 'AI provider quota exceeded. Try again later.'
        : busy ? 'AI provider is overloaded right now. Try again in a minute.'
          : 'AI provider request failed'
    const error = new HttpError(502, message, quota ? 'ai_quota_exceeded' : busy ? 'ai_provider_busy' : 'ai_provider_error')
    // Retrying a 429 immediately only burns more quota. A 503 gets one delayed retry.
    error.retry = !rejected && !quota && response.status !== 400
    if (busy) error.retryDelayMs = retryDelay()
    throw error
  }
  let payload
  try {
    payload = JSON.parse(text)
  } catch {
    const error = new HttpError(502, 'AI provider returned invalid JSON', 'ai_provider_error')
    error.retry = true
    throw error
  }
  const content = provider.id === 'gemini' ? geminiText(payload) : openAiText(payload)
  if (!content) {
    const error = new HttpError(502, 'AI provider returned an empty response', 'ai_provider_error')
    error.retry = true
    throw error
  }
  return content
}

export function requestModelText(provider, messages, fetchImpl, options = {}) {
  return callProvider(provider, messages, fetchImpl, { maxResponseChars: 262144, ...options })
}

function templateResult(prompt) {
  const game = generateTemplate(prompt)
  return {
    mode: 'template',
    provider: null,
    model: null,
    game,
    spec: specFromGame(game),
    notice: game.notice || TEMPLATE_NOTICE
  }
}

export async function generateGame({ prompt, env, fetchImpl = globalThis.fetch }) {
  if (wantsWorld(prompt)) {
    const idea = generateWorldIdea(prompt)
    return { mode: idea.mode, provider: null, model: null, game: idea.game, spec: idea.spec, notice: idea.notice }
  }
  const status = aiStatus(env)
  if (status.mode !== 'ai') return templateResult(prompt)
  const provider = resolveProvider(env)
  const idea = cleanText(prompt, 600)
  if (idea.length < 6) throw new HttpError(400, 'Describe your game in more detail', 'validation_error')
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: `Player idea:\n${idea}` }
  ]
  let lastError = 'AI provider failed'
  let code = 'ai_invalid_output'
  let providerFailures = 0
  for (let attempt = 1; attempt <= 3; attempt++) {
    let raw
    try {
      raw = await callProvider(provider, messages, fetchImpl)
    } catch (err) {
      lastError = err.message
      code = err.code || 'ai_provider_error'
      providerFailures += 1
      // Transport and 5xx failures get one retry; three 503s in a row burned free-tier quota live.
      if (err.retry === false || attempt === 3 || providerFailures >= 2) throw new HttpError(502, lastError, code)
      if (err.retryDelayMs) await sleep(err.retryDelayMs)
      continue
    }
    try {
      const spec = validateGameSpec(parseModelJson(raw))
      const game = {
        ...gameFromSpec(spec),
        generation: `ai:${provider.id}`,
        notice: `Generated with ${provider.id} (${provider.model}) as validated GameSpec v1. Model output is never executed as code.`
      }
      return {
        mode: 'ai',
        provider: provider.id,
        model: provider.model,
        game,
        spec,
        notice: game.notice
      }
    } catch (err) {
      lastError = err.message
      code = 'ai_invalid_output'
      messages.push({
        role: 'user',
        content: `Invalid output: ${err.message}. Return one GameSpecV1 JSON object and no code.`
      })
    }
  }
  throw new HttpError(502, `AI provider returned invalid game spec: ${lastError}`, code)
}
