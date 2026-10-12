import { CANOPY, CANDY, DUNE, FROST, HOTBAR, PETAL, ROCK, SOIL, TIMBER, TURF, blockOf, isSolid } from '/blocks/blocks.js'
import { VISTA_PITCH, goalProgress, lookYaw, skyCycle, skyPhase, sparkHit, sparkSpots } from '/blocks/goals.js'
import { blockAt, skyHex, spawnPoint, worldFromSpec } from '/blocks/terrain.js'
import { createWorldRenderer } from '/world-render.js'

const EYE = 1.62
const HINT = 'Click or drag to look. WASD moves, space jumps. Left click breaks. Right click or E places. Walk over the yellow sparks.'
const TOUCH_HINT = 'Drag the right side to look. The left stick moves. Tap to break. Walk over the yellow sparks.'

export function mountWorld({ spec, slug, field, offline = false, onStats } = {}) {
  const world = worldFromSpec(spec || {})
  const edits = new Map()
  const spots = sparkSpots(world)
  const picked = new Set()
  const pending = new Set()
  const coarse = window.matchMedia('(pointer: coarse)').matches
  const spawn = spawnPoint(world, edits)
  const pos = { x: spawn.x, y: spawn.y, z: spawn.z }
  let yaw = lookYaw(world, pos.x, pos.z)
  let pitch = VISTA_PITCH
  let looked = false
  let vy = 0
  let grounded = false
  let slot = 0
  let jumpQueued = false
  const keys = new Set()
  const stick = { x: 0, y: 0 }
  const remotes = new Map()
  const state = {
    ready: false,
    gl: false,
    editCount: 0,
    lastEdit: null,
    online: 1,
    name: '',
    note: ''
  }
  window.__blocks = state

  const canvas = document.createElement('canvas')
  canvas.className = 'world-canvas'
  canvas.tabIndex = 0
  const ui = document.createElement('div')
  ui.className = 'world-ui'
  ui.innerHTML = `
    <div class="world-goal" id="world-goal" role="status">
      <p class="world-goal-title" id="world-goal-title"></p>
      <p class="world-goal-sub" id="world-goal-sub"></p>
      <div class="world-goal-bar" aria-hidden="true"><i id="world-goal-fill"></i></div>
    </div>
    <p class="world-online" id="world-online">1 online</p>
    <p class="world-with" id="world-with"></p>
    <p class="world-toast" id="world-toast"></p>
    <button type="button" id="world-start" class="world-start"><span>Play</span></button>
    <div class="crosshair" aria-hidden="true"></div>
    <div class="names" id="world-names"></div>
    <div class="stick touch-only" id="world-stick"><i></i></div>
    <div class="world-actions touch-only">
      <button type="button" id="world-jump">Jump</button>
      <button type="button" id="world-place">Place</button>
    </div>
    <div class="hotbar" id="world-hotbar"></div>`
  field.classList.add('world-on')
  field.replaceChildren(canvas, ui)
  const onlineEl = ui.querySelector('#world-online')
  const withEl = ui.querySelector('#world-with')
  const hintEl = ui.querySelector('#world-toast')
  const goalEl = ui.querySelector('#world-goal')
  const goalTitle = ui.querySelector('#world-goal-title')
  const goalSub = ui.querySelector('#world-goal-sub')
  const goalFill = ui.querySelector('#world-goal-fill')
  const namesEl = ui.querySelector('#world-names')
  const hotbar = ui.querySelector('#world-hotbar')
  const stickEl = ui.querySelector('#world-stick')
  const knob = stickEl.querySelector('i')
  hintEl.textContent = coarse ? TOUCH_HINT : HINT
  setTimeout(() => hintEl.classList.add('fade'), 5000)

  let audioCtx = null
  let live = false
  let sparkDirty = true
  function unlockAudio() {
    try {
      if (!audioCtx) {
        const Ctx = window.AudioContext || window.webkitAudioContext
        if (!Ctx) return
        audioCtx = new Ctx()
      }
      if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {})
    } catch { /* autoplay or a missing context stays silent */ }
  }
  function blip(freq, dur, type, when) {
    if (!audioCtx || audioCtx.state === 'suspended') return
    const t = when ?? audioCtx.currentTime
    const osc = audioCtx.createOscillator()
    const gain = audioCtx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, t)
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(0.07, t + 0.012)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    osc.connect(gain)
    gain.connect(audioCtx.destination)
    osc.start(t)
    osc.stop(t + dur + 0.02)
  }
  function cue(kind) {
    unlockAudio()
    if (kind === 'place') blip(520, 0.07, 'square')
    else if (kind === 'break') blip(170, 0.09, 'triangle')
    else if (kind === 'spark') {
      const t = audioCtx?.currentTime
      if (t === undefined) return
      blip(660, 0.06, 'sine', t)
      blip(880, 0.08, 'sine', t + 0.07)
    }
  }
  function paintGoal() {
    const progress = goalProgress(world, edits, picked)
    state.goal = progress
    const built = Math.min(progress.built, progress.raise)
    const have = Math.min(progress.have, progress.sparks)
    goalTitle.textContent = progress.done ? 'Clear' : `${progress.label} ${built}/${progress.raise}`
    goalSub.textContent = progress.done
      ? `${progress.label} ${progress.raise}/${progress.raise} · Sparks ${progress.sparks}/${progress.sparks}`
      : `Sparks ${have}/${progress.sparks}`
    goalEl.classList.toggle('clear', progress.done)
    goalFill.style.width = `${Math.round(progress.ratio * 100)}%`
  }
  paintGoal()

  function speckThumb(dark, light) {
    const chip = document.createElement('canvas')
    chip.width = 48
    chip.height = 48
    const ctx = chip.getContext('2d')
    const a = Number.parseInt(dark.slice(1), 16)
    const b = Number.parseInt(light.slice(1), 16)
    const from = [(a >> 16) & 255, (a >> 8) & 255, a & 255]
    const to = [(b >> 16) & 255, (b >> 8) & 255, b & 255]
    const img = ctx.createImageData(48, 48)
    for (let y = 0; y < 48; y++) {
      for (let x = 0; x < 48; x++) {
        const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453
        const f = n - Math.floor(n)
        const grain = Math.sin((x + y * 3) * 0.7) * 0.5 + 0.5
        const t = Math.min(1, Math.max(0, f * 0.65 + grain * 0.35))
        const o = (y * 48 + x) * 4
        img.data[o] = from[0] + (to[0] - from[0]) * t
        img.data[o + 1] = from[1] + (to[1] - from[1]) * t
        img.data[o + 2] = from[2] + (to[2] - from[2]) * t
        img.data[o + 3] = 255
      }
    }
    ctx.putImageData(img, 0, 0)
    return chip.toDataURL('image/png')
  }

  const thumbUrl = {
    [TURF]: '/textures/grass_diff.jpg',
    [SOIL]: '/textures/dirt_diff.jpg',
    [ROCK]: '/textures/stone_diff.jpg',
    [DUNE]: '/textures/sand_diff.jpg',
    [TIMBER]: '/textures/wood_diff.jpg',
    [CANOPY]: '/textures/leaves_diff.jpg',
    [FROST]: '/textures/snow_diff.jpg',
    [PETAL]: speckThumb('#c46a5a', '#f2a3c7'),
    [CANDY]: speckThumb('#8a3048', '#e8c4a8')
  }
  const buttons = HOTBAR.map((id, index) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.style.backgroundImage = `url("${thumbUrl[id] || speckThumb('#6d6256', '#c4b8a4')}")`
    button.setAttribute('aria-label', blockOf(id).name)
    button.className = index === 0 ? 'on' : ''
    button.addEventListener('pointerdown', (event) => {
      event.stopPropagation()
      event.preventDefault()
      select(index)
    })
    hotbar.append(button)
    return button
  })

  function select(index) {
    slot = (index + HOTBAR.length) % HOTBAR.length
    buttons.forEach((button, i) => button.classList.toggle('on', i === slot))
  }

  function sample(x, y, z) {
    return blockAt(x, y, z, world, edits)
  }

  function hits(px, py, pz) {
    const r = 0.28
    const x0 = Math.floor(px - r)
    const x1 = Math.floor(px + r)
    const y0 = Math.floor(py + 0.01)
    const y1 = Math.floor(py + 1.65)
    const z0 = Math.floor(pz - r)
    const z1 = Math.floor(pz + r)
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        for (let z = z0; z <= z1; z++) {
          if (isSolid(sample(x, y, z))) return true
        }
      }
    }
    return false
  }

  let guard = 0
  while (hits(pos.x, pos.y, pos.z) && guard++ < 6) pos.y += 1

  const renderer = createWorldRenderer(canvas, {
    world,
    sample,
    onLit() { state.lit = true }
  })
  state.gl = renderer.ok
  if (!renderer.ok) state.lit = true

  function buildAll() {
    renderer.remeshAll()
  }

  function remeshAt(x, z) {
    renderer.remeshAt(x, z)
  }

  function applyEdit(x, y, z, block) {
    edits.set(`${x},${y},${z}`, block)
    remeshAt(x, z)
    state.lastEdit = { x, y, z, block }
    state.editCount += 1
    if (state.ready) cue(block ? 'place' : 'break')
    paintGoal()
  }



  function lookVector() {
    const cp = Math.cos(pitch)
    return { x: Math.sin(yaw) * cp, y: Math.sin(pitch), z: Math.cos(yaw) * cp }
  }

  function raycast(dist) {
    const eye = { x: pos.x, y: pos.y + EYE, z: pos.z }
    const dir = lookVector()
    let prev = null
    for (let t = 0; t <= dist; t += 0.08) {
      const x = eye.x + dir.x * t
      const y = eye.y + dir.y * t
      const z = eye.z + dir.z * t
      const bx = Math.floor(x)
      const by = Math.floor(y)
      const bz = Math.floor(z)
      const id = sample(bx, by, bz)
      if (id) return { hit: { x: bx, y: by, z: bz, id }, prev }
      prev = { x: bx, y: by, z: bz }
    }
    return { hit: null, prev }
  }

  function inWorld(x, y, z) {
    return x >= 0 && y >= 0 && z >= 0 && x < world.size && y < world.height && z < world.size
  }

  function placeCell() {
    const cast = raycast(5.2)
    if (cast.hit && cast.prev && sample(cast.prev.x, cast.prev.y, cast.prev.z) === 0 && inWorld(cast.prev.x, cast.prev.y, cast.prev.z)) {
      return cast.prev
    }
    const dir = lookVector()
    const x = Math.floor(pos.x + dir.x * 2)
    const z = Math.floor(pos.z + dir.z * 2)
    let y = Math.floor(pos.y)
    if (!inWorld(x, y, z)) return null
    if (sample(x, y, z) !== 0) y += 1
    if (!inWorld(x, y, z) || sample(x, y, z) !== 0) return null
    return { x, y, z }
  }

  function breakCell() {
    const cast = raycast(5.2)
    if (cast.hit && inWorld(cast.hit.x, cast.hit.y, cast.hit.z)) return cast.hit
    const dir = lookVector()
    const x = Math.floor(pos.x + dir.x * 2)
    const z = Math.floor(pos.z + dir.z * 2)
    const y = Math.floor(pos.y) - 1
    if (!inWorld(x, y, z) || !sample(x, y, z)) return null
    return { x, y, z }
  }

  let socket = null
  let stopped = false

  function send(payload) {
    if (socket && socket.readyState === 1) socket.send(JSON.stringify(payload))
  }

  function requestEdit(cell, block) {
    if (!cell) return
    const msg = {
      t: 'edit',
      x: cell.x,
      y: cell.y,
      z: cell.z,
      block,
      px: pos.x,
      py: pos.y,
      pz: pos.z,
      yaw,
      pitch
    }
    if (offline || !socket || socket.readyState !== 1) {
      applyEdit(cell.x, cell.y, cell.z, block)
      state.note = 'local'
      return
    }
    send(msg)
  }

  function place() { requestEdit(placeCell(), HOTBAR[slot]) }
  function dig() { requestEdit(breakCell(), 0) }
  state.place = place
  state.break = dig
  state.block = (x, y, z) => sample(x, y, z)
  state.pos = () => ({ x: pos.x, y: pos.y, z: pos.z, yaw, pitch })
  state.aim = (nextYaw, nextPitch) => {
    if (Number.isFinite(nextYaw)) yaw = nextYaw
    if (Number.isFinite(nextPitch)) pitch = Math.max(-1.15, Math.min(1.15, nextPitch))
    looked = true
  }
  state.measure = () => {
    if (!state.gl || typeof renderer.coverage !== 'function') {
      return { ratio: 0, uniform: true, total: 0, chunks: 0, triangles: 0 }
    }
    return renderer.coverage()
  }
  state.others = []

  function setOnline(n, players) {
    state.online = n
    state.others = players || []
    onlineEl.textContent = `${n} online`
    const names = (players || []).map((player) => player.name).filter(Boolean)
    withEl.textContent = names.length ? `With you: ${names.join(', ')}` : ''
    if (onStats) onStats({ online: n })
  }

  function connect() {
    if (offline || !slug) {
      state.ready = true
      state.name = 'You'
      return
    }
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
    socket = new WebSocket(`${proto}//${location.host}/api/worlds/${slug}`)
    socket.addEventListener('message', (event) => {
      let msg
      try { msg = JSON.parse(event.data) } catch { return }
      if (msg.t === 'welcome') {
        state.name = msg.name
        if (!keys.size) {
          pos.x = msg.spawn.x
          pos.y = msg.spawn.y
          pos.z = msg.spawn.z
          if (!looked) {
            yaw = msg.spawn.yaw || 0
            pitch = msg.spawn.pitch ?? VISTA_PITCH
          }
        }
        edits.clear()
        const loaded = msg.edits || []
        for (const [x, y, z, block] of loaded) edits.set(`${x},${y},${z}`, block)
        state.editCount = loaded.length
        const last = loaded[loaded.length - 1]
        state.lastEdit = last ? { x: last[0], y: last[1], z: last[2], block: last[3] } : null
        if (state.gl) buildAll()
        picked.clear()
        pending.clear()
        for (const id of msg.gems || []) picked.add(id)
        sparkDirty = true
        paintGoal()
        remotes.clear()
        for (const player of msg.players || []) remotes.set(player.id, player)
        setOnline(msg.online || 1, msg.players)
        state.ready = true
        return
      }
      if (msg.t === 'edit') {
        applyEdit(msg.x, msg.y, msg.z, msg.block)
        return
      }
      if (msg.t === 'gem') {
        pending.delete(msg.id)
        if (!picked.has(msg.id)) {
          picked.add(msg.id)
          cue('spark')
          sparkDirty = true
          paintGoal()
        }
        return
      }
      if (msg.t === 'players') {
        remotes.clear()
        for (const player of msg.players || []) remotes.set(player.id, player)
        setOnline(msg.online || remotes.size + 1, msg.players)
        return
      }
      if (msg.t === 'reset') {
        edits.clear()
        picked.clear()
        pending.clear()
        sparkDirty = true
        paintGoal()
        if (state.gl) buildAll()
        state.note = 'reset'
        return
      }
      if (msg.t === 'reject') {
        if (msg.id !== undefined) pending.delete(msg.id)
        state.note = msg.reason || 'reject'
      }
    })
    socket.addEventListener('close', () => {
      if (!stopped && !state.ready) {
        state.note = 'offline'
        state.ready = true
      }
    })
    socket.addEventListener('error', () => { state.note = 'socket' })
  }

  const ac = new AbortController()
  const signal = ac.signal

  function typing() {
    const tag = document.activeElement?.tagName
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
  }

  function goLive() {
    if (live) return
    live = true
    if (!looked) {
      yaw = lookYaw(world, pos.x, pos.z)
      pitch = VISTA_PITCH
    }
    const gate = ui.querySelector('#world-start')
    if (gate) gate.hidden = true
  }
  ui.querySelector('#world-start').addEventListener('pointerdown', (event) => {
    event.preventDefault()
    unlockAudio()
    goLive()
  })
  window.addEventListener('keydown', (event) => {
    unlockAudio()
    if (typing()) return
    goLive()
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key
    if (key >= '1' && key <= '9') { select(Number(key) - 1); event.preventDefault(); return }
    if (key === 'e') { place(); event.preventDefault(); return }
    if (key === ' ') { jumpQueued = true; event.preventDefault() }
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(key)) {
      keys.add(key === ' ' ? ' ' : key)
      event.preventDefault()
    }
  }, { signal })
  window.addEventListener('keyup', (event) => {
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key
    keys.delete(key)
    if (event.key === ' ') keys.delete(' ')
  }, { signal })

  canvas.addEventListener('contextmenu', (event) => event.preventDefault())
  let lookDrag = null
  canvas.addEventListener('pointerdown', (event) => {
    unlockAudio()
    goLive()
    if (event.target !== canvas) return
    canvas.focus()
    const rect = canvas.getBoundingClientRect()
    const localX = event.clientX - rect.left
    if (event.pointerType === 'touch' && localX < rect.width * 0.42) return
    lookDrag = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: 0, button: event.button }
    try { canvas.setPointerCapture(event.pointerId) } catch { /* iframe */ }
    if (event.pointerType !== 'touch' && !coarse && !document.pointerLockElement) {
      canvas.requestPointerLock?.().catch(() => {})
    }
  })
  canvas.addEventListener('pointermove', (event) => {
    looked = true
    if (document.pointerLockElement === canvas) {
      yaw += event.movementX * 0.0022
      pitch -= event.movementY * 0.0022
      pitch = Math.max(-1.15, Math.min(1.15, pitch))
      return
    }
    if (!lookDrag || event.pointerId !== lookDrag.id) return
    const dx = event.clientX - lookDrag.x
    const dy = event.clientY - lookDrag.y
    lookDrag.x = event.clientX
    lookDrag.y = event.clientY
    lookDrag.moved += Math.abs(dx) + Math.abs(dy)
    yaw += dx * 0.005
    pitch -= dy * 0.005
    pitch = Math.max(-1.15, Math.min(1.15, pitch))
  })
  function endLook(event) {
    if (!lookDrag || event.pointerId !== lookDrag.id) return
    const tap = lookDrag.moved < 6
    const button = lookDrag.button
    lookDrag = null
    if (!tap) return
    if (button === 2) place()
    else dig()
  }
  canvas.addEventListener('pointerup', endLook)
  canvas.addEventListener('pointercancel', endLook)
  canvas.addEventListener('wheel', (event) => {
    event.preventDefault()
    select(slot + Math.sign(event.deltaY))
  }, { passive: false })

  ui.querySelector('#world-place').addEventListener('click', (event) => { event.stopPropagation(); place() })
  ui.querySelector('#world-jump').addEventListener('pointerdown', (event) => {
    event.stopPropagation()
    event.preventDefault()
    jumpQueued = true
  })

  stickEl.addEventListener('pointerdown', (event) => {
    event.stopPropagation()
    stickEl.setPointerCapture(event.pointerId)
    moveStick(event)
  })
  stickEl.addEventListener('pointermove', (event) => {
    if (!stickEl.hasPointerCapture?.(event.pointerId)) return
    moveStick(event)
  })
  function stopStick(event) {
    if (stickEl.hasPointerCapture?.(event.pointerId)) stickEl.releasePointerCapture(event.pointerId)
    stick.x = 0
    stick.y = 0
    knob.style.left = '30px'
    knob.style.top = '30px'
    stickEl.classList.remove('on')
  }
  stickEl.addEventListener('pointerup', stopStick)
  stickEl.addEventListener('pointercancel', stopStick)
  function moveStick(event) {
    const rect = stickEl.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    let dx = event.clientX - cx
    let dy = event.clientY - cy
    const max = rect.width / 2
    const len = Math.hypot(dx, dy) || 1
    if (len / max < 0.12) {
      stick.x = 0
      stick.y = 0
      knob.style.left = '30px'
      knob.style.top = '30px'
      return
    }
    if (len > max) { dx = dx / len * max; dy = dy / len * max }
    stick.x = dx / max
    stick.y = -dy / max
    stickEl.classList.add('on')
    knob.style.left = `${30 + dx * 0.45}px`
    knob.style.top = `${30 + dy * 0.45}px`
  }

  function step(dt) {
    if (!live) return
    let ix = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0)
    let iz = (keys.has('w') || keys.has('arrowup') ? 1 : 0) - (keys.has('s') || keys.has('arrowdown') ? 1 : 0)
    ix += stick.x
    iz += stick.y
    const len = Math.hypot(ix, iz)
    if (len > 1) { ix /= len; iz /= len }
    const sy = Math.sin(yaw)
    const cy = Math.cos(yaw)
    const speed = 5.4
    const vx = (sy * iz + cy * ix) * speed
    const vz = (cy * iz - sy * ix) * speed
    vy -= 26 * dt
    if (jumpQueued && grounded) { vy = 8.2; grounded = false }
    jumpQueued = false
    pos.x += vx * dt
    if (hits(pos.x, pos.y, pos.z)) pos.x -= vx * dt
    pos.z += vz * dt
    if (hits(pos.x, pos.y, pos.z)) pos.z -= vz * dt
    pos.y += vy * dt
    if (hits(pos.x, pos.y, pos.z)) {
      if (vy < 0) grounded = true
      pos.y -= vy * dt
      vy = 0
    } else if (vy < 0) {
      grounded = false
    }
    if (pos.y < 0) { pos.y = 0; vy = 0; grounded = true }
  }

  function checkSparks() {
    const solo = offline || !slug
    const socketLive = socket && socket.readyState === 1
    if (!solo && !socketLive) return
    for (const spot of spots) {
      if (picked.has(spot.id) || pending.has(spot.id)) continue
      const hit = sparkHit(spots, picked, spot.id, pos)
      if (!hit.ok) continue
      if (solo) {
        picked.add(spot.id)
        cue('spark')
        sparkDirty = true
        paintGoal()
        continue
      }
      pending.add(spot.id)
      send({ t: 'gem', id: spot.id, px: pos.x, py: pos.y, pz: pos.z, yaw, pitch })
    }
  }

  function drawNames() {
    namesEl.replaceChildren()
    if (!state.gl) return
    const rect = canvas.getBoundingClientRect()
    for (const player of remotes.values()) {
      const clip = renderer.project(player.x, player.y + 2.05, player.z)
      if (!clip) continue
      const tag = document.createElement('span')
      tag.className = 'world-tag'
      tag.textContent = player.name
      tag.style.left = `${(clip[0] * 0.5 + 0.5) * rect.width}px`
      tag.style.top = `${(-clip[1] * 0.5 + 0.5) * rect.height}px`
      namesEl.append(tag)
    }
  }

  function draw(now) {
    const forced = spec?.cycle === 'day' ? 0.18 : spec?.cycle === 'night' ? 0.82 : spec?.cycle === 'dusk' ? 0.55 : null
    const cycle = skyCycle(world.biome, forced === null ? skyPhase(now) : forced)
    state.sky = cycle.hex
    const dir = lookVector()
    if (!state.gl) {
      drawFlat(cycle)
      return
    }
    renderer.render({
      now,
      eye: { x: pos.x, y: pos.y + EYE, z: pos.z },
      dir,
      cycle,
      remotes,
      spots,
      picked
    })
    drawNames()
  }

  function drawFlat(cycle) {
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const w = canvas.width || canvas.clientWidth || 2
    const h = canvas.height || canvas.clientHeight || 2
    if (canvas.width !== w) canvas.width = w
    if (canvas.height !== h) canvas.height = h
    ctx.fillStyle = cycle?.hex || skyHex(world.biome)
    ctx.fillRect(0, 0, w, h)
  }

  let last = performance.now()
  let moveAcc = 0
  let raf = 0
  function frame(now) {
    if (stopped) return
    const dt = Math.min(0.05, (now - last) / 1000 || 0)
    last = now
    step(dt)
    checkSparks()
    moveAcc += dt
    if (moveAcc > 0.1) {
      moveAcc = 0
      send({ t: 'move', x: pos.x, y: pos.y, z: pos.z, yaw, pitch })
    }
    draw(now)
    raf = requestAnimationFrame(frame)
  }
  connect()
  raf = requestAnimationFrame(frame)
  if (offline || !slug) state.ready = true

  return {
    destroy() {
      stopped = true
      cancelAnimationFrame(raf)
      ac.abort()
      try { socket?.close() } catch { /* already closed */ }
      renderer.dispose()
      try { audioCtx?.close() } catch { /* already closed */ }
      field.classList.remove('world-on')
      field.replaceChildren()
      if (window.__blocks === state) delete window.__blocks
    }
  }
}
