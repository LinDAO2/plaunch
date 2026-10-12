import assert from 'node:assert/strict'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { anthropicRequest, openAiResponsesRequest, schemaIsStrict } from '../src/ai/providers.js'
import { FREEFORM_SCHEMA } from '../src/ai/freeform.js'
import { EDIT_SCHEMA } from '../src/templates/cheatsheet.js'
import { providerRunEnv, runBakeoff } from '../src/ai/bakeoff.js'
import { generateGame } from '../src/ai/generate.js'
import { validSpec } from '../testing/helpers.js'

test('Anthropic uses tool-use and OpenAI uses the Responses API', () => {
  const anthropic = anthropicRequest({
    id: 'anthropic',
    model: 'claude-sonnet-5-5',
    apiKey: 'sk-ant',
    base: 'https://api.anthropic.com'
  }, [{ role: 'system', content: 'rules' }, { role: 'user', content: 'idea' }], { schema: FREEFORM_SCHEMA, maxOutputTokens: 1000 })
  assert.equal(anthropic.url, 'https://api.anthropic.com/v1/messages')
  assert.equal(anthropic.headers['x-api-key'], 'sk-ant')
  assert.equal(anthropic.headers['anthropic-version'], '2023-06-01')
  assert.equal(anthropic.body.temperature, undefined)
  assert.equal(anthropic.body.tool_choice.type, 'auto')
  assert.equal(anthropic.body.thinking.type, 'between_tools')
  const thinkingOn = anthropicRequest({
    id: 'anthropic',
    model: 'claude-sonnet-5-5',
    apiKey: 'sk-ant',
    base: 'https://api.anthropic.com',
    thinking: 'on'
  }, [{ role: 'user', content: 'idea' }])
  assert.equal(thinkingOn.body.thinking, undefined)
  assert.match(anthropic.body.system, /Always answer by calling the emit_result tool exactly once/)
  assert.equal(anthropic.body.tools[0].input_schema.required[0], 'html')
  const openai = openAiResponsesRequest({
    id: 'openai',
    model: 'gpt-6-astra',
    apiKey: 'sk-live',
    base: 'https://api.openai.com/v1'
  }, [{ role: 'system', content: 'rules' }, { role: 'user', content: 'idea' }], { schema: FREEFORM_SCHEMA, schemaName: 'freeform_html' })
  assert.equal(openai.url, 'https://api.openai.com/v1/responses')
  assert.equal(openai.body.temperature, undefined)
  assert.equal(openai.body.store, false)
  assert.equal(openai.body.text.format.strict, true)
  assert.equal(schemaIsStrict(EDIT_SCHEMA), false)
})

test('a 429 falls through to the next provider and a 401 does not', async () => {
  const urls = []
  const quota = async (url) => {
    urls.push(url)
    if (String(url).includes('generativelanguage')) return new Response('{"error":{"code":429,"status":"RESOURCE_EXHAUSTED","message":"quota"}}', { status: 429 })
    return new Response(JSON.stringify({ output_text: JSON.stringify(validSpec) }), { status: 200 })
  }
  const switched = await generateGame({
    prompt: 'dodge falling meteors',
    env: { AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'g', OPENAI_API_KEY: 'o', AI_FALLBACKS: 'openai' },
    fetchImpl: quota
  })
  assert.equal(switched.provider, 'openai')
  assert.equal(urls.length, 2)
  let denied = 0
  await assert.rejects(() => generateGame({
    prompt: 'dodge falling meteors',
    env: { AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'g', OPENAI_API_KEY: 'o', AI_FALLBACKS: 'openai' },
    fetchImpl: async () => { denied += 1; return new Response('nope', { status: 401 }) }
  }), (err) => err.code === 'ai_provider_auth')
  assert.equal(denied, 1)
})

test('bakeoff uses a live key when one is set and fixtures otherwise', () => {
  assert.equal(providerRunEnv('anthropic', { ANTHROPIC_API_KEY: 'sk-ant-live' }).live, true)
  assert.equal(providerRunEnv('anthropic', { ANTHROPIC_API_KEY: 'sk-ant-live', BAKEOFF_FIXTURES: '1' }).live, false)
  assert.equal(providerRunEnv('gemini', {}).live, false)
  assert.equal(providerRunEnv('openai', { OPENAI_API_KEY: 'fixture' }).live, false)
})

test('fixture bakeoff writes a report without a browser', async () => {
  const outDir = await mkdtemp(path.join(tmpdir(), 'bakeoff-'))
  const results = await runBakeoff({
    prompts: ['wordle', 'tower defense'],
    providers: ['gemini', 'anthropic'],
    outDir,
    smoke: false
  })
  assert.equal(results.length, 4)
  assert.equal(results.every((row) => row.ok), true)
  assert.equal(results.filter((row) => row.prompt === 'wordle').every((row) => row.strategy === 'remix'), true)
  assert.equal(results.filter((row) => row.prompt === 'tower defense').every((row) => row.strategy === 'freeform'), true)
  const report = await readFile(path.join(outDir, 'bakeoff.md'), 'utf8')
  assert.match(report, /wordle/)
  assert.match(report, /tower defense/)
  const saved = JSON.parse(await readFile(path.join(outDir, 'bakeoff.json'), 'utf8'))
  assert.equal(saved.results.length, 4)
})

test('bakeoff can compare a run with research turned off', async () => {
  const outDir = await mkdtemp(path.join(tmpdir(), 'bakeoff-off-'))
  const results = await runBakeoff({
    prompts: ['wordle', 'tower defense'],
    providers: ['gemini', 'anthropic'],
    outDir,
    smoke: false,
    research: false
  })
  assert.equal(results.length, 4)
  assert.equal(results.every((row) => row.ok), true)
  assert.equal(results.every((row) => row.strategy === ''), true)
})

test('a template fallback is not credited to the model', async () => {
  const outDir = await mkdtemp(path.join(tmpdir(), 'bakeoff-fallback-'))
  const results = await runBakeoff({
    prompts: ['wordle'],
    providers: ['gemini'],
    outDir,
    smoke: false,
    env: { GEMINI_API_KEY: 'sk-live', AI_PROVIDER: 'gemini', AI_FALLBACKS: '' },
    fetchImpl: async () => new Response(JSON.stringify({ error: { code: 503, status: 'UNAVAILABLE', message: 'overloaded' } }), { status: 503 })
  })
  assert.equal(results.length, 1)
  assert.equal(results[0].ok, false)
  assert.equal(results[0].fallback, true)
  assert.equal(results[0].mode, 'template')
  assert.equal(results[0].model, null)
  assert.equal(results[0].errors.includes('template fallback'), true)
  const report = await readFile(path.join(outDir, 'bakeoff.md'), 'utf8')
  assert.match(report, /template fallback/)
})
