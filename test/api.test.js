import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import { createClient, startServer, validSpec } from '../testing/helpers.js'

describe('http api', { concurrency: false }, () => {
  let server
  let client
  let owner
  let game

  before(async () => {
    server = await startServer()
    client = createClient(server.base)
    await client.prime()
  })

  after(async () => {
    await server.close()
  })

  test('GET /api/health', async () => {
    const res = await client.request('GET', '/api/health')
    assert.equal(res.status, 200)
    assert.equal(res.data.ok, true)
    assert.equal(res.data.version, '0.3.0')
    assert.equal(res.data.db, 'up')
    assert.equal(res.data.ai.mode, 'template')
    assert.equal(JSON.stringify(res.data).includes('test-session-secret'), false)
  })

  test('GET /api/auth/csrf and GET /api/auth/me', async () => {
    const csrf = await client.request('GET', '/api/auth/csrf')
    assert.equal(csrf.status, 200)
    assert.match(csrf.data.csrfToken, /^[A-Za-z0-9_-]{20,}$/)
    const me = await client.request('GET', '/api/auth/me')
    assert.equal(me.status, 200)
    assert.equal(me.data.user, null)
  })

  test('GET /api/games returns the seeded catalog', async () => {
    const res = await client.request('GET', '/api/games')
    assert.equal(res.status, 200)
    const ids = res.data.games.map((item) => item.id)
    assert.deepEqual(ids.sort(), ['click-frenzy', 'lightning-reflex', 'lucky-seven', 'meteor-dodge'])
    assert.equal(res.data.games.every((item) => item.plays === 0), true)
  })

  test('POST /api/generate stays on the template matcher', async () => {
    const bad = await client.request('POST', '/api/generate', { prompt: 'short' })
    assert.equal(bad.status, 400)
    const res = await client.request('POST', '/api/generate', { prompt: 'space dodge falling meteors' })
    assert.equal(res.status, 200)
    assert.equal(res.data.mode, 'template')
    assert.equal(res.data.game.type, 'dodge')
    assert.equal(res.data.game.name, 'Cosmic Rush')
    assert.match(res.data.notice, /template matcher/)
    assert.equal(res.data.spec.version, '1')
  })

  test('POST /api/ai/generate is template mode without a key', async () => {
    const status = await client.request('GET', '/api/ai/status')
    assert.equal(status.data.mode, 'template')
    assert.match(status.data.notice, /Template mode/)
    const res = await client.request('POST', '/api/ai/generate', { prompt: 'guess the mystery number please' })
    assert.equal(res.status, 200)
    assert.equal(res.data.mode, 'template')
    assert.equal(res.data.provider, null)
    assert.equal(res.data.game.type, 'guess')
  })

  test('write routes reject missing auth and missing CSRF', async () => {
    const anonymous = await client.request('POST', '/api/games', {
      name: 'Nope Game', description: 'nope', type: 'tap', duration: 10, accent: '#aabbcc'
    })
    assert.equal(anonymous.status, 401)
    const forged = await client.request('POST', '/api/games', {
      name: 'Nope Game', description: 'nope', type: 'tap', duration: 10, accent: '#aabbcc'
    }, { csrf: false })
    assert.equal(forged.status, 403)
    assert.equal(forged.data.code, 'csrf')
  })

  test('POST /api/auth/register, login, logout', async () => {
    const created = await client.request('POST', '/api/auth/register', {
      email: 'Ada@Example.com',
      password: 'test-password-123',
      displayName: 'Ada'
    })
    assert.equal(created.status, 201)
    assert.equal(created.data.user.email, 'ada@example.com')
    assert.equal(created.data.user.displayName, 'Ada')
    assert.ok(created.data.csrfToken)
    owner = created.data.user
    const duplicate = await client.request('POST', '/api/auth/register', {
      email: 'ada@example.com', password: 'test-password-123', displayName: 'Ada'
    })
    assert.equal(duplicate.status, 409)
    const me = await client.request('GET', '/api/auth/me')
    assert.equal(me.data.user.id, owner.id)
    await client.request('POST', '/api/auth/logout', {})
    assert.equal((await client.request('GET', '/api/auth/me')).data.user, null)
    const bad = await client.request('POST', '/api/auth/login', { email: 'ada@example.com', password: 'not-the-password' })
    assert.equal(bad.status, 401)
    const login = await client.request('POST', '/api/auth/login', { email: 'ada@example.com', password: 'test-password-123' })
    assert.equal(login.status, 200)
    assert.equal(login.data.user.displayName, 'Ada')
  })

  test('POST /api/games validates input and stores an owned game', async () => {
    const invalid = await client.request('POST', '/api/games', { name: 'X', type: 'pinball', duration: 4 })
    assert.equal(invalid.status, 400)
    const res = await client.request('POST', '/api/games', {
      name: 'A <b>bee</b>',
      description: 'Tap the flower',
      type: 'tap',
      duration: 10,
      accent: '#A88BFF',
      tokenInterest: true,
      verified: true
    })
    assert.equal(res.status, 201)
    assert.equal(res.data.version, 1)
    assert.equal(res.data.url, '/g/a-b-bee-b')
    assert.equal(res.data.game.plays, 0)
    assert.equal(res.data.game.tokenInterest, true)
    assert.equal(res.data.game.ownerId, owner.id)
    assert.equal(res.data.game.canEdit, true)
    assert.equal(res.data.game.spec.version, '1')
    assert.equal(res.data.game.assets[0].kind, 'accent')
    game = res.data.game
  })

  test('GET /api/games/:id and static studio shell', async () => {
    const found = await client.request('GET', `/api/games/${game.id}`)
    assert.equal(found.status, 200)
    assert.equal(found.data.game.name, 'A <b>bee</b>')
    const missing = await client.request('GET', '/api/games/missing-game')
    assert.equal(missing.status, 404)
    const page = await client.request('GET', `/g/${game.id}`)
    assert.equal(page.status, 200)
    assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'none'/)
    assert.equal(page.headers.get('x-frame-options'), 'DENY')
    const home = await client.request('GET', '/')
    assert.match(home.text, /Think it\./)
    const script = await client.request('GET', '/app.js')
    assert.equal(script.status, 200)
    assert.match(script.headers.get('content-type'), /javascript/)
  })

  test('opening a game does not count a play; play_started does', async () => {
    const before = await client.request('GET', `/api/games/${game.id}`)
    assert.equal(before.data.game.plays, 0)
    const viewed = await client.request('POST', `/api/games/${game.id}/events`, {
      type: 'game_viewed',
      eventId: 'view-event-0001'
    })
    assert.equal(viewed.status, 200)
    assert.equal(viewed.data.plays, 0)
    const started = await client.request('POST', `/api/games/${game.id}/events`, {
      type: 'play_started',
      eventId: 'play-event-0001'
    })
    assert.equal(started.data.plays, 1)
    const duplicate = await client.request('POST', `/api/games/${game.id}/events`, {
      type: 'play_started',
      eventId: 'play-event-0001'
    })
    assert.equal(duplicate.data.duplicate, true)
    assert.equal(duplicate.data.plays, 1)
    const legacy = await client.request('POST', `/api/games/${game.id}/play`)
    assert.equal(legacy.status, 200)
    assert.equal(legacy.data.plays, 2)
    const done = await client.request('POST', `/api/games/${game.id}/events`, { type: 'play_completed', eventId: 'done-event-0001' })
    assert.equal(done.data.plays, 2)
  })

  test('scores are unverified and ranked per mechanic', async () => {
    const bad = await client.request('POST', `/api/games/${game.id}/scores`, { name: 'Ada', points: -1 })
    assert.equal(bad.status, 400)
    const saved = await client.request('POST', `/api/games/${game.id}/scores`, {
      name: 'Ada',
      points: 12,
      mechanic: 'tap',
      verified: true
    })
    assert.equal(saved.status, 201)
    assert.equal(saved.data.verified, false)
    assert.equal(saved.data.scores[0].verified, false)
    assert.equal(saved.data.scores[0].ranking, 'higher')
    assert.equal(saved.data.scores[0].unit, 'taps')
    const mismatch = await client.request('POST', `/api/games/${game.id}/scores`, { name: 'Ada', points: 10, mechanic: 'dodge' })
    assert.equal(mismatch.status, 400)
    const reaction = await client.request('POST', '/api/games', {
      name: 'Flash Round', description: 'Wait for green', type: 'reaction', duration: 10, accent: '#4adeb9'
    })
    await client.request('POST', `/api/games/${reaction.data.game.id}/scores`, { name: 'Slow', points: 800 })
    const board = await client.request('POST', `/api/games/${reaction.data.game.id}/scores`, { name: 'Fast', points: 180 })
    assert.deepEqual(board.data.scores.map((score) => score.name), ['Fast', 'Slow'])
    assert.equal(board.data.scores[0].ranking, 'lower')
    const listed = await client.request('GET', `/api/games/${reaction.data.game.id}/scores`)
    assert.equal(listed.data.scores[0].name, 'Fast')
    assert.equal(listed.data.verified, false)
  })

  test('only the owner can edit or archive', async () => {
    const other = createClient(server.base)
    await other.prime()
    await other.request('POST', '/api/auth/register', {
      email: 'other@example.com', password: 'test-password-123', displayName: 'Bea'
    })
    const forbidden = await other.request('PATCH', `/api/games/${game.id}`, {
      name: 'Stolen', description: 'no', type: 'tap', duration: 10, accent: '#112233'
    })
    assert.equal(forbidden.status, 403)
    const archiveForbidden = await other.request('POST', `/api/games/${game.id}/archive`, {})
    assert.equal(archiveForbidden.status, 403)
    const updated = await client.request('PATCH', `/api/games/${game.id}`, {
      name: 'A <b>bee</b>',
      description: 'Tap the flower faster',
      type: 'tap',
      duration: 15,
      accent: '#a88bff'
    })
    assert.equal(updated.status, 200)
    assert.equal(updated.data.version, 2)
    assert.equal(updated.data.game.duration, 15)
    const archived = await client.request('POST', `/api/games/${game.id}/archive`, {})
    assert.equal(archived.status, 200)
    assert.equal(archived.data.game.status, 'archived')
    const hidden = await other.request('GET', `/api/games/${game.id}`)
    assert.equal(hidden.status, 404)
    const ownerView = await client.request('GET', `/api/games/${game.id}`)
    assert.equal(ownerView.status, 200)
    const list = await client.request('GET', '/api/games')
    assert.equal(list.data.games.some((item) => item.id === game.id), false)
    const mine = await client.request('GET', '/api/me/games')
    assert.equal(mine.data.games.some((item) => item.id === game.id && item.status === 'archived'), true)
    const play = await client.request('GET', `/play/${game.id}`)
    assert.equal(play.status, 404)
  })

  test('play and share pages for a published game', async () => {
    const page = await client.request('GET', '/play/meteor-dodge')
    assert.equal(page.status, 200)
    assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'self' https:\/\/x\.com https:\/\/\*\.x\.com https:\/\/twitter\.com/)
    assert.equal(page.headers.get('x-frame-options'), null)
    assert.match(page.text, /Meteor Dodge/)
    assert.match(page.text, /play\.js/)
    const nasty = await client.request('POST', '/api/games', {
      name: 'A <b>bee</b>',
      description: 'Tap <b>fast</b>',
      type: 'tap',
      duration: 10,
      accent: '#a88bff'
    })
    assert.equal(nasty.status, 201)
    const html = await client.request('GET', `/play/${nasty.data.game.id}`)
    assert.equal(html.text.includes('<b>bee</b>'), false)
    assert.equal(html.text.includes('<b>fast</b>'), false)
    assert.match(html.text, /A &lt;b&gt;bee&lt;\/b&gt;/)
    assert.match(html.text, /Tap &lt;b&gt;fast&lt;\/b&gt;/)
    const blocked = await client.request('POST', '/api/games', {
      name: 'Script Game',
      description: 'Safe <script>alert(1)</script> text',
      type: 'tap',
      duration: 10,
      accent: '#a88bff'
    })
    assert.equal(blocked.status, 400)
    const share = await client.request('GET', '/r/meteor-dodge')
    assert.equal(share.status, 200)
    assert.match(share.headers.get('content-security-policy'), /https:\/\/x\.com/)
    assert.match(share.text, /\/play\/meteor-dodge/)
    assert.equal(share.text.includes('twitter:player'), false)
    assert.equal(share.text.includes('twitter:card'), false)
  })

  test('POST /api/abuse-reports', async () => {
    const bad = await client.request('POST', '/api/abuse-reports', { gameId: 'missing-game', reason: 'spam', details: 'nope' })
    assert.equal(bad.status, 404)
    const res = await client.request('POST', '/api/abuse-reports', {
      gameId: 'meteor-dodge',
      reason: 'spam',
      details: 'Copied a poster'
    })
    assert.equal(res.status, 201)
    assert.equal(res.data.report.status, 'open')
    const reason = await client.request('POST', '/api/abuse-reports', { gameId: 'meteor-dodge', reason: 'piracy' })
    assert.equal(reason.status, 400)
  })

  test('unknown routes and bad JSON', async () => {
    assert.equal((await client.request('GET', '/api/missing')).status, 404)
    const raw = await fetch(server.base + '/api/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-csrf-token': 'x', cookie: 'pg_csrf=x' },
      body: '{oops'
    })
    assert.equal(raw.status, 400)
    const typed = await fetch(server.base + '/api/generate', {
      method: 'POST',
      headers: { 'content-type': 'text/plain', 'x-csrf-token': 'x', cookie: 'pg_csrf=x' },
      body: '{}'
    })
    assert.equal(typed.status, 415)
  })
})

describe('ai route and rate limit', { concurrency: false }, () => {
  test('POST /api/ai/generate uses the mocked provider for a signed-in creator', async () => {
    let calls = 0
    const server = await startServer({
      env: { AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'route-test-key', GEMINI_MODEL: 'gemini-3.8-flash' },
      fetchImpl: async (url, options) => {
        calls += 1
        assert.match(url, /models\/gemini-3\.8-flash:generateContent$/)
        const body = JSON.parse(options.body)
        assert.equal(body.generationConfig.responseMimeType, 'application/json')
        assert.ok(body.generationConfig.responseJsonSchema)
        assert.equal(options.headers['x-goog-api-key'], 'route-test-key')
        return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(validSpec) }] } }] }), { status: 200 })
      }
    })
    try {
      const client = createClient(server.base)
      await client.prime()
      const anon = await client.request('POST', '/api/ai/generate', { prompt: 'a space dodge game please' })
      assert.equal(anon.status, 401)
      assert.equal(calls, 0)
      const legacy = await client.request('POST', '/api/generate', { prompt: 'a space dodge game please' })
      assert.equal(legacy.data.mode, 'template')
      assert.equal(calls, 0)
      await client.request('POST', '/api/auth/register', { email: 'ai@example.com', password: 'test-password-123', displayName: 'Ai' })
      const res = await client.request('POST', '/api/ai/generate', { prompt: 'a space dodge game please' })
      assert.equal(res.status, 200)
      assert.equal(res.data.mode, 'ai')
      assert.equal(res.data.provider, 'gemini')
      assert.equal(res.data.model, 'gemini-3.8-flash')
      assert.equal(res.data.spec.runtime, 'dodge')
      assert.equal(calls, 1)
      const status = await client.request('GET', '/api/ai/status')
      assert.equal(status.data.mode, 'ai')
      assert.equal(JSON.stringify(status.data).includes('route-test-key'), false)
    } finally {
      await server.close()
    }
  })

  test('xAI uses the OpenAI-compatible adapter', async () => {
    let urlSeen = ''
    const server = await startServer({
      env: { AI_PROVIDER: 'xai', XAI_API_KEY: 'xai-test-key' },
      fetchImpl: async (url) => {
        urlSeen = url
        const spec = { ...validSpec, name: 'Grok Dash', runtime: 'tap', duration: 15, accent: '#a88bff', scoring: { direction: 'higher', label: 'Score', unit: 'taps' } }
        return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(spec) } }] }), { status: 200 })
      }
    })
    try {
      const client = createClient(server.base)
      await client.prime()
      await client.request('POST', '/api/auth/register', { email: 'xai@example.com', password: 'test-password-123' })
      const res = await client.request('POST', '/api/ai/generate', { prompt: 'make a tap game about coffee' })
      assert.equal(res.status, 200)
      assert.equal(res.data.provider, 'xai')
      assert.equal(urlSeen, 'https://api.x.ai/v1/chat/completions')
      assert.equal(res.data.game.name, 'Grok Dash')
    } finally {
      await server.close()
    }
  })

  test('rate limits and health exemption', async () => {
    const server = await startServer({ env: { RATE_LIMIT_MAX: '2', AUTH_RATE_LIMIT_MAX: '100' }, seed: false })
    try {
      const first = await fetch(server.base + '/api/games')
      const second = await fetch(server.base + '/api/games')
      const third = await fetch(server.base + '/api/games')
      assert.equal(first.status, 200)
      assert.equal(second.status, 200)
      assert.equal(third.status, 429)
      const health = await fetch(server.base + '/api/health')
      assert.equal(health.status, 200)
    } finally {
      await server.close()
    }
  })
})
