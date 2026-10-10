import { geminiResponseSchema } from './gamespec.js'

// Rosebud is intentionally not a provider. It has no generation API and its terms prohibit automated use.

// Live Gemini 3.x Flash latency on the standard tier ranged from 7s to 60s, so 20s timed out often.
export const DEFAULT_AI_TIMEOUT_MS = 60_000

function timeoutEnv(value) {
  const n = Number(value)
  return Number.isInteger(n) && n >= 1000 && n <= 120_000 ? n : DEFAULT_AI_TIMEOUT_MS
}

export function resolveProvider(env = {}) {
  const choice = String(env.AI_PROVIDER || 'auto').toLowerCase()
  const gemini = env.GEMINI_API_KEY ? {
    id: 'gemini',
    model: env.GEMINI_MODEL || 'gemini-3.5-flash',
    apiKey: env.GEMINI_API_KEY,
    base: env.GEMINI_API_BASE || 'https://generativelanguage.googleapis.com/v1beta',
    thinkingLevel: String(env.GEMINI_THINKING_LEVEL ?? 'low').toLowerCase(),
    timeoutMs: timeoutEnv(env.AI_TIMEOUT_MS)
  } : null
  const xai = env.XAI_API_KEY ? {
    id: 'xai',
    model: env.XAI_MODEL || 'grok-3',
    apiKey: env.XAI_API_KEY,
    base: env.XAI_BASE_URL || 'https://api.x.ai/v1',
    timeoutMs: timeoutEnv(env.AI_TIMEOUT_MS)
  } : null
  const openai = env.OPENAI_API_KEY ? {
    id: 'openai',
    model: env.OPENAI_MODEL || 'gpt-4o-mini',
    apiKey: env.OPENAI_API_KEY,
    base: env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    timeoutMs: timeoutEnv(env.AI_TIMEOUT_MS)
  } : null
  if (choice === 'gemini') return gemini
  if (choice === 'xai') return xai
  if (choice === 'openai') return openai
  if (choice === 'auto' || choice === '') return gemini || xai || openai || null
  return null
}

export function aiStatus(env = {}) {
  const provider = resolveProvider(env)
  if (!provider) {
    return {
      mode: 'template',
      provider: null,
      model: null,
      notice: 'Template mode. No AI provider key is configured, so ideas use the built-in matcher instead of a model.'
    }
  }
  const label = provider.id === 'gemini' ? 'Gemini' : provider.id === 'xai' ? 'xAI' : 'OpenAI'
  return {
    mode: 'ai',
    provider: provider.id,
    model: provider.model,
    notice: `AI mode · ${label} · ${provider.model}. Output is validated GameSpec v1 and is never run as code.`
  }
}

function trimBase(base) {
  return String(base || '').replace(/\/$/, '')
}

export function geminiRequest(provider, messages, options = {}) {
  const system = messages.filter((message) => message.role === 'system').map((message) => message.content).join('\n')
  const contents = messages.filter((message) => message.role !== 'system').map((message) => ({
    role: message.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: message.content }]
  }))
  const generationConfig = {
    temperature: 0.4,
    maxOutputTokens: options.maxOutputTokens || 2048,
    responseMimeType: 'application/json',
    responseJsonSchema: options.schema || geminiResponseSchema()
  }
  // Gemini 3 models think by default; ~1k thought tokens per spec added cost and latency.
  // Set GEMINI_THINKING_LEVEL=off (or default) to omit the setting.
  if (/^gemini-3/.test(provider.model) && provider.thinkingLevel && !['off', 'default', ''].includes(provider.thinkingLevel)) {
    generationConfig.thinkingConfig = { thinkingLevel: provider.thinkingLevel }
  }
  return {
    url: `${trimBase(provider.base)}/models/${provider.model}:generateContent`,
    headers: {
      'content-type': 'application/json',
      'x-goog-api-key': provider.apiKey
    },
    body: {
      systemInstruction: { parts: [{ text: system }] },
      contents,
      generationConfig
    }
  }
}

export function openAiRequest(provider, messages, options = {}) {
  const body = {
    model: provider.model,
    temperature: 0.4,
    messages,
    response_format: { type: 'json_object' }
  }
  if (options.maxOutputTokens) body.max_tokens = options.maxOutputTokens
  return {
    url: `${trimBase(provider.base)}/chat/completions`,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${provider.apiKey}`
    },
    body
  }
}

export function geminiText(payload) {
  const parts = payload?.candidates?.[0]?.content?.parts || []
  return parts.map((part) => part?.text || '').join('')
}

export function openAiText(payload) {
  const content = payload?.choices?.[0]?.message?.content
  return typeof content === 'string' ? content : ''
}

const PROVIDER_LABELS = { gemini: 'Gemini', xai: 'xAI', openai: 'OpenAI' }

function redactSecrets(text, provider) {
  let out = String(text || '')
  if (provider?.apiKey) out = out.split(provider.apiKey).join('[redacted]')
  // Google keys start with AIza; OpenAI and xAI keys start with sk- or xai-.
  return out.replace(/AIza[0-9A-Za-z_-]{20,}/g, '[redacted]').replace(/\b(sk|xai)-[0-9A-Za-z_-]{16,}/g, '[redacted]')
}

// Turn an upstream error response into an honest category. Only a real 503 or
// UNAVAILABLE counts as "busy"; everything else keeps its own status and message.
export function describeUpstreamError(provider, status, bodyText) {
  let parsed = null
  try {
    parsed = JSON.parse(bodyText)
  } catch {
    parsed = null
  }
  const err = Array.isArray(parsed) ? parsed[0]?.error : parsed?.error
  const upstreamCode = typeof err?.status === 'string' ? err.status
    : typeof err?.code === 'string' ? err.code
      : typeof err?.type === 'string' ? err.type : ''
  const rawMessage = typeof err?.message === 'string' ? err.message
    : typeof err === 'string' ? err
      : parsed ? '' : String(bodyText || '')
  const upstreamMessage = redactSecrets(rawMessage, provider).replace(/\s+/g, ' ').trim().slice(0, 300)
  const label = PROVIDER_LABELS[provider?.id] || 'AI provider'
  const tag = `${label} HTTP ${status}${upstreamCode ? ` ${upstreamCode}` : ''}`
  const code = String(upstreamCode).toUpperCase()
  let category
  if (status === 503 || code === 'UNAVAILABLE') category = 'busy'
  else if (status === 429 || code === 'RESOURCE_EXHAUSTED') category = 'quota'
  else if (status === 401 || status === 403 || code === 'PERMISSION_DENIED' || code === 'UNAUTHENTICATED') category = 'auth'
  else if (status === 404 || code === 'NOT_FOUND') category = 'model_not_found'
  else if (status === 504 || code === 'DEADLINE_EXCEEDED') category = 'timeout'
  else if (status >= 500) category = 'internal'
  else if (status >= 400) category = 'rejected'
  else category = 'error'
  const detail = upstreamMessage ? `: ${upstreamMessage}` : ''
  const table = {
    busy: { code: 'ai_provider_busy', retry: true, delay: true, text: `${label} is overloaded right now (${tag}${detail}). Try again in a minute.` },
    quota: { code: 'ai_quota_exceeded', retry: false, text: `${label} quota exceeded (${tag}${detail}).` },
    auth: { code: 'ai_provider_auth', retry: false, text: `${label} rejected the API key or project (${tag}${detail}).` },
    model_not_found: { code: 'ai_model_not_found', retry: false, text: `${label} model ${provider?.model || ''} was not found (${tag}${detail}).` },
    timeout: { code: 'ai_provider_timeout', retry: true, delay: true, text: `${label} timed out upstream (${tag}${detail}).` },
    internal: { code: 'ai_provider_internal', retry: true, delay: true, text: `${label} had an internal error (${tag}${detail}).` },
    rejected: { code: 'ai_request_rejected', retry: false, text: `${label} rejected the request (${tag}${detail}).` },
    error: { code: 'ai_provider_error', retry: false, text: `${label} request failed (${tag}${detail}).` }
  }[category]
  return {
    category,
    code: table.code,
    message: table.text,
    retry: table.retry,
    delay: Boolean(table.delay),
    upstream: { provider: provider?.id || null, model: provider?.model || null, status, code: upstreamCode || null, message: upstreamMessage || null }
  }
}
