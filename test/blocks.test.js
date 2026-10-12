import assert from 'node:assert/strict'
import { test } from 'node:test'
import { WebSocket } from 'ws'
import { generateIdea } from '../src/ai/idea.js'
import { heuristicTier } from '../src/ai/classify.js'
import { validateGameSpec } from '../src/ai/gamespec.js'
import { aoFactor, meshRegion } from '../src/blocks/mesh.js'
import { validateEdit } from '../src/blocks/rules.js'
import { VISTA_PITCH, goalCopy, goalProgress, goalTargets, lookYaw, skyCycle, sparkHit, sparkSpots } from '../src/blocks/goals.js'
import { isSolid } from '../src/blocks/blocks.js'
import { featuredWorlds, wantsWorld } from '../src/blocks/spec.js'
import { blockAt, spawnPoint, worldFromSpec } from '../src/blocks/terrain.js'
import { validSpec } from '../testing/helpers.js'
import { createClient, startServer } from '../testing/helpers.js'

function solidSample(cells) {
  const set = new Set(cells)
  return (x, y, z) => set.has(`${x},${y},${z}`) ? 1 : 0
}

test('terrain is deterministic and biome seeds diverge', () => {
  const grassland = worldFromSpec({ biome: 'grassland', terrainSeed: 1107, worldSize: 'small', structure: 'tower' })
  const again = worldFromSpec({ biome: 'grassland', terrainSeed: 1107, worldSize: 'small', structure: 'tower' })
  const other = worldFromSpec({ biome: 'grassland', terrainSeed: 1108, worldSize: 'small', structure: 'tower' })
  const candy = worldFromSpec(featuredWorlds()[1].spec)
  let same = true
  let differed = false
  for (let z = 0; z < grassland.size; z += 3) {
    for (let x = 0; x < grassland.size; x += 3) {
      for (let y = 0; y < grassland.height; y += 4) {
        const a = blockAt(x, y, z, grassland)
        assert.equal(a, blockAt(x, y, z, again))
        if (a !== blockAt(x, y, z, other)) differed = true
        same = same && a === blockAt(x, y, z, again)
      }
    }
  }
  assert.equal(same, true)
  assert.equal(differed, true)
  assert.notEqual(blockAt(4, 8, 4, grassland), blockAt(4, 8, 4, candy))
  assert.equal(candy.biome, 'candy')
})

test('mesher drops hidden faces and darkens occluded corners', () => {
  const lone = meshRegion(solidSample(['1,1,1']), 0, 0, 0, 4, 4, 4)
  assert.equal(lone.count, 12)
  const pair = meshRegion(solidSample(['1,1,1', '2,1,1']), 0, 0, 0, 4, 4, 4)
  assert.equal(pair.count, 20)
  assert.equal(lone.colors[0], 1)
  const occluded = meshRegion(solidSample(['1,1,1', '0,2,1']), 0, 0, 0, 4, 4, 4)
  assert.ok(occluded.colors[0] < 1)
  assert.ok(aoFactor(true, false, false) < aoFactor(false, false, false))
  assert.equal(aoFactor(true, true, true), 0.45)
  const repeat = meshRegion(solidSample(['1,1,1']), 0, 0, 0, 4, 4, 4)
  assert.deepEqual(repeat.positions, lone.positions)
})

test('world prompts become a shared block spec and minecraft is not a runtime', async () => {
  assert.equal(wantsWorld('please make minecraft'), true)
  assert.equal(wantsWorld('block building with friends'), true)
  assert.equal(wantsWorld('a calm voxel garden'), true)
  assert.equal(wantsWorld('build a castle together'), true)
  assert.equal(heuristicTier('build a castle together'), 'world')
  assert.equal(heuristicTier('dodge the meteors'), 'spec')
  for (const prompt of ['minecraft', 'block building game', 'voxel playground', 'build a castle together']) {
    const idea = await generateIdea({
      prompt: `${prompt} please`,
      tier: 'auto',
      env: {}
    })
    assert.equal(idea.game.type, 'world')
    assert.equal(idea.spec.runtime, 'world')
    assert.equal(idea.spec.version, '1.2')
    assert.equal(idea.tier, 'spec')
    assert.equal(idea.html, null)
    assert.equal(idea.credit.builtOn.name, 'Blocks')
    assert.equal(idea.credit.builtOn.license, 'MIT')
  }
  const castle = await generateIdea({ prompt: 'build a castle together', tier: 'auto', env: {} })
  assert.equal(castle.spec.structure, 'tower')
  assert.match(castle.spec.goal, /castle/i)
  assert.throws(() => validateGameSpec({ ...validSpec, runtime: 'minecraft' }), /runtime/)
  const seeded = featuredWorlds()
  assert.equal(seeded.length, 2)
  assert.equal(seeded[0].spec.biome, 'grassland')
  assert.equal(seeded[1].spec.biome, 'candy')
  assert.notEqual(seeded[0].spec.terrainSeed, seeded[1].spec.terrainSeed)
})

test('spawn is open high ground facing the landmark', () => {
  const worlds = [
    worldFromSpec(featuredWorlds()[0].spec),
    worldFromSpec(featuredWorlds()[1].spec),
    worldFromSpec({ biome: 'grassland', terrainSeed: 2201, worldSize: 'medium', structure: 'none', terrain: { landform: 'forest' } }),
    worldFromSpec({ biome: 'desert', terrainSeed: 2202, worldSize: 'medium', structure: 'none', terrain: { landform: 'canyon' } })
  ]
  for (const world of worlds) {
    const spawn = spawnPoint(world)
    const x = Math.floor(spawn.x)
    const z = Math.floor(spawn.z)
    const gy = Math.floor(spawn.y) - 1
    assert.ok(Math.hypot(spawn.x - (world.size >> 1), spawn.z - (world.size >> 1)) > 6)
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        assert.equal(blockAt(x + dx, gy + 1, z + dz, world), 0)
        assert.equal(blockAt(x + dx, gy + 2, z + dz, world), 0)
        assert.equal(blockAt(x + dx, gy + 3, z + dz, world), 0)
      }
    }
    const yaw = lookYaw(world, spawn.x, spawn.z)
    const dot = Math.sin(yaw) * ((world.size >> 1) - spawn.x) + Math.cos(yaw) * ((world.size >> 1) - spawn.z)
    assert.ok(dot > 0)
    const cp = Math.cos(VISTA_PITCH)
    const dx = Math.sin(yaw) * cp
    const dy = Math.sin(VISTA_PITCH)
    const dz = Math.cos(yaw) * cp
    let hit = 0
    for (let t = 1; t <= 28; t += 0.5) {
      const bx = Math.floor(spawn.x + dx * t)
      const by = Math.floor(spawn.y + 1.62 + dy * t)
      const bz = Math.floor(spawn.z + dz * t)
      if (isSolid(blockAt(bx, by, bz, world))) { hit = t; break }
    }
    assert.ok(hit >= 5 && hit <= 26, `look hits at ${hit} from ${spawn.y}`)
  }
})

test('landmark height and sparks score a shared goal', () => {
  const grassland = worldFromSpec(featuredWorlds()[0].spec)
  const candy = worldFromSpec(featuredWorlds()[1].spec)
  assert.equal(goalTargets(grassland).raise, 4)
  assert.equal(goalTargets(grassland).sparks, 6)
  assert.equal(goalTargets(candy).raise, 3)
  assert.equal(goalTargets(candy).sparks, 8)
  assert.match(featuredWorlds()[0].spec.goal, /tower 4 blocks/i)
  assert.match(featuredWorlds()[0].spec.description, /six sparks/i)
  assert.match(featuredWorlds()[1].spec.goal, /pyramid 3 blocks/i)
  assert.match(featuredWorlds()[1].spec.description, /eight sparks/i)
  assert.equal(goalCopy(grassland).goal, featuredWorlds()[0].spec.goal)
  const spots = sparkSpots(grassland)
  const again = sparkSpots(grassland)
  assert.equal(spots.length, 6)
  assert.deepEqual(spots, again)
  const candySpots = sparkSpots(candy)
  assert.equal(candySpots.length, 8)
  assert.notEqual(spots[0].x, candySpots[0].x)
  const seen = new Set()
  for (const spot of spots) {
    const x = Math.floor(spot.x)
    const z = Math.floor(spot.z)
    assert.equal(seen.has(`${x},${z}`), false)
    seen.add(`${x},${z}`)
    assert.ok(blockAt(x, Math.floor(spot.y) - 1, z, grassland) > 0)
    assert.equal(blockAt(x, Math.floor(spot.y), z, grassland), 0)
  }
  let progress = goalProgress(grassland, new Map(), new Set())
  assert.equal(progress.built, 0)
  assert.equal(progress.done, false)
  assert.equal(progress.ratio, 0)
  const edits = new Map()
  edits.set(`${progress.cx},${progress.peak + 1},${progress.cz}`, 3)
  progress = goalProgress(grassland, edits, new Set())
  assert.equal(progress.built, 1)
  assert.equal(progress.done, false)
  const spot = spots[0]
  assert.deepEqual(sparkHit(spots, new Set(), spot.id, { x: spot.x, y: spot.y - 1, z: spot.z }), { ok: true, id: spot.id })
  assert.equal(sparkHit(spots, new Set([spot.id]), spot.id, { x: spot.x, y: spot.y - 1, z: spot.z }).reason, 'taken')
  assert.equal(sparkHit(spots, new Set(), spot.id, { x: spot.x + 9, y: spot.y, z: spot.z }).reason, 'reach')
  assert.equal(sparkHit(spots, new Set(), 99, { x: spot.x, y: spot.y, z: spot.z }).reason, 'spark')
  for (let i = 1; i <= 4; i++) edits.set(`${progress.cx},${progress.peak + i},${progress.cz}`, 3)
  const done = goalProgress(grassland, edits, new Set(spots.map((item) => item.id)))
  assert.equal(done.built >= 4, true)
  assert.equal(done.have, 6)
  assert.equal(done.done, true)
  assert.equal(done.ratio, 1)
  const day = skyCycle('grassland', 0)
  const night = skyCycle('grassland', 0.5)
  assert.notEqual(day.hex, night.hex)
  assert.ok(night.light < day.light)
  assert.notEqual(skyCycle('candy', 0).hex, skyCycle('candy', 0.5).hex)
  assert.equal(skyCycle('grassland', 1).hex, day.hex)
})

test('edit rules reject bad coordinates, blocks, reach, and bursts', () => {
  const world = worldFromSpec({ biome: 'grassland', terrainSeed: 1, worldSize: 'small', structure: 'none' })
  const eye = { x: 8.5, y: 12, z: 8.5 }
  const bucket = { tokens: 6, t: 0 }
  const ok = validateEdit({ x: 8, y: 10, z: 8, block: 1, eye, world, now: 0, bucket })
  assert.equal(ok.ok, true)
  assert.equal(validateEdit({ x: 1.5, y: 10, z: 8, block: 1, eye, world, now: 0, bucket }).reason, 'coordinates')
  assert.equal(validateEdit({ x: -1, y: 10, z: 8, block: 1, eye, world, now: 0, bucket }).reason, 'bounds')
  assert.equal(validateEdit({ x: 8, y: 10, z: 8, block: 99, eye, world, now: 0, bucket }).reason, 'block')
  assert.equal(validateEdit({ x: 0, y: 0, z: 0, block: 1, eye, world, now: 0, bucket }).reason, 'reach')
  const tight = { tokens: 1, t: 0 }
  assert.equal(validateEdit({ x: 8, y: 10, z: 8, block: 1, eye, world, now: 0, bucket: tight }).ok, true)
  assert.equal(validateEdit({ x: 8, y: 10, z: 9, block: 1, eye, world, now: 0, bucket: tight }).reason, 'rate')
})

function connect(base, slug) {
  const ws = new WebSocket(`${base.replace(/^http/, 'ws')}/api/worlds/${slug}`)
  return ws
}

function waitOpen(ws) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('socket did not open')), 4000)
    ws.once('open', () => { clearTimeout(timer); resolve() })
    ws.once('error', (error) => { clearTimeout(timer); reject(error) })
  })
}

function nextOf(ws, pred, ms = 4000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timed out waiting for a world message')), ms)
    const onMessage = (data) => {
      const msg = JSON.parse(data.toString())
      if (pred(msg)) {
        clearTimeout(timer)
        ws.off('message', onMessage)
        resolve(msg)
      }
    }
    ws.on('message', onMessage)
  })
}

test('shared world validates edits, broadcasts, rate limits, and reloads after everyone leaves', async () => {
  const server = await startServer({ env: { WORLD_GUEST_CAP: '2', ADMIN_EMAILS: 'mod@example.com' } })
  const sockets = []
  try {
    const first = connect(server.base, 'blocks-grassland')
    const second = connect(server.base, 'blocks-grassland')
    sockets.push(first, second)
    const firstWelcome = nextOf(first, (msg) => msg.t === 'welcome')
    const secondWelcome = nextOf(second, (msg) => msg.t === 'welcome')
    await Promise.all([waitOpen(first), waitOpen(second)])
    const welcome = await firstWelcome
    await secondWelcome
    const x = Math.floor(welcome.spawn.x + 1)
    const y = Math.floor(welcome.spawn.y)
    const z = Math.floor(welcome.spawn.z)
    const bad = nextOf(first, (msg) => msg.t === 'reject')
    first.send(JSON.stringify({ t: 'edit', x: -1, y, z, block: 1, px: welcome.spawn.x, py: welcome.spawn.y, pz: welcome.spawn.z }))
    assert.equal((await bad).reason, 'bounds')
    const far = nextOf(first, (msg) => msg.t === 'reject' && msg.reason === 'reach')
    first.send(JSON.stringify({ t: 'edit', x: 0, y: 0, z: 0, block: 1, px: welcome.spawn.x, py: welcome.spawn.y, pz: welcome.spawn.z }))
    assert.equal((await far).reason, 'reach')
    const heard = nextOf(second, (msg) => msg.t === 'edit' && msg.x === x && msg.block === 1)
    first.send(JSON.stringify({
      t: 'edit', x, y, z, block: 1,
      px: welcome.spawn.x, py: welcome.spawn.y, pz: welcome.spawn.z, yaw: 0, pitch: 0
    }))
    const edit = await heard
    assert.equal(edit.block, 1)
    const row = await server.db.query('select block from world_edits where game_id = $1 and x = $2 and y = $3 and z = $4', ['blocks-grassland', x, y, z])
    assert.equal(Number(row.rows[0].block), 1)
    let accepted = 0
    let limited = 0
    const done = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`rate sweep stalled at ${accepted} accepted and ${limited} limited`)), 5000)
      const onMessage = (data) => {
        const msg = JSON.parse(data.toString())
        if (msg.t === 'edit' && msg.z === z + 1) accepted += 1
        if (msg.t === 'reject' && msg.reason === 'rate') limited += 1
        if (accepted + limited >= 20) {
          clearTimeout(timer)
          first.off('message', onMessage)
          resolve()
        }
      }
      first.on('message', onMessage)
    })
    for (let i = 0; i < 20; i++) {
      first.send(JSON.stringify({
        t: 'edit', x, y, z: z + 1, block: (i % 9) + 1,
        px: welcome.spawn.x, py: welcome.spawn.y, pz: welcome.spawn.z
      }))
    }
    await done
    assert.ok(accepted >= 1)
    assert.ok(limited >= 1)
    first.close()
    second.close()
    for (let i = 0; i < 50 && server.hub.rooms.has('blocks-grassland'); i++) {
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
    assert.equal(server.hub.rooms.has('blocks-grassland'), false)
    const third = connect(server.base, 'blocks-grassland')
    sockets.push(third)
    const restoredWait = nextOf(third, (msg) => msg.t === 'welcome')
    await waitOpen(third)
    const restored = await restoredWait
    assert.ok(restored.edits.some((item) => item[0] === x && item[1] === y && item[2] === z && item[3] === 1))
    const mod = createClient(server.base)
    await mod.prime()
    const account = await mod.request('POST', '/api/auth/register', {
      email: 'mod@example.com', password: 'test-password-123', displayName: 'Mod'
    })
    assert.equal(account.status, 201)
    const resetWait = nextOf(third, (msg) => msg.t === 'reset')
    const reset = await mod.request('POST', '/api/admin/games/blocks-grassland/reset-world', {})
    assert.equal(reset.status, 200)
    assert.equal((await resetWait).t, 'reset')
    const left = await server.db.query('select count(*) as n from world_edits where game_id = $1', ['blocks-grassland'])
    assert.equal(Number(left.rows[0].n), 0)
    const stranger = createClient(server.base)
    await stranger.prime()
    assert.equal((await stranger.request('POST', '/api/auth/register', {
      email: 'player@example.com', password: 'test-password-123', displayName: 'Player'
    })).status, 201)
    assert.equal((await stranger.request('POST', '/api/admin/games/blocks-grassland/reset-world', {})).status, 403)
    const board = await stranger.request('GET', '/api/games/blocks-grassland/world')
    assert.equal(board.status, 200)
    assert.equal(board.data.verified, false)
    const thirdGone = new Promise((resolve) => third.once('close', resolve))
    third.close()
    await thirdGone
    const guest = connect(server.base, 'blocks-grassland')
    sockets.push(guest)
    const guestWelcome = nextOf(guest, (msg) => msg.t === 'welcome')
    await waitOpen(guest)
    await guestWelcome
    const extra = connect(server.base, 'blocks-grassland')
    sockets.push(extra)
    const extraWelcome = nextOf(extra, (msg) => msg.t === 'welcome')
    await waitOpen(extra)
    await extraWelcome
    const overflow = connect(server.base, 'blocks-grassland')
    sockets.push(overflow)
    const closed = new Promise((resolve) => overflow.once('close', resolve))
    await closed
  } finally {
    for (const socket of sockets) {
      try { socket.close() } catch { /* already closed */ }
    }
    await server.close()
  }
})

test('a second visitor sees a shared spark pickup', async () => {
  const server = await startServer()
  const sockets = []
  try {
    const grassland = worldFromSpec(featuredWorlds()[0].spec)
    const spots = sparkSpots(grassland)
    const first = connect(server.base, 'blocks-grassland')
    const second = connect(server.base, 'blocks-grassland')
    sockets.push(first, second)
    const firstWelcome = nextOf(first, (msg) => msg.t === 'welcome')
    const secondWelcome = nextOf(second, (msg) => msg.t === 'welcome')
    await Promise.all([waitOpen(first), waitOpen(second)])
    const welcome = await firstWelcome
    await secondWelcome
    assert.ok(Array.isArray(welcome.gems))
    assert.equal(welcome.gems.length, 0)
    const far = spots.reduce((best, spot) => {
      const dist = Math.hypot(spot.x - welcome.spawn.x, spot.z - welcome.spawn.z)
      return dist > best.dist ? { spot, dist } : best
    }, { spot: spots[0], dist: 0 }).spot
    const missed = nextOf(first, (msg) => msg.t === 'reject' && (msg.reason === 'reach' || msg.reason === 'spark'))
    first.send(JSON.stringify({ t: 'gem', id: 99, px: welcome.spawn.x, py: welcome.spawn.y, pz: welcome.spawn.z }))
    assert.equal((await missed).reason, 'spark')
    const out = nextOf(first, (msg) => msg.t === 'reject' && msg.reason === 'reach')
    first.send(JSON.stringify({ t: 'gem', id: far.id, px: welcome.spawn.x, py: welcome.spawn.y, pz: welcome.spawn.z }))
    assert.equal((await out).reason, 'reach')
    const feet = far.y - 1
    for (let i = 0; i < 24; i++) {
      await new Promise((resolve) => setTimeout(resolve, 220))
      first.send(JSON.stringify({ t: 'move', x: far.x, y: feet, z: far.z, yaw: 0, pitch: -0.2 }))
    }
    await new Promise((resolve) => setTimeout(resolve, 220))
    const heard = nextOf(second, (msg) => msg.t === 'gem' && msg.id === far.id)
    first.send(JSON.stringify({ t: 'gem', id: far.id, px: far.x, py: feet, pz: far.z, yaw: 0, pitch: -0.2 }))
    assert.equal((await heard).id, far.id)
    first.close()
    second.close()
    for (let i = 0; i < 50 && server.hub.rooms.has('blocks-grassland'); i++) {
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
    const third = connect(server.base, 'blocks-grassland')
    sockets.push(third)
    const restoredWait = nextOf(third, (msg) => msg.t === 'welcome')
    await waitOpen(third)
    const restored = await restoredWait
    assert.ok(restored.gems.includes(far.id))
    const row = await server.db.query('select spark_id from world_sparks where game_id = $1', ['blocks-grassland'])
    assert.ok(row.rows.some((item) => Number(item.spark_id) === far.id))
  } finally {
    for (const socket of sockets) {
      try { socket.close() } catch { /* already closed */ }
    }
    await server.close()
  }
})
