import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { generateGame, parseModelJson, SYSTEM_PROMPT } from '../src/ai/generate.js'
import { geminiResponseSchema, validateGameSpec } from '../src/ai/gamespec.js'
import { aiStatus, geminiRequest, openAiRequest, resolveProvider } from '../src/ai/providers.js'
import { loadConfig } from '../src/config.js'
import { databaseKind, openDatabase } from '../src/db.js'
import { redact } from '../src/log.js'
import { migrate } from '../src/migrate.js'
import { hashPassword, verifyPassword } from '../src/passwords.js'
import { rankScores } from '../src/scores.js'
import { seedIfEmpty } from '../src/seed.js'
import { generateTemplate } from '../src/template.js'
import { slugify } from '../src/validate.js'
import { validSpec } from '../testing/helpers.js'

test('slug, template matcher, and per-mechanic ranking', () => {
  assert.equal(slugify('Cosmic Rush!'), 'cosmic-rush')
  assert.equal(generateTemplate('space dodge falling meteors').type, 'dodge')
  assert.equal(generateTemplate('space dodge falling meteors').name, 'Cosmic Rush')
  assert.equal(generateTemplate('a quick green reaction test').type, 'reaction')
  assert.equal(generateTemplate('guess the mystery number').type, 'guess')
  assert.equal(generateTemplate('cute cat tap challenge').name, 'Cat Dash')
  assert.match(generateTemplate('coffee cafe tap game').notice, /template matcher/)
  const reaction = rankScores([
    { name: 'slow', points: 400, createdAt: '2026-10-10T00:00:00.000Z', unit: 'ms' },
    { name: 'fast', points: 120, createdAt: '2026-10-10T00:00:01.000Z', unit: 'ms' }
  ], 'reaction')
  assert.deepEqual(reaction.map((score) => score.name), ['fast', 'slow'])
  assert.equal(reaction[0].ranking, 'lower')
  assert.equal(reaction[0].verified, false)
  const taps = rankScores([
    { name: 'low', points: 5, createdAt: '2026-10-10T00:00:00.000Z', unit: 'taps' },
    { name: 'high', points: 20, createdAt: '2026-10-10T00:00:01.000Z', unit: 'taps' }
  ], 'tap')
  assert.deepEqual(taps.map((score) => score.name), ['high', 'low'])
})

test('passwords round-trip and reject a wrong password', async () => {
  const hash = await hashPassword('correct-horse', { N: 1024 })
  assert.equal(await verifyPassword('correct-horse', hash), true)
  assert.equal(await verifyPassword('wrong-horse', hash), false)
  assert.equal(await verifyPassword('correct-horse', 'nope'), false)
})

test('config refuses a production boot without Postgres and a session secret', () => {
  assert.throws(() => loadConfig({ NODE_ENV: 'production' }), /SESSION_SECRET/)
  assert.throws(() => loadConfig({
    NODE_ENV: 'production',
    SESSION_SECRET: 'prod-secret',
    DATABASE_URL: 'pglite:memory'
  }), /postgres/)
  const prod = loadConfig({
    NODE_ENV: 'production',
    SESSION_SECRET: 'prod-secret',
    DATABASE_URL: 'postgres://playground:playground@localhost:5432/playground'
  })
  assert.equal(prod.cookieSecure, true)
  assert.equal(prod.seedOnEmpty, false)
  assert.equal(databaseKind(prod.databaseUrl), 'postgres')
  assert.equal(databaseKind('pglite:memory'), 'pglite')
})

test('logs redact secrets', () => {
  assert.equal(redact({ password: 'hunter2', port: 3000 }).password, '[redacted]')
  assert.equal(redact({ apiKey: 'sk-test', provider: 'gemini' }).apiKey, '[redacted]')
})

test('GameSpecV1 accepts a valid spec and rejects executable output', () => {
  const spec = validateGameSpec(validSpec)
  assert.equal(spec.version, '1')
  assert.equal(spec.accent, '#ff779e')
  assert.throws(() => validateGameSpec({ ...validSpec, script: 'alert(1)' }), /Executable field/)
  assert.throws(() => validateGameSpec({ ...validSpec, version: '2' }), /version/)
  assert.throws(() => validateGameSpec({ ...validSpec, runtime: 'minecraft' }), /runtime/)
  assert.throws(() => validateGameSpec({
    ...validSpec,
    runtime: 'reaction',
    scoring: { direction: 'higher', label: 'Reaction', unit: 'ms' }
  }), /direction/)
  const schema = JSON.stringify(geminiResponseSchema())
  assert.equal(schema.includes('"$ref"'), false)
  assert.equal(schema.includes('"oneOf"'), false)
  assert.equal(schema.includes('"anyOf"'), false)
  assert.equal(schema.includes('"pattern"'), false)
  assert.match(SYSTEM_PROMPT, /GameSpecV1/)
  assert.match(SYSTEM_PROMPT, /JavaScript/)
})

test('provider selection prefers Gemini, then xAI, then OpenAI', () => {
  assert.equal(resolveProvider({}), null)
  assert.equal(aiStatus({}).mode, 'template')
  const gemini = resolveProvider({ GEMINI_API_KEY: 'g', XAI_API_KEY: 'x', OPENAI_API_KEY: 'o' })
  assert.equal(gemini.id, 'gemini')
  assert.equal(gemini.model, 'gemini-3.8-flash')
  assert.equal(resolveProvider({ AI_PROVIDER: 'xai', GEMINI_API_KEY: 'g', XAI_API_KEY: 'x' }).id, 'xai')
  assert.equal(resolveProvider({ AI_PROVIDER: 'openai', OPENAI_API_KEY: 'o' }).model, 'gpt-4o-mini')
  assert.equal(resolveProvider({ GEMINI_MODEL: 'custom-gemini', GEMINI_API_KEY: 'g' }).model, 'custom-gemini')
})

test('Gemini and OpenAI-compatible requests match the provider contracts', () => {
  const gemini = geminiRequest({
    id: 'gemini',
    model: 'gemini-3.8-flash',
    apiKey: 'secret-gemini',
    base: 'https://generativelanguage.googleapis.com/v1beta'
  }, [{ role: 'system', content: 'rules' }, { role: 'user', content: 'idea' }])
  assert.equal(gemini.url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent')
  assert.equal(gemini.headers['x-goog-api-key'], 'secret-gemini')
  assert.equal(gemini.body.generationConfig.responseMimeType, 'application/json')
  assert.equal(gemini.body.generationConfig.responseJsonSchema.type, 'object')
  assert.equal(gemini.body.contents[0].parts[0].text, 'idea')
  const openai = openAiRequest({
    id: 'xai',
    model: 'grok-3',
    apiKey: 'secret-xai',
    base: 'https://api.x.ai/v1/'
  }, [{ role: 'user', content: 'idea' }])
  assert.equal(openai.url, 'https://api.x.ai/v1/chat/completions')
  assert.equal(openai.headers.authorization, 'Bearer secret-xai')
  assert.equal(openai.body.response_format.type, 'json_object')
  assert.equal(openai.body.model, 'grok-3')
})

test('AI generation retries invalid model output and then accepts a valid spec', async () => {
  let calls = 0
  const fetchImpl = async () => {
    calls += 1
    const text = calls < 3 ? '{"version":"1","script":"alert(1)"}' : JSON.stringify(validSpec)
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status: 200 })
  }
  const result = await generateGame({
    prompt: 'a space game about dodging meteors',
    env: { AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'test-key' },
    fetchImpl
  })
  assert.equal(calls, 3)
  assert.equal(result.mode, 'ai')
  assert.equal(result.provider, 'gemini')
  assert.equal(result.spec.runtime, 'dodge')
  assert.equal(result.game.type, 'dodge')
})

test('AI generation stops after three invalid responses', async () => {
  let calls = 0
  const fetchImpl = async () => {
    calls += 1
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'not-json' }] } }] }), { status: 200 })
  }
  await assert.rejects(() => generateGame({
    prompt: 'a space game about dodging meteors',
    env: { AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'super-secret-key' },
    fetchImpl
  }), (err) => {
    assert.equal(err.status, 502)
    assert.equal(err.code, 'ai_invalid_output')
    assert.equal(String(err.message).includes('super-secret-key'), false)
    return true
  })
  assert.equal(calls, 3)
  assert.equal(parseModelJson('```json\n{"a":1}\n```').a, 1)
})

test('a rejected provider key is not retried', async () => {
  let calls = 0
  const fetchImpl = async () => {
    calls += 1
    return new Response('nope', { status: 401 })
  }
  await assert.rejects(() => generateGame({
    prompt: 'a space game about dodging meteors',
    env: { AI_PROVIDER: 'openai', OPENAI_API_KEY: 'super-secret-key' },
    fetchImpl
  }), (err) => err.code === 'ai_provider_error' && err.status === 502)
  assert.equal(calls, 1)
})

test('template mode does not call the network', async () => {
  let calls = 0
  const result = await generateGame({
    prompt: 'cute cat tap challenge please',
    env: {},
    fetchImpl: async () => { calls += 1; return new Response('{}') }
  })
  assert.equal(calls, 0)
  assert.equal(result.mode, 'template')
  assert.equal(result.game.name, 'Cat Dash')
  assert.equal(result.spec.version, '1')
})

test('model output is data, never evaluated', () => {
  for (const file of ['src/ai/generate.js', 'src/ai/providers.js', 'src/ai/gamespec.js', 'src/app.js', 'public/mechanics.js']) {
    const text = readFileSync(path.join(process.cwd(), file), 'utf8')
    assert.equal(text.includes('eval('), false, file)
    assert.equal(text.includes('new Function'), false, file)
  }
})

test('file-backed PGlite data survives a restart', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'playground-pg-'))
  try {
    const first = await openDatabase(`pglite://${dir}`)
    await migrate(first)
    const seeded = await seedIfEmpty(first)
    assert.equal(seeded, 4)
    await first.query(`update games set plays = 4 where id = 'click-frenzy'`)
    await first.close()
    const second = await openDatabase(`pglite://${dir}`)
    const rows = await second.query(`select plays from games where id = 'click-frenzy'`)
    assert.equal(Number(rows.rows[0].plays), 4)
    const again = await migrate(second)
    assert.deepEqual(again, [])
    await second.close()
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
