// Server-authoritative arena rules. No rendering and no network.
// The same file is inlined into the sandbox page, which cannot open a socket.

export const ROOM_CAP = 12
const ACTOR_R = 0.42
const EYE = 1.45
const NAMES = ['Nova', 'Quill', 'Byte', 'Lumen', 'Puck', 'Ivy', 'Moss', 'Nimbus']
const COLORS = ['#3ee0ff', '#e6ff3a', '#ff5aa5', '#ffb020', '#b388ff', '#4adeb9', '#ff8ad4', '#7aa2ff']

const MODES = new Set(['deathmatch', 'tag', 'ctf', 'race', 'explore'])
const WEAPONS = new Set(['blaster', 'laser', 'none'])
const SKIES = new Set(['day', 'dusk', 'night', 'neon'])

export function defaultScore(mode, kind) {
  if (mode === 'race' && kind === 'lap') return 300
  if (mode === 'race') return 100
  if (mode === 'ctf' && kind === 'cap') return 200
  if (mode === 'ctf') return 100
  if (mode === 'tag') return 50
  if (mode === 'explore' && kind === 'buoy') return 25
  if (mode === 'explore') return 50
  return 100
}

function clampInt(value, fallback, min, max) {
  const n = Math.floor(Number(value))
  if (!Number.isInteger(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

export function normalizeTheme(theme = {}) {
  const mode = MODES.has(theme.mode) ? theme.mode : 'deathmatch'
  let weapon = WEAPONS.has(theme.weapon) ? theme.weapon : 'blaster'
  if (mode === 'race') weapon = 'none'
  const sky = SKIES.has(theme.sky) ? theme.sky : 'dusk'
  return {
    mode,
    weapon,
    sky,
    palette: theme.palette || {},
    names: theme.names || {}
  }
}

export function normalizeConfig(config = {}) {
  return {
    speed: clampInt(config.speed, 9, 4, 18),
    bots: clampInt(config.bots, 4, 0, 8),
    seconds: clampInt(config.seconds, 90, 30, 180),
    range: clampInt(config.range, 26, 8, 40),
    damage: clampInt(config.damage, 34, 10, 80),
    quality: clampInt(config.quality, 0, 0, 2)
  }
}

function box(x, z, w, d, h = 2.2) {
  return { x, z, w, d, h }
}

function outerWalls(half) {
  const t = 1
  const span = half * 2 + t
  return [
    box(0, -half, span, t, 3.2),
    box(0, half, span, t, 3.2),
    box(-half, 0, t, span, 3.2),
    box(half, 0, t, span, 3.2)
  ]
}

function buildMap(theme) {
  if (theme.mode === 'race') {
    return {
      walls: [
        ...outerWalls(16),
        box(0, 0, 18, 8, 1.4)
      ],
      spawns: [
        { x: 0, z: 12.2, yaw: Math.PI },
        { x: 2.2, z: 12.2, yaw: Math.PI },
        { x: -2.2, z: 12.2, yaw: Math.PI },
        { x: 4.2, z: 12.2, yaw: Math.PI },
        { x: -4.2, z: 12.2, yaw: Math.PI },
        { x: 1.1, z: 13.1, yaw: Math.PI },
        { x: -1.1, z: 13.1, yaw: Math.PI },
        { x: 3.2, z: 13.1, yaw: Math.PI }
      ],
      checks: [
        { x: 0, z: 10.2, w: 8, d: 1.4 },
        { x: 13.2, z: 0, w: 1.4, d: 6 },
        { x: 0, z: -10.2, w: 8, d: 1.4 },
        { x: -13.2, z: 0, w: 1.4, d: 6 }
      ],
      radius: 0
    }
  }
  if (theme.mode === 'explore') {
    return {
      walls: [
        box(-6, 2, 3.2, 2.4, 1.8),
        box(5, -4, 2.6, 3.2, 2.2),
        box(2, 7, 4, 2, 1.2),
        box(-8, -6, 2, 2, 2.6)
      ],
      spawns: [
        { x: 0, z: 2, yaw: 0 },
        { x: -4, z: -2, yaw: 0.6 },
        { x: 5, z: 3, yaw: -0.4 },
        { x: -2, z: 6, yaw: 1 },
        { x: 3, z: -6, yaw: 2 },
        { x: 7, z: 1, yaw: -1 },
        { x: -7, z: 4, yaw: 0.2 },
        { x: 1, z: -3, yaw: 2.4 }
      ],
      checks: [],
      radius: 16
    }
  }
  if (theme.mode === 'ctf') {
    return {
      walls: [
        ...outerWalls(18),
        box(-6, -7, 4, 2, 2),
        box(6, 7, 4, 2, 2),
        box(0, -9, 8, 1.4, 1.6),
        box(0, 9, 8, 1.4, 1.6)
      ],
      spawns: [
        { x: -12, z: 0, yaw: Math.PI / 2 },
        { x: 12, z: 0, yaw: -Math.PI / 2 },
        { x: -12, z: 3, yaw: Math.PI / 2 },
        { x: 12, z: 3, yaw: -Math.PI / 2 },
        { x: -12, z: -3, yaw: Math.PI / 2 },
        { x: 12, z: -3, yaw: -Math.PI / 2 },
        { x: -8, z: 5, yaw: Math.PI / 2 },
        { x: 8, z: -5, yaw: -Math.PI / 2 }
      ],
      checks: [],
      radius: 0
    }
  }
  return {
    walls: [
      ...outerWalls(18),
      box(0, 0, 3, 3, 2.2),
      box(-7, -7, 3, 2, 1.6),
      box(7, -6, 2, 4, 2.4),
      box(-6, 7, 4, 2, 1.4),
      box(8, 7, 2.2, 2.2, 2.8),
      box(-8, -3, 3, 2, 1.4)
    ],
    spawns: [
      { x: 0, z: -12, yaw: 0 },
      { x: 0, z: -6, yaw: Math.PI },
      { x: -10, z: -8, yaw: 0.4 },
      { x: 10, z: 8, yaw: -2.4 },
      { x: -9, z: 9, yaw: 2.2 },
      { x: 8, z: -10, yaw: -0.5 },
      { x: 11, z: 0, yaw: -1.5 },
      { x: -11, z: 1, yaw: 1.5 }
    ],
    checks: [],
    radius: 0
  }
}

function rand(match) {
  match.seed = (Math.imul(match.seed, 1664525) + 1013904223) >>> 0
  return match.seed / 4294967296
}

function wrapAngle(n) {
  let a = n
  while (a > Math.PI) a -= Math.PI * 2
  while (a < -Math.PI) a += Math.PI * 2
  return a
}

function blocked(x, z, walls, radius = ACTOR_R) {
  for (const wall of walls) {
    if (Math.abs(x - wall.x) < wall.w / 2 + radius && Math.abs(z - wall.z) < wall.d / 2 + radius) return true
  }
  return false
}

function wallPoint(x, y, z, walls) {
  for (const wall of walls) {
    if (y < 0 || y > wall.h) continue
    if (Math.abs(x - wall.x) <= wall.w / 2 && Math.abs(z - wall.z) <= wall.d / 2) return true
  }
  return false
}

function inside(actor, box, pad = 0) {
  return Math.abs(actor.x - box.x) <= box.w / 2 + pad && Math.abs(actor.z - box.z) <= box.d / 2 + pad
}

function near(actor, point, reach) {
  return Math.hypot(actor.x - point.x, actor.z - point.z) <= reach
}

function magFor(weapon) {
  if (weapon === 'laser') return 8
  if (weapon === 'none') return 0
  return 16
}

function makeActor(match, kind, name, index) {
  const spawn = match.map.spawns[index % match.map.spawns.length]
  const weapon = match.theme.weapon
  const actor = {
    id: `${kind === 'human' ? 'h' : kind === 'buoy' ? 'y' : 'b'}${match.seq++}`,
    name: String(name || 'Guest').slice(0, 40),
    color: COLORS[index % COLORS.length],
    bot: kind === 'bot',
    kind: kind === 'buoy' ? 'buoy' : 'player',
    team: index % 2,
    x: spawn.x,
    y: 0,
    z: spawn.z,
    yaw: spawn.yaw,
    pitch: 0,
    vy: 0,
    grounded: true,
    hp: kind === 'buoy' ? 30 : 100,
    alive: true,
    respawn: 0,
    invuln: kind === 'human' ? 1.4 : 0.4,
    cool: 0,
    mag: magFor(weapon),
    ammo: magFor(weapon),
    reload: 0,
    score: 0,
    bank: 0,
    gate: 0,
    laps: 0,
    flag: '',
    boost: 0,
    stuck: 0,
    input: { mx: 0, mz: 0, fire: false, jump: false, seq: 0 }
  }
  return actor
}

function place(match, actor, index) {
  const spawn = match.map.spawns[index % match.map.spawns.length]
  actor.x = spawn.x
  actor.y = 0
  actor.z = spawn.z
  actor.yaw = spawn.yaw
  actor.pitch = 0
  actor.vy = 0
  actor.hp = actor.kind === 'buoy' ? 30 : 100
  actor.alive = true
  actor.respawn = 0
  actor.invuln = 1.2
  actor.ammo = actor.mag
  actor.reload = 0
  actor.flag = ''
  actor.boost = 0
}

export function createMatch({ theme, config, seed = 1 } = {}) {
  const normalizedTheme = normalizeTheme(theme)
  const normalizedConfig = normalizeConfig(config)
  const map = buildMap(normalizedTheme)
  const match = {
    theme: normalizedTheme,
    config: normalizedConfig,
    map,
    actors: [],
    flags: [],
    beacons: [],
    feed: [],
    tracers: [],
    seed: seed >>> 0 || 1,
    seq: 1,
    tick: 0,
    elapsed: 0,
    over: false,
    it: '',
    humans: 0,
    scorer: null
  }
  if (normalizedTheme.mode === 'ctf') {
    match.flags = [
      { team: 0, x: -14, z: 0, homeX: -14, homeZ: 0, carried: '' },
      { team: 1, x: 14, z: 0, homeX: 14, homeZ: 0, carried: '' }
    ]
  }
  if (normalizedTheme.mode === 'explore') {
    const spots = [[-9, 5], [8, 6], [10, -5], [-5, -9], [0, 10], [6, 0]]
    match.beacons = spots.map(([x, z]) => ({ x, z, ready: true, cool: 0 }))
    for (let i = 0; i < 4; i++) {
      const buoy = makeActor(match, 'buoy', `Buoy ${i + 1}`, i + 2)
      buoy.bot = false
      buoy.x = [4, -3, 8, -10][i]
      buoy.z = [-2, 8, 4, -4][i]
      buoy.color = '#ffb020'
      match.actors.push(buoy)
    }
  }
  for (let i = 0; i < normalizedConfig.bots; i++) {
    match.actors.push(makeActor(match, 'bot', NAMES[i % NAMES.length], match.actors.length))
  }
  if (normalizedTheme.mode === 'tag') {
    const first = match.actors.find((actor) => actor.kind === 'player')
    match.it = first ? first.id : ''
  }
  return match
}

export function addHuman(match, name) {
  const humans = match.actors.filter((actor) => !actor.bot && actor.kind === 'player')
  if (humans.length >= ROOM_CAP) return null
  while (match.actors.length >= ROOM_CAP) {
    const index = match.actors.findIndex((actor) => actor.bot)
    if (index < 0) return null
    match.actors.splice(index, 1)
  }
  const actor = makeActor(match, 'human', name, humans.length)
  match.actors.push(actor)
  match.humans += 1
  if (match.theme.mode === 'tag' && !match.it) match.it = actor.id
  return actor
}

export function removeHuman(match, id) {
  const index = match.actors.findIndex((actor) => actor.id === id)
  if (index < 0) return
  match.actors.splice(index, 1)
  match.humans = Math.max(0, match.humans - 1)
  if (match.it === id) {
    const next = match.actors.find((actor) => actor.kind === 'player' && actor.alive)
    match.it = next ? next.id : ''
  }
  const bots = match.actors.filter((actor) => actor.bot).length
  while (bots + (match.actors.length - bots) < ROOM_CAP && match.actors.filter((actor) => actor.bot).length < match.config.bots) {
    match.actors.push(makeActor(match, 'bot', NAMES[match.actors.length % NAMES.length], match.actors.length))
  }
}

export function restartMatch(match) {
  match.elapsed = 0
  match.over = false
  match.feed = []
  match.tick = 0
  match.tracers = []
  for (const beacon of match.beacons) {
    beacon.ready = true
    beacon.cool = 0
  }
  for (const flag of match.flags) {
    flag.x = flag.homeX
    flag.z = flag.homeZ
    flag.carried = ''
  }
  match.actors.forEach((actor, index) => {
    if (actor.kind === 'buoy') {
      actor.hp = 30
      actor.alive = true
      actor.respawn = 0
      actor.invuln = 0.4
      return
    }
    place(match, actor, index)
    actor.score = 0
    actor.gate = 0
    actor.laps = 0
  })
  if (match.theme.mode === 'tag') {
    const first = match.actors.find((actor) => actor.kind === 'player')
    match.it = first ? first.id : ''
  }
}

// Local races hold drive input for three seconds of match.elapsed.
// A server-run race (the play page) never steps that local clock, so the
// hold must not apply there or the kart stays parked for the whole race.
export function raceDriveAxes({ mode, authority, elapsed, mx, mz, brake }) {
  const x = Number.isFinite(mx) ? mx : 0
  const z = Number.isFinite(mz) ? mz : 0
  if (mode !== 'race') return { mx: x, mz: z }
  const clock = Number(elapsed)
  const counting = authority === 'local' && (!Number.isFinite(clock) || clock < 3)
  if (counting) return { mx: 0, mz: 0 }
  if (!brake && z < 0.15) return { mx: x, mz: 1 }
  return { mx: x, mz: z }
}

export function applyInput(actor, msg) {
  if (!actor || !msg || typeof msg !== 'object') return
  const num = (value, min, max, fallback = 0) => {
    const n = Number(value)
    if (!Number.isFinite(n)) return fallback
    return Math.min(max, Math.max(min, n))
  }
  actor.yaw = num(msg.yaw, -Math.PI * 4, Math.PI * 4, actor.yaw)
  actor.pitch = num(msg.pitch, -1.15, 1.15, actor.pitch)
  actor.input.mx = num(msg.mx, -1, 1)
  actor.input.mz = num(msg.mz, -1, 1)
  actor.input.fire = msg.fire === true || msg.fire === 1
  actor.input.jump = msg.jump === true || msg.jump === 1
  actor.input.seq = num(msg.seq, 0, 1e9)
}

function points(match, mode, kind) {
  if (typeof match.scorer === 'function') {
    const custom = match.scorer(mode, kind)
    if (Number.isInteger(custom) && custom >= 0 && custom <= 1000) return custom
  }
  return defaultScore(mode, kind)
}

function note(match, text) {
  match.feed.push({ text: String(text).slice(0, 72), t: Math.floor(match.elapsed) })
  if (match.feed.length > 5) match.feed.shift()
}

function dropFlag(match, actor) {
  if (!actor.flag && actor.flag !== 0) return
  const flag = match.flags.find((item) => item.team === actor.flag)
  actor.flag = ''
  if (!flag) return
  flag.carried = ''
  flag.x = actor.x
  flag.z = actor.z
}

function zap(match, attacker, victim) {
  victim.alive = false
  victim.hp = 0
  victim.respawn = victim.kind === 'buoy' ? 7 : 2.5
  dropFlag(match, victim)
  const mode = match.theme.mode
  if (victim.kind === 'buoy') attacker.score += points(match, 'explore', 'buoy')
  else if (mode === 'deathmatch' || mode === 'ctf') attacker.score += points(match, mode, 'kill')
  const verb = victim.kind === 'buoy' ? 'popped' : 'zapped'
  note(match, `${attacker.name} ${verb} ${victim.name}`)
}

function raycast(match, actor) {
  const weapon = match.theme.weapon
  const range = match.config.range * (weapon === 'laser' ? 1.25 : 1)
  const dx = Math.sin(actor.yaw) * Math.cos(actor.pitch)
  const dy = Math.sin(actor.pitch)
  const dz = Math.cos(actor.yaw) * Math.cos(actor.pitch)
  let best = null
  let bestT = range
  for (let t = 0.45; t <= range; t += 0.35) {
    const x = actor.x + dx * t
    const y = actor.y + EYE + dy * t
    const z = actor.z + dz * t
    if (wallPoint(x, y, z, match.map.walls)) return best && bestT < t ? best : null
    for (const other of match.actors) {
      if (other === actor || !other.alive || other.invuln > 0) continue
      if (match.theme.mode === 'explore' && other.kind !== 'buoy') continue
      if (match.theme.mode === 'race') continue
      if (match.theme.mode === 'ctf' && other.kind === 'player' && other.team === actor.team) continue
      const hit = (x - other.x) ** 2 + (z - other.z) ** 2 < 0.5 ** 2 && y > other.y && y < other.y + 1.85
      if (hit && t < bestT) {
        best = other
        bestT = t
      }
    }
    if (best) return best
  }
  return best
}

function combat(match, actor, dt) {
  if (match.theme.weapon === 'none' || match.theme.mode === 'race') return
  actor.cool = Math.max(0, actor.cool - dt)
  if (actor.reload > 0) {
    actor.reload -= dt
    if (actor.reload <= 0) actor.ammo = actor.mag
  }
  if (!actor.input.fire || actor.cool > 0 || !actor.alive) return
  if (actor.ammo <= 0) {
    actor.reload = actor.reload > 0 ? actor.reload : 1.25
    return
  }
  actor.ammo -= 1
  actor.cool = match.theme.weapon === 'laser' ? 0.45 : 0.24
  match.tracers.push({
    x: Math.round(actor.x * 100) / 100,
    y: Math.round((actor.y + EYE) * 100) / 100,
    z: Math.round(actor.z * 100) / 100,
    yaw: Math.round(actor.yaw * 1000) / 1000,
    pitch: Math.round(actor.pitch * 1000) / 1000
  })
  const victim = raycast(match, actor)
  if (!victim) return
  if (match.theme.mode === 'tag') {
    if (actor.id !== match.it || victim.kind !== 'player') return
    match.it = victim.id
    actor.score += points(match, 'tag', 'tag')
    note(match, `${actor.name} tagged ${victim.name}`)
    return
  }
  const damage = match.theme.weapon === 'laser' ? Math.round(match.config.damage * 1.4) : match.config.damage
  victim.hp -= damage
  if (victim.hp <= 0) zap(match, actor, victim)
}

function moveActor(match, actor, dt) {
  if (!actor.alive || actor.kind === 'buoy') return
  const speed = match.config.speed * (actor.boost > 0 ? 1.65 : 1)
  actor.boost = Math.max(0, actor.boost - dt)
  const mx = actor.input.mx
  const mz = actor.input.mz
  const sin = Math.sin(actor.yaw)
  const cos = Math.cos(actor.yaw)
  const vx = (mz * sin + mx * cos) * speed
  const vz = (mz * cos - mx * sin) * speed
  if (match.theme.mode === 'race') {
    if (actor.input.fire || actor.input.jump) actor.boost = 0.45
    actor.input.jump = false
  } else {
    actor.vy -= 22 * dt
    actor.y += actor.vy * dt
    if (actor.y <= 0) {
      actor.y = 0
      actor.vy = 0
      actor.grounded = true
    }
    if (actor.input.jump && actor.grounded) {
      actor.vy = 6.4
      actor.grounded = false
    }
    actor.input.jump = false
  }
  const beforeX = actor.x
  const beforeZ = actor.z
  const sub = 2
  const h = dt / sub
  for (let i = 0; i < sub; i++) {
    const nx = actor.x + vx * h
    const nz = actor.z + vz * h
    if (!blocked(nx, actor.z, match.map.walls)) actor.x = nx
    if (!blocked(actor.x, nz, match.map.walls)) actor.z = nz
    if (match.map.radius) {
      const dist = Math.hypot(actor.x, actor.z)
      if (dist > match.map.radius) {
        actor.x = actor.x / dist * match.map.radius
        actor.z = actor.z / dist * match.map.radius
      }
    }
  }
  if (Math.hypot(actor.x - beforeX, actor.z - beforeZ) < 0.01 && (Math.abs(mx) + Math.abs(mz) > 0.2)) actor.stuck += dt
  else actor.stuck = 0
}

function separate(actors) {
  for (let i = 0; i < actors.length; i++) {
    for (let j = i + 1; j < actors.length; j++) {
      const a = actors[i]
      const b = actors[j]
      if (!a.alive || !b.alive || a.kind === 'buoy' || b.kind === 'buoy') continue
      let dx = b.x - a.x
      let dz = b.z - a.z
      let dist = Math.hypot(dx, dz)
      const min = 0.86
      if (dist >= min) continue
      if (dist < 0.0001) {
        dx = 0.02
        dz = 0
        dist = 0.02
      }
      const push = (min - dist) / 2
      const ux = dx / dist
      const uz = dz / dist
      if (!blocked(a.x - ux * push, a.z - uz * push, [])) {
        a.x -= ux * push
        a.z -= uz * push
      }
      b.x += ux * push
      b.z += uz * push
    }
  }
}

function aimAt(actor, x, z, dt, turn) {
  const want = Math.atan2(x - actor.x, z - actor.z)
  const diff = wrapAngle(want - actor.yaw)
  const step = Math.min(turn * dt, Math.abs(diff))
  actor.yaw += Math.sign(diff) * step
  return diff
}

function nearest(actor, list, filter) {
  let best = null
  let bestD = Infinity
  for (const item of list) {
    if (item === actor || (filter && !filter(item))) continue
    const dist = Math.hypot(item.x - actor.x, item.z - actor.z)
    if (dist < bestD) {
      best = item
      bestD = dist
    }
  }
  return best
}

function think(match, actor, dt) {
  const mode = match.theme.mode
  actor.input.jump = false
  actor.input.fire = false
  actor.input.mx = actor.stuck > 0.35 ? (rand(match) > 0.5 ? 1 : -1) : 0
  actor.input.mz = 1
  if (mode === 'race') {
    const gate = match.map.checks[actor.gate % match.map.checks.length]
    if (gate) aimAt(actor, gate.x, gate.z, dt, 2.4)
    return
  }
  if (mode === 'explore') {
    const beacon = nearest(actor, match.beacons, (item) => item.ready)
    if (beacon) aimAt(actor, beacon.x, beacon.z, dt, 2.2)
    else actor.yaw += 0.4 * dt
    return
  }
  if (mode === 'ctf') {
    const enemyFlag = match.flags.find((flag) => flag.team !== actor.team)
    const own = match.flags.find((flag) => flag.team === actor.team)
    const carrying = actor.flag !== '' && actor.flag !== undefined
    const target = carrying && own ? own : enemyFlag
    if (target) aimAt(actor, target.x, target.z, dt, 2.2)
    const foe = nearest(actor, match.actors, (item) => item.alive && item.kind === 'player' && item.team !== actor.team)
    if (foe) {
      const diff = wrapAngle(Math.atan2(foe.x - actor.x, foe.z - actor.z) - actor.yaw)
      actor.input.fire = Math.abs(diff) < 0.35 && Math.hypot(foe.x - actor.x, foe.z - actor.z) < match.config.range
    }
    return
  }
  const foe = nearest(actor, match.actors, (item) => {
    if (!item.alive || item.kind !== 'player') return false
    if (mode === 'tag') return actor.id === match.it ? item.id !== actor.id : item.id === match.it
    return true
  })
  if (!foe) {
    actor.yaw += 0.5 * dt
    return
  }
  const diff = aimAt(actor, foe.x, foe.z, dt, mode === 'tag' && actor.id !== match.it ? 2.8 : 2.2)
  const dist = Math.hypot(foe.x - actor.x, foe.z - actor.z)
  if (mode === 'tag' && actor.id !== match.it) actor.input.mz = dist < 6 ? -1 : 1
  else if (dist < 7) actor.input.mz = 0.25
  if (mode === 'tag') {
    if (actor.id === match.it && dist < 1.35 && actor.cool <= 0) {
      match.it = foe.id
      actor.score += points(match, 'tag', 'tag')
      note(match, `${actor.name} tagged ${foe.name}`)
      actor.cool = 1
    }
    return
  }
  actor.input.fire = Math.abs(diff) < 0.28 && dist < match.config.range && actor.cool <= 0 && rand(match) > 0.4
}

function objectives(match, actor) {
  const mode = match.theme.mode
  if (mode === 'ctf' && actor.alive && actor.kind === 'player') {
    for (const flag of match.flags) {
      if (flag.carried === actor.id) {
        flag.x = actor.x
        flag.z = actor.z
      }
    }
    if (actor.flag === '' || actor.flag === undefined) {
      const enemy = match.flags.find((flag) => flag.team !== actor.team && !flag.carried)
      if (enemy && near(actor, enemy, 1.35)) {
        enemy.carried = actor.id
        actor.flag = enemy.team
        note(match, `${actor.name} took the flag`)
      }
    } else {
      const own = match.flags.find((flag) => flag.team === actor.team)
      if (own && !own.carried && near(actor, own, 1.5)) {
        const carried = match.flags.find((flag) => flag.team === actor.flag)
        actor.score += points(match, 'ctf', 'cap')
        actor.flag = ''
        if (carried) {
          carried.carried = ''
          carried.x = carried.homeX
          carried.z = carried.homeZ
        }
        note(match, `${actor.name} captured the flag`)
      }
    }
  }
  if (mode === 'race' && actor.alive) {
    const gate = match.map.checks[actor.gate % match.map.checks.length]
    if (gate && inside(actor, gate)) {
      actor.gate += 1
      actor.score += points(match, 'race', 'gate')
      if (actor.gate % match.map.checks.length === 0) {
        actor.laps += 1
        actor.score += points(match, 'race', 'lap')
        note(match, `${actor.name} finished lap ${actor.laps}`)
      }
    }
  }
  if (mode === 'explore' && actor.alive && actor.kind === 'player') {
    for (const beacon of match.beacons) {
      if (beacon.ready && near(actor, beacon, 1.35)) {
        beacon.ready = false
        beacon.cool = 8
        actor.score += points(match, 'explore', 'beacon')
        note(match, `${actor.name} lit a beacon`)
      }
    }
  }
  if (mode === 'tag' && actor.alive && actor.id !== match.it) {
    actor.bank += 0
  }
}

function round2(n) {
  return Math.round(n * 100) / 100
}

function round3(n) {
  return Math.round(n * 1000) / 1000
}

export function stepMatch(match, dt) {
  if (!match || match.over) return match
  let left = Math.min(0.5, Math.max(0, Number(dt) || 0))
  if (!left) return match
  while (left > 0.0001) {
    const step = Math.min(0.05, left)
    left -= step
    tickMatch(match, step)
    if (match.over) break
  }
  return match
}

function tickMatch(match, step) {
  match.elapsed += step
  if (match.elapsed >= match.config.seconds) {
    match.over = true
    note(match, 'Round over')
    return match
  }
  for (const beacon of match.beacons) {
    if (!beacon.ready) {
      beacon.cool -= step
      if (beacon.cool <= 0) beacon.ready = true
    }
  }
  for (const actor of match.actors) {
    if (actor.kind === 'buoy') {
      if (actor.invuln > 0) actor.invuln -= step
      if (!actor.alive) {
        actor.respawn -= step
        if (actor.respawn <= 0) {
          actor.alive = true
          actor.hp = 30
          actor.invuln = 0.4
        }
      }
      continue
    }
    if (!actor.alive) {
      actor.respawn -= step
      if (actor.respawn <= 0) place(match, actor, match.actors.indexOf(actor))
      continue
    }
    if (actor.invuln > 0) actor.invuln -= step
    if (actor.bot) think(match, actor, step)
    moveActor(match, actor, step)
    combat(match, actor, step)
    objectives(match, actor)
  }
  separate(match.actors)
  if (match.theme.mode === 'tag') {
    for (const actor of match.actors) {
      if (!actor.alive || actor.id === match.it || actor.kind !== 'player') continue
      actor.bank += step
      if (actor.bank >= 1) {
        actor.score += 10
        actor.bank -= 1
      }
    }
  }
  match.tick += 1
  return match
}

export function packSnap(match, youId = '') {
  const snap = {
    t: 'snap',
    tick: match.tick,
    mode: match.theme.mode,
    weapon: match.theme.weapon,
    sky: match.theme.sky,
    left: Math.max(0, Math.ceil(match.config.seconds - match.elapsed)),
    over: match.over ? 1 : 0,
    you: youId,
    it: match.it || '',
    actors: match.actors.map((actor) => ({
      id: actor.id,
      name: actor.name,
      color: actor.color,
      bot: actor.bot ? 1 : 0,
      kind: actor.kind,
      team: actor.team,
      x: round2(actor.x),
      y: round2(actor.y),
      z: round2(actor.z),
      yaw: round3(actor.yaw),
      pitch: round3(actor.pitch),
      hp: Math.max(0, Math.ceil(actor.hp)),
      alive: actor.alive ? 1 : 0,
      score: actor.score | 0,
      ammo: actor.ammo | 0,
      flag: actor.flag === '' || actor.flag === undefined ? '' : actor.flag,
      it: actor.id === match.it ? 1 : 0
    })),
    flags: match.flags.map((flag) => ({
      team: flag.team,
      x: round2(flag.x),
      z: round2(flag.z),
      carried: flag.carried || ''
    })),
    beacons: match.beacons.map((beacon) => ({
      x: beacon.x,
      z: beacon.z,
      ready: beacon.ready ? 1 : 0
    })),
    feed: match.feed.slice(-4),
    tracers: match.tracers.slice(-8)
  }
  match.tracers = []
  return snap
}

export function packWelcome(match, actor) {
  return {
    t: 'welcome',
    id: actor.id,
    name: actor.name,
    color: actor.color,
    map: {
      walls: match.map.walls,
      checks: match.map.checks,
      radius: match.map.radius || 0
    },
    snap: packSnap(match, actor.id)
  }
}
