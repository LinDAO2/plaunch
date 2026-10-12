import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { generateIdea } from './idea.js'
import { clearResearchCache } from './research.js'
import { templateFreeform } from './freeform.js'
import { inspectFreeform } from './freeform-check.js'
import { foldProviderStream } from './providers.js'
import { validateGameSpec } from './gamespec.js'

export function fixtureObject(prompt, body) {
  const blob = JSON.stringify(body || {})
  const idea = String(prompt || '')
  if (blob.includes('general-audience')) return { flag: false, reason: '' }
  if (blob.includes('"tier"') && blob.includes('freeform')) {
    return { tier: /tower|rhythm|gravity|typing|pong/i.test(idea) ? 'freeform' : 'spec' }
  }
  if (blob.includes('templateId')) return { templateId: 'flap', confidence: 0.55, changes: ['candy colors'] }
  if (blob.includes('"html"')) return { html: templateFreeform(idea) }
  // A trademark in the title is rejected by the splicer, which would look like a fallback.
  return { THEME: { names: { title: 'Candy Round' } } }
}

export function fixtureResponse(url, body, prompt) {
  const value = fixtureObject(prompt, body)
  const text = JSON.stringify(value)
  if (String(url).includes('anthropic.com')) {
    return {
      content: [{ type: 'tool_use', name: 'emit_result', input: value }],
      usage: { input_tokens: 120, output_tokens: 80 }
    }
  }
  if (String(url).includes('/responses')) {
    return { output_text: text, usage: { input_tokens: 120, output_tokens: 80 } }
  }
  if (String(url).includes('/chat/completions')) {
    return { choices: [{ message: { content: text } }], usage: { prompt_tokens: 120, completion_tokens: 80 } }
  }
  return {
    candidates: [{ content: { parts: [{ text }] } }],
    usageMetadata: { promptTokenCount: 120, candidatesTokenCount: 80 }
  }
}

function tokensFrom(payload) {
  const usage = payload?.usage || payload?.usageMetadata || {}
  return {
    input: usage.input_tokens || usage.promptTokenCount || usage.prompt_tokens || 0,
    output: usage.output_tokens || usage.candidatesTokenCount || usage.completion_tokens || 0
  }
}

export function fixtureFetch(prompt) {
  const totals = { input: 0, output: 0 }
  const fetchImpl = async (url, init = {}) => {
    const body = init.body ? JSON.parse(init.body) : {}
    const payload = fixtureResponse(url, body, prompt)
    const used = tokensFrom(payload)
    totals.input += used.input
    totals.output += used.output
    return new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  return { fetchImpl, totals }
}

const KEY_FOR = {
  gemini: 'GEMINI_API_KEY',
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  xai: 'XAI_API_KEY'
}

function providerEnv(id) {
  return {
    AI_PROVIDER: id,
    AI_FALLBACKS: '',
    AI_PROVIDER_SPEC: '',
    AI_PROVIDER_FREEFORM: '',
    AI_PROVIDER_SAFETY: '',
    GEMINI_API_KEY: id === 'gemini' ? 'fixture' : '',
    OPENAI_API_KEY: id === 'openai' ? 'fixture' : '',
    ANTHROPIC_API_KEY: id === 'anthropic' ? 'fixture' : '',
    XAI_API_KEY: id === 'xai' ? 'fixture' : ''
  }
}

export function providerRunEnv(id, env = process.env) {
  const key = env[KEY_FOR[id]]
  if (key && key !== 'fixture' && env.BAKEOFF_FIXTURES !== '1') {
    return {
      live: true,
      env: {
        ...env,
        AI_PROVIDER: id,
        AI_FALLBACKS: '',
        AI_PROVIDER_SPEC: '',
        AI_PROVIDER_FREEFORM: '',
        AI_PROVIDER_SAFETY: ''
      }
    }
  }
  return { live: false, env: providerEnv(id) }
}

function providerIdFromUrl(url) {
  const value = String(url)
  if (value.includes('anthropic.com')) return 'anthropic'
  if (value.includes('generativelanguage') || value.includes(':streamGenerateContent') || value.includes(':generateContent')) return 'gemini'
  if (value.includes('api.x.ai') || value.includes('/chat/completions')) return 'xai'
  return 'openai'
}

export function meteringFetch(inner, totals) {
  return async (url, init) => {
    const response = await inner(url, init)
    try {
      const payload = await response.clone().json()
      const used = tokensFrom(payload)
      totals.input += used.input
      totals.output += used.output
    } catch {
      try {
        const raw = await response.clone().text()
        if (raw.includes('data:')) {
          const folded = foldProviderStream(providerIdFromUrl(url), raw)
          totals.input += folded.inputTokens
          totals.output += folded.outputTokens
        }
      } catch {
        // A non-JSON error body still counts as a provider call.
      }
    }
    return response
  }
}

export async function runBakeoff({ prompts, providers, outDir, smoke = false, env = process.env, fetchImpl, research = true } = {}) {
  clearResearchCache()
  const results = []
  await mkdir(outDir, { recursive: true })
  const gamesDir = path.join(outDir, 'games')
  await mkdir(gamesDir, { recursive: true })
  for (const prompt of prompts) {
    for (const id of providers) {
      const started = Date.now()
      const run = providerRunEnv(id, env)
      const totals = { input: 0, output: 0 }
      const fixture = run.live ? null : fixtureFetch(prompt)
      if (fixture) {
        totals.input = 0
        totals.output = 0
      }
      const call = run.live
        ? meteringFetch(fetchImpl || globalThis.fetch, totals)
        : meteringFetch(fixture.fetchImpl, totals)
      try {
        const idea = await generateIdea({ prompt, tier: 'auto', env: { ...run.env, AI_RESEARCH: research ? 'on' : 'off' }, fetchImpl: call })
        const html = idea.html || idea.game?.freeformHtml || ''
        const problems = []
        if (html) problems.push(...inspectFreeform(html))
        else if (idea.spec) {
          try { validateGameSpec(idea.spec) } catch (err) { problems.push(err.message) }
        } else problems.push('No game document')
        const file = `${id}-${prompt.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 40)}.json`
        await writeFile(path.join(gamesDir, file), JSON.stringify({
          prompt,
          provider: id,
          mode: idea.mode,
          name: idea.game?.name || '',
          html: html || null,
          spec: idea.spec || null
        }, null, 2))
        const fellBack = Boolean(idea.fallback)
        if (fellBack && !problems.includes('template fallback')) problems.push('template fallback')
        results.push({
          prompt,
          provider: id,
          ok: problems.length === 0 && !fellBack,
          mode: fellBack ? 'template' : idea.mode,
          model: fellBack ? null : idea.model,
          fallback: fellBack,
          strategy: idea.research?.strategy || '',
          ms: Date.now() - started,
          tokens: { ...totals },
          usd: null,
          errors: problems,
          smoke: smoke ? 'skipped-in-fixture' : 'off',
          file
        })
      } catch (err) {
        results.push({
          prompt,
          provider: id,
          ok: false,
          mode: 'error',
          ms: Date.now() - started,
          tokens: { ...totals },
          usd: null,
          errors: [err.message],
          strategy: '',
          smoke: 'off',
          file: ''
        })
      }
    }
  }
  const markdown = [
    '# Bakeoff',
    '',
    'Token counts are from the fixture or the provider usage field. USD is omitted when the model has no confirmed price.',
    '',
    '| Prompt | Provider | OK | Mode | Strategy | Fallback | ms | in | out |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...results.map((row) => `| ${row.prompt} | ${row.provider} | ${row.ok} | ${row.mode} | ${row.strategy || ''} | ${row.fallback ? 'template fallback' : ''} | ${row.ms} | ${row.tokens.input} | ${row.tokens.output} |`)
  ].join('\n')
  await writeFile(path.join(outDir, 'bakeoff.json'), JSON.stringify({ results }, null, 2))
  await writeFile(path.join(outDir, 'bakeoff.md'), markdown)
  return results
}
