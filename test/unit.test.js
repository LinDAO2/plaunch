import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { EXAMPLE_GAMES } from '../src/arcade/examples.js'
import { classifyTier, heuristicTier, normalizeTier } from '../src/ai/classify.js'
import { generateIdea } from '../src/ai/idea.js'
import { FREEFORM_PROMPT, generateFreeform, templateFreeform } from '../src/ai/freeform.js'
import { inspectFreeform } from '../src/ai/freeform-check.js'
import { generateGame, parseModelJson, SYSTEM_PROMPT } from '../src/ai/generate.js'
import { sandboxCsp } from '../src/usercontent.js'
import { geminiResponseSchema, validateGameSpec } from '../src/ai/gamespec.js'
import { createSimulation } from '../public/arcade-sim.js'
import { checkPlausible, plausibilityFor } from '../src/plausibility.js'
import { posterPng, POSTER_SIZE } from '../src/poster.js'
import { aiStatus, geminiRequest, openAiRequest, resolveProvider } from '../src/ai/providers.js'
import { loadConfig, registrableDomain } from '../src/config.js'
import { databaseKind, openDatabase } from '../src/db.js'
import { redact } from '../src/log.js'
import { migrate } from '../src/migrate.js'
import { hashPassword, verifyPassword } from '../src/passwords.js'
import { specsAreDistinct } from '../src/ai/distinct.js'
import { SAMPLE_SPECS } from '../src/ai/samples.js'
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
  assert.throws(() => loadConfig({
    NODE_ENV: 'production',
    SESSION_SECRET: 'prod-secret',
    DATABASE_URL: 'postgres://playground:playground@localhost:5432/playground'
  }), /USERCONTENT_ORIGIN/)
  assert.throws(() => loadConfig({
    NODE_ENV: 'production',
    SESSION_SECRET: 'prod-secret',
    DATABASE_URL: 'postgres://playground:playground@localhost:5432/playground',
    USERCONTENT_ORIGIN: 'https://usercontent.example'
  }), /PUBLIC_BASE_URL/)
  const prod = loadConfig({
    NODE_ENV: 'production',
    SESSION_SECRET: 'prod-secret',
    DATABASE_URL: 'postgres://playground:playground@localhost:5432/playground',
    PUBLIC_BASE_URL: 'https://play.example.com',
    USERCONTENT_ORIGIN: 'https://usercontent.example'
  })
  assert.equal(prod.publicBaseUrl, 'https://play.example.com')
  assert.equal(prod.usercontentOrigin, 'https://usercontent.example')
  assert.equal(prod.cookieSecure, true)
  assert.equal(prod.seedOnEmpty, false)
  assert.equal(databaseKind(prod.databaseUrl), 'postgres')
  assert.equal(databaseKind('pglite:memory'), 'pglite')
})

test('production refuses a sandbox on the same host or registrable domain', () => {
  assert.equal(registrableDomain('sandbox.example.co.uk'), 'example.co.uk')
  assert.equal(registrableDomain('foo.alice.github.io'), 'alice.github.io')
  assert.equal(registrableDomain('127.0.0.1'), '')
  const base = {
    NODE_ENV: 'production',
    SESSION_SECRET: 'prod-secret',
    DATABASE_URL: 'postgres://playground:playground@localhost:5432/playground',
    PUBLIC_BASE_URL: 'https://play.example.com'
  }
  assert.throws(() => loadConfig({ ...base, USERCONTENT_ORIGIN: 'https://play.example.com' }), /same host/)
  assert.throws(() => loadConfig({ ...base, USERCONTENT_ORIGIN: 'https://play.example.com:8443' }), /same host/)
  assert.throws(() => loadConfig({ ...base, USERCONTENT_ORIGIN: 'https://usercontent.play.example.com' }), /registrable domain "example.com"/)
  assert.throws(() => loadConfig({
    ...base,
    PUBLIC_BASE_URL: 'https://play.example.co.uk',
    USERCONTENT_ORIGIN: 'https://sandbox.example.co.uk'
  }), /registrable domain "example.co.uk"/)
  assert.throws(() => loadConfig({
    ...base,
    PUBLIC_BASE_URL: 'https://alice.github.io',
    USERCONTENT_ORIGIN: 'https://foo.alice.github.io'
  }), /registrable domain "alice.github.io"/)
  const separate = loadConfig({ ...base, USERCONTENT_ORIGIN: 'https://playgroundusercontent.com' })
  assert.equal(separate.usercontentOrigin, 'https://playgroundusercontent.com')
  const pages = loadConfig({
    ...base,
    PUBLIC_BASE_URL: 'https://alice.github.io',
    USERCONTENT_ORIGIN: 'https://bob.github.io'
  })
  assert.equal(pages.usercontentOrigin, 'https://bob.github.io')
  const ips = loadConfig({
    ...base,
    PUBLIC_BASE_URL: 'https://203.0.113.10',
    USERCONTENT_ORIGIN: 'https://203.0.113.20'
  })
  assert.equal(ips.usercontentOrigin, 'https://203.0.113.20')
  const allowed = loadConfig({
    ...base,
    USERCONTENT_ORIGIN: 'https://usercontent.play.example.com',
    ALLOW_SAME_SITE_USERCONTENT: 'true'
  })
  assert.equal(allowed.usercontentOrigin, 'https://usercontent.play.example.com')
  assert.throws(() => loadConfig({
    ...base,
    USERCONTENT_ORIGIN: 'https://usercontent.play.example.com',
    ALLOW_SAME_SITE_USERCONTENT: '1'
  }), /ALLOW_SAME_SITE_USERCONTENT/)
  const dev = loadConfig({
    NODE_ENV: 'development',
    PUBLIC_BASE_URL: 'https://play.example.com',
    USERCONTENT_ORIGIN: 'https://usercontent.play.example.com'
  })
  assert.equal(dev.usercontentOrigin, 'https://usercontent.play.example.com')
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
  assert.equal(schema.includes('"pattern":"'), false)
  assert.equal(schema.includes('"minLength"'), false)
  assert.match(schema, /"1\.1"/)
  assert.match(schema, /arcade/)
  assert.match(SYSTEM_PROMPT, /GameSpecV1/)
  assert.match(SYSTEM_PROMPT, /JavaScript/)
  assert.match(SYSTEM_PROMPT, /1\.1/)
})

test('provider selection prefers Gemini, then xAI, then OpenAI', () => {
  assert.equal(resolveProvider({}), null)
  assert.equal(aiStatus({}).mode, 'template')
  const gemini = resolveProvider({ GEMINI_API_KEY: 'g', XAI_API_KEY: 'x', OPENAI_API_KEY: 'o' })
  assert.equal(gemini.id, 'gemini')
  assert.equal(gemini.model, 'gemini-3.5-flash')
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

test('rankScores keeps the top 20 and a checked flag', () => {
  const scores = Array.from({ length: 21 }, (_, index) => ({
    name: `P${index}`,
    points: index,
    createdAt: '2026-10-10T00:00:00.000Z',
    assurance: index === 20 ? 'checked' : 'unverified'
  }))
  const ranked = rankScores(scores, 'tap')
  assert.equal(ranked.length, 20)
  assert.equal(ranked[0].points, 20)
  assert.equal(ranked[0].assurance, 'checked')
  assert.equal(ranked[0].verified, false)
  assert.equal(ranked[19].assurance, 'unverified')
})

test('arcade examples validate and diverge across seeded ticks', () => {
  assert.ok(EXAMPLE_GAMES.length >= 3)
  const signatures = new Set()
  for (const game of EXAMPLE_GAMES) {
    const spec = validateGameSpec(game.spec)
    assert.equal(spec.version, '1.1')
    assert.equal(spec.runtime, 'arcade')
    const once = runSpec(spec, 42, 80)
    const twice = runSpec(spec, 42, 80)
    assert.deepEqual(once, twice)
    const other = runSpec(spec, 99, 80)
    assert.notDeepEqual(once.entities, other.entities)
    signatures.add(`${spec.spawn.pattern}:${spec.movement}:${spec.controls.scheme}:${spec.rules.win}`)
  }
  assert.equal(signatures.size, EXAMPLE_GAMES.length)
  const rain = EXAMPLE_GAMES.find((game) => game.id === 'meteor-rain').spec
  const steady = createSimulation(validateGameSpec({ ...rain, spawn: { ...rain.spawn, pattern: 'lanes' } }), 2)
  let first = null
  for (let i = 0; i < 40; i++) {
    const snap = steady.tick(50, {})
    if (!snap.entities.length) continue
    if (!first) first = snap.entities[0]
    else if (snap.entities[0].y > first.y) {
      assert.equal(snap.entities[0].x, first.x)
      break
    }
  }
  const zig = EXAMPLE_GAMES.find((game) => game.id === 'zigzag-orbs').spec
  const weave = createSimulation(zig, 2)
  let zigSeen = null
  let zigMoved = false
  for (let i = 0; i < 40; i++) {
    const snap = weave.tick(50, {})
    const entity = snap.entities[0]
    if (!entity) continue
    if (zigSeen && entity.y > zigSeen.y && entity.x !== zigSeen.x) zigMoved = true
    zigSeen = entity
  }
  assert.equal(zigMoved, true)
  const homing = validateGameSpec({
    ...rain,
    movement: 'homing',
    spawn: { rate: 1.4, pattern: 'lanes' },
    entities: [rain.entities[0]]
  })
  const hunter = createSimulation(homing, 1)
  hunter.setPlayerX(90)
  let startX = null
  let homed = false
  for (let i = 0; i < 50; i++) {
    const snap = hunter.tick(50, {})
    const entity = snap.entities[0]
    if (!entity) continue
    if (startX === null) startX = entity.x
    if (entity.x > startX + 2) homed = true
  }
  assert.equal(homed, true)
})

test('arcade sim honors taps, combos, lives, and win rules', () => {
  const harvest = EXAMPLE_GAMES.find((game) => game.id === 'lane-harvest').spec
  const berries = validateGameSpec({
    ...harvest,
    entities: [harvest.entities[0]],
    spawn: { rate: 2, pattern: 'waves' },
    movement: 'straight',
    rules: { ...harvest.rules, win: 'score', targetScore: 100 },
    scoreRules: { pointsPerEntity: 10, comboMultiplier: 3 }
  })
  const picker = createSimulation(berries, 4)
  let scored = picker.snapshot()
  for (let i = 0; i < 80 && scored.score < 60; i++) {
    scored = picker.tick(50, {})
    const taps = scored.entities.filter((entity) => entity.y > -2).map((entity) => ({ x: entity.x, y: entity.y }))
    if (taps.length >= 3) scored = picker.tick(50, { taps })
  }
  assert.ok(scored.score >= 60, `combo score was ${scored.score}`)
  const rain = EXAMPLE_GAMES.find((game) => game.id === 'meteor-rain').spec
  const dodge = createSimulation(validateGameSpec({ ...rain, entities: [rain.entities[0]] }), 1)
  let hit = false
  for (let i = 0; i < 120; i++) {
    const before = dodge.snapshot()
    const hazard = before.entities.find((entity) => entity.kind === 'hazard')
    if (hazard) dodge.setPlayerX(hazard.x)
    const snap = dodge.tick(50, {})
    if (snap.lives < 3) {
      hit = true
      break
    }
  }
  assert.equal(hit, true)
  const survivor = validateGameSpec({
    ...rain,
    duration: 5,
    spawn: { rate: 0.8, pattern: 'lanes' },
    rules: { win: 'survive', seconds: 5, lives: 3, targetScore: 40 }
  })
  const lasting = createSimulation(survivor, 1)
  lasting.setPlayerX(6)
  let end = lasting.snapshot()
  for (let i = 0; i < 110; i++) end = lasting.tick(50, {})
  assert.equal(end.over, true)
  assert.equal(end.won, true)
})

test('poster png and score plausibility', () => {
  const png = posterPng({ id: 'meteor-dodge', name: 'Meteor Dodge', accent: '#ff779e', type: 'dodge', updatedAt: 't' })
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a')
  assert.equal(png.readUInt32BE(16), POSTER_SIZE)
  assert.equal(png.readUInt32BE(20), POSTER_SIZE)
  const other = posterPng({ id: 'lane-harvest', name: 'Lane Harvest', accent: '#4adeb9', type: 'arcade', updatedAt: 't' })
  assert.notEqual(png.equals(other), true)
  const tap = plausibilityFor({ type: 'tap', duration: 10 })
  assert.equal(checkPlausible(tap, 4, 2000).ok, true)
  assert.equal(checkPlausible(tap, 4, 100).ok, false)
  assert.equal(checkPlausible(tap, 400, 2000).ok, false)
})

function runSpec(spec, seed, ticks) {
  const sim = createSimulation(spec, seed)
  let snap = sim.snapshot()
  for (let i = 0; i < ticks; i++) snap = sim.tick(50, {})
  return snap
}

test('file-backed PGlite data survives a restart', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'playground-pg-'))
  try {
    const first = await openDatabase(`pglite://${dir}`)
    await migrate(first)
    const seeded = await seedIfEmpty(first)
    assert.equal(seeded, 10)
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

test('Gemini request sets low thinking and a 60s default timeout for Gemini 3 models', () => {
  const provider = resolveProvider({ GEMINI_API_KEY: 'g' })
  assert.equal(provider.timeoutMs, 60000)
  const req = geminiRequest(provider, [{ role: 'user', content: 'idea' }])
  assert.deepEqual(req.body.generationConfig.thinkingConfig, { thinkingLevel: 'low' })
  const off = geminiRequest(resolveProvider({ GEMINI_API_KEY: 'g', GEMINI_THINKING_LEVEL: 'off' }), [{ role: 'user', content: 'idea' }])
  assert.equal(off.body.generationConfig.thinkingConfig, undefined)
  const old = geminiRequest(resolveProvider({ GEMINI_API_KEY: 'g', GEMINI_MODEL: 'gemini-2.5-flash' }), [{ role: 'user', content: 'idea' }])
  assert.equal(old.body.generationConfig.thinkingConfig, undefined)
  assert.equal(resolveProvider({ GEMINI_API_KEY: 'g', AI_TIMEOUT_MS: '45000' }).timeoutMs, 45000)
})

test('palette salvages exact hex colors that Gemini merged into one string', () => {
  const spec = {
    version: '1.1', name: 'Meteor Drift', description: 'Dodge meteors.', theme: 'space', runtime: 'arcade', duration: 30,
    accent: '#f97316', scoring: { direction: 'higher', label: 'Stardust', unit: 'pts' }, difficulty: 'normal',
    controls: { keyboard: 'Arrows', touch: 'Drag', scheme: 'drag' },
    entities: [{ kind: 'hazard', label: 'Meteor', sprite: '☄️', points: 0, speed: 1.8, shape: 'circle' }],
    spawn: { rate: 2.8, pattern: 'rain' }, safety: { audience: 'general', notes: '' }, movement: 'straight',
    rules: { win: 'survive', seconds: 30, lives: 3, targetScore: 300 }, scoreRules: { pointsPerEntity: 15, comboMultiplier: 2 },
    palette: ["#0b0d1b','#1e1b4b','#f97316','#38bdf8"], player: { sprite: '🚀', scheme: 'drag' }
  }
  assert.deepEqual(validateGameSpec(spec).palette, ['#0b0d1b', '#1e1b4b', '#f97316', '#38bdf8'])
  assert.deepEqual(validateGameSpec({ ...spec, palette: ["#0b0d1b'", ' #1e1b4b'] }).palette, ['#0b0d1b', '#1e1b4b'])
  // Live gemini-3.5-flash output: bare hex and trailing names. The palette is cosmetic, so no retry.
  assert.deepEqual(validateGameSpec({ ...spec, palette: ['#06b6d4 Rhine Cyan', '06b6d4', '111827', '67e8f9'] }).palette, ['#06b6d4', '#111827', '#67e8f9'])
  assert.deepEqual(validateGameSpec({ ...spec, palette: ['red'] }).palette, ['#f97316'])
  assert.deepEqual(validateGameSpec({ ...spec, palette: ['#12345', 42] }).palette, ['#f97316'])
  assert.throws(() => validateGameSpec({ ...spec, palette: [] }), /palette/)
})

test('a Gemini 503 is retried once after a delay, not three times', async () => {
  const { generateGame } = await import('../src/ai/generate.js')
  process.env.AI_RETRY_DELAY_MS = '1'
  let calls = 0
  const fetchImpl = async () => { calls++; return new Response('{"error":{"code":503,"status":"UNAVAILABLE"}}', { status: 503 }) }
  await assert.rejects(
    generateGame({ prompt: 'dodge falling meteors', env: { GEMINI_API_KEY: 'g' }, fetchImpl }),
    (err) => err.code === 'ai_provider_busy' && /overloaded/.test(err.message)
  )
  delete process.env.AI_RETRY_DELAY_MS
  assert.equal(calls, 2)
})

test('Gemini 429 quota errors are not retried', async () => {
  const { generateGame } = await import('../src/ai/generate.js')
  let calls = 0
  const fetchImpl = async () => { calls++; return new Response('{"error":{"code":429}}', { status: 429 }) }
  await assert.rejects(
    generateGame({ prompt: 'dodge falling meteors', env: { GEMINI_API_KEY: 'g' }, fetchImpl }),
    (err) => err.code === 'ai_quota_exceeded' && /quota/.test(err.message)
  )
  assert.equal(calls, 1)
})

test('mocked provider samples differ on at least three play axes', async () => {
  assert.equal(SAMPLE_SPECS.length, 4)
  const specs = []
  for (const sample of SAMPLE_SPECS) {
    const result = await generateGame({
      prompt: 'make something that plays differently please',
      env: { GEMINI_API_KEY: 'g' },
      fetchImpl: async () => new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: JSON.stringify(sample) }] } }]
      }), { status: 200 })
    })
    specs.push(result.spec)
  }
  assert.equal(specsAreDistinct(specs, 3), true)
  assert.ok(new Set(specs.map((spec) => spec.spawn.rate)).size >= 3)
  assert.ok(new Set(specs.map((spec) => spec.scoreRules.comboMultiplier)).size >= 3)
  assert.ok(specs.some((spec) => spec.primitives.includes('popup')))
  assert.ok(specs.some((spec) => spec.primitives.includes('chase')))
  assert.ok(specs.some((spec) => spec.primitives.includes('shoot')))
  assert.ok(specs.some((spec) => spec.primitives.includes('platform')))
  assert.match(SYSTEM_PROMPT, /popup/)
  assert.match(SYSTEM_PROMPT, /Vary spawn\.rate/)
  assert.match(SYSTEM_PROMPT, /Mole Garden/)
})

test('arcade primitives change how a round plays', () => {
  const rain = EXAMPLE_GAMES.find((game) => game.id === 'meteor-rain').spec
  const mole = validateGameSpec({
    ...rain,
    primitives: ['popup'],
    lifetimeMs: 400,
    controls: { ...rain.controls, scheme: 'tap' },
    spawn: { rate: 0.4, pattern: 'lanes' },
    entities: [rain.entities[0]]
  })
  const garden = createSimulation(mole, 3)
  let seen = null
  let hidden = false
  for (let i = 0; i < 80; i++) {
    const snap = garden.tick(50, {})
    const entity = snap.entities[0]
    if (entity && !seen) {
      seen = entity
      assert.ok(entity.y > 10 && entity.y < 90, `popup y ${entity.y}`)
    }
    if (seen && snap.spawned === 1 && !snap.entities.length && snap.time > 400) hidden = true
  }
  assert.equal(hidden, true)

  const hunter = createSimulation(validateGameSpec({
    ...rain,
    primitives: ['chase'],
    lifetimeMs: 0,
    movement: 'homing',
    spawn: { rate: 4, pattern: 'lanes' },
    entities: [rain.entities[0]]
  }), 2)
  hunter.setPlayer(90, 8)
  let start = null
  let chased = false
  for (let i = 0; i < 50; i++) {
    const snap = hunter.tick(50, {})
    const entity = snap.entities[0]
    if (!entity) continue
    if (!start) start = { x: entity.x, y: entity.y }
    else if (entity.y < start.y - 2 && entity.x > start.x + 2) chased = true
  }
  assert.equal(chased, true)

  const shooter = createSimulation(validateGameSpec({
    ...rain,
    primitives: ['fall', 'shoot'],
    lifetimeMs: 0,
    spawn: { rate: 3, pattern: 'lanes' },
    entities: [rain.entities[0]],
    scoreRules: { pointsPerEntity: 10, comboMultiplier: 1 }
  }), 1)
  shooter.setPlayerX(18)
  let shot = shooter.snapshot()
  for (let i = 0; i < 40; i++) shot = shooter.tick(50, { fire: true })
  assert.ok(shot.score >= 10, `shot score ${shot.score}`)
  assert.equal(shot.lives, 3)

  const hopper = createSimulation(validateGameSpec({
    ...rain,
    primitives: ['fall', 'platform'],
    lifetimeMs: 0,
    controls: { ...rain.controls, scheme: 'keys' }
  }), 1)
  const ground = hopper.snapshot().playerY
  const jumped = hopper.tick(50, { jump: true })
  assert.ok(jumped.playerY < ground - 1, `jump y ${jumped.playerY}`)

  const mazeSpec = validateGameSpec({
    ...rain,
    primitives: ['maze'],
    lifetimeMs: 0,
    movement: 'straight',
    spawn: { rate: 0.2, pattern: 'lanes' }
  })
  const grid = createSimulation(mazeSpec, 5)
  const origin = grid.snapshot()
  assert.ok(origin.walls.length > 8)
  const blocked = grid.tick(200, { left: true })
  assert.equal(blocked.playerX, origin.playerX)
  const stepped = createSimulation(mazeSpec, 5)
  const moved = stepped.tick(200, { right: true })
  assert.ok(moved.playerX > origin.playerX + 10)
})

test('freeform checker accepts the template and rejects network and storage access', () => {
  assert.deepEqual(inspectFreeform(templateFreeform('a chess board')), [])
  const hostile = '<html><head></head><body><canvas></canvas><script src="https://cdn.example/app.js"></script><script>fetch("https://example.com"); new Function("return 1"); document.cookie; localStorage.getItem("x");</script>playground-score</body></html>'
  const errors = inspectFreeform(hostile)
  assert.ok(errors.some((error) => /script/i.test(error)))
  assert.ok(errors.some((error) => /URL/i.test(error)))
  assert.ok(errors.some((error) => /fetch/i.test(error)))
  assert.ok(errors.some((error) => /Function/i.test(error)))
  assert.ok(errors.some((error) => /cookie/i.test(error)))
  assert.ok(errors.some((error) => /localStorage/i.test(error)))
})

test('tier classification keeps arcade ideas on the spec and sends the rest to freeform', () => {
  assert.equal(classifyTier('a chess game'), 'freeform')
  assert.equal(classifyTier('tetris'), 'freeform')
  assert.equal(classifyTier('a platformer with keys and coins'), 'freeform')
  assert.equal(classifyTier('dodge the meteors'), 'spec')
  assert.equal(classifyTier('cute cat tap challenge'), 'spec')
  assert.equal(classifyTier('guess the mystery number'), 'spec')
  assert.equal(classifyTier('endless runner where you jump over cacti'), 'freeform')
  assert.equal(heuristicTier('a quiet night picnic'), 'uncertain')
  assert.equal(classifyTier('a quiet night picnic'), 'freeform')
  assert.equal(normalizeTier('nope', 'chess'), null)
  assert.equal(normalizeTier('freeform', 'dodge meteors'), 'freeform')
  assert.equal(normalizeTier('auto', 'dodge meteors'), 'spec')
})

test('sandbox CSP allows only inline code and frames the parent plus X', () => {
  const csp = sandboxCsp({ mainOrigins: ['http://127.0.0.1:9'], publicBaseUrl: 'https://play.example' })
  assert.equal(csp.startsWith("default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'none'; "), true)
  assert.match(csp, /; sandbox allow-scripts;/)
  assert.match(csp, /form-action 'none'/)
  assert.match(csp, /frame-src 'none'/)
  assert.match(csp, /http:\/\/127\.0\.0\.1:9/)
  assert.match(csp, /https:\/\/play\.example/)
  assert.match(csp, /https:\/\/x\.com/)
  assert.match(csp, /https:\/\/\*\.x\.com/)
  assert.match(csp, /https:\/\/twitter\.com/)
  assert.match(csp, /https:\/\/\*\.twitter\.com/)
})

test('freeform generation retries once with the checker errors, then accepts', async () => {
  let calls = 0
  const bodies = []
  const good = templateFreeform('a chess match')
  const bad = '<html><body><canvas></canvas><script>fetch("https://example.com/x")</script></body></html>'
  const fetchImpl = async (_url, options) => {
    calls += 1
    bodies.push(JSON.parse(options.body))
    const html = calls === 1 ? bad : good
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ html }) }] } }] }), { status: 200 })
  }
  const result = await generateFreeform({
    prompt: 'a chess match please',
    env: { AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'test-key' },
    fetchImpl
  })
  assert.equal(calls, 2)
  assert.equal(result.tier, 'freeform')
  assert.equal(result.spec, null)
  assert.match(result.html, /<canvas/i)
  const retry = JSON.stringify(bodies[1])
  assert.match(retry, /example\.com\/x/)
  assert.match(retry, /fetch is not allowed/)
  assert.match(retry, /Previous attempt/)
})

test('freeform generation stops after one failed retry', async () => {
  let calls = 0
  const fetchImpl = async () => {
    calls += 1
    const html = '<html><body><canvas></canvas><script>eval("1")</script></body></html>'
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ html }) }] } }] }), { status: 200 })
  }
  await assert.rejects(() => generateFreeform({
    prompt: 'a chess match please',
    env: { AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'test-key' },
    fetchImpl
  }), /Freeform game was rejected/)
  assert.equal(calls, 2)
})

test('freeform prompt asks for touch, visuals, and a best score', () => {
  assert.match(FREEFORM_PROMPT, /tap and drag/)
  assert.match(FREEFORM_PROMPT, /gradients/)
  assert.match(FREEFORM_PROMPT, /best score/i)
  assert.match(FREEFORM_PROMPT, /playground-score/)
})

test('an unsure idea asks the model which tier to use', async () => {
  let calls = 0
  const fetchImpl = async () => {
    calls += 1
    const text = calls === 1 ? '{"tier":"spec"}' : JSON.stringify(validSpec)
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status: 200 })
  }
  const result = await generateIdea({
    prompt: 'a quiet night picnic',
    tier: 'auto',
    env: { AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'test-key' },
    fetchImpl
  })
  assert.equal(calls, 2)
  assert.equal(result.tier, 'spec')
  assert.match(result.tierReason, /model/)
})

test('usercontent injects the WebRTC prelude before game code', async () => {
  const { withPrelude, SANDBOX_PRELUDE } = await import('../src/usercontent.js')
  const out = withPrelude('<!DOCTYPE html><html><head><title>x</title></head><body><canvas></canvas><script>go()</script></body></html>')
  assert.equal(out.indexOf(SANDBOX_PRELUDE) > out.indexOf('<head>'), true)
  assert.equal(out.indexOf(SANDBOX_PRELUDE) < out.indexOf('<title>'), true)
  assert.equal(withPrelude('<canvas></canvas>').startsWith(SANDBOX_PRELUDE), true)
})
