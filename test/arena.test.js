import assert from 'node:assert/strict'
import { test } from 'node:test'
import { inspectFreeform } from '../src/ai/freeform-check.js'
import { addHuman, applyInput, createMatch, stepMatch } from '../src/arena/sim.js'
import { pickTemplate } from '../src/templates/pick.js'
import { spliceTemplate } from '../src/templates/splice.js'
import { templateById } from '../src/templates/catalog.js'
import { templateHtml } from '../src/templates/generate.js'
import { createClient, startServer } from '../testing/helpers.js'

function run(match, seconds, steer) {
  const steps = Math.round(seconds / 0.05)
  for (let i = 0; i < steps; i++) {
    if (steer) steer(match, i)
    stepMatch(match, 0.05)
  }
}

test('arena rules move, hit, and score without trusting a client position', () => {
  const match = createMatch({
    theme: { mode: 'deathmatch', weapon: 'blaster', sky: 'dusk' },
    config: { speed: 9, bots: 0, seconds: 60, range: 28, damage: 34, quality: 0 },
    seed: 3
  })
  const ada = addHuman(match, 'Ada')
  const bea = addHuman(match, 'Bea')
  run(match, 1.5)
  applyInput(ada, { yaw: Math.PI / 2, pitch: 0, mx: 0, mz: 1, fire: 0, x: 999, y: 999, z: 999 })
  const x0 = ada.x
  run(match, 1)
  assert.ok(ada.x > x0 + 8, `expected forward movement, x=${ada.x}`)
  assert.ok(ada.x < 20, 'a client cannot set its own coordinates')
  applyInput(ada, { yaw: 0, pitch: 0, mx: 0, mz: 0, fire: 1, x: 999 })
  ada.x = 0
  ada.z = -12
  bea.x = 0
  bea.z = -6
  bea.invuln = 0
  bea.hp = 100
  run(match, 1.2)
  assert.equal(bea.alive, false)
  assert.equal(ada.score, 100)
  assert.ok(ada.ammo < 16)
  assert.match(match.feed.at(-1).text, /zapped/)
  run(match, 2.6)
  assert.equal(bea.alive, true)
})

test('tag, capture, race, and beacon objectives score on the server', () => {
  const tag = createMatch({
    theme: { mode: 'tag', weapon: 'blaster', sky: 'night' },
    config: { speed: 9, bots: 0, seconds: 40, range: 20, damage: 20, quality: 1 },
    seed: 5
  })
  const it = addHuman(tag, 'Ivy')
  const other = addHuman(tag, 'Quill')
  tag.it = it.id
  other.invuln = 0
  it.invuln = 0
  applyInput(it, { yaw: 0, pitch: 0, fire: 1, mx: 0, mz: 0 })
  run(tag, 0.4)
  assert.equal(tag.it, other.id)
  assert.equal(it.score, 50)

  const race = createMatch({
    theme: { mode: 'race', weapon: 'blaster', sky: 'day' },
    config: { speed: 14, bots: 0, seconds: 60, range: 10, damage: 10, quality: 0 },
    seed: 6
  })
  const driver = addHuman(race, 'Rae')
  run(race, 2, () => applyInput(driver, { yaw: Math.PI, pitch: 0, mz: 1, fire: 1 }))
  assert.ok(driver.score >= 100)
  assert.equal(race.theme.weapon, 'none')

  const ctf = createMatch({
    theme: { mode: 'ctf', weapon: 'blaster', sky: 'day' },
    config: { speed: 14, bots: 0, seconds: 90, range: 16, damage: 10, quality: 0 },
    seed: 7
  })
  const cam = addHuman(ctf, 'Cam')
  run(ctf, 12, () => {
    const carrying = cam.flag !== '' && cam.flag !== undefined
    const target = carrying ? ctf.flags[0] : ctf.flags[1]
    applyInput(cam, { yaw: Math.atan2(target.x - cam.x, target.z - cam.z), mz: 1, pitch: 0, fire: 0 })
  })
  assert.ok(cam.score >= 200)

  const isle = createMatch({
    theme: { mode: 'explore', weapon: 'blaster', sky: 'day' },
    config: { speed: 8, bots: 0, seconds: 60, range: 24, damage: 40, quality: 0 },
    seed: 8
  })
  const eve = addHuman(isle, 'Eve')
  const beacon = isle.beacons[0]
  run(isle, 4, () => applyInput(eve, { yaw: Math.atan2(beacon.x - eve.x, beacon.z - eve.z), mz: 1, pitch: 0, fire: 0 }))
  assert.equal(eve.score >= 50, true)
  assert.equal(beacon.ready, false)
  const buoy = isle.actors.find((actor) => actor.kind === 'buoy')
  buoy.x = 0
  buoy.z = 2
  eve.x = 0
  eve.z = -2
  eve.invuln = 0
  buoy.invuln = 0
  applyInput(eve, { yaw: 0, pitch: 0, mz: 0, fire: 1 })
  run(isle, 1.2)
  assert.ok(eve.score >= 75)
})

test('prompts pick the three.js arena family and a theme edit stays inside the blocks', () => {
  assert.equal(pickTemplate('a neon cyberpunk arena').id, 'arena')
  assert.equal(pickTemplate('a 3D kart race').id, 'circuit-dash')
  assert.equal(pickTemplate('a zombie-free survival island explore game').id, 'beacon-isle')
  assert.equal(pickTemplate('A space game where you dodge falling meteors.'), null)
  const spec = templateById('arena')
  const html = templateHtml('arena')
  assert.equal(inspectFreeform(html).join('; '), '')
  assert.ok(Buffer.byteLength(html) < 150 * 1024)
  const edited = spliceTemplate(html, {
    CONFIG: { speed: 12, bots: 3 },
    THEME: { mode: 'tag', weapon: 'laser', sky: 'neon', palette: { accent: '#ff55cc' }, names: { title: 'Neon Pit' } }
  }, spec)
  assert.equal(edited.ok, true, edited.error)
  assert.match(edited.html, /"mode":"tag"/)
  assert.match(edited.html, /Neon Pit/)
  assert.equal(inspectFreeform(edited.html).join('; '), '')
})

test('arena rooms are authoritative, rate limited, and capped', async () => {
  const server = await startServer({ env: { WORLD_GUEST_CAP: '20' } })
  const wsBase = server.base.replace(/^http/, 'ws')
  const openSockets = []
  try {
    const connect = (path) => new Promise((resolve, reject) => {
      const ws = new WebSocket(`${wsBase}${path}`)
      const messages = []
      openSockets.push(ws)
      ws.addEventListener('message', (event) => {
        try { messages.push(JSON.parse(String(event.data))) } catch { /* ignore */ }
      })
      ws.addEventListener('open', () => resolve({ ws, messages }))
      ws.addEventListener('error', () => reject(new Error(`socket failed for ${path}`)))
    })
    const waitFor = async (messages, pred, ms = 4000) => {
      const start = Date.now()
      while (Date.now() - start < ms) {
        const found = messages.find(pred)
        if (found) return found
        await new Promise((resolve) => setTimeout(resolve, 30))
      }
      throw new Error(`timed out waiting for a socket message: ${JSON.stringify(messages.slice(-2))}`)
    }
    const world = await connect('/api/worlds/blocks-grassland')
    const worldHello = await waitFor(world.messages, (msg) => msg.t === 'welcome' || msg.t === 'reject')
    assert.equal(worldHello.t, 'welcome')

    const missing = await connect('/api/arenas/not-a-real-game')
    const denied = await waitFor(missing.messages, (msg) => msg.t === 'reject')
    assert.equal(denied.reason, 'missing')

    const player = await connect('/api/arenas/arena')
    const hello = await waitFor(player.messages, (msg) => msg.t === 'welcome')
    assert.equal(hello.snap.mode, 'deathmatch')
    for (let i = 0; i < 80; i++) {
      player.ws.send(JSON.stringify({ t: 'in', seq: i, yaw: 0, pitch: 0, mx: 0, mz: 0, fire: 0, x: 900, y: 900, z: 900 }))
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
    const snap = [...player.messages].reverse().find((msg) => msg.t === 'snap')
    const self = snap.actors.find((actor) => actor.id === hello.id)
    assert.ok(Math.abs(self.x) < 8, `position stayed server-side, x=${self.x}`)
    const fire = setInterval(() => {
      if (player.ws.readyState !== 1) return
      const latest = [...player.messages].reverse().find((msg) => msg.t === 'snap')
      const me = latest?.actors.find((actor) => actor.id === hello.id)
      if (!me) return
      const foes = latest.actors.filter((actor) => actor.alive && actor.id !== hello.id)
      foes.sort((a, b) => Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - me.x, b.z - me.z))
      const yaw = foes[0] ? Math.atan2(foes[0].x - me.x, foes[0].z - me.z) : 0
      player.ws.send(JSON.stringify({ t: 'in', yaw, pitch: 0, mx: 0, mz: 0, fire: 1, seq: 2 }))
    }, 40)
    const scored = await waitFor(player.messages, (msg) => msg.t === 'snap' && msg.actors.some((actor) => actor.id === hello.id && actor.score > 0), 10000)
    clearInterval(fire)
    assert.ok(scored.actors.find((actor) => actor.id === hello.id).score >= 100)

    const mates = []
    for (let i = 0; i < 11; i++) mates.push(await connect('/api/arenas/arena'))
    await waitFor(mates.at(-1).messages, (msg) => msg.t === 'welcome' || msg.t === 'reject')
    const extra = await connect('/api/arenas/arena')
    const full = await waitFor(extra.messages, (msg) => msg.t === 'reject' || msg.t === 'welcome')
    assert.equal(full.t, 'reject')
    assert.equal(full.reason, 'full')
  } finally {
    for (const ws of openSockets) {
      try { ws.close() } catch { /* closed */ }
    }
    await server.close()
  }
})

test('three.js is served from the sandbox origin and arena is on the guest play page', async () => {
  const server = await startServer()
  const client = createClient(server.base)
  try {
    await client.prime()
    const script = await fetch(`${server.usercontentBase}/three.js`)
    assert.equal(script.status, 200)
    assert.match(script.headers.get('content-type'), /javascript/)
    assert.equal(script.headers.get('x-vendor-version'), '0.170.0')
    const bytes = Buffer.byteLength(Buffer.from(await script.arrayBuffer()))
    assert.ok(bytes < 5 * 1024 * 1024, `three.js is ${bytes} bytes`)
    assert.ok(bytes > 100000)
    const assetNames = ['knight.glb', 'rogue.glb', 'blaster.glb', 'bolt.glb', 'wall.glb', 'barrel.glb', 'crate.glb', 'rock.glb', 'dish.glb']
    let assetBytes = 0
    for (const name of assetNames) {
      const asset = await fetch(`${server.usercontentBase}/assets/${name}`)
      assert.equal(asset.status, 200, name)
      assert.match(asset.headers.get('content-type'), /model\/gltf-binary/)
      assert.equal(asset.headers.get('access-control-allow-origin'), '*')
      const body = Buffer.from(await asset.arrayBuffer())
      assert.equal(body.subarray(0, 4).toString(), 'glTF')
      assetBytes += body.length
    }
    const blocked = await fetch(`${server.usercontentBase}/assets/../package.json`)
    assert.notEqual(blocked.headers.get('content-type'), 'application/json')
    assert.ok(bytes + assetBytes < 4 * 1024 * 1024, `first-load sample is ${bytes + assetBytes} bytes`)
    const page = await client.request('GET', '/play/arena')
    assert.equal(page.status, 200)
    assert.match(page.text, /cannot read this page, cookies, or the network/)
    assert.match(page.text, /name="twitter:player"/)
    assert.match(page.text, /Original by Playground \(MIT\)/)
    const guest = await client.request('GET', '/api/games/arena')
    assert.equal(guest.data.game.tier, 'freeform')
    assert.equal(guest.data.game.featured, true)
    assert.match(guest.data.game.credit.license, /MIT/)
  } finally {
    await server.close()
  }
})
