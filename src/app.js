import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { aiStatus } from './ai/generate.js'
import { aiStatusFresh } from './ai/providers.js'
import { assertFreeform } from './ai/freeform-check.js'
import { inspectImport } from './imports/bundle.js'
import { importBroughtGame } from './imports/service.js'
import { validateGameSpec } from './ai/gamespec.js'
import { validateWorldSpec } from './blocks/spec.js'
import { loadEdits, loadSparks, saveEdit, saveSpark } from './blocks/store.js'
import { generateIdea } from './ai/idea.js'
import { restyleTemplate } from './templates/generate.js'
import { TAGS, tagsFor } from './ai/tags.js'
import { blocklistReason, classifySafety } from './safety.js'
import { HttpError } from './errors.js'
import { renderPlayPage, renderSharePage } from './html.js'
import { resolvePoster, schedulePosterCapture } from './poster-store.js'
import { templateMarker } from './templates/render.js'
import { assertCsrf, ensureCsrf, readCookies, readJson, rememberCookie, sendHtml, sendJson, serializeCookie } from './http.js'
import { log } from './log.js'
import { hashPassword, verifyPassword } from './passwords.js'
import { createRateLimiter } from './rate-limit.js'
import {
  archiveGame,
  banUser,
  consumeAiCredit,
  createAbuseReport,
  createGame,
  createGuest,
  createSession,
  createUser,
  dashboardFor,
  deleteSession,
  discoverGames,
  featureGame,
  findGuestByToken,
  findUserByEmail,
  findUserBySession,
  isIpBanned,
  mergeGuestIntoAccount,
  getGameRow,
  incrementShares,
  listAssets,
  listOwnedGames,
  listPublishedGames,
  listScores,
  moderateGame,
  moderationQueue,
  publicGame,
  readCredit,
  recordEvent,
  recordHold,
  resetWorld,
  reviewReport,
  savePreview,
  specForSave,
  submitScore,
  updateGame
} from './repo.js'
import { xAuthCallback, xAuthEnabled, xAuthStart } from './auth/x.js'
import { listWorldStats } from './blocks/store.js'
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
const BLOCKS = path.join(path.dirname(fileURLToPath(import.meta.url)), 'blocks')
const BLOCK_FILES = new Set(['blocks.js', 'terrain.js', 'mesh.js', 'spec.js', 'goals.js', 'frame-check.js', 'rules.js'])
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
  ['/sandbox-score.js', 'sandbox-score.js'],
  ['/discover.js', 'discover.js'],
  ['/admin.js', 'admin.js'],
  ['/cards.js', 'cards.js'],
  ['/juice.js', 'juice.js'],
  ['/icons.js', 'icons.js'],
  ['/blocks-view.js', 'blocks-view.js'],
  ['/world-render.js', 'world-render.js'],
  ['/arena-bridge.js', 'arena-bridge.js'],
  ['/fonts/bricolage-grotesque-latin-700.woff2', 'fonts/bricolage-grotesque-latin-700.woff2'],
  ['/fonts/source-sans-3-latin-400.woff2', 'fonts/source-sans-3-latin-400.woff2'],
  ['/fonts/source-sans-3-latin-600.woff2', 'fonts/source-sans-3-latin-600.woff2'],
  ['/fonts/ibm-plex-mono-latin-400.woff2', 'fonts/ibm-plex-mono-latin-400.woff2'],
  ['/fonts/ibm-plex-mono-latin-600.woff2', 'fonts/ibm-plex-mono-latin-600.woff2'],
  ['/fonts/lilita-one-latin.woff2', 'fonts/lilita-one-latin.woff2'],
  ['/fonts/rubik-latin-700.woff2', 'fonts/rubik-latin-700.woff2'],
  ['/fonts/chakra-petch-latin-600.woff2', 'fonts/chakra-petch-latin-600.woff2'],
  ['/favicon.svg', 'favicon.svg'],
  ['/favicon.ico', 'favicon.svg']
])
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2'
}
const GENERATIONS = new Set(['manual', 'rule-based-template', 'ai:gemini', 'ai:openai', 'ai:xai', 'ai:anthropic', 'seed', 'import'])
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

function isAdmin(config, user) {
  if (!user?.email) return false
  return (config.adminEmails || []).includes(user.email.toLowerCase())
}

function requireAdmin(config, user) {
  const current = requireUser(user)
  if (!isAdmin(config, current)) throw new HttpError(403, 'Moderator access required', 'forbidden')
  return current
}

function userPayload(config, user) {
  const guest = user.kind === 'guest'
  return {
    id: user.id,
    email: guest ? null : user.email,
    displayName: user.displayName,
    admin: isAdmin(config, user),
    guest
  }
}

function clientIp(req) {
  return String(req.socket?.remoteAddress || 'unknown').replace(/^::ffff:/, '')
}

function hashIp(req, config) {
  return createHash('sha256').update(`${config.sessionSecret}|${clientIp(req)}`).digest('hex')
}

function issueGuestCookie(ctx, token) {
  rememberCookie(ctx, serializeCookie('pg_guest', token, {
    httpOnly: true,
    maxAge: ctx.config.sessionTtlSeconds,
    secure: ctx.config.cookieSecure
  }))
}

function clearGuestCookie(ctx) {
  rememberCookie(ctx, serializeCookie('pg_guest', '', {
    httpOnly: true,
    maxAge: 0,
    secure: ctx.config.cookieSecure
  }))
}

async function actorFromRequest(req, db) {
  const cookies = readCookies(req)
  const sessionUser = await findUserBySession(db, cookies.pg_session || '')
  if (sessionUser) return sessionUser
  const guest = await findGuestByToken(db, cookies.pg_guest || '')
  if (!guest || guest.bannedAt) return null
  return guest
}

async function ensureGuest(req, ctx, db) {
  const cookies = readCookies(req)
  if (cookies.pg_session && await findUserBySession(db, cookies.pg_session)) return null
  const existing = await findGuestByToken(db, cookies.pg_guest || '')
  if (existing) return existing.bannedAt ? null : existing
  const ipHash = hashIp(req, ctx.config)
  if (await isIpBanned(db, ipHash)) return null
  const token = randomBytes(32).toString('base64url')
  const guest = await createGuest(db, { token, ipHash })
  issueGuestCookie(ctx, token)
  return guest
}

async function requireCreator(req, ctx, db) {
  const cookies = readCookies(req)
  const sessionUser = await findUserBySession(db, cookies.pg_session || '')
  if (sessionUser) return sessionUser
  if (await isIpBanned(db, hashIp(req, ctx.config))) {
    throw new HttpError(403, 'This network is banned', 'banned')
  }
  const guest = await findGuestByToken(db, cookies.pg_guest || '')
  if (guest?.bannedAt) throw new HttpError(403, 'This guest is banned', 'banned')
  if (guest) return guest
  const created = await ensureGuest(req, ctx, db)
  if (!created) throw new HttpError(403, 'This network is banned', 'banned')
  return created
}

async function attachGuestMerge(req, ctx, db, account) {
  const guest = await findGuestByToken(db, readCookies(req).pg_guest || '')
  if (guest && !guest.bannedAt && guest.id !== account.id) {
    await mergeGuestIntoAccount(db, guest.id, account.id)
  }
  clearGuestCookie(ctx)
}

const ACTOR_PATTERN = /^[A-Za-z0-9_-]{20,80}$/

function actorHash(req, ctx) {
  const cookies = readCookies(req)
  let actor = cookies.pg_actor || ''
  if (!ACTOR_PATTERN.test(actor)) {
    actor = randomBytes(18).toString('base64url')
    rememberCookie(ctx, serializeCookie('pg_actor', actor, {
      httpOnly: true,
      maxAge: ctx.config.sessionTtlSeconds,
      secure: ctx.config.cookieSecure
    }))
  }
  const session = cookies.pg_session || actor
  const ip = String(req.socket?.remoteAddress || 'unknown').replace(/^::ffff:/, '')
  return createHash('sha256').update(`${session}|${ip}`).digest('hex')
}

async function stampListing(fields, body, previous, env, fetchImpl, safetyModel) {
  fields.tags = tagsFor({
    prompt: body.prompt,
    name: fields.name,
    description: fields.description,
    mechanic: fields.type,
    tier: fields.tier
  })
  const verdict = await classifySafety({
    text: [body.prompt, fields.name, fields.description, fields.tier === 'freeform' ? fields.freeformHtml : ''].filter(Boolean).join('\n'),
    env,
    fetchImpl,
    model: safetyModel
  })
  if (verdict.flagged) {
    fields.status = 'pending'
    fields.flagReason = verdict.reason
  } else if (previous && previous.status !== 'published') {
    fields.status = previous.status
    fields.flagReason = previous.flagReason || ''
  } else {
    fields.status = 'published'
    fields.flagReason = ''
  }
  return verdict
}

async function publishedForResearch(db) {
  try {
    const result = await db.query(`select name, description, tags, credit from games where status = 'published' order by created_at desc limit 200`)
    return result.rows
  } catch {
    return []
  }
}

function generationOf(value, fallback = 'manual') {
  return GENERATIONS.has(value) ? value : fallback
}

const HTML_LIMIT = 256_000
const IMPORT_LIMIT = 4_000_000

function present(config, game, options = {}) {
  const out = publicGame(game, options)
  out.tier = game.tier === 'freeform' ? 'freeform' : 'spec'
  if (out.tier === 'freeform') {
    out.sandboxUrl = `${config.usercontentOrigin}/g/${game.id}`
    if (options.canEdit) out.html = game.freeformHtml || ''
    if (game.type === 'world' || templateMarker(game.freeformHtml)) out.remix = true
  }
  return out
}

function fieldsForSave(body, previous) {
  if (body.tier === 'freeform') {
    const html = typeof body.html === 'string' ? body.html : (previous?.freeformHtml || '')
    const imported = generationOf(body.generation, previous?.generation || '') === 'import'
    const fields = validateGameInput({ ...body, type: 'arcade' })
    fields.generation = generationOf(body.generation, previous?.generation || 'manual')
    fields.tier = 'freeform'
    if (imported) {
      const errors = inspectImport(html)
      if (errors.length) throw new HttpError(400, errors.join('; '), 'import_rejected')
      fields.freeformHtml = html
    } else {
      const checked = assertFreeform(html)
      if (!checked.ok) throw new HttpError(400, checked.errors.join('; '), 'freeform_rejected')
      fields.freeformHtml = checked.html
    }
    if (body.credit && typeof body.credit === 'object') fields.credit = readCredit(body.credit)
    return { fields, spec: null }
  }
  const fields = validateGameInput(body)
  fields.generation = generationOf(body.generation, previous?.generation || 'manual')
  fields.tier = 'spec'
  fields.freeformHtml = null
  if (body.credit && typeof body.credit === 'object') fields.credit = readCredit(body.credit)
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
    user: userPayload(ctx.config, user),
    csrfToken: csrf
  }, ctx)
}

function generationPayload(result, prompt) {
  const tags = [...new Set([...(result.tags || []), ...tagsFor({
    prompt,
    name: result.game?.name,
    description: result.game?.description,
    mechanic: result.game?.type,
    tier: result.tier
  })])]
  const blocked = blocklistReason([prompt, result.game?.name, result.game?.description, result.html].filter(Boolean).join('\n'))
  return {
    mode: result.mode,
    provider: result.provider,
    model: result.model,
    game: result.game,
    spec: result.spec,
    notice: result.notice,
    tier: result.tier,
    html: result.html || null,
    tierReason: result.tierReason || '',
    templateId: result.templateId || null,
    templateName: result.templateName || null,
    fallback: Boolean(result.fallback),
    tags,
    safety: { flagged: Boolean(blocked), reason: blocked },
    research: result.research || null,
    credit: result.credit || null
  }
}

function startSse(res, ctx) {
  const headers = {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'strict-origin-when-cross-origin'
  }
  if (ctx?.cookies?.length) headers['set-cookie'] = ctx.cookies
  if (ctx?.requestId) headers['x-request-id'] = ctx.requestId
  res.writeHead(200, headers)
}

function sseSend(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
}

export function createApp({ db, config, fetchImpl, hub = null } = {}) {
  const limits = createRateLimiter(config)

  return async function app(req, res) {
    const started = Date.now()
    const requestId = randomUUID()
    const ctx = { cookies: [], requestId, config, csrfToken: '' }
    let status = 500
    try {
      const url = new URL(req.url || '/', 'http://localhost')
      ensureCsrf(req, ctx)
      const gate = limits.allow(req, url.pathname)
      if (!gate.ok) {
        status = sendJson(res, 429, { error: gate.error, code: gate.code }, ctx, { 'retry-after': '60' })
        return
      }
      if (UNSAFE.has(req.method || 'GET')) assertCsrf(req)
      status = await dispatch(req, res, ctx, url, { db, config, fetchImpl: fetchImpl || globalThis.fetch, hub })
    } catch (err) {
      status = err.status || 500
      if (!res.headersSent) {
        if (!err.status) log('error', 'request failed', { requestId, message: err.message })
        const out = { error: err.status ? err.message : 'Server error', code: err.code }
        // Upstream AI failures carry the provider's real status and message (secrets redacted).
        if (err.status && err.upstream) out.upstream = err.upstream
        sendJson(res, status, out, ctx)
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

async function dispatch(req, res, ctx, url, { db, config, fetchImpl, hub }) {
  const { pathname } = url
  const method = req.method || 'GET'

  if (method === 'GET' && pathname === '/api/health') {
    try {
      await db.query('select 1 as ok')
      const ai = await aiStatusFresh(config.env, fetchImpl)
      return sendJson(res, 200, {
        ok: true,
        version: config.version,
        db: 'up',
        ai: { mode: ai.mode, provider: ai.provider, model: ai.model, providers: ai.providers || [] }
      }, ctx)
    } catch (err) {
      log('error', 'database health check failed', { requestId: ctx.requestId, message: err.message })
      return sendJson(res, 503, { ok: false, version: config.version, db: 'down' }, ctx)
    }
  }

  if (method === 'GET' && pathname === '/api/auth/csrf') {
    await ensureGuest(req, ctx, db)
    return sendJson(res, 200, { csrfToken: ensureCsrf(req, ctx), xSignIn: xAuthEnabled(config.env) }, ctx)
  }

  if (method === 'GET' && pathname === '/api/auth/me') {
    const user = await actorFromRequest(req, db)
    return sendJson(res, 200, { user: user ? userPayload(config, user) : null, xSignIn: xAuthEnabled(config.env) }, ctx)
  }

  if (method === 'GET' && pathname === '/api/auth/x/start') {
    xAuthStart(config.env)
  }

  if (method === 'GET' && pathname === '/api/auth/x/callback') {
    xAuthCallback(config.env)
  }

  if (method === 'POST' && pathname === '/api/auth/register') {
    if (await isIpBanned(db, hashIp(req, config))) throw new HttpError(403, 'This network is banned', 'banned')
    const body = await readJson(req)
    const email = validateEmail(body.email)
    const password = validatePassword(body.password)
    const displayName = validateDisplayName(body.displayName, email)
    const passwordHash = await hashPassword(password, { N: config.passwordScryptN })
    const user = await createUser(db, { email, passwordHash, displayName, ipHash: hashIp(req, config) })
    await attachGuestMerge(req, ctx, db, user)
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
    if (user.bannedAt) throw new HttpError(403, 'This account is banned', 'banned')
    await attachGuestMerge(req, ctx, db, user)
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
    const ai = aiStatus(config.env).mode === 'ai'
    const user = ai ? await requireCreator(req, ctx, db) : null
    if (user) {
      await consumeAiCredit(db, {
        userId: user.id,
        guest: user.kind === 'guest',
        ipHash: hashIp(req, config),
        userLimit: config.aiDailyUser,
        guestLimit: config.aiDailyGuest,
        globalLimit: config.aiDailyGlobal
      })
    }
    const accept = String(req.headers.accept || '')
    if (accept.includes('text/event-stream')) {
      startSse(res, ctx)
      try {
        const result = await generateIdea({
          prompt: body.prompt,
          tier: body.tier,
          kind: body.kind,
          env: config.env,
          fetchImpl,
          onProgress: (info) => sseSend(res, 'progress', info),
          published: await publishedForResearch(db)
        })
        sseSend(res, 'result', generationPayload(result, body.prompt))
        res.end()
        return 200
      } catch (err) {
        // The 200 is already sent, so log the stream error here or it never reaches the server log.
        log(err.status ? 'warn' : 'error', 'ai generate stream failed', { requestId: ctx.requestId, status: err.status || 500, code: err.code || 'server_error', message: err.message, upstream: err.upstream || null })
        sseSend(res, 'error', { error: err.status ? err.message : 'Server error', code: err.code || 'server_error', upstream: err.upstream || null })
        res.end()
        return err.status || 500
      }
    }
    const result = await generateIdea({ prompt: body.prompt, tier: body.tier, kind: body.kind, env: config.env, fetchImpl, published: await publishedForResearch(db) })
    return sendJson(res, 200, generationPayload(result, body.prompt), ctx)
  }

  if (method === 'POST' && pathname === '/api/ai/restyle') {
    const body = await readJson(req, HTML_LIMIT)
    const ai = aiStatus(config.env).mode === 'ai'
    const user = ai ? await requireCreator(req, ctx, db) : null
    if (user) {
      await consumeAiCredit(db, {
        userId: user.id,
        guest: user.kind === 'guest',
        ipHash: hashIp(req, config),
        userLimit: config.aiDailyUser,
        guestLimit: config.aiDailyGuest,
        globalLimit: config.aiDailyGlobal
      })
    }
    const result = await restyleTemplate({
      templateId: body.templateId,
      html: body.html,
      prompt: body.prompt,
      turn: Number(body.turn) || 1,
      env: config.env,
      fetchImpl
    })
    return sendJson(res, 200, result, ctx)
  }

  if (method === 'POST' && pathname === '/api/freeform/preview') {
    const user = await requireCreator(req, ctx, db)
    const body = await readJson(req, HTML_LIMIT)
    const imported = body.generation === 'import'
    const importErrors = imported ? inspectImport(body.html) : null
    const checked = imported
      ? { ok: importErrors.length === 0, html: body.html, errors: importErrors }
      : assertFreeform(body.html)
    if (!checked.ok) throw new HttpError(400, checked.errors.join('; '), imported ? 'import_rejected' : 'freeform_rejected')
    const token = await savePreview(db, checked.html, user.id)
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

  if (method === 'GET' && pathname === '/api/discover') {
    const view = url.searchParams.get('view') || 'new'
    if (!['new', 'trending', 'featured'].includes(view)) {
      throw new HttpError(400, 'Discover view must be new, trending, or featured', 'validation_error')
    }
    const tag = url.searchParams.get('tag') || ''
    if (tag && !TAGS.includes(tag)) throw new HttpError(400, 'Unknown tag', 'validation_error')
    const games = await discoverGames(db, { view, tag, q: url.searchParams.get('q') || '' })
    return sendJson(res, 200, { view, tag, games }, ctx)
  }

  if (method === 'GET' && pathname === '/api/me/games') {
    const user = await requireCreator(req, ctx, db)
    const games = await listOwnedGames(db, user.id)
    return sendJson(res, 200, { games: games.map((game) => present(config, game, { canEdit: true, includeSpec: false })) }, ctx)
  }

  if (method === 'GET' && pathname === '/api/me/dashboard') {
    const user = await requireCreator(req, ctx, db)
    const games = await dashboardFor(db, user.id)
    return sendJson(res, 200, { games }, ctx)
  }

  if (method === 'POST' && pathname === '/api/import') {
    const user = await requireCreator(req, ctx, db)
    const body = await readJson(req, IMPORT_LIMIT)
    const { game, version } = await importBroughtGame(db, user, body, {
      token: config.githubToken,
      fetchImpl,
      env: config.env,
      safetyModel: config.safetyModelOnPublish
    })
    if (game.status === 'published') schedulePosterCapture(db, game, config.nodeEnv, requestOrigin(config, req))
    return sendJson(res, 201, { game: present(config, game, { canEdit: true }), url: `/g/${game.id}`, version }, ctx)
  }

  if (method === 'POST' && pathname === '/api/games') {
    const user = await requireCreator(req, ctx, db)
    const body = await readJson(req, HTML_LIMIT)
    const { fields, spec } = fieldsForSave(body, null)
    const verdict = await stampListing(fields, body, null, config.env, fetchImpl, config.safetyModelOnPublish)
    const { game, version } = await createGame(db, fields, spec, user.id)
    if (verdict.flagged) await recordHold(db, { actorId: user.id, gameId: game.id, reason: verdict.reason, source: verdict.source })
    const assets = await listAssets(db, game.id)
    if (game.status === 'published') schedulePosterCapture(db, game, config.nodeEnv, requestOrigin(config, req))
    return sendJson(res, 201, { game: present(config, game, { canEdit: true, assets }), url: `/g/${game.id}`, version }, ctx)
  }

  if (method === 'POST' && pathname === '/api/abuse-reports') {
    const body = validateReport(await readJson(req))
    const user = await currentUser(req, db)
    const report = await createAbuseReport(db, { ...body, userId: user?.id })
    return sendJson(res, 201, { report }, ctx)
  }

  if (pathname === '/api/admin/queue' && method === 'GET') {
    requireAdmin(config, await currentUser(req, db))
    return sendJson(res, 200, await moderationQueue(db), ctx)
  }

  const adminGame = pathname.match(/^\/api\/admin\/games\/([a-z0-9-]+)\/(hide|unhide|archive|feature|reset-world)$/)
  if (adminGame && method === 'POST') {
    const actor = requireAdmin(config, await currentUser(req, db))
    const id = adminGame[1]
    const action = adminGame[2]
    if (!SLUG.test(id)) throw new HttpError(404, 'Game not found', 'not_found')
    if (action === 'feature') {
      const body = await readJson(req)
      const game = await featureGame(db, { id, actorId: actor.id, featured: body.featured === true })
      return sendJson(res, 200, { game: present(config, game, { canEdit: true }) }, ctx)
    }
    if (action === 'reset-world') {
      await readJson(req)
      const game = await resetWorld(db, { id, actorId: actor.id })
      hub?.reset(id)
      return sendJson(res, 200, { game: present(config, game, { canEdit: true }), reset: true }, ctx)
    }
    const game = await moderateGame(db, { id, actorId: actor.id, action })
    return sendJson(res, 200, { game: present(config, game, { canEdit: true }) }, ctx)
  }

  const adminReport = pathname.match(/^\/api\/admin\/reports\/([0-9a-f-]{36})$/i)
  if (adminReport && method === 'POST') {
    const actor = requireAdmin(config, await currentUser(req, db))
    const body = await readJson(req)
    const report = await reviewReport(db, { id: adminReport[1], actorId: actor.id, status: body.status })
    return sendJson(res, 200, { report }, ctx)
  }

  const adminBan = pathname.match(/^\/api\/admin\/users\/([0-9a-f-]{36})\/ban$/i)
  if (adminBan && method === 'POST') {
    const actor = requireAdmin(config, await currentUser(req, db))
    await readJson(req)
    const banned = await banUser(db, { userId: adminBan[1], actorId: actor.id })
    return sendJson(res, 200, { user: banned }, ctx)
  }

  const gameMatch = pathname.match(/^\/api\/games\/([a-z0-9-]+)(?:\/(scores|play|events|archive|share|world))?$/)
  if (gameMatch) {
    const id = gameMatch[1]
    const sub = gameMatch[2]
    if (!SLUG.test(id)) throw new HttpError(404, 'Game not found', 'not_found')

    if (method === 'GET' && !sub) {
      const game = await getGameRow(db, id)
      if (!game) throw new HttpError(404, 'Game not found', 'not_found')
      const user = await actorFromRequest(req, db)
      const owner = user?.id === game.ownerId
      if (game.status !== 'published' && !owner) throw new HttpError(404, 'Game not found', 'not_found')
      const assets = await listAssets(db, id)
      return sendJson(res, 200, { game: present(config, game, { canEdit: owner, assets }) }, ctx)
    }

    if (method === 'PATCH' && !sub) {
      const user = await requireCreator(req, ctx, db)
      const existing = await getGameRow(db, id)
      if (!existing) throw new HttpError(404, 'Game not found', 'not_found')
      const body = await readJson(req, existing.generation === 'import' ? IMPORT_LIMIT : HTML_LIMIT)
      const { fields, spec } = fieldsForSave(body, existing)
      const verdict = await stampListing(fields, body, existing, config.env, fetchImpl, config.safetyModelOnPublish)
      const { game, version } = await updateGame(db, id, fields, spec, user.id)
      if (verdict.flagged) await recordHold(db, { actorId: user.id, gameId: game.id, reason: verdict.reason, source: verdict.source })
      const assets = await listAssets(db, id)
      return sendJson(res, 200, { game: present(config, game, { canEdit: true, assets }), version }, ctx)
    }

    if (method === 'POST' && sub === 'archive') {
      const user = await requireCreator(req, ctx, db)
      const { game } = await archiveGame(db, id, user.id)
      return sendJson(res, 200, { game: present(config, game, { canEdit: true }) }, ctx)
    }

    if (method === 'POST' && (sub === 'play' || sub === 'events')) {
      const event = sub === 'play' ? { type: 'play_started', eventId: null } : validateEvent(await readJson(req))
      const user = await actorFromRequest(req, db)
      const result = await recordEvent(db, {
        gameId: id,
        eventType: event.type,
        eventId: event.eventId,
        actorHash: event.type === 'play_started' ? actorHash(req, ctx) : null,
        userId: user?.id || null
      })
      const body = { plays: result.plays, type: event.type, duplicate: result.duplicate }
      if (result.roundToken) body.roundToken = result.roundToken
      return sendJson(res, 200, body, ctx)
    }

    if (method === 'POST' && sub === 'share') {
      const result = await incrementShares(db, id)
      return sendJson(res, 200, result, ctx)
    }

    if (method === 'GET' && sub === 'world') {
      const game = await getGameRow(db, id)
      if (!game || game.status !== 'published') throw new HttpError(404, 'Game not found', 'not_found')
      if (game.type !== 'world') throw new HttpError(400, 'This game has no shared world', 'validation_error')
      const stats = await listWorldStats(db, id)
      return sendJson(res, 200, { online: hub ? hub.online(id) : 0, stats, verified: false }, ctx)
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

  const pages = {
    '/': 'index.html',
    '/discover': 'discover.html',
    '/admin': 'admin.html',
    '/privacy': 'privacy.html',
    '/terms': 'terms.html',
    '/studio/dashboard': 'dashboard.html'
  }
  if (method === 'GET' && (pages[pathname] || /^\/g\/[a-z0-9-]+$/.test(pathname))) {
    const file = pages[pathname] || 'index.html'
    const html = await readFile(path.join(PUBLIC, file))
    return sendHtml(res, 200, html, ctx, 'studio')
  }

  const playMatch = pathname.match(/^\/play\/([a-z0-9-]+)$/)
  if (method === 'GET' && playMatch) {
    const game = await publishedOrNull(db, playMatch[1])
    if (!game) return sendHtml(res, 404, renderMissing('Game not found'), ctx, 'embed')
    const embed = url.searchParams.get('embed') === '1'
    return sendHtml(res, 200, await renderPlayPage(game, {
      embed,
      origin: requestOrigin(config, req),
      site: config.xSiteHandle
    }), ctx, embed ? 'player' : 'embed')
  }

  const shareMatch = pathname.match(/^\/r\/([a-z0-9-]+)$/)
  if (method === 'GET' && shareMatch) {
    const game = await publishedOrNull(db, shareMatch[1])
    if (!game) return sendHtml(res, 404, renderMissing('Game not found'), ctx, 'embed')
    const board = splitBoards(await listScores(db, game.id), game.type)
    let creator = 'Playground'
    if (game.ownerId) {
      const found = await db.query('select display_name from users where id = $1', [game.ownerId])
      creator = found.rows[0]?.display_name || 'Playground'
    }
    return sendHtml(res, 200, renderSharePage({ ...game, creator }, {
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
    const poster = await resolvePoster(db, game)
    return sendImage(res, poster.bytes, ctx, poster.kind)
  }

  const remixMatch = pathname.match(/^\/api\/games\/([a-z0-9-]+)\/remix$/)
  if (method === 'POST' && remixMatch) {
    const user = await requireCreator(req, ctx, db)
    await readJson(req)
    const source = await publishedOrNull(db, remixMatch[1])
    if (source?.type === 'world' && source.spec?.runtime === 'world') {
      let spec
      try { spec = validateWorldSpec(source.spec) } catch { spec = source.spec }
      const fields = validateGameInput({
        name: `${source.name} fork`.slice(0, 45),
        description: source.description,
        type: 'world',
        duration: source.duration,
        accent: source.accent
      })
      fields.generation = source.generation || 'rule-based-template'
      fields.tier = 'spec'
      fields.credit = readCredit({
        builtOn: { name: source.name, author: 'Playground', license: 'MIT', source: '' },
        inspiredBy: source.credit?.inspiredBy || []
      })
      spec = { ...spec, name: fields.name, description: fields.description, duration: fields.duration, accent: fields.accent }
      const { game, version } = await createGame(db, fields, spec, user.id)
      for (const edit of await loadEdits(db, source.id)) await saveEdit(db, game.id, edit, 'fork')
      for (const sparkId of await loadSparks(db, source.id)) await saveSpark(db, game.id, sparkId, 'fork')
      return sendJson(res, 201, { game: present(config, game, { canEdit: true }), url: `/g/${game.id}`, version }, ctx)
    }
    if (!source || !templateMarker(source.freeformHtml)) throw new HttpError(404, 'Game not found', 'not_found')
    const checked = assertFreeform(source.freeformHtml)
    if (!checked.ok) throw new HttpError(400, checked.errors.join('; '), 'freeform_rejected')
    const fields = validateGameInput({
      name: source.name,
      description: source.description,
      type: 'arcade',
      duration: source.duration,
      accent: source.accent
    })
    fields.generation = 'rule-based-template'
    fields.tier = 'freeform'
    fields.freeformHtml = checked.html
    fields.tags = (source.tags || []).filter((tag) => TAGS.includes(tag))
    fields.credit = {}
    const { game, version } = await createGame(db, fields, null, user.id)
    return sendJson(res, 201, { game: present(config, game, { canEdit: true }), url: `/g/${game.id}`, version }, ctx)
  }

  if (method === 'GET' && (pathname === '/three.js' || pathname.startsWith('/textures/'))) {
    const texName = pathname.startsWith('/textures/') ? pathname.slice('/textures/'.length) : ''
    const file = pathname === '/three.js'
      ? path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'vendor', 'three', 'three.min.js')
      : path.join(PUBLIC, 'textures', texName)
    if (pathname.startsWith('/textures/') && !/^[a-z0-9_-]+\.(jpg|png)$/.test(texName)) {
      return sendJson(res, 404, { error: 'Not found', code: 'not_found' }, ctx)
    }
    const ext = pathname === '/three.js' ? '.js' : (texName.endsWith('.png') ? '.png' : '.jpg')
    try {
      const bytes = await readFile(file)
      return sendJsonRaw(res, 200, bytes, ctx, ext, pathname)
    } catch {
      return sendJson(res, 404, { error: 'Not found', code: 'not_found' }, ctx)
    }
  }

  if (method === 'GET' && pathname.startsWith('/blocks/')) {
    const name = pathname.slice('/blocks/'.length)
    if (!BLOCK_FILES.has(name)) return sendJson(res, 404, { error: 'Not found', code: 'not_found' }, ctx)
    try {
      const bytes = await readFile(path.join(BLOCKS, name))
      return sendJsonRaw(res, 200, bytes, ctx, '.js', pathname)
    } catch {
      return sendJson(res, 404, { error: 'Not found', code: 'not_found' }, ctx)
    }
  }

  if (method === 'GET' && FILES.has(pathname)) {
    const file = FILES.get(pathname)
    try {
      const bytes = await readFile(path.join(PUBLIC, file))
      return sendJsonRaw(res, 200, bytes, ctx, path.extname(file), pathname)
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

function sendImage(res, bytes, ctx, kind = 'card') {
  const headers = {
    'content-type': 'image/png',
    'cache-control': kind === 'shot' ? 'public, max-age=86400' : 'no-store',
    'x-content-type-options': 'nosniff',
    'content-length': String(bytes.length)
  }
  if (ctx?.cookies?.length) headers['set-cookie'] = ctx.cookies
  if (ctx?.requestId) headers['x-request-id'] = ctx.requestId
  res.writeHead(200, headers)
  res.end(bytes)
  return 200
}

function cacheFor(pathname, ext) {
  if (pathname === '/favicon.svg' || pathname === '/favicon.ico' || pathname === '/three.js' || pathname.startsWith('/textures/') || ext === '.woff2' || ext === '.jpg' || ext === '.svg') {
    return 'public, max-age=2592000, immutable'
  }
  if (ext === '.js' || ext === '.css') return 'public, max-age=86400'
  return 'no-store'
}

function sendJsonRaw(res, status, bytes, ctx, ext, pathname = '') {
  const headers = {
    'content-type': MIME[ext] || 'application/octet-stream',
    'cache-control': cacheFor(pathname, ext),
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
