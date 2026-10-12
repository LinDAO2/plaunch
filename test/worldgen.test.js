import assert from 'node:assert/strict'
import { test } from 'node:test'
import { generateIdea } from '../src/ai/idea.js'
import { repairWorldSpec, chooseWorld } from '../src/blocks/spec.js'
import { WATER, blockAt, surfaceY, worldFromSpec } from '../src/blocks/terrain.js'
import { saveEdit } from '../src/blocks/store.js'
import { createClient, startServer } from '../testing/helpers.js'

test('repair keeps a messy model reply inside the world schema', () => {
  const spec = repairWorldSpec({
    biome: 'not-a-biome',
    name: '  Salt Flats  ',
    goal: 'Find the clay marker.',
    terrain: { islands: false, caves: true, sky: 'dusk' },
    quests: [{ kind: 'find', text: 'Find the clay marker.' }, { kind: 'explode', text: 'no' }],
    music: 'soft dusk',
    cycle: 'dusk',
    palette: ['#c46a4a', '#e2c56a', 'nope'],
    blockSet: [{ name: 'Clay', color: '#c46a4a', texture: 'brick' }, { name: 'Dune', color: '#e2c56a', texture: 'speckle' }]
  }, 'a desert treasure hunt')
  assert.equal(spec.version, '1.2')
  assert.equal(spec.runtime, 'world')
  assert.equal(spec.biome, 'desert')
  assert.equal(spec.terrain.caves, true)
  assert.equal(spec.cycle, 'dusk')
  assert.equal(spec.music, 'calm')
  assert.equal(spec.quests.some((quest) => quest.kind === 'find'), true)
  assert.equal(spec.quests.some((quest) => quest.kind === 'explode'), false)
  assert.equal(spec.blockSet[0].texture, 'brick')
})

test('landscape prompts keep distinct biomes and landforms', () => {
  const prompts = [
    ['a dense green forest with tall trees', 'grassland', 'forest'],
    ['mountains with a lake', 'grassland', 'lake'],
    ['a sandy beach along the coast', 'grassland', 'beach'],
    ['snowy mountain peaks', 'snow', 'peaks'],
    ['a desert canyon', 'desert', 'canyon']
  ]
  const specs = prompts.map(([prompt, biome, landform]) => {
    const spec = repairWorldSpec({ biome: 'grassland', terrain: { islands: false, caves: false, sky: 'day', landform: 'rolling' } }, prompt)
    assert.equal(spec.biome, biome)
    assert.equal(spec.terrain.landform, landform)
    assert.equal(chooseWorld(prompt).name.length > 2, true)
    return spec
  })
  const keys = new Set(specs.map((spec) => `${spec.biome}:${spec.terrain.landform}:${spec.terrainSeed}:${spec.name}`))
  assert.equal(keys.size, prompts.length)
  const forest = worldFromSpec(specs[0])
  const lake = worldFromSpec(specs[1])
  const beach = worldFromSpec(specs[2])
  const peaks = worldFromSpec(specs[3])
  const canyon = worldFromSpec(specs[4])
  const mid = (world) => surfaceY(world.size >> 1, world.size >> 1, world)
  assert.ok(mid(lake) < WATER)
  assert.ok(surfaceY(4, 2, beach) < surfaceY(4, beach.size - 4, beach))
  let canyonLow = 99
  let canyonHigh = 0
  let peakHigh = 0
  for (let i = 2; i < canyon.size; i += 3) {
    canyonLow = Math.min(canyonLow, surfaceY(i, canyon.size >> 1, canyon))
    canyonHigh = Math.max(canyonHigh, surfaceY(i, canyon.size >> 1, canyon))
    peakHigh = Math.max(peakHigh, surfaceY(i, 4, peaks))
  }
  assert.ok(canyonHigh - canyonLow > 8)
  assert.ok(peakHigh > mid(forest))
  const castle = chooseWorld('build a castle together')
  assert.equal(castle.structure, 'tower')
  assert.equal(castle.name, 'Castle Blocks')
  assert.equal(castle.terrain.landform, 'rolling')
})

test('islands drop the shore and caves open air under the surface', () => {
  const islands = worldFromSpec({
    biome: 'grassland',
    terrainSeed: 42,
    worldSize: 'small',
    structure: 'none',
    terrain: { islands: true, caves: false, sky: 'day' }
  })
  const edge = surfaceY(0, 0, islands)
  const mid = surfaceY(islands.size >> 1, islands.size >> 1, islands)
  assert.ok(edge < mid, `shore ${edge} should sit under the middle ${mid}`)
  const caves = worldFromSpec({
    biome: 'snow',
    terrainSeed: 77,
    worldSize: 'small',
    structure: 'none',
    terrain: { islands: false, caves: true, sky: 'night' }
  })
  let opened = false
  for (let z = 2; z < caves.size && !opened; z += 2) {
    for (let x = 2; x < caves.size && !opened; x += 2) {
      const top = surfaceY(x, z, caves)
      for (let y = 2; y < top - 2; y++) {
        if (blockAt(x, y, z, caves) === 0) opened = true
      }
    }
  }
  assert.equal(opened, true)
})

test('create always writes a world, and a bad model reply falls back', async () => {
  const forced = await generateIdea({ prompt: 'dodge the falling meteors', kind: 'world', tier: 'auto', env: {} })
  assert.equal(forced.spec.runtime, 'world')
  assert.equal(forced.game.type, 'world')
  assert.equal(forced.html, null)
  let called = false
  const fallen = await generateIdea({
    prompt: 'a candy island with a pyramid',
    kind: 'world',
    tier: 'auto',
    env: { AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'test-key', AI_FALLBACKS: '' },
    fetchImpl: async () => {
      called = true
      throw new Error('offline')
    }
  })
  assert.equal(called, true)
  assert.equal(fallen.fallback, true)
  assert.equal(fallen.spec.biome, 'candy')
  assert.equal(fallen.spec.terrain.islands, true)
  assert.equal(fallen.spec.structure, 'pyramid')
  assert.equal(fallen.credit.inspiredBy.some((item) => item.license === 'CC0-1.0' || item.license === 'MIT'), true)
})

test('remix forks a world spec and its placed blocks', async () => {
  const server = await startServer({ seed: true })
  try {
    const client = createClient(server.base)
    await client.prime()
    await client.request('POST', '/api/auth/register', {
      email: 'worlds@example.com',
      password: 'test-password-123',
      displayName: 'Ada'
    })
    await saveEdit(server.db, 'blocks-grassland', { x: 3, y: 4, z: 5, block: 1 }, 'Ada')
    const remixed = await client.request('POST', '/api/games/blocks-grassland/remix', {})
    assert.equal(remixed.status, 201, remixed.data?.error)
    assert.equal(remixed.data.game.type, 'world')
    assert.equal(remixed.data.game.spec.biome, 'grassland')
    assert.equal(remixed.data.game.spec.runtime, 'world')
    assert.notEqual(remixed.data.game.id, 'blocks-grassland')
    const edits = await server.db.query('select block from world_edits where game_id = $1 and x = 3 and y = 4 and z = 5', [remixed.data.game.id])
    assert.equal(Number(edits.rows[0].block), 1)
  } finally {
    await server.close()
  }
})
