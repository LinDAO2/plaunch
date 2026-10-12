import { HttpError } from '../errors.js'
import { cleanText } from '../validate.js'
import { generateWorldIdea, wantsWorld } from '../blocks/spec.js'
import { gameFromSpec, specFromGame, validateGameSpec } from './gamespec.js'
import { log } from '../log.js'
import { DEFAULT_AI_TIMEOUT_MS, FREEFORM_OUTPUT_BUDGET, aiStatus, anthropicRequest, anthropicText, completionMeta, describeUpstreamError, foldProviderStream, geminiRequest, geminiText, openAiRequest, openAiResponsesRequest, openAiText, resolveProvider, resolveProviderChain, responsesText, stitchModelText } from './providers.js'
import { generateTemplate, TEMPLATE_NOTICE } from '../template.js'
import { SAMPLE_SPECS } from './samples.js'
import { STYLE_GUIDE } from '../style-kit.js'

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
- ${STYLE_GUIDE}
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

function requestFor(provider, messages, options) {
  if (provider.id === 'gemini') return geminiRequest(provider, messages, options)
  if (provider.id === 'anthropic') return anthropicRequest(provider, messages, options)
  if (provider.id === 'openai') return openAiResponsesRequest(provider, messages, options)
  return openAiRequest(provider, messages, options)
}

function textFor(provider, payload) {
  if (provider.id === 'gemini') return geminiText(payload)
  if (provider.id === 'anthropic') return anthropicText(payload)
  if (provider.id === 'openai') return responsesText(payload)
  return openAiText(payload)
}

function canFallback(err) {
  if (!err) return false
  if (err.code === 'ai_provider_auth' || err.code === 'ai_request_rejected' || err.code === 'ai_model_not_found') return false
  return err.retry === true || err.code === 'ai_quota_exceeded'
}

function tooLarge() {
  const error = new HttpError(502, 'AI response too large', 'ai_provider_error')
  error.retry = false
  return error
}

function isEventStream(response, text) {
  const type = String(response.headers?.get?.('content-type') || '')
  if (type.includes('text/event-stream')) return true
  const sample = String(text || '').trimStart()
  if (sample.startsWith('{') || sample.startsWith('[')) return false
  return sample.startsWith('data:') || sample.startsWith('event:')
}

// Payload characters (text, tool input, thinking) seen so far in a provider SSE stream.
export function streamPayloadChars(raw) {
  let chars = 0
  for (const match of String(raw).matchAll(/"(?:text|partial_json|thinking)":"((?:[^"\\]|\\.)*)"/g)) chars += match[1].length
  return chars
}

// True while the stream is waiting on the model: after message_start or a content_block_start
// (tool_use or thinking) with no delta yet, or during thinking. Anthropic buffers a tool_use
// input and sends only pings (~30 s apart) until it flushes, so the short idle timer must not apply.
export function streamIsThinking(raw) {
  const text = String(raw)
  const tail = text.slice(Math.max(0, text.length - 4000))
  const events = [...tail.matchAll(/"type":\s*"(message_start|content_block_start|content_block_delta|content_block_stop|thinking_delta|ping)"/g)].map((match) => match[1]).filter((type) => type !== 'ping')
  if (!text.includes('data:')) return true
  const lastEvent = events.at(-1)
  const open = text.lastIndexOf('"type":"content_block_start"')
  if (open > text.lastIndexOf('"type":"content_block_stop"') && /"content_block":\{"type":"tool_use"/.test(text.slice(open, open + 200))) return true
  return lastEvent === 'message_start' || lastEvent === 'content_block_start' || lastEvent === 'thinking_delta' || events.length === 0
}

export const THINKING_STALL_MS = 90_000

async function readResponseText(response, { maxChars, stallMs, deadline, onChunk }) {
  const reader = response.body?.getReader?.()
  if (!reader) {
    const text = await response.text()
    if (text.length > maxChars) throw tooLarge()
    onChunk?.(text)
    return text
  }
  const decoder = new TextDecoder()
  let text = ''
  const fail = (err) => {
    reader.cancel().catch(() => {})
    throw err
  }
  try {
    while (true) {
      const pending = reader.read()
      const timers = []
      const racers = [pending]
      if (stallMs) {
        const idle = streamIsThinking(text) ? Math.max(stallMs, THINKING_STALL_MS) : stallMs
        racers.push(new Promise((_, reject) => {
          timers.push(setTimeout(() => {
            const err = new Error('AI provider stalled')
            err.name = 'TimeoutError'
            err.stall = true
            reject(err)
          }, idle))
        }))
      }
      if (deadline) {
        const left = Math.max(0, deadline - Date.now())
        racers.push(new Promise((_, reject) => {
          timers.push(setTimeout(() => {
            const err = new Error('AI provider timed out')
            err.name = 'TimeoutError'
            reject(err)
          }, left))
        }))
      }
      const raced = await Promise.race(racers)
      for (const timer of timers) clearTimeout(timer)
      if (raced.done) break
      text += decoder.decode(raced.value, { stream: true })
      if (text.length > maxChars) fail(tooLarge())
      onChunk?.(text)
    }
  } catch (err) {
    await reader.cancel().catch(() => {})
    throw err
  }
  text += decoder.decode()
  return text
}

async function callProvider(provider, messages, fetchImpl, options = {}) {
  const request = requestFor(provider, messages, options)
  const limit = options.timeoutMs || provider.timeoutMs || DEFAULT_AI_TIMEOUT_MS
  const started = Date.now()
  const controller = options.stream ? new AbortController() : null
  const killer = controller ? setTimeout(() => controller.abort(), limit) : null
  let response
  try {
    response = await fetchImpl(request.url, {
      method: 'POST',
      headers: request.headers,
      body: JSON.stringify(request.body),
      signal: controller ? controller.signal : AbortSignal.timeout(limit)
    })
  } catch (err) {
    if (killer) clearTimeout(killer)
    const error = new HttpError(502, err.name === 'TimeoutError' || err.name === 'AbortError' ? 'AI provider timed out' : 'AI provider request failed', 'ai_provider_error')
    // A freeform stall or overall cap should not start a second full wait.
    error.retry = options.stream ? false : true
    error.cause = err
    throw error
  }
  const maxChars = options.maxResponseChars || 20_000
  let text
  try {
    text = await readResponseText(response, {
      maxChars,
      stallMs: options.stream ? (options.stallMs || 0) : 0,
      deadline: options.stream ? started + limit : 0,
      onChunk: (buf) => {
        if (!options.onProgress) return
        const outputTokens = Math.ceil(streamPayloadChars(buf) / 4)
        options.onProgress({ phase: 'writing', outputTokens, label: `Writing the game… ${outputTokens} tokens` })
      }
    })
  } catch (err) {
    if (err.code === 'ai_provider_error') throw err
    const error = new HttpError(502, err.stall || err.name === 'TimeoutError' || err.name === 'AbortError' ? 'AI provider timed out' : 'AI provider request failed', 'ai_provider_error')
    error.retry = options.stream ? false : true
    throw error
  } finally {
    if (killer) clearTimeout(killer)
  }
  if (!response.ok) {
    const info = describeUpstreamError(provider, response.status, text)
    log('warn', 'ai provider error', info.upstream)
    const error = new HttpError(502, info.message, info.code)
    error.upstream = info.upstream
    // Retrying a 429 or a rejected request only burns quota. A 503, 500, or 504 gets one delayed retry.
    error.retry = info.retry
    if (info.delay) error.retryDelayMs = retryDelay()
    throw error
  }
  let content = ''
  let truncated = false
  let outputTokens = 0
  if (options.stream && isEventStream(response, text)) {
    const folded = foldProviderStream(provider.id, text)
    content = folded.text
    truncated = folded.truncated
    outputTokens = folded.outputTokens
  } else {
    let payload
    try {
      payload = JSON.parse(text)
    } catch {
      const error = new HttpError(502, 'AI provider returned invalid JSON', 'ai_provider_error')
      error.retry = true
      throw error
    }
    content = textFor(provider, payload)
    const meta = completionMeta(provider, payload, content)
    truncated = meta.truncated
    outputTokens = meta.outputTokens
  }
  if (!content) {
    // Thinking can burn the whole cap before the tool call. Continuation needs that truncated empty reply.
    if (truncated && options.allowTruncatedEmpty) {
      return { text: '', truncated: true, outputTokens: outputTokens || options.maxOutputTokens || 0 }
    }
    const error = new HttpError(502, 'AI provider returned an empty response', 'ai_provider_error')
    error.retry = true
    throw error
  }
  if (options.onProgress) {
    options.onProgress({ phase: 'writing', outputTokens, label: `Writing the game… ${outputTokens} tokens` })
  }
  return { text: content, truncated, outputTokens }
}

function withUpstream(error, source) {
  if (source?.upstream) error.upstream = source.upstream
  return error
}

// One delayed retry for transient upstream failures (503, 500, 504, transport). Never for 4xx.
export async function requestModelText(provider, messages, fetchImpl = globalThis.fetch, options = {}) {
  const opts = { maxResponseChars: 262144, ...options }
  options.onUse?.(provider)
  const once = (msgs, extra) => callProvider(provider, msgs, fetchImpl, {
    ...opts,
    ...extra,
    continueOnTruncation: false,
    allowTruncatedEmpty: Boolean(options.continueOnTruncation) && !extra?.noEmpty
  })
  const attempt = async (msgs, extra) => {
    try {
      return await once(msgs, extra)
    } catch (err) {
      if (!err.retry || options.noRetry) throw err
      if (err.retryDelayMs) await sleep(err.retryDelayMs)
      return await once(msgs, extra)
    }
  }
  let result
  try {
    result = await attempt(messages, {})
  } catch (err) {
    const next = (options.fallbacks || [])[0]
    if (!next || !canFallback(err)) throw err
    return requestModelText(next, messages, fetchImpl, { ...options, fallbacks: options.fallbacks.slice(1) })
  }
  if (options.continueOnTruncation && result.truncated && result.outputTokens < FREEFORM_OUTPUT_BUDGET) {
    const used = result.outputTokens || options.maxOutputTokens || FREEFORM_OUTPUT_BUDGET
    const room = Math.min(4000, FREEFORM_OUTPUT_BUDGET - used)
    if (room >= 256) {
      options.onProgress?.({ phase: 'continuing', outputTokens: used, label: 'Continuing a cut-off answer…' })
      const follow = result.text
        ? [
          ...messages,
          { role: 'assistant', content: result.text },
          { role: 'user', content: 'Continue exactly where the text stopped. Do not repeat earlier text. Finish the JSON or HTML document.' }
        ]
        : [
          ...messages,
          { role: 'user', content: 'The previous reply hit the output cap before any result text. Call emit_result once with the full result. Do not spend the reply on thinking. Return the complete JSON or HTML now.' }
        ]
      try {
        const more = await attempt(follow, { maxOutputTokens: room, noEmpty: true })
        result = {
          text: stitchModelText(result.text, more.text),
          truncated: Boolean(more.truncated),
          outputTokens: Math.min(FREEFORM_OUTPUT_BUDGET, result.outputTokens + (more.outputTokens || 0))
        }
      } catch {
        // Keep the partial document. The caller rejects it if it still will not parse.
      }
    }
  }
  return result.text
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

export async function generateGame({ prompt, env, fetchImpl = globalThis.fetch, brief = '' }) {
  if (wantsWorld(prompt)) {
    const idea = generateWorldIdea(prompt)
    return { mode: idea.mode, provider: null, model: null, game: idea.game, spec: idea.spec, notice: idea.notice }
  }
  const status = aiStatus(env)
  if (status.mode !== 'ai') return templateResult(prompt)
  let provider = resolveProvider(env, 'spec')
  const idea = cleanText(prompt, 600)
  if (idea.length < 6) throw new HttpError(400, 'Describe your game in more detail', 'validation_error')
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: brief ? `Player idea:\n${idea}\n\n${brief}` : `Player idea:\n${idea}` }
  ]
  let lastError = 'AI provider failed'
  let code = 'ai_invalid_output'
  let providerFailures = 0
  let fallbacks = resolveProviderChain(env, 'spec').slice(1)
  for (let attempt = 1; attempt <= 3; attempt++) {
    let raw
    try {
      raw = (await callProvider(provider, messages, fetchImpl, { maxResponseChars: 262144 })).text
    } catch (err) {
      lastError = err.message
      code = err.code || 'ai_provider_error'
      providerFailures += 1
      // Transport and 5xx failures get one retry; three 503s in a row burned free-tier quota live.
      if (err.retry === false || attempt === 3 || providerFailures >= 2) {
        if (canFallback(err) && fallbacks.length) {
          provider = fallbacks.shift()
          providerFailures = 0
          attempt = 0
          continue
        }
        throw withUpstream(new HttpError(502, lastError, code), err)
      }
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
