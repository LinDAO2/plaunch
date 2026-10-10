import { EXAMPLE_GAMES } from './arcade/examples.js'
import { tagsFor } from './ai/tags.js'
import { specFromGame } from './ai/gamespec.js'

const CLASSICS = [
  { id: 'click-frenzy', name: 'Click Frenzy', description: 'Tap as fast as you can.', type: 'tap', duration: 10, accent: '#a88bff', createdAt: '2026-10-09T00:00:00Z' },
  { id: 'lightning-reflex', name: 'Lightning Reflex', description: 'Wait for green, then tap.', type: 'reaction', duration: 10, accent: '#4adeb9', createdAt: '2026-10-09T00:00:00Z' },
  { id: 'lucky-seven', name: 'Lucky Seven', description: 'Guess the number from 1 to 10.', type: 'guess', duration: 10, accent: '#ffbd70', createdAt: '2026-10-09T00:00:00Z' },
  { id: 'meteor-dodge', name: 'Meteor Dodge', description: 'Dodge the falling meteors.', type: 'dodge', duration: 20, accent: '#ff779e', createdAt: '2026-10-09T00:00:00Z' }
]

const EXAMPLES = [
  ...CLASSICS.map((game) => ({ ...game, spec: specFromGame(game, { theme: game.type }) })),
  ...EXAMPLE_GAMES.map((game) => ({ ...game, createdAt: '2026-10-10T00:00:00Z' }))
]

export async function seed(db) {
  let inserted = 0
  await db.transaction(async (tx) => {
    for (const game of EXAMPLES) {
      const spec = game.spec
      const result = await tx.query(
        `insert into games (id, name, description, mechanic, duration, accent, token_interest, status, plays, generation, spec, created_at, updated_at, published_at, tags)
         values ($1, $2, $3, $4, $5, $6, false, 'published', 0, 'seed', $7::jsonb, $8, $8, $8, $9::jsonb)
         on conflict (id) do nothing
         returning id`,
        [game.id, game.name, game.description, game.type, game.duration, game.accent, JSON.stringify(spec), game.createdAt, JSON.stringify(tagsFor({ name: game.name, description: game.description, mechanic: game.type }))]
      )
      if (!result.rows.length) continue
      inserted += 1
      await tx.query(
        'insert into game_versions (game_id, version, snapshot) values ($1, 1, $2::jsonb)',
        [game.id, JSON.stringify({ ...game, tokenInterest: false, spec, generation: 'seed', status: 'published' })]
      )
      await tx.query(
        `insert into game_assets (game_id, kind, uri, meta) values ($1, 'accent', $2, '{"role":"theme-color"}'::jsonb)`,
        [game.id, game.accent]
      )
    }
  })
  return inserted
}

export async function seedIfEmpty(db) {
  const count = await db.query('select count(*) as n from games')
  if (Number(count.rows[0].n) > 0) return 0
  return seed(db)
}
