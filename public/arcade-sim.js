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

  const state = {
    t: 0,
    score: 0,
    lives: livesStart,
    combo: 1,
    lastScoreAt: -100000,
    entities: [],
    playerX: 50,
    over: false,
    won: false,
    spawnAcc: 0,
    spawned: 0,
    nextId: 1
  }

  function pickEntity() {
    if (!spawnables.length) return { kind: 'hazard', label: 'Hazard', sprite: '●', points: 0, speed: 1, shape: 'circle' }
    return spawnables[Math.floor(rng() * spawnables.length)]
  }

  function make(x, yExtra = 0) {
    const src = pickEntity()
    const speed = Number(src.speed) > 0 ? Number(src.speed) : 1
    state.entities.push({
      id: state.nextId++,
      kind: src.kind,
      label: src.label,
      sprite: src.sprite || (SCORING_KINDS.has(src.kind) ? '★' : '●'),
      shape: src.shape || 'circle',
      points: Number.isFinite(Number(src.points)) ? Number(src.points) : pointsPer,
      x,
      y: -6 - yExtra,
      vy: 16 + speed * 14,
      vx: movement === 'bounce' ? (rng() < 0.5 ? -12 : 12) : 0,
      phase: rng() * Math.PI * 2,
      alive: true
    })
    state.spawned += 1
  }

  function spawnOne() {
    if (pattern === 'lanes') {
      make([18, 50, 82][state.spawned % 3])
      return
    }
    if (pattern === 'waves') {
      for (const x of [18, 50, 82]) make(x)
      return
    }
    if (pattern === 'burst') {
      const base = 20 + rng() * 60
      for (let i = 0; i < 4; i++) make(Math.max(8, Math.min(92, base + (i - 1.5) * 8)), i * 5)
      return
    }
    make(8 + rng() * 84)
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

  function resolve(entity) {
    if (!entity.alive || state.over) return
    const scoring = SCORING_KINDS.has(entity.kind)
    const hazard = HAZARD_KINDS.has(entity.kind)
    if (!scoring && !hazard) return
    entity.alive = false
    if (scoring) award(entity)
    else damage()
  }

  function collideBody(entity) {
    if (scheme === 'tap') return
    if (entity.y > 74 && entity.y < 92 && Math.abs(entity.x - state.playerX) < 8) resolve(entity)
  }

  function tapHits(taps) {
    if (scheme !== 'tap' || !Array.isArray(taps)) return
    for (const tap of taps) {
      if (!tap || !Number.isFinite(tap.x) || !Number.isFinite(tap.y)) continue
      for (const entity of state.entities) {
        if (!entity.alive) continue
        if (Math.hypot(entity.x - tap.x, entity.y - tap.y) <= 10) resolve(entity)
      }
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
      pattern,
      movement,
      scheme,
      win,
      spawned: state.spawned,
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
      if (scheme === 'keys') {
        if (input.left) state.playerX -= step * 0.08
        if (input.right) state.playerX += step * 0.08
      } else if (scheme === 'drag' && Number.isFinite(input.pointerX)) {
        state.playerX = input.pointerX
      }
      state.playerX = Math.max(6, Math.min(94, state.playerX))
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
        entity.x = Math.max(4, Math.min(96, entity.x))
        entity.y += entity.vy * sec
        collideBody(entity)
        if (entity.alive && entity.y > 108) {
          if (HAZARD_KINDS.has(entity.kind)) state.score += 1
          entity.alive = false
        }
      }
      tapHits(input.taps)
      if (state.entities.length > 48) state.entities = state.entities.filter((entity) => entity.alive).slice(-40)
      else state.entities = state.entities.filter((entity) => entity.alive)
      endCheck()
      return snapshot()
    },
    snapshot,
    setPlayerX(x) {
      state.playerX = Math.max(6, Math.min(94, Number(x) || 50))
    }
  }
}
