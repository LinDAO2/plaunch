import { randomBytes } from 'node:crypto'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { aiStatus } from './ai/generate.js'
import { assertFreeform } from './ai/freeform-check.js'
import { validateGameSpec } from './ai/gamespec.js'
import { generateIdea } from './ai/idea.js'
import { HttpError } from './errors.js'
import { renderPlayPage, renderSharePage } from './html.js'
import { posterPng } from './poster.js'
import { assertCsrf, ensureCsrf, readCookies, readJson, rememberCookie, sendHtml, sendJson, serializeCookie } from './http.js'
import { log } from './log.js'
import { hashPassword, verifyPassword } from './passwords.js'
import { createRateLimiter } from './rate-limit.js'
import {
  archiveGame,
  consumeAiCredit,
  createAbuseReport,
  createGame,
  createSession,
  createUser,
  dashboardFor,
  deleteSession,
  findUserByEmail,
  findUserBySession,
  getGameRow,
  incrementShares,
  listAssets,
  listOwnedGames,
  listPublishedGames,
  listScores,
  publicGame,
  recordEvent,
  savePreview,
  specForSave,
  submitScore,
  updateGame
} from './repo.js'
import { splitBoards } from './scores.js'
import { TEMPLATE_NOTICE, generateTemplate } from './template.js'
import { specFromGame } from './ai/gamespec.js'
import {
  assertMechanicScore,
  validateDisplayName,
  validateEmail,
  validateEvent,
  validateGameInput,
  validatePassword,
  validateReport,
  validateScoreInput
} from './validate.js'

const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public')
const FILES = new Map([
  ['/style.css', 'style.css'],
  ['/app.js', 'app.js'],
  ['/mechanics.js', 'mechanics.js'],
  ['/client-api.js', 'client-api.js'],
  ['/play.js', 'play.js'],
  ['/play.css', 'play.css'],
  ['/arcade-sim.js', 'arcade-sim.js'],
  ['/arcade-view.js', 'arcade-view.js'],
  ['/dashboard.js', 'dashboard.js'],
  ['/sandbox-score.js', 'sandbox-score.js']
])
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png'
}
const GENERATIONS = new Set(['manual', 'rule-based-template', 'ai:gemini', 'ai:openai', 'ai:xai', 'seed'])
const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
const SLUG = /^[a-z0-9-]{1,48}$/

let dummyHashPromise

async function dummyHash(config) {
  if (!dummyHashPromise) dummyHashPromise = hashPassword('not-a-real-password', { N: config.passwordScryptN })
  return dummyHashPromise
}

async function currentUser(req, db) {
  return findUserBySession(db, readCookies(req).pg_session || '')
}

function requireUser(user) {
  if (!user) throw new HttpError(401, 'Sign in required', 'unauthorized')
  return user
}

function generationOf(value, fallback = 'manual') {
  return GENERATIONS.has(value) ? value : fallback
}

const HTML_LIMIT = 256_000

function present(config, game, options = {}) {
  const out = publicGame(game, options)
  out.tier = game.tier === 'freeform' ? 'freeform' : 'spec'
  if (out.tier === 'freeform') {
    out.sandboxUrl = `${config.usercontentOrigin}/g/${game.id}`
    if (options.canEdit) out.html = game.freeformHtml || ''
  }
  return out
}

function fieldsForSave(body, previous) {
  if (body.tier === 'freeform') {
    const html = typeof body.html === 'string' ? body.html : (previous?.freeformHtml || '')
    const checked = assertFreeform(html)
    if (!checked.ok) throw new HttpError(400, checked.errors.join('; '), 'freeform_rejected')
    const fields = validateGameInput({ ...body, type: 'arcade' })
    fields.generation = generationOf(body.generation, previous?.generation || 'manual')
    fields.tier = 'freeform'
    fields.freeformHtml = checked.html
    return { fields, spec: null }
  }
  const fields = validateGameInput(body)
  fields.generation = generationOf(body.generation, previous?.generation || 'manual')
  fields.tier = 'spec'
  fields.freeformHtml = null
  return { fields, spec: savedSpec(fields, body, previous) }
}

function savedSpec(fields, body, previous) {
  try {
    return specForSave(fields, readSpec(body, fields), previous)
  } catch (err) {
    if (err.status) throw err
    throw new HttpError(400, err.message, 'validation_error')
  }
}

function readSpec(body, fields) {
  if (body.spec === undefined) return null
  let spec
  try {
    spec = validateGameSpec(body.spec)
  } catch (err) {
    throw new HttpError(400, err.message, 'validation_error')
  }
  const same = spec.runtime === fields.type
    && spec.name === fields.name
    && spec.description === fields.description
    && spec.duration === fields.duration
    && spec.accent === fields.accent
  if (!same) throw new HttpError(400, 'Game spec does not match the game fields', 'validation_error')
  return spec
}

function issueSession(ctx, token) {
  rememberCookie(ctx, serializeCookie('pg_session', token, {
    httpOnly: true,
    maxAge: ctx.config.sessionTtlSeconds,
    secure: ctx.config.cookieSecure
  }))
  const csrf = randomBytes(32).toString('base64url')
  rememberCookie(ctx, serializeCookie('pg_csrf', csrf, {
    maxAge: ctx.config.sessionTtlSeconds,
    secure: ctx.config.cookieSecure
  }))
  ctx.csrfToken = csrf
  return csrf
}

function clearSession(ctx) {
  rememberCookie(ctx, serializeCookie('pg_session', '', {
    httpOnly: true,
    maxAge: 0,
    secure: ctx.config.cookieSecure
  }))
  const csrf = randomBytes(32).toString('base64url')
  rememberCookie(ctx, serializeCookie('pg_csrf', csrf, {
    maxAge: ctx.config.sessionTtlSeconds,
    secure: ctx.config.cookieSecure
  }))
  ctx.csrfToken = csrf
  return csrf
}

async function sendUser(res, ctx, user, csrf, status = 200) {
  return sendJson(res, status, {
    user: { id: user.id, email: user.email, displayName: user.displayName },
    csrfToken: csrf
  }, ctx)
}

export function createApp({ db, config, fetchImpl } = {}) {
  const limits = createRateLimiter(config)

  return async function app(req, res) {
    const started = Date.now()
    const requestId = randomUUID()
    const ctx = { cookies: [], requestId, config, csrfToken: '' }
    let status = 500
    try {
      const url = new URL(req.url || '/', 'http://localhost')
      ensureCsrf(req, ctx)
      if (!limits.allow(req, url.pathname)) {
        status = sendJson(res, 429, { error: 'Too many requests', code: 'rate_limited' }, ctx, { 'retry-after': '60' })
        return
      }
      if (UNSAFE.has(req.method || 'GET')) assertCsrf(req)
      status = await dispatch(req, res, ctx, url, { db, config, fetchImpl: fetchImpl || globalThis.fetch })
    } catch (err) {
      status = err.status || 500
      if (!res.headersSent) {
        if (!err.status) log('error', 'request failed', { requestId, message: err.message })
        sendJson(res, status, { error: err.status ? err.message : 'Server error', code: err.code }, ctx)
      }
    } finally {
      log('info', 'request', {
        requestId,
        method: req.method,
        path: String(req.url || '').split('?')[0],
        status: res.statusCode || status,
        ms: Date.now() - started
      })
    }
  }
}

async function dispatch(req, res, ctx, url, { db, config, fetchImpl }) {
  const { pathname } = url
  const method = req.method || 'GET'

  if (method === 'GET' && pathname === '/api/health') {
    try {
      await db.query('select 1 as ok')
      const ai = aiStatus(config.env)
      return sendJson(res, 200, { ok: true, version: config.version, db: 'up', ai: { mode: ai.mode, provider: ai.provider } }, ctx)
    } catch (err) {
      log('error', 'database health check failed', { requestId: ctx.requestId, message: err.message })
      return sendJson(res, 503, { ok: false, version: config.version, db: 'down' }, ctx)
    }
  }

  if (method === 'GET' && pathname === '/api/auth/csrf') {
    return sendJson(res, 200, { csrfToken: ensureCsrf(req, ctx) }, ctx)
  }

  if (method === 'GET' && pathname === '/api/auth/me') {
    const user = await currentUser(req, db)
    return sendJson(res, 200, { user: user ? { id: user.id, email: user.email, displayName: user.displayName } : null }, ctx)
  }

  if (method === 'POST' && pathname === '/api/auth/register') {
    const body = await readJson(req)
    const email = validateEmail(body.email)
    const password = validatePassword(body.password)
    const displayName = validateDisplayName(body.displayName, email)
    const passwordHash = await hashPassword(password, { N: config.passwordScryptN })
    const user = await createUser(db, { email, passwordHash, displayName })
    const token = randomBytes(32).toString('base64url')
    await createSession(db, user.id, token, config.sessionTtlSeconds)
    const csrf = issueSession(ctx, token)
    return sendUser(res, ctx, user, csrf, 201)
  }

  if (method === 'POST' && pathname === '/api/auth/login') {
    const body = await readJson(req)
    const email = validateEmail(body.email)
    const password = validatePassword(body.password)
    const user = await findUserByEmail(db, email)
    const ok = user ? await verifyPassword(password, user.passwordHash) : false
    if (!user) await verifyPassword(password, await dummyHash(config))
    if (!user || !ok) throw new HttpError(401, 'Invalid email or password', 'unauthorized')
    const token = randomBytes(32).toString('base64url')
    await createSession(db, user.id, token, config.sessionTtlSeconds)
    const csrf = issueSession(ctx, token)
    return sendUser(res, ctx, user, csrf, 200)
  }

  if (method === 'POST' && pathname === '/api/auth/logout') {
    await deleteSession(db, readCookies(req).pg_session || '')
    const csrf = clearSession(ctx)
    return sendJson(res, 200, { ok: true, csrfToken: csrf }, ctx)
  }

  if (method === 'GET' && pathname === '/api/ai/status') {
    return sendJson(res, 200, aiStatus(config.env), ctx)
  }

  if (method === 'POST' && pathname === '/api/ai/generate') {
    const body = await readJson(req)
    const user = aiStatus(config.env).mode === 'ai' ? requireUser(await currentUser(req, db)) : null
    if (user) await consumeAiCredit(db, user.id, config.aiDailyUser, config.aiDailyGlobal)
    const result = await generateIdea({ prompt: body.prompt, tier: body.tier, env: config.env, fetchImpl })
    return sendJson(res, 200, {
      mode: result.mode,
      provider: result.provider,
      model: result.model,
      game: result.game,
      spec: result.spec,
      notice: result.notice,
      tier: result.tier,
      html: result.html || null,
      tierReason: result.tierReason || ''
    }, ctx)
  }

  if (method === 'POST' && pathname === '/api/freeform/preview') {
    const body = await readJson(req, HTML_LIMIT)
    const checked = assertFreeform(body.html)
    if (!checked.ok) throw new HttpError(400, checked.errors.join('; '), 'freeform_rejected')
    const user = await currentUser(req, db)
    const token = await savePreview(db, checked.html, user?.id || null)
    return sendJson(res, 200, { token, url: `${config.usercontentOrigin}/preview/${token}` }, ctx)
  }

  if (method === 'POST' && pathname === '/api/generate') {
    const body = await readJson(req)
    const game = generateTemplate(body.prompt)
    return sendJson(res, 200, { game, notice: game.notice || TEMPLATE_NOTICE, mode: 'template', provider: null, spec: specFromGame(game) }, ctx)
  }

  if (method === 'GET' && pathname === '/api/games') {
    const games = await listPublishedGames(db)
    return sendJson(res, 200, { games: games.map((game) => present(config, game, { includeSpec: false })) }, ctx)
  }

  if (method === 'GET' && pathname === '/api/me/games') {
    const user = requireUser(await currentUser(req, db))
    const games = await listOwnedGames(db, user.id)
    return sendJson(res, 200, { games: games.map((game) => present(config, game, { canEdit: true, includeSpec: false })) }, ctx)
  }

  if (method === 'GET' && pathname === '/api/me/dashboard') {
    const user = requireUser(await currentUser(req, db))
    const games = await dashboardFor(db, user.id)
    return sendJson(res, 200, { games }, ctx)
  }

  if (method === 'POST' && pathname === '/api/games') {
    const user = requireUser(await currentUser(req, db))
    const body = await readJson(req, HTML_LIMIT)
    const { fields, spec } = fieldsForSave(body, null)
    const { game, version } = await createGame(db, fields, spec, user.id)
    const assets = await listAssets(db, game.id)
    return sendJson(res, 201, { game: present(config, game, { canEdit: true, assets }), url: `/g/${game.id}`, version }, ctx)
  }

  if (method === 'POST' && pathname === '/api/abuse-reports') {
    const body = validateReport(await readJson(req))
    const user = await currentUser(req, db)
    const report = await createAbuseReport(db, { ...body, userId: user?.id })
    return sendJson(res, 201, { report }, ctx)
  }

  const gameMatch = pathname.match(/^\/api\/games\/([a-z0-9-]+)(?:\/(scores|play|events|archive|share))?$/)
  if (gameMatch) {
    const id = gameMatch[1]
    const sub = gameMatch[2]
    if (!SLUG.test(id)) throw new HttpError(404, 'Game not found', 'not_found')

    if (method === 'GET' && !sub) {
      const game = await getGameRow(db, id)
      if (!game) throw new HttpError(404, 'Game not found', 'not_found')
      const user = await currentUser(req, db)
      const owner = user?.id === game.ownerId
      if (game.status !== 'published' && !owner) throw new HttpError(404, 'Game not found', 'not_found')
      const assets = await listAssets(db, id)
      return sendJson(res, 200, { game: present(config, game, { canEdit: owner, assets }) }, ctx)
    }

    if (method === 'PATCH' && !sub) {
      const user = requireUser(await currentUser(req, db))
      const existing = await getGameRow(db, id)
      if (!existing) throw new HttpError(404, 'Game not found', 'not_found')
      const body = await readJson(req, HTML_LIMIT)
      const { fields, spec } = fieldsForSave(body, existing)
      const { game, version } = await updateGame(db, id, fields, spec, user.id)
      const assets = await listAssets(db, id)
      return sendJson(res, 200, { game: present(config, game, { canEdit: true, assets }), version }, ctx)
    }

    if (method === 'POST' && sub === 'archive') {
      const user = requireUser(await currentUser(req, db))
      const { game } = await archiveGame(db, id, user.id)
      return sendJson(res, 200, { game: present(config, game, { canEdit: true }) }, ctx)
    }

    if (method === 'POST' && (sub === 'play' || sub === 'events')) {
      const event = sub === 'play' ? { type: 'play_started', eventId: null } : validateEvent(await readJson(req))
      const result = await recordEvent(db, { gameId: id, eventType: event.type, eventId: event.eventId })
      const body = { plays: result.plays, type: event.type, duplicate: result.duplicate }
      if (result.roundToken) body.roundToken = result.roundToken
      return sendJson(res, 200, body, ctx)
    }

    if (method === 'POST' && sub === 'share') {
      const result = await incrementShares(db, id)
      return sendJson(res, 200, result, ctx)
    }

    if (method === 'GET' && sub === 'scores') {
      const game = await getGameRow(db, id)
      if (!game || game.status !== 'published') throw new HttpError(404, 'Game not found', 'not_found')
      return sendJson(res, 200, splitBoards(await listScores(db, id), game.type), ctx)
    }

    if (method === 'POST' && sub === 'scores') {
      const game = await getGameRow(db, id)
      if (!game || game.status !== 'published') throw new HttpError(404, 'Game not found', 'not_found')
      const input = validateScoreInput(await readJson(req))
      if (input.mechanic && input.mechanic !== game.type) {
        throw new HttpError(400, 'Score mechanic does not match this game', 'validation_error')
      }
      const bounds = assertMechanicScore(game.type, input.points, game.duration)
      const { assurance } = await submitScore(db, game, { ...input, ...bounds })
      const board = splitBoards(await listScores(db, id), game.type)
      return sendJson(res, 201, { ...board, assurance }, ctx)
    }
  }

  if (method === 'GET' && (pathname === '/' || pathname === '/studio/dashboard' || /^\/g\/[a-z0-9-]+$/.test(pathname))) {
    const file = pathname === '/studio/dashboard' ? 'dashboard.html' : 'index.html'
    const html = await readFile(path.join(PUBLIC, file))
    return sendHtml(res, 200, html, ctx, 'studio')
  }

  const playMatch = pathname.match(/^\/play\/([a-z0-9-]+)$/)
  if (method === 'GET' && playMatch) {
    const game = await publishedOrNull(db, playMatch[1])
    if (!game) return sendHtml(res, 404, renderMissing('Game not found'), ctx, 'embed')
    const embed = url.searchParams.get('embed') === '1'
    return sendHtml(res, 200, await renderPlayPage(game, { embed }), ctx, embed ? 'player' : 'embed')
  }

  const shareMatch = pathname.match(/^\/r\/([a-z0-9-]+)$/)
  if (method === 'GET' && shareMatch) {
    const game = await publishedOrNull(db, shareMatch[1])
    if (!game) return sendHtml(res, 404, renderMissing('Game not found'), ctx, 'embed')
    const board = splitBoards(await listScores(db, game.id), game.type)
    return sendHtml(res, 200, renderSharePage(game, {
      origin: requestOrigin(config, req),
      site: config.xSiteHandle,
      scores: board.scores,
      unverified: board.unverified
    }), ctx, 'embed')
  }

  const posterMatch = pathname.match(/^\/api\/games\/([a-z0-9-]+)\/poster\.png$/)
  if (method === 'GET' && posterMatch) {
    const game = await publishedOrNull(db, posterMatch[1])
    if (!game) return sendJson(res, 404, { error: 'Game not found', code: 'not_found' }, ctx)
    return sendImage(res, posterPng(game), ctx)
  }

  if (method === 'GET' && FILES.has(pathname)) {
    const file = FILES.get(pathname)
    try {
      const bytes = await readFile(path.join(PUBLIC, file))
      return sendJsonRaw(res, 200, bytes, ctx, path.extname(file))
    } catch {
      return sendJson(res, 404, { error: 'Not found', code: 'not_found' }, ctx)
    }
  }

  if (pathname.startsWith('/api/')) return sendJson(res, 404, { error: 'Not found', code: 'not_found' }, ctx)
  return sendHtml(res, 404, renderMissing('Not found'), ctx, 'studio')
}

async function publishedOrNull(db, id) {
  if (!SLUG.test(id)) return null
  const game = await getGameRow(db, id)
  if (!game || game.status !== 'published') return null
  return game
}

function requestOrigin(config, req) {
  if (config.publicBaseUrl) return config.publicBaseUrl
  const host = req.headers.host || 'localhost'
  const proto = config.cookieSecure ? 'https' : 'http'
  try {
    return new URL(`${proto}://${host}`).origin
  } catch {
    return 'http://localhost'
  }
}

function sendImage(res, bytes, ctx) {
  const headers = {
    'content-type': 'image/png',
    'cache-control': 'public, max-age=3600',
    'x-content-type-options': 'nosniff',
    'content-length': String(bytes.length)
  }
  if (ctx?.cookies?.length) headers['set-cookie'] = ctx.cookies
  if (ctx?.requestId) headers['x-request-id'] = ctx.requestId
  res.writeHead(200, headers)
  res.end(bytes)
  return 200
}

function sendJsonRaw(res, status, bytes, ctx, ext) {
  const headers = {
    'content-type': MIME[ext] || 'application/octet-stream',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff'
  }
  if (ctx?.cookies?.length) headers['set-cookie'] = ctx.cookies
  if (ctx?.requestId) headers['x-request-id'] = ctx.requestId
  res.writeHead(status, headers)
  res.end(bytes)
  return status
}

function renderMissing(message) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Not found</title></head><body><p>${message}</p></body></html>`
}
