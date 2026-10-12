import assert from 'node:assert/strict'
import { test } from 'node:test'
import { generateIdea } from '../src/ai/idea.js'
import { generateWorldFromPrompt } from '../src/ai/worldgen.js'
import { CANOPY, GLOW, FROST, ROCK, TIMBER } from '../src/blocks/blocks.js'
import { repairWorldSpec, chooseWorld, structureForPrompt } from '../src/blocks/spec.js'
import { WATER, blockAt, spawnPoint, structureOrigin, surfaceY, vistaGlance, worldFromSpec } from '../src/blocks/terrain.js'

function floatingCanopies(world) {
  const cells = new Set()
  const trunks = []
  for (let z = 0; z < world.size; z++) {
    for (let x = 0; x < world.size; x++) {
      for (let y = 1; y < world.height; y++) {
        const id = blockAt(x, y, z, world)
        if (id !== TIMBER && id !== CANOPY) continue
        cells.add(`${x},${y},${z}`)
        if (id === TIMBER) trunks.push([x, y, z])
      }
    }
  }
  const seen = new Set(trunks.map(([x, y, z]) => `${x},${y},${z}`))
  const queue = trunks.slice()
  const steps = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]
  for (let i = 0; i < queue.length; i++) {
    const [x, y, z] = queue[i]
    for (const [dx, dy, dz] of steps) {
      const key = `${x + dx},${y + dy},${z + dz}`
      if (!cells.has(key) || seen.has(key)) continue
      seen.add(key)
      queue.push([x + dx, y + dy, z + dz])
    }
  }
  let bare = 0
  for (const key of cells) {
    if (seen.has(key)) continue
    const [x, y, z] = key.split(',').map(Number)
    if (blockAt(x, y, z, world) === CANOPY) bare += 1
  }
  return bare
}
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
  const at = (world) => {
    const spawn = spawnPoint(world)
    return vistaGlance(world, spawn.x, spawn.y, spawn.z)
  }
  const lakeView = at(lake)
  const forestView = at(forest)
  const beachView = at(beach)
  assert.ok(lakeView.water >= 4, JSON.stringify(lakeView))
  assert.ok(forestView.leaf + forestView.wood >= 4, JSON.stringify(forestView))
  const forestSpawn = spawnPoint(forest)
  const forestGround = surfaceY(Math.floor(forestSpawn.x), Math.floor(forestSpawn.z), forest)
  assert.equal(forestSpawn.y, forestGround + 1)
  assert.ok(forestGround < 14, forestGround)
  assert.ok(forestSpawn.z < forest.size * 0.55)
  for (let k = 1; k <= 6; k++) assert.equal(blockAt(Math.floor(forestSpawn.x), forestGround + k, Math.floor(forestSpawn.z), forest), 0)
  const clearWorld = worldFromSpec(chooseWorld('mountains surrounding a clear lake'))
  const clearSpawn = spawnPoint(clearWorld)
  const clearGround = surfaceY(Math.floor(clearSpawn.x), Math.floor(clearSpawn.z), clearWorld)
  const cabin = structureOrigin(clearWorld)
  assert.equal(clearSpawn.y, clearGround + 1)
  assert.ok(clearSpawn.z > clearWorld.size / 2)
  assert.ok(clearGround >= 12)
  assert.ok(cabin.z < clearWorld.size / 2)
  assert.ok(vistaGlance(clearWorld, clearSpawn.x, clearSpawn.y, clearSpawn.z).water >= 4)
  assert.equal(floatingCanopies(forest), 0)
  assert.equal(floatingCanopies(clearWorld), 0)
  assert.ok(beachView.sand + beachView.water >= 4, JSON.stringify(beachView))
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
  const clear = 'mountains surrounding a clear lake'
  assert.ok(structureForPrompt(clear) === 'cabin' || structureForPrompt(clear) === 'dock')
  assert.notEqual(structureForPrompt(clear), 'pyramid')
  const shore = worldFromSpec(chooseWorld(clear))
  const origin = structureOrigin(shore)
  assert.ok(surfaceY(origin.x, origin.z, shore) >= WATER)
  let timber = 0
  let wet = 0
  for (let y = 1; y < 24; y++) {
    if (blockAt(origin.x, y, origin.z, shore) === TIMBER) timber += 1
  }
  for (let dz = -12; dz <= 12; dz++) {
    const z = origin.z + dz
    if (z > 0 && z < shore.size && surfaceY(origin.x, z, shore) < WATER) wet += 1
  }
  assert.ok(timber > 0)
  assert.ok(wet > 0)
  const light = worldFromSpec({ biome: 'grassland', terrainSeed: 3, worldSize: 'medium', structure: 'lighthouse', terrain: { landform: 'beach', sky: 'day' } })
  const lo = structureOrigin(light)
  assert.equal(blockAt(lo.x, surfaceY(lo.x, lo.z, light) + 10, lo.z, light), GLOW)
  const ruins = worldFromSpec({ biome: 'desert', terrainSeed: 4, worldSize: 'medium', structure: 'ruins', terrain: { landform: 'canyon', sky: 'day' } })
  const ro = structureOrigin(ruins)
  const rh = surfaceY(ro.x, ro.z, ruins)
  let rock = 0
  for (let dx = -3; dx <= 3; dx++) {
    for (let dz = -2; dz <= 2; dz++) {
      if (blockAt(ro.x + dx, rh + 1, ro.z + dz, ruins) === ROCK) rock += 1
    }
  }
  assert.ok(rock > 0)
  const watch = worldFromSpec({ biome: 'snow', terrainSeed: 5, worldSize: 'medium', structure: 'watchtower', terrain: { landform: 'peaks', sky: 'day' } })
  const wo = structureOrigin(watch)
  const wh = surfaceY(wo.x, wo.z, watch)
  assert.equal(blockAt(wo.x, wh + 8, wo.z, watch), FROST)
  assert.equal(blockAt(wo.x, wh + 4, wo.z, watch), ROCK)
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
  const lines = []
  const write = console.log
  console.log = (line) => { lines.push(String(line)) }
  let fallen
  try {
    fallen = await generateIdea({
      prompt: 'a candy island with a pyramid',
      kind: 'world',
      tier: 'auto',
      env: { AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'test-key', AI_FALLBACKS: '' },
      fetchImpl: async () => {
        called = true
        throw new Error('offline')
      }
    })
  } finally {
    console.log = write
  }
  assert.equal(called, true)
  assert.equal(fallen.fallback, true)
  assert.equal(fallen.spec.biome, 'candy')
  assert.equal(fallen.spec.terrain.islands, true)
  assert.equal(fallen.spec.structure, 'pyramid')
  assert.equal(fallen.credit.inspiredBy.some((item) => item.license === 'CC0-1.0' || item.license === 'MIT'), true)
  assert.ok(lines.some((line) => line.includes('world generation fell back') && line.includes('offline')))
})

test('live world generation does not fall back while a key is set', async () => {
  const previous = globalThis.fetch
  const spec = {
    version: '1.2',
    name: 'Repeated House',
    description: 'A shared build.',
    theme: 'grass',
    runtime: 'world',
    biome: 'grassland',
    terrainSeed: 48213,
    worldSize: 'medium',
    structure: 'house',
    goal: 'Build together.',
    palette: ['#5ea84a', '#8a5a32'],
    accent: '#5ea84a',
    terrain: { islands: false, caves: false, sky: 'day', landform: 'rolling' },
    blockSet: [
      { name: 'Turf', color: '#5ea84a', texture: 'speckle' },
      { name: 'Soil', color: '#8a5a32', texture: 'solid' }
    ],
    prefabs: [],
    quests: [{ kind: 'build', text: 'Raise a landmark.' }],
    npcs: [],
    music: 'calm',
    cycle: 'day'
  }
  let calls = 0
  globalThis.fetch = async () => {
    calls += 1
    return new Response(JSON.stringify({
      content: [{ type: 'tool_use', name: 'emit_result', input: spec }]
    }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  const env = { AI_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'test-key', AI_FALLBACKS: '' }
  const open = [
    'a dense green forest with tall trees',
    'mountains with a lake',
    'a sandy beach along the coast',
    'snowy mountain peaks',
    'a desert canyon'
  ]
  try {
    const worlds = []
    for (const prompt of open) {
      const idea = await generateWorldFromPrompt({ prompt, env })
      assert.equal(idea.fallback, false, prompt)
      assert.equal(idea.provider, 'anthropic')
      assert.notEqual(idea.spec.terrainSeed, 48213)
      assert.ok(idea.spec.terrainSeed >= 1 && idea.spec.terrainSeed <= 100000)
      worlds.push(idea.spec)
    }
    assert.equal(calls, open.length)
    assert.equal(new Set(worlds.map((item) => item.terrainSeed)).size, open.length)
    const fits = {
      'a dense green forest with tall trees': ['none'],
      'mountains with a lake': ['cabin', 'dock'],
      'a sandy beach along the coast': ['lighthouse'],
      'snowy mountain peaks': ['watchtower'],
      'a desert canyon': ['ruins']
    }
    for (const spec of worlds) {
      const prompt = open[worlds.indexOf(spec)]
      assert.ok(fits[prompt].includes(spec.structure), `${prompt} -> ${spec.structure}`)
      assert.ok(!['tower', 'house', 'pyramid'].includes(spec.structure))
    }
    const clear = await generateWorldFromPrompt({ prompt: 'mountains surrounding a clear lake', env })
    assert.equal(clear.fallback, false)
    assert.equal(clear.provider, 'anthropic')
    assert.ok(clear.spec.structure === 'cabin' || clear.spec.structure === 'dock', clear.spec.structure)
    assert.notEqual(clear.spec.structure, 'pyramid')
    assert.notEqual(clear.spec.terrainSeed, 48213)
    const pyramid = await generateWorldFromPrompt({ prompt: 'a candy island with a pyramid', env })
    const castle = await generateWorldFromPrompt({ prompt: 'build a castle together', env })
    assert.equal(pyramid.fallback, false)
    assert.equal(castle.fallback, false)
    assert.equal(pyramid.spec.structure, 'pyramid')
    assert.equal(castle.spec.structure, 'tower')
    assert.notEqual(pyramid.spec.terrainSeed, 48213)
    assert.notEqual(castle.spec.terrainSeed, 48213)
  } finally {
    globalThis.fetch = previous
  }
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
