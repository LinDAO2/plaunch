import { randomUUID, createHash, randomBytes } from 'node:crypto'
import { HttpError } from './errors.js'
import { checkPlausible, plausibilityFor } from './plausibility.js'
import { specFromGame } from './ai/gamespec.js'
import { rankScores } from './scores.js'
import { slugify } from './validate.js'

function parseJson(value) {
  if (value == null) return null
  if (typeof value === 'string') return JSON.parse(value)
  return value
}

function iso(value) {
  return new Date(value).toISOString()
}

export function mapGame(row) {
  if (!row) return null
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    type: row.mechanic,
    duration: Number(row.duration),
    accent: row.accent,
    tokenInterest: row.token_interest === true,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    plays: Number(row.plays) || 0,
    status: row.status,
    ownerId: row.owner_id || null,
    generation: row.generation,
    spec: parseJson(row.spec)
  }
}

export function publicGame(game, { canEdit = false, assets = null, includeSpec = true } = {}) {
  const out = {
    id: game.id,
    name: game.name,
    description: game.description,
    type: game.type,
    duration: game.duration,
    accent: game.accent,
    tokenInterest: game.tokenInterest,
    createdAt: game.createdAt,
    plays: game.plays,
    status: game.status,
    ownerId: game.ownerId,
    generation: game.generation,
    canEdit
  }
  if (includeSpec) out.spec = game.spec
  if (assets) {
    out.assets = assets.map((asset) => ({
      id: asset.id,
      kind: asset.kind,
      uri: asset.uri,
      meta: parseJson(asset.meta) || {}
    }))
  }
  return out
}

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex')
}

async function nextVersion(tx, gameId) {
  const result = await tx.query('select coalesce(max(version), 0) + 1 as version from game_versions where game_id = $1', [gameId])
  return Number(result.rows[0].version)
}

async function insertVersion(tx, game, userId) {
  const version = await nextVersion(tx, game.id)
  await tx.query(
    'insert into game_versions (game_id, version, snapshot, created_by) values ($1, $2, $3::jsonb, $4)',
    [game.id, version, JSON.stringify(game), userId || null]
  )
  return version
}

async function replaceAccent(tx, gameId, accent) {
  await tx.query(`delete from game_assets where game_id = $1 and kind = 'accent'`, [gameId])
  await tx.query(
    `insert into game_assets (game_id, kind, uri, meta) values ($1, 'accent', $2, $3::jsonb)`,
    [gameId, accent, JSON.stringify({ role: 'theme-color' })]
  )
}

export async function listPublishedGames(db) {
  const result = await db.query(`select * from games where status = 'published' order by created_at desc, id asc`)
  return result.rows.map(mapGame)
}

export async function listOwnedGames(db, userId) {
  const result = await db.query(`select * from games where owner_id = $1 order by updated_at desc, id asc`, [userId])
  return result.rows.map(mapGame)
}

export async function getGameRow(db, id) {
  const result = await db.query('select * from games where id = $1', [id])
  return mapGame(result.rows[0])
}

export async function listAssets(db, gameId) {
  const result = await db.query('select id, kind, uri, meta from game_assets where game_id = $1 order by created_at asc', [gameId])
  return result.rows
}

async function uniqueSlug(tx, name) {
  const base = slugify(name)
  let id = base
  for (let attempt = 0; attempt < 5; attempt++) {
    const existing = await tx.query('select 1 from games where id = $1', [id])
    if (!existing.rows.length) return id
    id = `${base.slice(0, 32)}-${randomUUID().slice(0, 7)}`
  }
  throw new HttpError(409, 'Could not allocate a game id')
}

export async function createGame(db, fields, spec, userId) {
  return db.transaction(async (tx) => {
    const id = await uniqueSlug(tx, fields.name)
    const now = new Date().toISOString()
    const inserted = await tx.query(
      `insert into games (id, owner_id, name, description, mechanic, duration, accent, token_interest, status, plays, generation, spec, created_at, updated_at, published_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, 'published', 0, $9, $10::jsonb, $11, $11, $11)
       returning *`,
      [id, userId, fields.name, fields.description, fields.type, fields.duration, fields.accent, fields.tokenInterest, fields.generation || 'manual', JSON.stringify(spec), now]
    )
    const game = mapGame(inserted.rows[0])
    const version = await insertVersion(tx, game, userId)
    await replaceAccent(tx, id, fields.accent)
    return { game, version }
  })
}

export async function updateGame(db, id, fields, spec, userId) {
  return db.transaction(async (tx) => {
    const existing = await tx.query('select * from games where id = $1 for update', [id])
    const current = mapGame(existing.rows[0])
    if (!current) throw new HttpError(404, 'Game not found', 'not_found')
    if (!current.ownerId || current.ownerId !== userId) throw new HttpError(403, 'You can only edit your own games', 'forbidden')
    const updated = await tx.query(
      `update games set name = $2, description = $3, mechanic = $4, duration = $5, accent = $6, token_interest = $7, generation = $8, spec = $9::jsonb, updated_at = now()
       where id = $1 returning *`,
      [id, fields.name, fields.description, fields.type, fields.duration, fields.accent, fields.tokenInterest, fields.generation || current.generation, JSON.stringify(spec)]
    )
    const game = mapGame(updated.rows[0])
    const version = await insertVersion(tx, game, userId)
    await replaceAccent(tx, id, fields.accent)
    return { game, version }
  })
}

export async function archiveGame(db, id, userId) {
  return db.transaction(async (tx) => {
    const existing = await tx.query('select * from games where id = $1 for update', [id])
    const current = mapGame(existing.rows[0])
    if (!current) throw new HttpError(404, 'Game not found', 'not_found')
    if (!current.ownerId || current.ownerId !== userId) throw new HttpError(403, 'You can only archive your own games', 'forbidden')
    if (current.status === 'archived') return { game: current }
    const updated = await tx.query(`update games set status = 'archived', updated_at = now() where id = $1 returning *`, [id])
    const game = mapGame(updated.rows[0])
    await insertVersion(tx, game, userId)
    return { game }
  })
}

export async function recordEvent(db, { gameId, eventType, eventId }) {
  return db.transaction(async (tx) => {
    const existing = await tx.query('select * from games where id = $1 for update', [gameId])
    const game = mapGame(existing.rows[0])
    if (!game || game.status !== 'published') throw new HttpError(404, 'Game not found', 'not_found')
    if (eventId) {
      const dup = await tx.query('select 1 from plays where game_id = $1 and event_id = $2', [gameId, eventId])
      if (dup.rows.length) return { plays: game.plays, duplicate: true }
    }
    const roundToken = eventType === 'play_started' ? randomBytes(24).toString('base64url') : null
    try {
      await tx.query(
        'insert into plays (game_id, event_type, event_id, round_token_hash) values ($1, $2, $3, $4)',
        [gameId, eventType, eventId, roundToken ? hashToken(roundToken) : null]
      )
    } catch (err) {
      if (err.code === '23505') return { plays: game.plays, duplicate: true, roundToken: null }
      throw err
    }
    if (eventType !== 'play_started') return { plays: game.plays, duplicate: false, roundToken: null }
    const updated = await tx.query('update games set plays = plays + 1, updated_at = now() where id = $1 returning plays', [gameId])
    return { plays: Number(updated.rows[0].plays), duplicate: false, roundToken }
  })
}

export async function openRound(db, game, token, points) {
  const hash = hashToken(token)
  return db.transaction(async (tx) => {
    const found = await tx.query(
      `select id, created_at, consumed_at from plays
       where game_id = $1 and event_type = 'play_started' and round_token_hash = $2
       limit 1`,
      [game.id, hash]
    )
    const row = found.rows[0]
    if (!row) throw new HttpError(400, 'Round token is not valid for this game', 'validation_error')
    if (row.consumed_at) throw new HttpError(400, 'Round token was already used', 'validation_error')
    const elapsedMs = Date.now() - new Date(row.created_at).getTime()
    const verdict = checkPlausible(plausibilityFor(game), points, elapsedMs)
    if (!verdict.ok) throw new HttpError(400, verdict.message, 'validation_error')
    await tx.query('update plays set consumed_at = now() where id = $1', [row.id])
    return { assurance: 'checked', elapsedMs }
  })
}

export async function addScore(db, game, score) {
  const assurance = score.assurance === 'checked' ? 'checked' : 'unverified'
  const inserted = await db.query(
    `insert into scores (game_id, player_name, points, mechanic, ranking, unit, verified, assurance)
     values ($1, $2, $3, $4, $5, $6, false, $7)`,
    [game.id, score.name, score.points, game.type, score.ranking, score.unit, assurance]
  )
  return inserted.rowCount
}

export async function listScores(db, gameId) {
  const result = await db.query(
    'select player_name, points, mechanic, ranking, unit, verified, assurance, created_at from scores where game_id = $1',
    [gameId]
  )
  return result.rows.map((row) => ({
    name: row.player_name,
    points: Number(row.points),
    mechanic: row.mechanic,
    ranking: row.ranking,
    unit: row.unit,
    verified: row.verified === true,
    assurance: row.assurance === 'checked' ? 'checked' : 'unverified',
    createdAt: iso(row.created_at)
  }))
}

export function rankedForGame(scores, mechanic) {
  return rankScores(scores, mechanic)
}

export async function createAbuseReport(db, { gameId, userId, reason, details }) {
  const game = await getGameRow(db, gameId)
  if (!game) throw new HttpError(404, 'Game not found', 'not_found')
  const result = await db.query(
    `insert into abuse_reports (game_id, reporter_user_id, reason, details) values ($1, $2, $3, $4) returning id, status, created_at`,
    [gameId, userId || null, reason, details]
  )
  const row = result.rows[0]
  return { id: row.id, status: row.status, createdAt: iso(row.created_at) }
}

export async function createUser(db, { email, passwordHash, displayName }) {
  try {
    const result = await db.query(
      `insert into users (email, password_hash, display_name) values ($1, $2, $3) returning id, email, display_name`,
      [email, passwordHash, displayName]
    )
    const row = result.rows[0]
    return { id: row.id, email: row.email, displayName: row.display_name }
  } catch (err) {
    if (err.code === '23505') throw new HttpError(409, 'An account with that email already exists', 'conflict')
    throw err
  }
}

export async function findUserByEmail(db, email) {
  const result = await db.query('select id, email, display_name, password_hash from users where lower(email) = lower($1)', [email])
  const row = result.rows[0]
  if (!row) return null
  return { id: row.id, email: row.email, displayName: row.display_name, passwordHash: row.password_hash }
}

export async function createSession(db, userId, token, ttlSeconds) {
  const expires = new Date(Date.now() + ttlSeconds * 1000).toISOString()
  await db.query('insert into sessions (user_id, token_hash, expires_at) values ($1, $2, $3)', [userId, hashToken(token), expires])
}

export async function deleteSession(db, token) {
  if (!token) return
  await db.query('delete from sessions where token_hash = $1', [hashToken(token)])
}

export async function findUserBySession(db, token) {
  if (!token) return null
  const result = await db.query(
    `select u.id, u.email, u.display_name
     from sessions s join users u on u.id = s.user_id
     where s.token_hash = $1 and s.expires_at > now()`,
    [hashToken(token)]
  )
  const row = result.rows[0]
  if (!row) return null
  return { id: row.id, email: row.email, displayName: row.display_name }
}

export function specForSave(fields, requestedSpec, previous) {
  if (requestedSpec) return requestedSpec
  return specFromGame(fields, {
    theme: previous?.spec?.theme,
    difficulty: previous?.spec?.difficulty,
    spawnRate: previous?.spec?.spawn?.rate
  })
}
