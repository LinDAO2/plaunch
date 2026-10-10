import { geminiResponseSchema } from './gamespec.js'

// Rosebud is intentionally not a provider. It has no generation API and its terms prohibit automated use.

export function resolveProvider(env = {}) {
  const choice = String(env.AI_PROVIDER || 'auto').toLowerCase()
  const gemini = env.GEMINI_API_KEY ? {
    id: 'gemini',
    model: env.GEMINI_MODEL || 'gemini-3.8-flash',
    apiKey: env.GEMINI_API_KEY,
    base: env.GEMINI_API_BASE || 'https://generativelanguage.googleapis.com/v1beta'
  } : null
  const xai = env.XAI_API_KEY ? {
    id: 'xai',
    model: env.XAI_MODEL || 'grok-3',
    apiKey: env.XAI_API_KEY,
    base: env.XAI_BASE_URL || 'https://api.x.ai/v1'
  } : null
  const openai = env.OPENAI_API_KEY ? {
    id: 'openai',
    model: env.OPENAI_MODEL || 'gpt-4o-mini',
    apiKey: env.OPENAI_API_KEY,
    base: env.OPENAI_BASE_URL || 'https://api.openai.com/v1'
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

export function geminiRequest(provider, messages) {
  const system = messages.filter((message) => message.role === 'system').map((message) => message.content).join('\n')
  const contents = messages.filter((message) => message.role !== 'system').map((message) => ({
    role: message.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: message.content }]
  }))
  return {
    url: `${trimBase(provider.base)}/models/${provider.model}:generateContent`,
    headers: {
      'content-type': 'application/json',
      'x-goog-api-key': provider.apiKey
    },
    body: {
      systemInstruction: { parts: [{ text: system }] },
      contents,
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 2048,
        responseMimeType: 'application/json',
        responseJsonSchema: geminiResponseSchema()
      }
    }
  }
}

export function openAiRequest(provider, messages) {
  return {
    url: `${trimBase(provider.base)}/chat/completions`,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${provider.apiKey}`
    },
    body: {
      model: provider.model,
      temperature: 0.4,
      messages,
      response_format: { type: 'json_object' }
    }
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
