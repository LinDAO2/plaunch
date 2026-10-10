import assert from 'node:assert/strict'
import { test } from 'node:test'
import { WebSocket } from 'ws'
import { generateIdea } from '../src/ai/idea.js'
import { heuristicTier } from '../src/ai/classify.js'
import { validateGameSpec } from '../src/ai/gamespec.js'
import { aoFactor, meshRegion } from '../src/blocks/mesh.js'
import { validateEdit } from '../src/blocks/rules.js'
import { featuredWorlds, wantsWorld } from '../src/blocks/spec.js'
import { blockAt, worldFromSpec } from '../src/blocks/terrain.js'
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
    let called = false
    const idea = await generateIdea({
      prompt: `${prompt} please`,
      tier: 'auto',
      env: { GEMINI_API_KEY: 'test-key' },
      fetchImpl: async () => { called = true; throw new Error('model should not be called') }
    })
    assert.equal(called, false)
    assert.equal(idea.game.type, 'world')
    assert.equal(idea.spec.runtime, 'world')
    assert.equal(idea.spec.version, '1.2')
    assert.equal(idea.tier, 'spec')
    assert.equal(idea.html, null)
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
