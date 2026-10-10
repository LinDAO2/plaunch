import { randomUUID, createHash, randomBytes } from 'node:crypto'
import { HttpError } from './errors.js'
import { checkPlausible, plausibilityFor } from './plausibility.js'
import { specFromGame } from './ai/gamespec.js'
import { rankScores } from './scores.js'
import { slugify } from './validate.js'
import { posterKind } from './poster-store.js'

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
    shares: Number(row.shares) || 0,
    status: row.status,
    ownerId: row.owner_id || null,
    generation: row.generation,
    spec: parseJson(row.spec),
    tier: row.tier === 'freeform' ? 'freeform' : 'spec',
    freeformHtml: row.freeform_html || null,
    tags: readTags(row.tags),
    featured: row.featured === true,
    flagReason: row.flag_reason || '',
    credit: readCredit(row.credit),
    posterState: row.poster_state === 'shot' ? 'shot' : ''
  }
}

function readCredit(value) {
  const parsed = parseJson(value)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
  return {
    author: typeof parsed.author === 'string' ? parsed.author : '',
    license: typeof parsed.license === 'string' ? parsed.license : '',
    source: typeof parsed.source === 'string' ? parsed.source : '',
    sha: typeof parsed.sha === 'string' ? parsed.sha : '',
    origin: parsed.origin === 'curated' || parsed.origin === 'community' ? parsed.origin : '',
    copyleftConfirmed: parsed.copyleftConfirmed === true,
    permissionConfirmed: parsed.permissionConfirmed === true
  }
}

function readTags(value) {
  const parsed = parseJson(value)
  if (!Array.isArray(parsed)) return []
  return parsed.filter((tag) => typeof tag === 'string')
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
    shares: game.shares || 0,
    status: game.status,
    ownerId: game.ownerId,
    generation: game.generation,
    canEdit,
    tags: game.tags || [],
    featured: game.featured === true,
    credit: game.credit?.author ? game.credit : null,
    poster: posterKind(game)
  }
  if (canEdit) out.flagReason = game.flagReason || ''
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
    const tier = fields.tier === 'freeform' ? 'freeform' : 'spec'
    const status = fields.status === 'pending' ? 'pending' : 'published'
    const inserted = await tx.query(
      `insert into games (id, owner_id, name, description, mechanic, duration, accent, token_interest, status, plays, generation, spec, created_at, updated_at, published_at, tier, freeform_html, tags, featured, flag_reason, credit)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 0, $10, $11::jsonb, $12, $12, $13, $14, $15, $16::jsonb, false, $17, $18::jsonb)
       returning *`,
      [id, userId, fields.name, fields.description, fields.type, fields.duration, fields.accent, fields.tokenInterest, status, fields.generation || 'manual', spec == null ? null : JSON.stringify(spec), now, status === 'published' ? now : null, tier, tier === 'freeform' ? fields.freeformHtml : null, JSON.stringify(fields.tags || []), fields.flagReason || '', JSON.stringify(fields.credit || {})]
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
    const tier = fields.tier === 'freeform' ? 'freeform' : 'spec'
    const status = fields.status || current.status
    const updated = await tx.query(
      `update games set name = $2, description = $3, mechanic = $4, duration = $5, accent = $6, token_interest = $7, generation = $8, spec = $9::jsonb, tier = $10, freeform_html = $11, tags = $12::jsonb, status = $13, flag_reason = $14, updated_at = now()
       where id = $1 returning *`,
      [id, fields.name, fields.description, fields.type, fields.duration, fields.accent, fields.tokenInterest, fields.generation || current.generation, spec == null ? null : JSON.stringify(spec), tier, tier === 'freeform' ? (fields.freeformHtml || current.freeformHtml) : null, JSON.stringify(fields.tags || current.tags || []), status, fields.flagReason ?? current.flagReason ?? '']
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

export async function recordEvent(db, { gameId, eventType, eventId, actorHash = null, userId = null }) {
  return db.transaction(async (tx) => {
    const existing = await tx.query('select * from games where id = $1 for update', [gameId])
    const game = mapGame(existing.rows[0])
    if (!game || game.status !== 'published') throw new HttpError(404, 'Game not found', 'not_found')
    if (eventId) {
      const dup = await tx.query('select 1 from plays where game_id = $1 and event_id = $2', [gameId, eventId])
      if (dup.rows.length) return { plays: game.plays, duplicate: true }
    }
    const roundToken = eventType === 'play_started' ? randomBytes(24).toString('base64url') : null
    let burst = false
    if (eventType === 'play_started' && actorHash) {
      const recent = await tx.query(
        `select count(*)::int as n from plays
         where game_id = $1 and event_type = 'play_started' and actor_hash = $2
           and created_at > now() - interval '2 minutes'`,
        [gameId, actorHash]
      )
      burst = Number(recent.rows[0].n) >= 2
    }
    try {
      await tx.query(
        `insert into plays (game_id, event_type, event_id, round_token_hash, actor_hash, user_id, burst)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [gameId, eventType, eventId, roundToken ? hashToken(roundToken) : null, eventType === 'play_started' ? actorHash : null, userId, burst]
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

export async function submitScore(db, game, score) {
  return db.transaction(async (tx) => {
    let assurance = 'unverified'
    if (score.roundToken) {
      const found = await tx.query(
        `select id, created_at, consumed_at from plays
         where game_id = $1 and event_type = 'play_started' and round_token_hash = $2
         for update`,
        [game.id, hashToken(score.roundToken)]
      )
      const row = found.rows[0]
      if (!row) throw new HttpError(400, 'Round token is not valid for this game', 'validation_error')
      if (row.consumed_at) throw new HttpError(400, 'Round token was already used', 'validation_error')
      const elapsedMs = Date.now() - new Date(row.created_at).getTime()
      const verdict = checkPlausible(plausibilityFor(game), score.points, elapsedMs)
      if (!verdict.ok) throw new HttpError(400, verdict.message, 'validation_error')
      const consumed = await tx.query(
        'update plays set consumed_at = now() where id = $1 and consumed_at is null returning id',
        [row.id]
      )
      if (!consumed.rows.length) throw new HttpError(400, 'Round token was already used', 'validation_error')
      assurance = 'checked'
    }
    await tx.query(
      `insert into scores (game_id, player_name, points, mechanic, ranking, unit, verified, assurance)
       values ($1, $2, $3, $4, $5, $6, false, $7)`,
      [game.id, score.name, score.points, game.type, score.ranking, score.unit, assurance]
    )
    return { assurance }
  })
}

export async function incrementShares(db, gameId) {
  const updated = await db.query(
    `update games set shares = shares + 1, updated_at = now()
     where id = $1 and status = 'published'
     returning shares`,
    [gameId]
  )
  if (!updated.rows.length) throw new HttpError(404, 'Game not found', 'not_found')
  return { shares: Number(updated.rows[0].shares) }
}

function utcDay() {
  return new Date().toISOString().slice(0, 10)
}

async function takeDaily(tx, scope, day, limit) {
  const result = await tx.query(
    `insert into ai_daily (scope, day, total) values ($1, $2::date, 1)
     on conflict (scope, day) do update set total = ai_daily.total + 1
     where ai_daily.total < $3
     returning total`,
    [scope, day, limit]
  )
  return result.rows[0] ? Number(result.rows[0].total) : 0
}

export async function consumeAiCredit(db, { userId, guest, ipHash, userLimit, guestLimit, globalLimit }) {
  const day = utcDay()
  return db.transaction(async (tx) => {
    const mine = await takeDaily(tx, guest ? `guest:${userId}` : `user:${userId}`, day, guest ? guestLimit : userLimit)
    if (!mine) {
      const who = guest ? 'browser' : 'account'
      const limit = guest ? guestLimit : userLimit
      throw new HttpError(429, `Daily generation limit reached for this ${who} (${limit}). Try again tomorrow.`, 'ai_daily_limit')
    }
    if (guest) {
      const network = await takeDaily(tx, `ip:${ipHash}`, day, guestLimit)
      if (!network) {
        throw new HttpError(429, `Daily generation limit reached for this network (${guestLimit}). Try again tomorrow.`, 'ai_daily_limit')
      }
    }
    const everyone = await takeDaily(tx, 'global', day, globalLimit)
    if (!everyone) {
      throw new HttpError(429, 'Daily generation limit reached for everyone. Try again tomorrow.', 'ai_daily_limit')
    }
    return { user: mine, global: everyone }
  })
}

export async function dashboardFor(db, userId) {
  const games = await db.query('select * from games where owner_id = $1 order by updated_at desc, id asc', [userId])
  if (!games.rows.length) return []
  const events = await db.query(
    `select p.game_id, p.event_type, count(*)::int as n
     from plays p
     join games g on g.id = p.game_id
     where g.owner_id = $1
     group by p.game_id, p.event_type`,
    [userId]
  )
  const scores = await db.query(
    `select s.game_id, s.player_name, s.points, s.ranking, s.unit, s.created_at
     from scores s
     join games g on g.id = s.game_id
     where g.owner_id = $1 and s.assurance = 'checked'`,
    [userId]
  )
  const counts = new Map()
  for (const row of events.rows) {
    const bucket = counts.get(row.game_id) || {}
    bucket[row.event_type] = Number(row.n)
    counts.set(row.game_id, bucket)
  }
  const best = new Map()
  for (const row of scores.rows) {
    const current = best.get(row.game_id)
    const better = !current || (row.ranking === 'lower' ? Number(row.points) < current.points : Number(row.points) > current.points)
    if (better) {
      best.set(row.game_id, {
        name: row.player_name,
        points: Number(row.points),
        ranking: row.ranking,
        unit: row.unit
      })
    }
  }
  return games.rows.map((row) => {
    const game = mapGame(row)
    const tally = counts.get(game.id) || {}
    return {
      id: game.id,
      name: game.name,
      status: game.status,
      type: game.type,
      views: tally.game_viewed || 0,
      plays: tally.play_started || 0,
      completions: tally.play_completed || 0,
      shares: game.shares,
      topScore: best.get(game.id) || null
    }
  })
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

const TRENDING_SQL = `
  select p.game_id, count(distinct p.actor_hash)::int as score
  from plays p
  join games og on og.id = p.game_id
  where p.event_type = 'play_started'
    and p.actor_hash is not null
    and p.created_at > now() - interval '24 hours'
    and (p.user_id is null or og.owner_id is null or p.user_id <> og.owner_id)
    and not exists (
      select 1 from plays b
      where b.game_id = p.game_id
        and b.actor_hash = p.actor_hash
        and b.event_type = 'play_started'
        and b.burst = true
        and b.created_at > now() - interval '24 hours'
    )
  group by p.game_id
`

export async function discoverGames(db, { view = 'new', tag = '', q = '' } = {}) {
  const params = []
  const where = [`g.status = 'published'`]
  if (view === 'featured') where.push('g.featured = true')
  if (tag) {
    params.push(JSON.stringify([tag]))
    where.push(`g.tags @> $${params.length}::jsonb`)
  }
  const needle = String(q || '').trim().slice(0, 80).replace(/[%_]/g, '')
  if (needle) {
    params.push(`%${needle}%`)
    where.push(`(g.name ilike $${params.length} or g.description ilike $${params.length} or g.tags::text ilike $${params.length})`)
  }
  const order = view === 'trending'
    ? 'coalesce(t.score, 0) desc, g.created_at desc, g.id asc'
    : 'g.created_at desc, g.id asc'
  const result = await db.query(
    `select g.*, coalesce(t.score, 0)::int as trending
     from games g
     left join (${TRENDING_SQL}) t on t.game_id = g.id
     where ${where.join(' and ')}
     order by ${order}
     limit 60`,
    params
  )
  return result.rows.map((row) => {
    const game = publicGame(mapGame(row), { includeSpec: false })
    game.trending = Number(row.trending) || 0
    return game
  })
}

async function writeAudit(db, { actorId, action, targetType, targetId, detail }) {
  await db.query(
    `insert into audit_log (actor_id, action, target_type, target_id, detail) values ($1, $2, $3, $4, $5::jsonb)`,
    [actorId || null, action, targetType, String(targetId || ''), JSON.stringify(detail || {})]
  )
}

function auditRow(row) {
  return {
    id: row.id,
    actorId: row.actor_id || null,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    detail: parseJson(row.detail) || {},
    createdAt: iso(row.created_at)
  }
}

export async function moderateGame(db, { id, actorId, action }) {
  const next = { hide: 'hidden', unhide: 'published', archive: 'archived' }[action]
  if (!next) throw new HttpError(400, 'Unknown moderation action', 'validation_error')
  return db.transaction(async (tx) => {
    const existing = await tx.query('select * from games where id = $1 for update', [id])
    const current = mapGame(existing.rows[0])
    if (!current) throw new HttpError(404, 'Game not found', 'not_found')
    if (action === 'unhide' && current.status !== 'hidden' && current.status !== 'pending') {
      throw new HttpError(400, 'Only hidden or pending games can be made public', 'validation_error')
    }
    const featured = action === 'hide' || action === 'archive' ? false : current.featured
    const updated = await tx.query(
      `update games set status = $2, featured = $3, published_at = case when $2 = 'published' then now() else published_at end, updated_at = now()
       where id = $1 returning *`,
      [id, next, featured]
    )
    const game = mapGame(updated.rows[0])
    await writeAudit(tx, { actorId, action: `game.${action}`, targetType: 'game', targetId: id, detail: { status: next } })
    await insertVersion(tx, game, actorId)
    return game
  })
}

export async function featureGame(db, { id, actorId, featured }) {
  return db.transaction(async (tx) => {
    const existing = await tx.query('select * from games where id = $1 for update', [id])
    const current = mapGame(existing.rows[0])
    if (!current) throw new HttpError(404, 'Game not found', 'not_found')
    if (featured && current.status !== 'published') {
      throw new HttpError(400, 'Only a public game can be featured', 'validation_error')
    }
    const updated = await tx.query(
      `update games set featured = $2, updated_at = now() where id = $1 returning *`,
      [id, featured === true]
    )
    const game = mapGame(updated.rows[0])
    await writeAudit(tx, {
      actorId,
      action: featured ? 'game.feature' : 'game.unfeature',
      targetType: 'game',
      targetId: id,
      detail: { featured: featured === true }
    })
    return game
  })
}

export async function banUser(db, { userId, actorId }) {
  if (!userId) throw new HttpError(404, 'User not found', 'not_found')
  if (userId === actorId) throw new HttpError(400, 'You cannot ban your own account', 'validation_error')
  return db.transaction(async (tx) => {
    const found = await tx.query('select id, email, banned_at, ip_hash from users where id = $1 for update', [userId])
    const row = found.rows[0]
    if (!row) throw new HttpError(404, 'User not found', 'not_found')
    if (!row.banned_at) {
      await tx.query('update users set banned_at = now(), updated_at = now() where id = $1', [userId])
    }
    if (row.ip_hash) {
      await tx.query('insert into ip_bans (ip_hash) values ($1) on conflict (ip_hash) do nothing', [row.ip_hash])
    }
    await tx.query('delete from sessions where user_id = $1', [userId])
    await writeAudit(tx, { actorId, action: 'user.ban', targetType: 'user', targetId: userId, detail: { email: row.email || '', ipHash: row.ip_hash || '' } })
    return { id: row.id, email: row.email, banned: true }
  })
}

export async function reviewReport(db, { id, actorId, status }) {
  if (status !== 'reviewed' && status !== 'dismissed') {
    throw new HttpError(400, 'Report status must be reviewed or dismissed', 'validation_error')
  }
  return db.transaction(async (tx) => {
    const updated = await tx.query(
      `update abuse_reports set status = $2 where id = $1 and status = 'open' returning id, game_id, status`,
      [id, status]
    )
    const row = updated.rows[0]
    if (!row) throw new HttpError(404, 'Open report not found', 'not_found')
    await writeAudit(tx, {
      actorId,
      action: status === 'dismissed' ? 'report.dismiss' : 'report.review',
      targetType: 'report',
      targetId: id,
      detail: { gameId: row.game_id, status }
    })
    return { id: row.id, gameId: row.game_id, status: row.status }
  })
}

export async function resetWorld(db, { id, actorId }) {
  const current = await getGameRow(db, id)
  if (!current) throw new HttpError(404, 'Game not found', 'not_found')
  if (current.type !== 'world') throw new HttpError(400, 'This game has no shared world', 'validation_error')
  await db.query('delete from world_edits where game_id = $1', [id])
  await db.query('delete from world_stats where game_id = $1', [id])
  await writeAudit(db, { actorId, action: 'world.reset', targetType: 'game', targetId: id, detail: {} })
  return current
}

export async function recordHold(db, { actorId, gameId, reason, source }) {
  await writeAudit(db, {
    actorId,
    action: 'game.hold',
    targetType: 'game',
    targetId: gameId,
    detail: { reason, source }
  })
}

export async function moderationQueue(db) {
  const pending = await db.query(`select * from games where status in ('pending', 'hidden') order by updated_at desc limit 50`)
  const reports = await db.query(
    `select r.id, r.game_id, r.reason, r.details, r.status, r.created_at, g.name as game_name
     from abuse_reports r
     left join games g on g.id = r.game_id
     where r.status = 'open'
     order by r.created_at asc
     limit 50`
  )
  const audit = await db.query(`select * from audit_log order by created_at desc limit 40`)
  return {
    games: pending.rows.map((row) => {
      const game = mapGame(row)
      return {
        id: game.id,
        name: game.name,
        type: game.type,
        status: game.status,
        flagReason: game.flagReason,
        tags: game.tags,
        ownerId: game.ownerId,
        createdAt: game.createdAt
      }
    }),
    reports: reports.rows.map((row) => ({
      id: row.id,
      gameId: row.game_id,
      gameName: row.game_name || '',
      reason: row.reason,
      details: row.details,
      status: row.status,
      createdAt: iso(row.created_at)
    })),
    audit: audit.rows.map(auditRow)
  }
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

function mapAccount(row) {
  if (!row) return null
  return {
    id: row.id,
    email: row.email || null,
    displayName: row.display_name,
    kind: row.kind || 'account',
    bannedAt: row.banned_at || null,
    ipHash: row.ip_hash || null,
    passwordHash: row.password_hash
  }
}

export async function createUser(db, { email, passwordHash, displayName, ipHash = null }) {
  try {
    const result = await db.query(
      `insert into users (email, password_hash, display_name, kind, ip_hash)
       values ($1, $2, $3, 'account', $4)
       returning id, email, display_name, kind, banned_at, ip_hash`,
      [email, passwordHash, displayName, ipHash]
    )
    return mapAccount(result.rows[0])
  } catch (err) {
    if (err.code === '23505') throw new HttpError(409, 'An account with that email already exists', 'conflict')
    throw err
  }
}

export async function createGuest(db, { token, ipHash }) {
  const result = await db.query(
    `insert into users (email, password_hash, display_name, kind, guest_token_hash, ip_hash)
     values (null, null, 'Guest', 'guest', $1, $2)
     returning id, email, display_name, kind, banned_at, ip_hash`,
    [hashToken(token), ipHash]
  )
  return mapAccount(result.rows[0])
}

export async function findGuestByToken(db, token) {
  if (!token || token.length < 20) return null
  const result = await db.query(
    `select id, email, display_name, kind, banned_at, ip_hash
     from users where guest_token_hash = $1 and kind = 'guest'`,
    [hashToken(token)]
  )
  return mapAccount(result.rows[0])
}

export async function isIpBanned(db, ipHash) {
  if (!ipHash) return false
  const result = await db.query('select 1 as ok from ip_bans where ip_hash = $1', [ipHash])
  return result.rows.length > 0
}

export async function mergeGuestIntoAccount(db, guestId, accountId) {
  if (!guestId || !accountId || guestId === accountId) return
  await db.transaction(async (tx) => {
    await tx.query('update games set owner_id = $1 where owner_id = $2', [accountId, guestId])
    await tx.query('update game_versions set created_by = $1 where created_by = $2', [accountId, guestId])
    await tx.query('update freeform_previews set owner_id = $1 where owner_id = $2', [accountId, guestId])
    await tx.query('update abuse_reports set reporter_user_id = $1 where reporter_user_id = $2', [accountId, guestId])
    await tx.query('update plays set user_id = $1 where user_id = $2', [accountId, guestId])
    await tx.query('update audit_log set actor_id = $1 where actor_id = $2', [accountId, guestId])
    await tx.query('delete from sessions where user_id = $1', [guestId])
    await tx.query('delete from users where id = $1 and kind = $2', [guestId, 'guest'])
  })
}

export async function findUserByEmail(db, email) {
  const result = await db.query(
    'select id, email, display_name, password_hash, banned_at, kind, ip_hash from users where lower(email) = lower($1)',
    [email]
  )
  return mapAccount(result.rows[0])
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
    `select u.id, u.email, u.display_name, u.banned_at, u.kind, u.ip_hash
     from sessions s join users u on u.id = s.user_id
     where s.token_hash = $1 and s.expires_at > now()`,
    [hashToken(token)]
  )
  const row = result.rows[0]
  if (!row || row.banned_at) return null
  return mapAccount(row)
}

export async function savePreview(db, html, ownerId) {
  await db.query('delete from freeform_previews where expires_at <= now()')
  const token = randomBytes(24).toString('base64url')
  const expires = new Date(Date.now() + 15 * 60 * 1000).toISOString()
  await db.query(
    'insert into freeform_previews (token, html, owner_id, expires_at) values ($1, $2, $3, $4)',
    [token, html, ownerId || null, expires]
  )
  return token
}

export async function takePreview(db, token) {
  const result = await db.query(
    'select html from freeform_previews where token = $1 and expires_at > now()',
    [token]
  )
  return result.rows[0]?.html || ''
}

export function specForSave(fields, requestedSpec, previous) {
  if (requestedSpec) return requestedSpec
  return specFromGame(fields, {
    theme: previous?.spec?.theme,
    difficulty: previous?.spec?.difficulty,
    spawnRate: previous?.spec?.spawn?.rate
  })
}
