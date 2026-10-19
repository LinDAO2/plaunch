import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { EXAMPLE_GAMES } from '../src/arcade/examples.js'
import { classifyTier, heuristicTier, normalizeTier } from '../src/ai/classify.js'
import { generateIdea } from '../src/ai/idea.js'
import { clearResearchCache } from '../src/ai/research.js'
import { ensureHowToPlay, FREEFORM_PROMPT, generateFreeform, playabilityNotes, templateFreeform } from '../src/ai/freeform.js'
import { inspectFreeform } from '../src/ai/freeform-check.js'
import { generateGame, parseModelJson, requestModelText, streamIsThinking, streamPayloadChars, SYSTEM_PROMPT, THINKING_STALL_MS } from '../src/ai/generate.js'
import { sandboxCsp } from '../src/usercontent.js'
import { geminiResponseSchema, validateGameSpec } from '../src/ai/gamespec.js'
import { createSimulation } from '../public/arcade-sim.js'
import { checkPlausible, plausibilityFor } from '../src/plausibility.js'
import { posterPng, POSTER_SIZE } from '../src/poster.js'
import { resolvePoster, saveStoredPoster, schedulePosterCapture } from '../src/poster-store.js'
import { aiStatus, foldProviderStream, freeformTimeoutMs, geminiRequest, openAiRequest, resolveProvider, resolveProviderChain } from '../src/ai/providers.js'
import { loadConfig, registrableDomain } from '../src/config.js'
import { blocklistReason, classifySafety } from '../src/safety.js'
import { tagsFor } from '../src/ai/tags.js'
import { databaseKind, openDatabase } from '../src/db.js'
import { redact } from '../src/log.js'
import { migrate } from '../src/migrate.js'
import { hashPassword, verifyPassword } from '../src/passwords.js'
import { specsAreDistinct } from '../src/ai/distinct.js'
import { SAMPLE_SPECS } from '../src/ai/samples.js'
import { rankScores } from '../src/scores.js'
import { seedIfEmpty } from '../src/seed.js'
import { resolveArtifactsDir } from '../testing/helpers.js'
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
  assert.equal(prod.safetyModelOnPublish, true)
  assert.equal(loadConfig({
    NODE_ENV: 'production',
    SESSION_SECRET: 'prod-secret',
    DATABASE_URL: 'postgres://playground:playground@localhost:5432/playground',
    PUBLIC_BASE_URL: 'https://play.example.com',
    USERCONTENT_ORIGIN: 'https://usercontent.example',
    SAFETY_MODEL_ON_PUBLISH: 'false'
  }).safetyModelOnPublish, false)
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
  assert.equal(dev.safetyModelOnPublish, false)
  assert.equal(loadConfig({ NODE_ENV: 'development', SAFETY_MODEL_ON_PUBLISH: 'true' }).safetyModelOnPublish, true)
  assert.equal(loadConfig({}).safetyModelOnPublish, false)
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

test('provider selection prefers Anthropic, then Gemini, then xAI, then OpenAI', () => {
  assert.equal(resolveProvider({}), null)
  assert.equal(aiStatus({}).mode, 'template')
  const gemini = resolveProvider({ GEMINI_API_KEY: 'g', XAI_API_KEY: 'x', OPENAI_API_KEY: 'o' })
  assert.equal(gemini.id, 'gemini')
  assert.equal(gemini.model, 'gemini-3.5-flash')
  assert.equal(resolveProvider({ AI_PROVIDER: 'xai', GEMINI_API_KEY: 'g', XAI_API_KEY: 'x' }).id, 'xai')
  assert.equal(resolveProvider({ AI_PROVIDER: 'openai', OPENAI_API_KEY: 'o' }).model, 'gpt-6-astra')
  assert.equal(resolveProvider({ ANTHROPIC_API_KEY: 'a' }).id, 'anthropic')
  assert.equal(resolveProvider({ ANTHROPIC_API_KEY: 'a' }).model, 'claude-sonnet-5-5')
  assert.equal(resolveProvider({ ANTHROPIC_API_KEY: 'a' }).thinking, 'off')
  assert.equal(resolveProvider({ ANTHROPIC_API_KEY: 'a', ANTHROPIC_THINKING: 'on' }).thinking, 'on')
  assert.equal(resolveProvider({ GEMINI_API_KEY: 'g', XAI_API_KEY: 'x', OPENAI_API_KEY: 'o', ANTHROPIC_API_KEY: 'a' }).id, 'anthropic')
  assert.equal(resolveProvider({ AI_PROVIDER_SPEC: 'anthropic', AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'g', ANTHROPIC_API_KEY: 'a' }, 'spec').id, 'anthropic')
  assert.equal(resolveProvider({ GEMINI_MODEL: 'custom-gemini', GEMINI_API_KEY: 'g' }).model, 'custom-gemini')
  const chain = resolveProviderChain({ ANTHROPIC_API_KEY: 'a', GEMINI_API_KEY: 'g' })
  assert.deepEqual(chain.map((item) => item.id), ['anthropic', 'gemini'])
  assert.deepEqual(resolveProviderChain({ ANTHROPIC_API_KEY: 'a', GEMINI_API_KEY: 'g', AI_FALLBACKS: '' }).map((item) => item.id), ['anthropic'])
  assert.equal(freeformTimeoutMs({}), 180000)
  assert.equal(freeformTimeoutMs({ AI_FREEFORM_TIMEOUT_MS: '90000' }), 90000)
  assert.equal(resolveProvider({ GEMINI_API_KEY: 'g' }).timeoutMs, 60000)
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
  }), (err) => err.code === 'ai_provider_auth' && err.status === 502 && err.upstream?.status === 401)
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

function playUntil(spec, seed, inputFor) {
  const sim = createSimulation(validateGameSpec(spec), seed)
  let snap = sim.snapshot()
  for (let i = 0; i < 800 && !snap.over; i++) snap = sim.tick(50, inputFor(snap))
  return snap
}

test('homing gems does not win while idle, and shadow chase lasts a full round', () => {
  const gems = EXAMPLE_GAMES.find((game) => game.id === 'homing-gems').spec
  const idleGems = playUntil(gems, 1, () => ({}))
  assert.equal(idleGems.won, false)
  assert.ok(idleGems.time > 8000, `idle gems ended at ${idleGems.time}`)
  const playedGems = playUntil(gems, 2, (snap) => ({
    left: Math.sin(snap.time / 1000 * 1.5) < 0,
    right: Math.sin(snap.time / 1000 * 1.5) >= 0
  }))
  assert.ok(playedGems.time >= 20000, `played gems ended at ${playedGems.time}`)
  const chase = EXAMPLE_GAMES.find((game) => game.id === 'shadow-chase').spec
  const idleChase = playUntil(chase, 1, () => ({}))
  assert.ok(idleChase.time > 12000, `idle chase ended at ${idleChase.time}`)
  const playedChase = playUntil(chase, 4, (snap) => {
    const t = snap.time / 1000
    return { left: Math.sin(t) < 0, right: Math.sin(t) >= 0, up: Math.cos(t) > 0, down: Math.cos(t) <= 0 }
  })
  assert.ok(playedChase.time >= 20000, `played chase ended at ${playedChase.time}`)
})

test('arcade sim follows the mouse in keys games and moves in 2D in chase games', () => {
  const rain = EXAMPLE_GAMES.find((game) => game.id === 'meteor-rain').spec
  const sim = createSimulation(validateGameSpec(rain), 1)
  let snap = sim.snapshot()
  assert.equal(snap.playerX, 50)
  for (let i = 0; i < 20; i++) snap = sim.tick(50, { pointerX: 10 })
  assert.equal(snap.playerX, 10)
  const one = createSimulation(validateGameSpec(rain), 1)
  const glide = one.tick(50, { pointerX: 90 })
  assert.ok(glide.playerX > 50 && glide.playerX < 90, `capped glide ${glide.playerX}`)
  const keyed = createSimulation(validateGameSpec(rain), 1).tick(50, { pointerX: 90, left: true })
  assert.ok(keyed.playerX < 50, `keys win over pointer ${keyed.playerX}`)
  const chaseSpec = EXAMPLE_GAMES.find((game) => game.id === 'shadow-chase').spec
  const runner = createSimulation(validateGameSpec(chaseSpec), 1)
  const startY = runner.snapshot().playerY
  let fled = runner.snapshot()
  for (let i = 0; i < 10; i++) fled = runner.tick(50, { up: true })
  assert.ok(fled.playerY < startY - 10, `chase up ${fled.playerY}`)
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

test('a stored capture replaces the title card and tests do not launch one', async () => {
  const db = await openDatabase('pglite:memory')
  try {
    await migrate(db)
    await db.query(
      `insert into games (id, name, mechanic, duration, accent, tier, generation, freeform_html)
       values ('dot-run', 'Dot Run', 'arcade', 60, '#e6ff3a', 'freeform', 'import', '<html></html>')`
    )
    const row = { id: 'dot-run', name: 'Dot Run', tier: 'freeform', freeformHtml: '<html></html>', posterState: '' }
    schedulePosterCapture(db, row, 'test')
    const pending = await db.query(`select poster_state from games where id = 'dot-run'`)
    assert.equal(pending.rows[0].poster_state, '')
    const card = await resolvePoster(db, { ...row, type: 'arcade', accent: '#e6ff3a', updatedAt: 't' })
    assert.equal(card.kind, 'card')
    assert.equal(card.bytes.readUInt32BE(16), POSTER_SIZE)
    const shot = posterPng({ id: 'stored-dot', name: 'Stored', accent: '#112233', type: 'arcade', updatedAt: 't' })
    assert.equal(await saveStoredPoster(db, 'dot-run', shot), true)
    const served = await resolvePoster(db, { ...row, posterState: 'shot', type: 'arcade', accent: '#e6ff3a', updatedAt: 't' })
    assert.equal(served.kind, 'shot')
    assert.equal(served.bytes.equals(shot), true)
  } finally {
    await db.close()
  }
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
    assert.equal(seeded, 33)
    const names = await first.query(`select name, credit->>'author' as author from games`)
    const blob = names.rows.map((row) => `${row.name}|${row.author || ''}`).join('\n')
    assert.equal(/Ada Run|Zip Run|Dot Run|Submitter|Ada Lovelace/.test(blob), false)
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
  const peek = inspectFreeform('<html><body><canvas></canvas><script>parent.document.title; top.location.href</script>playground-score</body></html>')
  assert.ok(peek.some((error) => /Parent page access/.test(error)))
  assert.deepEqual(inspectFreeform(templateFreeform('parent postMessage only')), [])
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
  assert.equal(csp.startsWith("default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data: blob:; media-src data: blob:; connect-src 'self' blob:; "), true)
  assert.equal(csp.includes('unsafe-eval'), false)
  assert.equal(csp.includes('wasm-unsafe-eval'), false)
  assert.match(csp, /; sandbox allow-scripts allow-pointer-lock;/)
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
  assert.match(FREEFORM_PROMPT, /#FFD23F/)
  assert.match(FREEFORM_PROMPT, /\/kaplay\.js/)
  assert.match(FREEFORM_PROMPT, /compact code/)
  assert.match(FREEFORM_PROMPT, /30 seconds/)
  assert.equal(playabilityNotes(templateFreeform('pong')).length, 0)
  assert.match(SYSTEM_PROMPT, /#1B1B2F/)
})

test('an unsure idea asks the model which tier to use', async () => {
  clearResearchCache()
  let calls = 0
  const fetchImpl = async (_url, init) => {
    calls += 1
    const body = String(init?.body || '')
    let text = JSON.stringify(validSpec)
    if (body.includes('coreLoop')) {
      text = JSON.stringify({
        coreLoop: 'Walk the picnic and tap a snack.',
        controls: 'Tap the blanket.',
        juice: 'A soft pop on each hit.',
        fun: 'A short calm round is enough.'
      })
    } else if (body.includes('"tier"')) {
      text = '{"tier":"spec"}'
    }
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status: 200 })
  }
  const result = await generateIdea({
    prompt: 'a quiet night picnic',
    tier: 'auto',
    env: { AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'test-key' },
    fetchImpl
  })
  assert.equal(calls, 3)
  assert.equal(result.tier, 'spec')
  assert.match(result.tierReason, /model/)
  assert.equal(result.research.brief.source, 'model')
})

test('tags follow the mechanic and the idea', () => {
  const dodge = tagsFor({ name: 'Meteor Dodge', description: 'Dodge falling meteors.', mechanic: 'dodge', tier: 'spec' })
  assert.ok(dodge.includes('dodge'))
  assert.equal(dodge.includes('sandbox'), false)
  const chess = tagsFor({ prompt: 'a chess game on a board', mechanic: 'arcade', tier: 'freeform' })
  assert.ok(chess.includes('puzzle'))
  assert.ok(chess.includes('sandbox'))
  const runner = tagsFor({ prompt: 'endless runner where you jump over cacti', mechanic: 'arcade', tier: 'freeform' })
  assert.ok(runner.includes('runner'))
})

test('the blocklist flags sexual content and leaves arcade copy alone', () => {
  assert.equal(blocklistReason('Dodge falling meteors in a tiny arena.'), '')
  assert.equal(blocklistReason('Cosmic Rush'), '')
  assert.equal(blocklistReason('an nsfw porn night'), 'sexual content')
})

test('gemini safety classification runs only when the blocklist is clean and a key is set', async () => {
  let calls = 0
  const fetchImpl = async () => {
    calls += 1
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"flag":true,"reason":"hate"}' }] } }] }), { status: 200 })
  }
  const hit = await classifySafety({ text: 'a sunny garden tap', env: { GEMINI_API_KEY: 'k', NODE_ENV: 'production' }, fetchImpl })
  assert.equal(calls, 1)
  assert.equal(hit.flagged, true)
  assert.equal(hit.source, 'gemini')
  assert.equal(hit.reason, 'hate')
  const local = await classifySafety({ text: 'nsfw porn', env: { GEMINI_API_KEY: 'k' }, fetchImpl })
  assert.equal(calls, 1)
  assert.equal(local.source, 'blocklist')
  const offline = await classifySafety({ text: 'a sunny garden tap', env: { NODE_ENV: 'production' }, fetchImpl })
  assert.equal(offline.flagged, false)
  assert.equal(calls, 1)
})

test('SAFETY_MODEL_ON_PUBLISH=false skips the Gemini safety call and keeps the blocklist', async () => {
  let calls = 0
  const fetchImpl = async () => {
    calls += 1
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"flag":true,"reason":"hate"}' }] } }] }), { status: 200 })
  }
  const skipped = await classifySafety({
    text: 'a sunny garden tap',
    env: { GEMINI_API_KEY: 'k', NODE_ENV: 'production', SAFETY_MODEL_ON_PUBLISH: 'false' },
    fetchImpl
  })
  assert.equal(calls, 0)
  assert.equal(skipped.flagged, false)
  assert.equal(skipped.source, 'skipped')
  const dev = await classifySafety({
    text: 'a sunny garden tap',
    env: { GEMINI_API_KEY: 'k', NODE_ENV: 'development' },
    fetchImpl
  })
  assert.equal(calls, 0)
  assert.equal(dev.source, 'skipped')
  const local = await classifySafety({
    text: 'nsfw porn',
    env: { GEMINI_API_KEY: 'k', SAFETY_MODEL_ON_PUBLISH: 'false' },
    fetchImpl
  })
  assert.equal(local.source, 'blocklist')
  assert.equal(local.flagged, true)
  assert.equal(calls, 0)
})

test('screenshot artifacts use the first directory mkdir accepts', async () => {
  const calls = []
  const mkdirImpl = async (dir) => {
    calls.push(dir)
    if (dir === '/blocked' || dir === '/opt/cursor/artifacts') {
      const error = new Error('EACCES')
      error.code = 'EACCES'
      throw error
    }
  }
  const fallback = await resolveArtifactsDir({
    env: { ARTIFACTS_DIR: '/blocked' },
    cwd: '/work',
    mkdirImpl
  })
  assert.equal(fallback, path.join('/work', 'artifacts'))
  assert.deepEqual(calls, ['/blocked', '/opt/cursor/artifacts', path.join('/work', 'artifacts')])

  calls.length = 0
  const preferred = await resolveArtifactsDir({
    env: { ARTIFACTS_DIR: '/custom/out' },
    cwd: '/work',
    mkdirImpl
  })
  assert.equal(preferred, '/custom/out')
  assert.deepEqual(calls, ['/custom/out'])

  calls.length = 0
  const vm = await resolveArtifactsDir({ env: { ARTIFACTS_DIR: '   ' }, cwd: '/work', mkdirImpl: async (dir) => { calls.push(dir) } })
  assert.equal(vm, '/opt/cursor/artifacts')
  assert.deepEqual(calls, ['/opt/cursor/artifacts'])

  const dir = await mkdtemp(path.join(os.tmpdir(), 'pg-artifacts-'))
  try {
    assert.equal(await resolveArtifactsDir({ env: { ARTIFACTS_DIR: dir }, cwd: '/work' }), dir)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('create stays on shared block worlds', () => {
  const html = readFileSync(path.join(process.cwd(), 'public/index.html'), 'utf8')
  const app = readFileSync(path.join(process.cwd(), 'public/app.js'), 'utf8')
  assert.match(html, /Make a shared block world from one sentence/)
  assert.equal(/fashion studio|cozy fishing|survival frontier|playable game from one sentence/i.test(html), false)
  assert.match(app, /kind: 'world'/)
  assert.equal(html.includes('recipe-card'), false)
})

test('the site palette is black, off-white, and acid yellow', () => {
  const style = readFileSync(path.join(process.cwd(), 'public/style.css'), 'utf8')
  const play = readFileSync(path.join(process.cwd(), 'public/play.css'), 'utf8')
  const css = `${style}\n${play}`
  assert.match(style, /radial-gradient/)
  assert.equal(/radial-gradient|linear-gradient/.test(play), false)
  assert.equal(/#b397ff/i.test(css), false)
  assert.match(css, /--brand:\s*#e6ff3a/)
  assert.match(css, /--surface:\s*#111318/)
  assert.match(css, /--surface-raised:\s*#191c22/)
  assert.match(css, /--muted:\s*#71767b/)
  assert.match(css, /--bg:\s*#000/)
  assert.match(css, /bricolage-grotesque-latin-700\.woff2/)
  assert.match(css, /source-sans-3-latin-400\.woff2/)
  assert.match(css, /ibm-plex-mono-latin-400\.woff2/)
  for (const file of ['OFL-BricolageGrotesque.txt', 'OFL-SourceSans3.txt', 'OFL-IBMPlexMono.txt', 'OFL-LilitaOne.txt', 'OFL-Rubik.txt', 'OFL-ChakraPetch.txt']) {
    assert.match(readFileSync(path.join(process.cwd(), 'public/fonts', file), 'utf8'), /SIL Open Font License/)
  }
})

test('usercontent injects the WebRTC prelude before game code', async () => {
  const { withPrelude, SANDBOX_PRELUDE } = await import('../src/usercontent.js')
  const out = withPrelude('<!DOCTYPE html><html><head><title>x</title></head><body><canvas></canvas><script>go()</script></body></html>')
  assert.equal(out.indexOf(SANDBOX_PRELUDE) > out.indexOf('<head>'), true)
  assert.equal(out.indexOf(SANDBOX_PRELUDE) < out.indexOf('<title>'), true)
  assert.equal(withPrelude('<canvas></canvas>').startsWith(SANDBOX_PRELUDE), true)
})

test('Gemini errors keep their real status; only 503 is labeled busy', async () => {
  const { describeUpstreamError } = await import('../src/ai/providers.js')
  const provider = { id: 'gemini', model: 'gemini-3.5-flash', apiKey: 'AIzaSyTESTKEY000000000000000000000' }
  const internal = describeUpstreamError(provider, 500, '{"error":{"code":500,"message":"Internal error encountered.","status":"INTERNAL"}}')
  assert.equal(internal.code, 'ai_provider_internal')
  assert.doesNotMatch(internal.message, /overloaded/)
  assert.match(internal.message, /HTTP 500 INTERNAL: Internal error encountered/)
  const busy = describeUpstreamError(provider, 503, '{"error":{"code":503,"message":"The model is overloaded.","status":"UNAVAILABLE"}}')
  assert.equal(busy.code, 'ai_provider_busy')
  const bad = describeUpstreamError(provider, 400, '{"error":{"code":400,"message":"Unknown name \\"thinkingLevel\\" for key AIzaSyTESTKEY000000000000000000000","status":"INVALID_ARGUMENT"}}')
  assert.equal(bad.code, 'ai_request_rejected')
  assert.equal(bad.retry, false)
  assert.match(bad.upstream.message, /thinkingLevel/)
  assert.doesNotMatch(JSON.stringify(bad), /AIzaSyTESTKEY/)
  assert.equal(describeUpstreamError(provider, 404, '{"error":{"status":"NOT_FOUND","message":"models/x is not found"}}').code, 'ai_model_not_found')
  assert.equal(describeUpstreamError(provider, 429, '{"error":{"status":"RESOURCE_EXHAUSTED","message":"quota"}}').code, 'ai_quota_exceeded')
  assert.equal(describeUpstreamError(provider, 403, '{"error":{"status":"PERMISSION_DENIED","message":"denied"}}').code, 'ai_provider_auth')
})

test('freeform generation retries a transient 500 once and surfaces a 400 without retrying', async () => {
  process.env.AI_RETRY_DELAY_MS = '1'
  let calls = 0
  const ok = { candidates: [{ content: { parts: [{ text: JSON.stringify({ html: templateFreeform('a wordle game') }) }] } }] }
  const flaky = async () => {
    calls += 1
    if (calls === 1) return new Response('{"error":{"code":500,"status":"INTERNAL","message":"Internal error encountered."}}', { status: 500 })
    return new Response(JSON.stringify(ok), { status: 200 })
  }
  const result = await generateFreeform({ prompt: 'a wordle game', env: { GEMINI_API_KEY: 'g', AI_PROVIDER: 'gemini' }, fetchImpl: flaky })
  assert.equal(result.mode, 'ai')
  assert.equal(calls, 2)
  calls = 0
  const rejecting = async () => { calls += 1; return new Response('{"error":{"code":400,"status":"INVALID_ARGUMENT","message":"Invalid JSON payload received."}}', { status: 400 }) }
  await assert.rejects(
    generateFreeform({ prompt: 'a wordle game', env: { GEMINI_API_KEY: 'g', AI_PROVIDER: 'gemini' }, fetchImpl: rejecting }),
    (err) => err.code === 'ai_request_rejected' && err.upstream.status === 400 && /Invalid JSON payload/.test(err.message)
  )
  assert.equal(calls, 1)
  delete process.env.AI_RETRY_DELAY_MS
})

test('a truncated Anthropic stream stays nonempty and continues once under 12k tokens', async () => {
  const partial = [
    'event: content_block_delta',
    'data: {"type":"content_block_delta","delta":{"type":"input_json_delta","partial_json":"{\\"html\\":\\"<p>"}}',
    '',
    'event: message_delta',
    'data: {"type":"message_delta","delta":{"stop_reason":"max_tokens"},"usage":{"output_tokens":8000}}',
    ''
  ].join('\n')
  const folded = foldProviderStream('anthropic', partial)
  assert.equal(folded.truncated, true)
  assert.match(folded.text, /<p>/)
  const bodies = []
  let calls = 0
  const fetchImpl = async (_url, init) => {
    calls += 1
    bodies.push(JSON.parse(init.body))
    if (calls === 1) return new Response(partial, { status: 200, headers: { 'content-type': 'text/event-stream' } })
    return new Response(JSON.stringify({
      content: [{ type: 'tool_use', name: 'emit_result', input: { html: 'rest' } }],
      stop_reason: 'end_turn',
      usage: { output_tokens: 20 }
    }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  const text = await requestModelText({
    id: 'anthropic',
    model: 'claude-sonnet-5-5',
    apiKey: 'sk-ant',
    base: 'https://api.anthropic.com',
    timeoutMs: 60000
  }, [{ role: 'user', content: 'idea' }], fetchImpl, {
    stream: true,
    continueOnTruncation: true,
    maxOutputTokens: 8000
  })
  assert.equal(calls, 2)
  assert.match(text, /<p>/)
  assert.match(text, /rest/)
  assert.equal(bodies[1].max_tokens <= 4000, true)
  assert.equal(bodies[0].stream, true)
  assert.equal(bodies[1].max_tokens, 4000)
})

test('an empty max_tokens reply still continues once', async () => {
  const partial = [
    'event: message_delta',
    'data: {"type":"message_delta","delta":{"stop_reason":"max_tokens"},"usage":{"output_tokens":8000}}',
    ''
  ].join('\n')
  const bodies = []
  let calls = 0
  const fetchImpl = async (_url, init) => {
    calls += 1
    bodies.push(JSON.parse(init.body))
    if (calls === 1) return new Response(partial, { status: 200, headers: { 'content-type': 'text/event-stream' } })
    return new Response(JSON.stringify({
      content: [{ type: 'tool_use', name: 'emit_result', input: { html: '<p>ready</p>' } }],
      stop_reason: 'end_turn',
      usage: { output_tokens: 30 }
    }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  const text = await requestModelText({
    id: 'anthropic',
    model: 'claude-sonnet-5-5',
    apiKey: 'sk-ant',
    base: 'https://api.anthropic.com',
    timeoutMs: 60000
  }, [{ role: 'user', content: 'idea' }], fetchImpl, {
    stream: true,
    continueOnTruncation: true,
    maxOutputTokens: 8000
  })
  assert.equal(calls, 2)
  assert.match(text, /ready/)
  assert.match(JSON.stringify(bodies[1].messages), /hit the output cap/)
  assert.equal(bodies[1].max_tokens, 4000)
})

test('freeform self-check asks again when the game cannot score', async () => {
  let calls = 0
  const quiet = '<!DOCTYPE html><html><body><canvas id="c"></canvas><script>parent.postMessage({ type: "playground-score", points: 0 }, "*")</script></body></html>'
  const fetchImpl = async () => {
    calls += 1
    const html = calls === 1 ? quiet : templateFreeform('tower defense')
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ html }) }] } }] }), { status: 200 })
  }
  const result = await generateFreeform({
    prompt: 'tower defense please',
    env: { AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'g', AI_FALLBACKS: '' },
    fetchImpl
  })
  assert.equal(calls, 2)
  assert.match(result.html, /press Space/i)
  assert.equal(playabilityNotes(quiet).length > 0, true)
})

test('a playable game missing the how-to-play line keeps the shell overlay', async () => {
  let calls = 0
  const playing = `<!DOCTYPE html><html><body><canvas id="c"></canvas><script>
let score = 0
function draw(){ const c = document.getElementById('c').getContext('2d'); c.fillText('score '+score, 8, 16) }
addEventListener('keydown', () => { score += 1; parent.postMessage({ type: 'playground-score', points: score }, '*'); draw() })
addEventListener('pointerdown', () => { score += 1; parent.postMessage({ type: 'playground-score', points: score }, '*'); draw() })
</script></body></html>`
  const fetchImpl = async () => {
    calls += 1
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ html: playing }) }] } }] }), { status: 200 })
  }
  const result = await generateFreeform({
    prompt: 'tower defense please',
    env: { AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'g', AI_FALLBACKS: '' },
    fetchImpl
  })
  assert.equal(calls, 1)
  assert.equal(playabilityNotes(playing).length, 0)
  assert.match(result.html, /id="pg-how"/)
  assert.match(result.html, /How to play: Press Space, an arrow key, or tap\./)
  assert.equal(ensureHowToPlay(templateFreeform('pong')), templateFreeform('pong'))
})

test('tool-use streams wait out Anthropic pings and count real payload tokens', () => {
  const openTool = [
    'data: {"type":"message_start"}',
    'data: {"type":"content_block_start","content_block":{"type":"tool_use","name":"emit_result"}}',
    'data: {"type":"ping"}'
  ].join('\n')
  assert.equal(streamIsThinking(openTool), true)
  assert.equal(Math.max(25_000, THINKING_STALL_MS), 90_000)
  const texting = [
    'data: {"type":"content_block_start","content_block":{"type":"text"}}',
    'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"hello"}}',
    'data: {"type":"content_block_stop"}'
  ].join('\n')
  assert.equal(streamIsThinking(texting), false)
  assert.equal(streamPayloadChars('{"text":"abcd","partial_json":"xy","thinking":"z"}'), 7)
})

test('billing, auth, and quota failures fail over and a dead provider stays down', async () => {
  const { clearProviderCooldowns, describeUpstreamError, noteProviderDown, resolveProviderChain } = await import('../src/ai/providers.js')
  clearProviderCooldowns()
  const provider = { id: 'anthropic', model: 'claude-sonnet-5-5' }
  const bill = describeUpstreamError(provider, 400, '{"error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API."}}')
  assert.equal(bill.code, 'ai_billing')
  assert.equal(bill.retry, false)
  assert.equal(bill.failover, true)
  assert.equal(describeUpstreamError(provider, 401, '{"error":{"type":"authentication_error","message":"invalid x-api-key"}}').failover, true)
  assert.equal(describeUpstreamError(provider, 429, '{"error":{"type":"rate_limit_error","message":"rate limited"}}').code, 'ai_quota_exceeded')
  const plain = describeUpstreamError(provider, 400, '{"error":{"type":"invalid_request_error","message":"Invalid JSON payload received."}}')
  assert.equal(plain.code, 'ai_request_rejected')
  assert.equal(plain.failover, false)
  const env = {
    AI_PROVIDER: 'anthropic',
    ANTHROPIC_API_KEY: 'a',
    OPENAI_API_KEY: 'o',
    GEMINI_API_KEY: 'g'
  }
  assert.deepEqual(resolveProviderChain(env).map((item) => item.id), ['anthropic', 'openai', 'gemini'])
  noteProviderDown('anthropic', { code: 'ai_billing' }, 1000, { AI_PROVIDER_COOLDOWN_MS: 600000 })
  assert.deepEqual(resolveProviderChain(env, undefined, 2000).map((item) => item.id), ['openai', 'gemini'])
  clearProviderCooldowns()
})
