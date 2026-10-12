import assert from 'node:assert/strict'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { anthropicRequest, openAiResponsesRequest, schemaIsStrict } from '../src/ai/providers.js'
import { FREEFORM_SCHEMA } from '../src/ai/freeform.js'
import { EDIT_SCHEMA } from '../src/templates/cheatsheet.js'
import { runBakeoff } from '../src/ai/bakeoff.js'
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
  assert.equal(anthropic.body.tool_choice.name, 'emit_result')
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
  const report = await readFile(path.join(outDir, 'bakeoff.md'), 'utf8')
  assert.match(report, /wordle/)
  assert.match(report, /tower defense/)
  const saved = JSON.parse(await readFile(path.join(outDir, 'bakeoff.json'), 'utf8'))
  assert.equal(saved.results.length, 4)
})
