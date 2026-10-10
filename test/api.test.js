import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import { createClient, startServer, validSpec } from '../testing/helpers.js'

describe('http api', { concurrency: false }, () => {
  let server
  let client
  let owner
  let game

  before(async () => {
    server = await startServer({
      env: { PUBLIC_BASE_URL: 'https://play.example', X_SITE_HANDLE: 'playground' }
    })
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
    assert.equal(res.data.version, '0.9.0')
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
    assert.deepEqual(ids.sort(), ['blocks-candy-moon', 'blocks-grassland', 'click-frenzy', 'homing-gems', 'lane-harvest', 'lightning-reflex', 'lucky-seven', 'meteor-dodge', 'meteor-rain', 'mole-garden', 'shadow-chase', 'zigzag-orbs'])
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
    assert.equal(res.data.tier, 'spec')
    assert.equal(res.data.html, null)
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
    assert.match(home.text, /Make a game from one sentence/)
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
    assert.equal(saved.data.assurance, 'unverified')
    assert.equal(saved.data.scores.length, 0)
    assert.equal(saved.data.unverified[0].verified, false)
    assert.equal(saved.data.unverified[0].name, 'Ada')
    assert.equal(saved.data.unverified[0].ranking, 'higher')
    assert.equal(saved.data.unverified[0].unit, 'taps')
    const mismatch = await client.request('POST', `/api/games/${game.id}/scores`, { name: 'Ada', points: 10, mechanic: 'dodge' })
    assert.equal(mismatch.status, 400)
    const reaction = await client.request('POST', '/api/games', {
      name: 'Flash Round', description: 'Wait for green', type: 'reaction', duration: 10, accent: '#4adeb9'
    })
    await client.request('POST', `/api/games/${reaction.data.game.id}/scores`, { name: 'Slow', points: 800 })
    const board = await client.request('POST', `/api/games/${reaction.data.game.id}/scores`, { name: 'Fast', points: 180 })
    assert.deepEqual(board.data.scores, [])
    assert.deepEqual(board.data.unverified.map((score) => score.name), ['Fast', 'Slow'])
    assert.equal(board.data.unverified[0].ranking, 'lower')
    const listed = await client.request('GET', `/api/games/${reaction.data.game.id}/scores`)
    assert.equal(listed.data.scores.length, 0)
    assert.equal(listed.data.unverified[0].name, 'Fast')
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
    assert.equal(page.text.includes('style='), false)
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
    assert.match(share.text, /href="\/play\/meteor-dodge"/)
    assert.match(share.text, /name="twitter:card" content="player"/)
    assert.match(share.text, /name="twitter:site" content="@playground"/)
    assert.match(share.text, /name="twitter:player" content="https:\/\/play\.example\/play\/meteor-dodge\?embed=1"/)
    assert.match(share.text, /name="twitter:player:width" content="480"/)
    assert.match(share.text, /name="twitter:player:height" content="480"/)
    assert.match(share.text, /name="twitter:image" content="https:\/\/play\.example\/api\/games\/meteor-dodge\/poster\.png"/)
    assert.match(share.text, /property="og:image"/)
    assert.match(share.text, /Top 20/)
    const quoted = await client.request('POST', '/api/games', {
      name: 'Say "hi"',
      description: 'Rock & roll',
      type: 'tap',
      duration: 10,
      accent: '#a88bff'
    })
    assert.equal(quoted.status, 201)
    const card = await client.request('GET', `/r/${quoted.data.game.id}`)
    assert.equal(card.text.includes('content="Say "hi""'), false)
    assert.match(card.text, /content="Say &quot;hi&quot;"/)
    assert.match(card.text, /Rock &amp; roll/)
    const embed = await client.request('GET', '/play/meteor-dodge?embed=1')
    assert.equal(embed.status, 200)
    assert.match(embed.headers.get('content-security-policy'), /frame-ancestors https:\/\/x\.com https:\/\/\*\.x\.com https:\/\/twitter\.com https:\/\/\*\.twitter\.com/)
    assert.equal(embed.headers.get('content-security-policy').includes("frame-ancestors 'self'"), false)
    assert.equal(embed.headers.get('x-frame-options'), null)
    assert.match(embed.text, /class="play-body embed"/)
    assert.match(embed.text, />Play</)
    const poster = await fetch(server.base + '/api/games/meteor-dodge/poster.png')
    assert.equal(poster.status, 200)
    assert.match(poster.headers.get('content-type'), /image\/png/)
    const bytes = Buffer.from(await poster.arrayBuffer())
    assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a')
    assert.equal(bytes.readUInt32BE(16), 1200)
    assert.equal(bytes.readUInt32BE(20), 1200)
    const missingPoster = await client.request('GET', '/api/games/missing-game/poster.png')
    assert.equal(missingPoster.status, 404)
  })

  test('round tokens mark plausible scores checked', async () => {
    const started = await client.request('POST', '/api/games/meteor-dodge/events', {
      type: 'play_started',
      eventId: `round${Date.now()}ok`
    })
    assert.equal(started.status, 200)
    assert.match(started.data.roundToken, /^[A-Za-z0-9_-]{20,80}$/)
    const early = await client.request('POST', '/api/games/meteor-dodge/scores', {
      name: 'Ada',
      points: 10,
      mechanic: 'dodge',
      roundToken: started.data.roundToken
    })
    assert.equal(early.status, 400)
    await server.db.query(
      `update plays set created_at = now() - interval '2 seconds'
       where game_id = 'meteor-dodge' and round_token_hash is not null and consumed_at is null`
    )
    const wild = await client.request('POST', '/api/games/meteor-dodge/scores', {
      name: 'Ada',
      points: 400,
      mechanic: 'dodge',
      roundToken: started.data.roundToken
    })
    assert.equal(wild.status, 400)
    const checked = await client.request('POST', '/api/games/meteor-dodge/scores', {
      name: 'Ada',
      points: 10,
      mechanic: 'dodge',
      roundToken: started.data.roundToken
    })
    assert.equal(checked.status, 201)
    assert.equal(checked.data.verified, false)
    assert.equal(checked.data.assurance, 'checked')
    assert.equal(checked.data.scores.some((score) => score.assurance === 'checked' && score.points === 10), true)
    const reuse = await client.request('POST', '/api/games/meteor-dodge/scores', {
      name: 'Ada',
      points: 10,
      mechanic: 'dodge',
      roundToken: started.data.roundToken
    })
    assert.equal(reuse.status, 400)
    const board = await client.request('GET', '/r/meteor-dodge')
    assert.match(board.text, /checked/)
  })

  test('creator dashboard counts views, plays, completions, shares, and the top checked score', async () => {
    const anon = createClient(server.base)
    await anon.prime()
    assert.equal((await anon.request('GET', '/api/me/dashboard')).status, 401)
    const page = await client.request('GET', '/studio/dashboard')
    assert.equal(page.status, 200)
    assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'none'/)
    assert.match(page.text, /dashboard\.js/)
    assert.match(page.text, /Loading your games/)
    const created = await client.request('POST', '/api/games', {
      name: 'Dash Orchard', description: 'Count the plays', type: 'tap', duration: 10, accent: '#4adeb9'
    })
    const id = created.data.game.id
    await client.request('POST', `/api/games/${id}/events`, { type: 'game_viewed', eventId: 'dash-view-0001' })
    await client.request('POST', `/api/games/${id}/events`, { type: 'play_started', eventId: 'dash-play-0001' })
    await client.request('POST', `/api/games/${id}/events`, { type: 'play_completed', eventId: 'dash-done-0001' })
    const share = await client.request('POST', `/api/games/${id}/share`, {})
    assert.equal(share.status, 200)
    assert.equal(share.data.shares, 1)
    await client.request('POST', `/api/games/${id}/share`, {})
    await client.request('POST', `/api/games/${id}/scores`, { name: 'Zoe', points: 20 })
    const started = await client.request('POST', `/api/games/${id}/events`, { type: 'play_started', eventId: 'dash-play-0002' })
    await server.db.query(
      `update plays set created_at = now() - interval '2 seconds' where game_id = $1 and consumed_at is null`,
      [id]
    )
    const checked = await client.request('POST', `/api/games/${id}/scores`, {
      name: 'Ada', points: 8, roundToken: started.data.roundToken
    })
    assert.equal(checked.data.assurance, 'checked')
    const dash = await client.request('GET', '/api/me/dashboard')
    assert.equal(dash.status, 200)
    const row = dash.data.games.find((item) => item.id === id)
    assert.equal(row.status, 'published')
    assert.equal(row.views, 1)
    assert.equal(row.plays, 2)
    assert.equal(row.completions, 1)
    assert.equal(row.shares, 2)
    assert.equal(row.topScore.name, 'Ada')
    assert.equal(row.topScore.points, 8)
    const missing = await client.request('POST', '/api/games/missing-game/share', {})
    assert.equal(missing.status, 404)
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

  test('freeform games publish to the sandbox and the player card', async () => {
    const generated = await client.request('POST', '/api/ai/generate', { prompt: 'a chess game on a board' })
    assert.equal(generated.status, 200)
    assert.equal(generated.data.tier, 'freeform')
    assert.equal(generated.data.spec, null)
    assert.match(generated.data.html, /<canvas/i)
    assert.match(generated.data.tierReason, /freeform/i)
    const forced = await client.request('POST', '/api/ai/generate', { prompt: 'a chess game on a board', tier: 'spec' })
    assert.equal(forced.status, 200)
    assert.equal(forced.data.tier, 'spec')
    assert.equal(forced.data.html, null)
    assert.equal(typeof forced.data.spec, 'object')

    const rejected = await client.request('POST', '/api/games', {
      name: 'Bad Sandbox',
      description: 'nope',
      type: 'arcade',
      duration: 30,
      accent: '#112233',
      tier: 'freeform',
      html: '<html><body><canvas></canvas><script>fetch("https://example.com/nope")</script>playground-score</body></html>'
    })
    assert.equal(rejected.status, 400)
    assert.match(rejected.data.error, /fetch|External URL/)

    const anon = createClient(server.base)
    await anon.prime()
    const denied = await anon.request('POST', '/api/freeform/preview', { html: generated.data.html })
    assert.equal(denied.status, 401)

    const preview = await client.request('POST', '/api/freeform/preview', { html: generated.data.html })
    assert.equal(preview.status, 200)
    const previewDoc = await fetch(preview.data.url)
    assert.equal(previewDoc.status, 200)
    assert.match(await previewDoc.text(), /<canvas/i)

    const published = await client.request('POST', '/api/games', {
      name: 'Chess Sandbox',
      description: 'A tiny chess idea',
      type: 'tap',
      duration: 30,
      accent: '#7c6bf2',
      tier: 'freeform',
      generation: 'rule-based-template',
      html: generated.data.html
    })
    assert.equal(published.status, 201)
    assert.equal(published.data.game.tier, 'freeform')
    assert.equal(published.data.game.type, 'arcade')
    assert.equal(published.data.game.spec, null)
    assert.match(published.data.game.html, /<canvas/i)
    assert.equal(published.data.game.sandboxUrl, `${server.usercontentBase}/g/${published.data.game.id}`)

    const listed = await client.request('GET', '/api/games')
    const card = listed.data.games.find((item) => item.id === published.data.game.id)
    assert.equal(card.tier, 'freeform')
    assert.equal(card.html, undefined)

    const sandbox = await fetch(published.data.game.sandboxUrl)
    assert.equal(sandbox.status, 200)
    const csp = sandbox.headers.get('content-security-policy')
    assert.match(csp, /default-src 'none'/)
    assert.match(csp, /script-src 'unsafe-inline'/)
    assert.match(csp, /style-src 'unsafe-inline'/)
    assert.match(csp, /img-src data: blob:/)
    assert.match(csp, /connect-src 'none'/)
    assert.match(csp, /frame-ancestors/)
    assert.match(csp, /https:\/\/x\.com/)
    assert.match(csp, /https:\/\/twitter\.com/)
    assert.equal(sandbox.headers.get('set-cookie'), null)

    const id = published.data.game.id
    const embed = await client.request('GET', `/play/${id}?embed=1`)
    assert.equal(embed.status, 200)
    assert.match(embed.text, /embed-gate/)
    assert.match(embed.headers.get('content-security-policy'), /frame-src /)
    const share = await client.request('GET', `/r/${id}`)
    assert.equal(share.status, 200)
    assert.match(share.text, /twitter:player"/)
    assert.match(share.text, /twitter:player:width" content="480"/)
    assert.match(share.text, /twitter:player:height" content="480"/)
    assert.match(share.text, new RegExp(`/play/${id}\\?embed=1`))
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

  test('daily generation caps return 429', async () => {
    let calls = 0
    const fetchImpl = async () => {
      calls += 1
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(validSpec) }] } }] }), { status: 200 })
    }
    const server = await startServer({
      env: {
        AI_PROVIDER: 'gemini',
        GEMINI_API_KEY: 'cap-key',
        AI_DAILY_LIMIT_PER_USER: '1',
        AI_DAILY_LIMIT_GLOBAL: '5'
      },
      fetchImpl
    })
    try {
      const client = createClient(server.base)
      await client.prime()
      await client.request('POST', '/api/auth/register', { email: 'cap@example.com', password: 'test-password-123', displayName: 'Cap' })
      const first = await client.request('POST', '/api/ai/generate', { prompt: 'a space dodge game please' })
      assert.equal(first.status, 200)
      assert.equal(calls, 1)
      const second = await client.request('POST', '/api/ai/generate', { prompt: 'a different garden game please' })
      assert.equal(second.status, 429)
      assert.equal(second.data.code, 'ai_daily_limit')
      assert.match(second.data.error, /this account/)
      assert.equal(calls, 1)
    } finally {
      await server.close()
    }

    let globalCalls = 0
    const globalServer = await startServer({
      env: {
        AI_PROVIDER: 'gemini',
        GEMINI_API_KEY: 'cap-key',
        AI_DAILY_LIMIT_PER_USER: '20',
        AI_DAILY_LIMIT_GLOBAL: '1'
      },
      fetchImpl: async () => {
        globalCalls += 1
        return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(validSpec) }] } }] }), { status: 200 })
      }
    })
    try {
      const first = createClient(globalServer.base)
      const second = createClient(globalServer.base)
      await first.prime()
      await second.prime()
      await first.request('POST', '/api/auth/register', { email: 'one@example.com', password: 'test-password-123' })
      await second.request('POST', '/api/auth/register', { email: 'two@example.com', password: 'test-password-123' })
      assert.equal((await first.request('POST', '/api/ai/generate', { prompt: 'a space dodge game please' })).status, 200)
      const blocked = await second.request('POST', '/api/ai/generate', { prompt: 'a garden tap game please' })
      assert.equal(blocked.status, 429)
      assert.match(blocked.data.error, /everyone/)
      assert.equal(globalCalls, 1)
    } finally {
      await globalServer.close()
    }
  })

  test('freeform preview requires a signed-in creator and shares the AI rate limit', async () => {
    // The anonymous 401 still counts toward the per-IP AI bucket.
    const limited = await startServer({ env: { AI_RATE_LIMIT_MAX: '3' }, seed: false })
    try {
      const html = '<!DOCTYPE html><html><body><canvas id="c"></canvas><script>parent.postMessage({type:"playground-score",points:1},"*")</script></body></html>'
      const anon = createClient(limited.base)
      await anon.prime()
      assert.equal((await anon.request('POST', '/api/freeform/preview', { html })).status, 401)
      const user = createClient(limited.base)
      await user.prime()
      assert.equal((await user.request('POST', '/api/auth/register', {
        email: 'preview@example.com',
        password: 'test-password-123',
        displayName: 'Preview'
      })).status, 201)
      assert.equal((await user.request('POST', '/api/freeform/preview', { html })).status, 200)
      assert.equal((await user.request('POST', '/api/freeform/preview', { html })).status, 200)
      const blocked = await user.request('POST', '/api/freeform/preview', { html })
      assert.equal(blocked.status, 429)
      assert.equal(blocked.data.code, 'rate_limited')
    } finally {
      await limited.close()
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

describe('discover and moderation', { concurrency: false }, () => {
  test('trending dedupes a session, ignores a burst, and skips the creator', async () => {
    const server = await startServer({ env: { ADMIN_EMAILS: 'mod@example.com' }, seed: false })
    try {
      const owner = createClient(server.base)
      await owner.prime()
      assert.equal((await owner.request('POST', '/api/auth/register', {
        email: 'owner@example.com', password: 'test-password-123', displayName: 'Owner'
      })).status, 201)
      const created = await owner.request('POST', '/api/games', {
        name: 'Trend Tap', description: 'A quiet tap game', type: 'tap', duration: 10, accent: '#112233'
      })
      assert.equal(created.status, 201)
      assert.ok(created.data.game.tags.includes('tap'))
      const id = created.data.game.id
      assert.equal((await owner.request('POST', `/api/games/${id}/events`, { type: 'play_started', eventId: 'owner-play-1' })).status, 200)
      const stranger = createClient(server.base)
      await stranger.prime()
      assert.equal((await stranger.request('POST', `/api/games/${id}/events`, { type: 'play_started', eventId: 'stranger-play-1' })).status, 200)
      assert.equal((await stranger.request('POST', `/api/games/${id}/events`, { type: 'play_started', eventId: 'stranger-play-2' })).status, 200)
      const once = await stranger.request('GET', '/api/discover?view=trending')
      assert.equal(once.data.games.find((game) => game.id === id).trending, 1)
      assert.equal((await stranger.request('POST', `/api/games/${id}/events`, { type: 'play_started', eventId: 'stranger-play-3' })).status, 200)
      const burst = await stranger.request('GET', '/api/discover?view=trending')
      assert.equal(burst.data.games.find((game) => game.id === id).trending, 0)
      const other = createClient(server.base)
      await other.prime()
      await other.request('POST', `/api/games/${id}/events`, { type: 'play_started', eventId: 'other-play-1' })
      const again = await other.request('GET', '/api/discover?view=trending&tag=tap&q=Trend')
      assert.equal(again.data.games.find((game) => game.id === id).trending, 1)
      assert.equal((await other.request('GET', '/api/discover?tag=puzzle')).data.games.some((game) => game.id === id), false)
      assert.equal((await other.request('GET', '/api/discover?view=nope')).status, 400)

      const player = createClient(server.base)
      await player.prime()
      const joined = await player.request('POST', '/api/auth/register', {
        email: 'player@example.com', password: 'test-password-123', displayName: 'Player'
      })
      const held = await player.request('POST', '/api/games', {
        name: 'After dark', description: 'nsfw scene', type: 'tap', duration: 10, accent: '#222222'
      })
      assert.equal(held.status, 201)
      assert.equal(held.data.game.status, 'pending')
      assert.match(held.data.game.flagReason, /sexual content/)
      assert.equal((await player.request('GET', '/api/games')).data.games.some((game) => game.id === held.data.game.id), false)
      assert.equal((await player.request('GET', `/play/${held.data.game.id}`)).status, 404)
      assert.equal((await player.request('POST', '/api/abuse-reports', {
        gameId: id, reason: 'spam', details: 'Too many popups'
      })).status, 201)
      assert.equal((await player.request('GET', '/api/admin/queue')).status, 403)

      const mod = createClient(server.base)
      await mod.prime()
      const modUser = await mod.request('POST', '/api/auth/register', {
        email: 'mod@example.com', password: 'test-password-123', displayName: 'Mod'
      })
      assert.equal(modUser.data.user.admin, true)
      assert.equal((await mod.request('POST', `/api/admin/games/${id}/feature`, { featured: true })).status, 200)
      const featured = await mod.request('GET', '/api/discover?view=featured')
      assert.equal(featured.data.games.some((game) => game.id === id), true)
      const queue = await mod.request('GET', '/api/admin/queue')
      assert.equal(queue.status, 200)
      assert.equal(queue.data.games.some((game) => game.id === held.data.game.id && game.status === 'pending'), true)
      assert.equal(queue.data.reports.length, 1)
      assert.equal(queue.data.audit.some((entry) => entry.action === 'game.hold'), true)
      const reportId = queue.data.reports[0].id
      assert.equal((await mod.request('POST', `/api/admin/reports/${reportId}`, { status: 'reviewed' })).status, 200)
      assert.equal((await mod.request('POST', `/api/admin/games/${held.data.game.id}/unhide`, {})).status, 200)
      assert.equal((await player.request('GET', `/play/${held.data.game.id}`)).status, 200)
      assert.equal((await mod.request('POST', `/api/admin/games/${id}/hide`, {})).status, 200)
      assert.equal((await player.request('GET', `/play/${id}`)).status, 404)
      assert.equal((await mod.request('POST', `/api/admin/games/${id}/unhide`, {})).status, 200)
      assert.equal((await mod.request('POST', `/api/admin/users/${modUser.data.user.id}/ban`, {})).status, 400)
      const banned = await mod.request('POST', `/api/admin/users/${joined.data.user.id}/ban`, {})
      assert.equal(banned.status, 200)
      const locked = await player.request('POST', '/api/auth/login', {
        email: 'player@example.com', password: 'test-password-123'
      })
      assert.equal(locked.status, 403)
      assert.equal(locked.data.code, 'banned')
      const privacy = await player.request('GET', '/privacy')
      assert.equal(privacy.status, 200)
      assert.match(privacy.text, /DRAFT — needs legal review/)
      const terms = await player.request('GET', '/terms')
      assert.match(terms.text, /DRAFT — needs legal review/)
      assert.match(terms.text, /not in effect/)
    } finally {
      await server.close()
    }
  })

  test('a gemini safety flag holds a clean title for review', async () => {
    let calls = 0
    const server = await startServer({
      env: { GEMINI_API_KEY: 'safety-key' },
      seed: false,
      fetchImpl: async () => {
        calls += 1
        return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"flag":true,"reason":"hate"}' }] } }] }), { status: 200 })
      }
    })
    try {
      const client = createClient(server.base)
      await client.prime()
      await client.request('POST', '/api/auth/register', {
        email: 'safety@example.com', password: 'test-password-123', displayName: 'Safety'
      })
      const held = await client.request('POST', '/api/games', {
        name: 'Sunny garden', description: 'Tap the flowers', type: 'tap', duration: 10, accent: '#339966'
      })
      assert.equal(held.status, 201)
      assert.equal(held.data.game.status, 'pending')
      assert.equal(held.data.game.flagReason, 'hate')
      assert.equal(calls, 1)
    } finally {
      await server.close()
    }
  })
})
