const SCORING_KINDS = new Set(['target', 'collectible'])
const HAZARD_KINDS = new Set(['hazard', 'obstacle'])

export function mulberry32(seed) {
  let a = seed >>> 0
  return function rand() {
    a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function round3(value) {
  return Math.round(value * 1000) / 1000
}

function cellKey(c, r) {
  return `${c},${r}`
}

export function createSimulation(spec, seed = 1) {
  const rng = mulberry32(seed || 1)
  const scheme = spec.controls?.scheme || 'keys'
  const movement = spec.movement || 'straight'
  const pattern = spec.spawn?.pattern || 'rain'
  const rate = Number(spec.spawn?.rate) > 0 ? Number(spec.spawn.rate) : 1
  const pointsPer = Number(spec.scoreRules?.pointsPerEntity) > 0 ? Number(spec.scoreRules.pointsPerEntity) : 10
  const comboMax = Math.max(1, Number(spec.scoreRules?.comboMultiplier) || 1)
  const livesStart = Math.max(1, Number(spec.rules?.lives) || 3)
  const win = spec.rules?.win || 'survive'
  const surviveMs = (Number(spec.rules?.seconds) || Number(spec.duration) || 20) * 1000
  const targetScore = Number(spec.rules?.targetScore) || 40
  const durationMs = (Number(spec.duration) || 20) * 1000
  const spawnables = (spec.entities || []).filter((entity) => entity.kind !== 'player')
  const primitiveList = Array.isArray(spec.primitives) && spec.primitives.length ? spec.primitives.slice() : ['fall']
  const primitives = new Set(primitiveList)
  const falling = primitives.has('fall')
  const chaseMove = primitives.has('chase')
  const mazeOn = primitives.has('maze')
  const popup = primitives.has('popup')
  const lifetimeMs = Number(spec.lifetimeMs) > 0 ? Number(spec.lifetimeMs) : 0
  const anchored = mazeOn || (popup && !falling && !chaseMove)
  const vertical = !mazeOn && !chaseMove && (falling || !popup)
  const proximity = chaseMove || primitives.has('platform') || mazeOn || popup
  const platforms = primitives.has('platform')
    ? [{ x: 15, y: 58, w: 28 }, { x: 55, y: 38, w: 24 }]
    : []

  const walls = new Set()
  if (mazeOn) {
    for (let c = 0; c < 8; c++) {
      walls.add(cellKey(c, 0))
      walls.add(cellKey(c, 5))
    }
    for (let r = 0; r < 6; r++) {
      walls.add(cellKey(0, r))
      walls.add(cellKey(7, r))
    }
    for (let r = 1; r <= 4; r++) {
      for (let c = 2; c <= 5; c++) {
        if (rng() < 0.35) walls.add(cellKey(c, r))
      }
    }
    walls.delete(cellKey(1, 4))
    walls.delete(cellKey(2, 4))
  }

  function centerOf(c, r) {
    return { x: (c + 0.5) * 12.5, y: (r + 0.5) * (100 / 6) }
  }

  const startCell = centerOf(1, 4)
  const state = {
    t: 0,
    score: 0,
    lives: livesStart,
    combo: 1,
    lastScoreAt: -100000,
    entities: [],
    shots: [],
    playerX: mazeOn ? startCell.x : 50,
    playerY: mazeOn ? startCell.y : 84,
    playerVy: 0,
    cell: { c: 1, r: 4 },
    over: false,
    won: false,
    spawnAcc: 0,
    spawned: 0,
    nextId: 1,
    lastShot: -100000,
    lastStep: -100000
  }

  function pickEntity() {
    if (!spawnables.length) return { kind: 'hazard', label: 'Hazard', sprite: '●', points: 0, speed: 1, shape: 'circle' }
    return spawnables[Math.floor(rng() * spawnables.length)]
  }

  function pushEntity(x, y, vy) {
    const src = pickEntity()
    const speed = Number(src.speed) > 0 ? Number(src.speed) : 1
    state.entities.push({
      id: state.nextId++,
      kind: src.kind,
      label: src.label,
      sprite: src.sprite || (SCORING_KINDS.has(src.kind) ? '★' : '●'),
      shape: src.shape || 'circle',
      points: Number.isFinite(Number(src.points)) ? Number(src.points) : pointsPer,
      speed,
      x,
      y,
      vy,
      vx: movement === 'bounce' ? (rng() < 0.5 ? -12 : 12) : 0,
      phase: rng() * Math.PI * 2,
      born: state.t,
      alive: true
    })
    state.spawned += 1
  }

  function make(x, yExtra = 0) {
    pushEntity(x, -6 - yExtra, 16 + (1) * 14)
    const entity = state.entities[state.entities.length - 1]
    const speed = entity.speed
    entity.vy = 16 + speed * 14
  }

  function makeAnchored(x) {
    pushEntity(x, 16 + rng() * 60, 0)
  }

  function spawnMaze() {
    const options = []
    for (let r = 1; r <= 4; r++) {
      for (let c = 1; c <= 6; c++) {
        if (!walls.has(cellKey(c, r)) && !(c === state.cell.c && r === state.cell.r)) options.push(centerOf(c, r))
      }
    }
    const spot = options.length ? options[Math.floor(rng() * options.length)] : centerOf(3, 2)
    pushEntity(spot.x, spot.y, 0)
  }

  function spawnOne() {
    if (mazeOn) {
      spawnMaze()
      return
    }
    const place = (x) => {
      if (chaseMove && !falling) makeAnchored(x)
      else if (anchored) makeAnchored(x)
      else make(x)
    }
    if (pattern === 'lanes') {
      place([18, 50, 82][state.spawned % 3])
      return
    }
    if (pattern === 'waves') {
      for (const x of [18, 50, 82]) place(x)
      return
    }
    if (pattern === 'burst') {
      const base = 20 + rng() * 60
      for (let i = 0; i < 4; i++) place(Math.max(8, Math.min(92, base + (i - 1.5) * 8)))
      return
    }
    place(8 + rng() * 84)
  }

  function award(entity) {
    const base = entity.points > 0 ? entity.points : pointsPer
    if (state.t - state.lastScoreAt < 1500) state.combo = Math.min(comboMax, state.combo + 1)
    else state.combo = 1
    state.score += Math.round(base * state.combo)
    state.lastScoreAt = state.t
  }

  function damage() {
    state.lives -= 1
    state.combo = 1
    if (state.lives <= 0) {
      state.lives = 0
      state.over = true
      state.won = false
    }
  }

  function resolve(entity, source) {
    if (!entity.alive || state.over) return
    const scoring = SCORING_KINDS.has(entity.kind)
    const hazard = HAZARD_KINDS.has(entity.kind)
    if (!scoring && !hazard) return
    entity.alive = false
    if (scoring || source === 'shot') award(entity.points > 0 || scoring ? entity : { ...entity, points: pointsPer })
    else damage()
  }

  function collideBody(entity) {
    if (scheme === 'tap') return
    if (proximity) {
      if (Math.hypot(entity.x - state.playerX, entity.y - state.playerY) < 8) resolve(entity, 'body')
      return
    }
    if (entity.y > 74 && entity.y < 92 && Math.abs(entity.x - state.playerX) < 8) resolve(entity, 'body')
  }

  function tapHits(taps) {
    if (scheme !== 'tap' || !Array.isArray(taps)) return
    for (const tap of taps) {
      if (!tap || !Number.isFinite(tap.x) || !Number.isFinite(tap.y)) continue
      for (const entity of state.entities) {
        if (!entity.alive) continue
        if (Math.hypot(entity.x - tap.x, entity.y - tap.y) <= 10) resolve(entity, 'tap')
      }
    }
  }

  function moveChase(entity, sec) {
    const dx = state.playerX - entity.x
    const dy = state.playerY - entity.y
    const dist = Math.hypot(dx, dy)
    if (dist < 0.05) return
    const speed = 18 + entity.speed * 22
    const step = Math.min(dist, speed * sec)
    entity.x += (dx / dist) * step
    entity.y += (dy / dist) * step
  }

  function movePlayer(step, input) {
    if (mazeOn) {
      if (state.t - state.lastStep < 160) return
      let dc = 0
      let dr = 0
      if (input.left) dc = -1
      else if (input.right) dc = 1
      else if (input.up) dr = -1
      else if (input.down) dr = 1
      if (!dc && !dr) return
      const nc = state.cell.c + dc
      const nr = state.cell.r + dr
      state.lastStep = state.t
      if (walls.has(cellKey(nc, nr))) return
      state.cell = { c: nc, r: nr }
      const spot = centerOf(nc, nr)
      state.playerX = spot.x
      state.playerY = spot.y
      return
    }
    if (scheme === 'keys') {
      if (input.left) state.playerX -= step * 0.08
      if (input.right) state.playerX += step * 0.08
    } else if (scheme === 'drag' && Number.isFinite(input.pointerX)) {
      state.playerX = input.pointerX
    }
    state.playerX = Math.max(6, Math.min(94, state.playerX))
    if (!primitives.has('platform')) return
    const prevY = state.playerY
    if ((input.jump || input.up) && state.playerVy === 0 && prevY >= 83) state.playerVy = -52
    state.playerVy += 120 * (step / 1000)
    state.playerY += state.playerVy * (step / 1000)
    let grounded = false
    for (const plat of platforms) {
      const onX = state.playerX >= plat.x && state.playerX <= plat.x + plat.w
      if (onX && state.playerVy >= 0 && prevY <= plat.y && state.playerY >= plat.y) {
        state.playerY = plat.y
        state.playerVy = 0
        grounded = true
      }
    }
    if (state.playerY >= 84) {
      state.playerY = 84
      state.playerVy = 0
      grounded = true
    }
    if (!grounded && state.playerY > 96) {
      state.playerY = 84
      state.playerVy = 0
      damage()
    }
  }

  function endCheck() {
    if (state.over) return
    if (win === 'score' && state.score >= targetScore) {
      state.over = true
      state.won = true
      return
    }
    if (win === 'survive' && state.t >= surviveMs && state.lives > 0) {
      state.over = true
      state.won = true
      return
    }
    if (state.t >= durationMs) {
      state.over = true
      if (win === 'score') state.won = state.score >= targetScore
      else state.won = state.lives > 0
    }
  }

  function snapshot() {
    return {
      time: state.t,
      score: state.score,
      lives: state.lives,
      combo: state.combo,
      over: state.over,
      won: state.won,
      playerX: round3(state.playerX),
      playerY: round3(state.playerY),
      pattern,
      movement,
      scheme,
      win,
      primitives: primitiveList.slice(),
      spawned: state.spawned,
      platforms: platforms.map((plat) => ({ x: plat.x, y: plat.y, w: plat.w })),
      walls: mazeOn ? [...walls].map((key) => {
        const [c, r] = key.split(',').map(Number)
        return { c, r }
      }).sort((a, b) => a.r - b.r || a.c - b.c) : [],
      shots: state.shots.map((shot) => ({ x: round3(shot.x), y: round3(shot.y) })),
      entities: state.entities.filter((entity) => entity.alive).map((entity) => ({
        kind: entity.kind,
        sprite: entity.sprite,
        x: round3(entity.x),
        y: round3(entity.y)
      }))
    }
  }

  return {
    tick(dt, input = {}) {
      if (state.over) return snapshot()
      const step = Math.max(0, Math.min(100, Number(dt) || 0))
      state.t += step
      movePlayer(step, input)
      const interval = (pattern === 'burst' ? 1600 : 1000) / rate
      state.spawnAcc += step
      let guard = 0
      while (state.spawnAcc >= interval && guard < 6) {
        state.spawnAcc -= interval
        spawnOne()
        guard += 1
      }
      const sec = step / 1000
      for (const entity of state.entities) {
        if (!entity.alive) continue
        if (chaseMove) moveChase(entity, sec)
        else if (!anchored && !mazeOn) {
          if (movement === 'zigzag') entity.x += Math.sin(state.t / 180 + entity.phase) * 28 * sec
          else if (movement === 'homing') {
            const dx = state.playerX - entity.x
            entity.x += Math.sign(dx) * Math.min(Math.abs(dx), 30 * sec)
          } else if (movement === 'bounce') {
            entity.x += entity.vx * sec
            if (entity.x < 8 || entity.x > 92) {
              entity.vx *= -1
              entity.x = Math.max(8, Math.min(92, entity.x))
            }
          }
          if (vertical) entity.y += entity.vy * sec
        }
        entity.x = Math.max(4, Math.min(96, entity.x))
        entity.y = Math.max(-12, Math.min(110, entity.y))
        collideBody(entity)
        if (entity.alive && vertical && entity.y > 108) {
          if (HAZARD_KINDS.has(entity.kind)) state.score += 1
          entity.alive = false
        }
        if (entity.alive && lifetimeMs > 0 && state.t - entity.born >= lifetimeMs) entity.alive = false
      }
      if (primitives.has('shoot') && input.fire && state.t - state.lastShot >= 260) {
        state.shots.push({ x: state.playerX, y: state.playerY - 6, vy: -78 })
        state.lastShot = state.t
      }
      for (const shot of state.shots) {
        shot.y += shot.vy * sec
        for (const entity of state.entities) {
          if (!entity.alive || shot.dead) continue
          if (Math.hypot(entity.x - shot.x, entity.y - shot.y) <= 6) {
            resolve(entity, 'shot')
            shot.dead = true
          }
        }
      }
      state.shots = state.shots.filter((shot) => !shot.dead && shot.y > -10).slice(-12)
      tapHits(input.taps)
      if (state.entities.length > 48) state.entities = state.entities.filter((entity) => entity.alive).slice(-40)
      else state.entities = state.entities.filter((entity) => entity.alive)
      endCheck()
      return snapshot()
    },
    snapshot,
    setPlayerX(x) {
      state.playerX = Math.max(6, Math.min(94, Number(x) || 50))
    },
    setPlayer(x, y) {
      state.playerX = Math.max(6, Math.min(94, Number(x) || 50))
      state.playerY = Math.max(4, Math.min(96, Number(y) || 84))
    }
  }
}
