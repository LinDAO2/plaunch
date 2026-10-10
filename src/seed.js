import { EXAMPLE_GAMES } from './arcade/examples.js'
import { TAGS, tagsFor } from './ai/tags.js'
import { specFromGame } from './ai/gamespec.js'
import { featuredWorlds } from './blocks/spec.js'
import { loadCurated } from './imports/catalog.js'
import { TEMPLATES } from './templates/catalog.js'
import { renderTemplate } from './templates/render.js'

const FIXTURE_NAME = /^(Ada Run|Zip Run|Dot Run)$/
const FIXTURE_AUTHOR = /^(Submitter|Ada Lovelace)$/

const TEMPLATE_TAGS = {
  'word-guess': ['puzzle', 'guess'],
  'block-drop': ['puzzle', 'arcade'],
  snake: ['arcade', 'action'],
  'merge-tiles': ['puzzle'],
  flap: ['arcade', 'action'],
  breakout: ['arcade', 'action'],
  platformer: ['action'],
  'endless-runner': ['runner', 'action'],
  'space-shooter': ['action'],
  'maze-chomper': ['arcade'],
  'jump-up': ['arcade', 'action'],
  'match-3': ['puzzle']
}

export function templateGames() {
  return TEMPLATES.map((spec, index) => ({
    id: spec.id,
    name: spec.name,
    description: spec.description,
    type: 'arcade',
    duration: 60,
    accent: String(spec.theme.palette.accent || '#e6ff3a').toLowerCase(),
    createdAt: new Date(Date.UTC(2026, 9, 10, 18, 0, index)).toISOString(),
    tags: (TEMPLATE_TAGS[spec.id] || ['arcade']).filter((tag) => TAGS.includes(tag)),
    freeformHtml: renderTemplate(spec),
    credit: {}
  }))
}

function assertCatalogGame(game) {
  if (FIXTURE_NAME.test(game.name || '') || FIXTURE_AUTHOR.test(game.credit?.author || '')) {
    throw new Error(`Seed refused a test fixture: ${game.name || game.id}`)
  }
}

const CLASSICS = [
  { id: 'click-frenzy', name: 'Click Frenzy', description: 'Tap as fast as you can.', type: 'tap', duration: 10, accent: '#a88bff', createdAt: '2026-10-09T00:00:00Z' },
  { id: 'lightning-reflex', name: 'Lightning Reflex', description: 'Wait for green, then tap.', type: 'reaction', duration: 10, accent: '#4adeb9', createdAt: '2026-10-09T00:00:00Z' },
  { id: 'lucky-seven', name: 'Lucky Seven', description: 'Guess the number from 1 to 10.', type: 'guess', duration: 10, accent: '#ffbd70', createdAt: '2026-10-09T00:00:00Z' },
  { id: 'meteor-dodge', name: 'Meteor Dodge', description: 'Dodge the falling meteors.', type: 'dodge', duration: 20, accent: '#ff779e', createdAt: '2026-10-09T00:00:00Z' }
]

const EXAMPLES = [
  ...CLASSICS.map((game) => ({ ...game, spec: specFromGame(game, { theme: game.type }) })),
  ...EXAMPLE_GAMES.map((game) => ({ ...game, createdAt: '2026-10-10T00:00:00Z' })),
  ...featuredWorlds().map((game) => ({ ...game, createdAt: '2026-10-10T00:00:00Z' }))
]

export async function seed(db) {
  let inserted = 0
  await db.transaction(async (tx) => {
    for (const game of EXAMPLES) {
      assertCatalogGame(game)
      const spec = game.spec
      const result = await tx.query(
        `insert into games (id, name, description, mechanic, duration, accent, token_interest, status, plays, generation, spec, created_at, updated_at, published_at, tags, featured)
         values ($1, $2, $3, $4, $5, $6, false, 'published', 0, 'seed', $7::jsonb, $8, $8, $8, $9::jsonb, $10)
         on conflict (id) do nothing
         returning id`,
        [game.id, game.name, game.description, game.type, game.duration, game.accent, JSON.stringify(spec), game.createdAt, JSON.stringify(tagsFor({ name: game.name, description: game.description, mechanic: game.type })), game.featured === true]
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
    for (const game of await loadCurated()) {
      assertCatalogGame(game)
      const result = await tx.query(
        `insert into games (id, name, description, mechanic, duration, accent, token_interest, status, plays, generation, spec, created_at, updated_at, published_at, tags, featured, tier, freeform_html, credit)
         values ($1, $2, $3, $4, $5, $6, false, 'published', 0, 'seed', null, $7, $7, $7, $8::jsonb, false, 'freeform', $9, $10::jsonb)
         on conflict (id) do nothing
         returning id`,
        [game.id, game.name, game.description, game.type, game.duration, game.accent, game.createdAt, JSON.stringify(game.tags), game.freeformHtml, JSON.stringify(game.credit)]
      )
      if (!result.rows.length) continue
      inserted += 1
      await tx.query(
        'insert into game_versions (game_id, version, snapshot) values ($1, 1, $2::jsonb)',
        [game.id, JSON.stringify({ id: game.id, name: game.name, credit: game.credit, generation: 'seed', status: 'published', tier: 'freeform' })]
      )
    }
    for (const game of templateGames()) {
      assertCatalogGame(game)
      const result = await tx.query(
        `insert into games (id, name, description, mechanic, duration, accent, token_interest, status, plays, generation, spec, created_at, updated_at, published_at, tags, featured, tier, freeform_html, credit)
         values ($1, $2, $3, $4, $5, $6, false, 'published', 0, 'seed', null, $7, $7, $7, $8::jsonb, false, 'freeform', $9, $10::jsonb)
         on conflict (id) do nothing
         returning id`,
        [game.id, game.name, game.description, game.type, game.duration, game.accent, game.createdAt, JSON.stringify(game.tags), game.freeformHtml, JSON.stringify(game.credit)]
      )
      if (!result.rows.length) continue
      inserted += 1
      await tx.query(
        'insert into game_versions (game_id, version, snapshot) values ($1, 1, $2::jsonb)',
        [game.id, JSON.stringify({ id: game.id, name: game.name, generation: 'seed', status: 'published', tier: 'freeform', tags: game.tags })]
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
