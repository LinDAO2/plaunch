export async function loadEdits(db, gameId) {
  const result = await db.query(
    'select x, y, z, block from world_edits where game_id = $1',
    [gameId]
  )
  return result.rows.map((row) => ({
    x: Number(row.x),
    y: Number(row.y),
    z: Number(row.z),
    block: Number(row.block)
  }))
}

export async function saveEdit(db, gameId, edit, name) {
  await db.query(
    `insert into world_edits (game_id, x, y, z, block, editor_name, updated_at)
     values ($1, $2, $3, $4, $5, $6, now())
     on conflict (game_id, x, y, z) do update set
       block = excluded.block,
       editor_name = excluded.editor_name,
       updated_at = now()`,
    [gameId, edit.x, edit.y, edit.z, edit.block, name.slice(0, 40)]
  )
}

export async function addWorldStat(db, gameId, name, blocks, timeMs) {
  if (!blocks && !timeMs) return
  await db.query(
    `insert into world_stats (game_id, player_name, blocks_placed, time_ms)
     values ($1, $2, $3, $4)
     on conflict (game_id, player_name) do update set
       blocks_placed = world_stats.blocks_placed + excluded.blocks_placed,
       time_ms = world_stats.time_ms + excluded.time_ms`,
    [gameId, name.slice(0, 40), blocks | 0, timeMs | 0]
  )
}

export async function listWorldStats(db, gameId) {
  const result = await db.query(
    `select player_name, blocks_placed, time_ms from world_stats
     where game_id = $1
     order by blocks_placed desc, time_ms desc
     limit 20`,
    [gameId]
  )
  return result.rows.map((row) => ({
    name: row.player_name,
    blocksPlaced: Number(row.blocks_placed) || 0,
    timePlayedMs: Number(row.time_ms) || 0,
    verified: false
  }))
}

export async function loadSparks(db, gameId) {
  const result = await db.query(
    'select spark_id from world_sparks where game_id = $1',
    [gameId]
  )
  return result.rows.map((row) => Number(row.spark_id))
}

export async function saveSpark(db, gameId, sparkId, name) {
  const result = await db.query(
    `insert into world_sparks (game_id, spark_id, picker_name)
     values ($1, $2, $3)
     on conflict (game_id, spark_id) do nothing
     returning spark_id`,
    [gameId, sparkId, name.slice(0, 40)]
  )
  return result.rows.length > 0
}

export async function clearWorld(db, gameId) {
  await db.query('delete from world_edits where game_id = $1', [gameId])
  await db.query('delete from world_stats where game_id = $1', [gameId])
  await db.query('delete from world_sparks where game_id = $1', [gameId])
}
