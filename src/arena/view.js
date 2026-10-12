const coarse = matchMedia('(pointer: coarse)').matches || innerWidth < 820
const lowStart = CONFIG.quality === 1 || (CONFIG.quality === 0 && (coarse || (navigator.hardwareConcurrency || 8) <= 4))
let pixelRatio = Math.min(window.devicePixelRatio || 1, lowStart ? 1 : 1.5)
let qualityName = lowStart ? 'low' : 'high'
const framed = window.parent !== window

const canvas = document.querySelector('#view')
const mini = document.querySelector('#mini')
const miniCtx = mini.getContext('2d')
const title = document.querySelector('#title')
const timerEl = document.querySelector('#timer')
const feedEl = document.querySelector('#feed')
const hpEl = document.querySelector('#hp')
const ammoEl = document.querySelector('#ammo')
const pointsEl = document.querySelector('#points')
const overEl = document.querySelector('#over')
const qualityBtn = document.querySelector('#quality')
title.textContent = THEME.names.title || 'Arena'
document.body.classList.toggle('touch', coarse)
document.body.style.background = THEME.palette.bg || '#07081a'

const held = Object.create(null)
const pointer = { down: false, look: false, lx: 0, ly: 0, ox: 0, oy: 0 }
const stick = { mx: 0, mz: 0, yaw: 0, pitch: 0 }
let fireHeld = false
let jumpEdge = false
let yaw = 0
let pitch = 0
let seq = 1
let travel = 0
let lastX = 0
let lastZ = 0
let havePos = false
let fps = 0
let frames = 0
let fpsAt = 0
let slow = 0
const scripted = { on: false, mx: 0, mz: 0, yaw: null, pitch: null, fire: 0 }
let aimLock = false

const theme = normalizeTheme(THEME)
const config = normalizeConfig(CONFIG)
const local = createMatch({ theme: THEME, config: CONFIG, seed: 7 })
local.scorer = function (mode, kind) {
  try {
    const custom = RULES.scoreKill(mode, kind)
    if (Number.isInteger(custom) && custom >= 0 && custom <= 1000) return custom
  } catch (err) {}
  return defaultScore(mode, kind)
}
const youLocal = addHuman(local, 'You')
yaw = youLocal.yaw
let authority = framed ? 'wait' : 'local'
let waitLeft = 2.2
let netActors = null
let netSnap = null
let shownScore = -1
const samples = new Map()

const skyHex = {
  day: THEME.palette.sky || '#9fd4ff',
  dusk: THEME.palette.sky || '#1a2744',
  night: THEME.palette.sky || '#070814',
  neon: THEME.palette.sky || '#1a0824'
}
const accent = THEME.palette.accent || '#3ee0ff'
const floorColor = THEME.palette.floor || '#12182c'
const wallColor = THEME.palette.wall || '#2c3a55'
const ink = THEME.palette.ink || '#e7fbff'

let renderer = null
let scene = null
let camera = null
let glOk = false
const meshes = new Map()
const bolts = []
let boltGeo = null
let boltMat = null
const clock = (typeof THREE !== 'undefined' && THREE.Clock) ? new THREE.Clock() : { getDelta: () => 0.016, elapsed: 0 }

function bootGL() {
  if (typeof THREE === 'undefined') return
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: qualityName === 'high',
      alpha: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true
    })
  } catch (err) {
    renderer = null
  }
  if (!renderer || !renderer.getContext()) return
  glOk = true
  if (THREE.SRGBColorSpace) renderer.outputColorSpace = THREE.SRGBColorSpace
  scene = new THREE.Scene()
  scene.background = new THREE.Color(skyHex[theme.sky] || skyHex.dusk)
  scene.fog = new THREE.Fog(scene.background, theme.sky === 'night' ? 14 : 22, theme.sky === 'day' ? 70 : 52)
  camera = new THREE.PerspectiveCamera(theme.mode === 'race' ? 78 : 72, 1, 0.08, 90)
  scene.add(camera)
  const skyLight = theme.sky === 'day' ? 0xfff2dd : theme.sky === 'neon' ? 0xff4fd8 : 0xbfd4ff
  const groundLight = theme.sky === 'neon' ? 0x102040 : 0x1a2030
  scene.add(new THREE.HemisphereLight(skyLight, groundLight, theme.sky === 'night' ? 0.7 : 1.15))
  if (qualityName === 'high') {
    const sun = new THREE.DirectionalLight(0xffffff, theme.sky === 'night' ? 0.35 : 0.8)
    sun.position.set(14, 22, 8)
    scene.add(sun)
  }
  buildLevel()
  buildGun()
  resize()
}

function mat(color) {
  return new THREE.MeshLambertMaterial({ color })
}

function addBox(w, h, d, color, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color))
  mesh.position.set(x, y, z)
  scene.add(mesh)
  return mesh
}

function buildLevel() {
  const map = local.map
  if (theme.mode === 'explore') {
    const water = new THREE.Mesh(new THREE.CircleGeometry(42, 28), mat('#14324a'))
    water.rotation.x = -Math.PI / 2
    water.position.y = -0.55
    scene.add(water)
    const isle = new THREE.Mesh(new THREE.CylinderGeometry(map.radius, map.radius + 0.6, 1.1, qualityName === 'high' ? 28 : 16), mat(floorColor))
    isle.position.y = -0.55
    scene.add(isle)
  } else {
    addBox(theme.mode === 'race' ? 34 : 40, 0.6, theme.mode === 'race' ? 34 : 40, floorColor, 0, -0.3, 0)
    const stripe = theme.mode === 'race' ? '#ffb020' : accent
    for (let i = -3; i <= 3; i++) addBox(0.08, 0.04, 28, stripe, i * 4, 0.02, 0)
  }
  for (const wall of map.walls) addBox(wall.w, wall.h, wall.d, wallColor, wall.x, wall.h / 2, wall.z)
  for (const gate of map.checks) {
    addBox(0.25, 2.2, 0.25, accent, gate.x - gate.w / 2, 1.1, gate.z)
    addBox(0.25, 2.2, 0.25, accent, gate.x + gate.w / 2, 1.1, gate.z)
    addBox(gate.w, 0.16, 0.16, accent, gate.x, 2.15, gate.z)
  }
  boltGeo = new THREE.BoxGeometry(0.06, 0.06, theme.weapon === 'laser' ? 1.4 : 0.7)
  boltMat = new THREE.MeshBasicMaterial({ color: accent })
}

function buildGun() {
  if (theme.weapon === 'none') {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.06, 0.08), mat(ink))
    bar.position.set(0, -0.22, -0.45)
    camera.add(bar)
    return
  }
  const gun = new THREE.Group()
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.1, 0.22), mat('#d7e2ea'))
  body.position.set(0.22, -0.18, -0.32)
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial({ color: accent }))
  core.position.set(0.22, -0.16, -0.48)
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.08), mat(accent))
  fin.position.set(0.22, -0.26, -0.28)
  gun.add(body, core, fin)
  camera.add(gun)
}

function resize() {
  const w = innerWidth
  const h = innerHeight
  if (!renderer) return
  renderer.setPixelRatio(pixelRatio)
  renderer.setSize(w, h, false)
  camera.aspect = w / Math.max(1, h)
  camera.updateProjectionMatrix()
}

function actorMesh(actor) {
  let group = meshes.get(actor.id)
  if (group) return group
  group = new THREE.Group()
  const color = actor.color || accent
  if (actor.kind === 'buoy') {
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), mat(color))
    ball.position.y = 0.7
    group.add(ball)
  } else if (theme.mode === 'race') {
    const shell = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.28, 1.15), mat(color))
    shell.position.y = 0.32
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.22, 0.4), mat(ink))
    cabin.position.set(0, 0.52, -0.05)
    group.add(shell, cabin)
  } else {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.36, 1.05, 6), mat(color))
    body.position.y = 0.62
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 6), mat(ink))
    head.position.y = 1.32
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.08), mat(accent))
    visor.position.set(0, 1.34, 0.2)
    group.add(body, head, visor)
  }
  scene.add(group)
  meshes.set(actor.id, group)
  return group
}

function spawnBolt(tracer) {
  if (!glOk) return
  const mesh = new THREE.Mesh(boltGeo, boltMat)
  const dx = Math.sin(tracer.yaw) * Math.cos(tracer.pitch)
  const dy = Math.sin(tracer.pitch)
  const dz = Math.cos(tracer.yaw) * Math.cos(tracer.pitch)
  mesh.position.set(tracer.x + dx * 1.2, tracer.y + dy * 1.2, tracer.z + dz * 1.2)
  mesh.lookAt(tracer.x + dx * 4, tracer.y + dy * 4, tracer.z + dz * 4)
  scene.add(mesh)
  bolts.push({ mesh, life: 0.1 })
}

function sampleActors(list, now) {
  const seen = new Set()
  const out = []
  for (const actor of list) {
    seen.add(actor.id)
    let sample = samples.get(actor.id)
    if (!sample) {
      sample = { from: actor, to: actor, at: now }
      samples.set(actor.id, sample)
    } else if (sample.to !== actor && (sample.to.x !== actor.x || sample.to.z !== actor.z || sample.to.yaw !== actor.yaw)) {
      sample.from = sample.to
      sample.to = actor
      sample.at = now
    }
    const u = authority === 'remote' ? Math.min(1, (now - sample.at) / 50) : 1
    const mix = (a, b) => a + (b - a) * u
    let dyaw = sample.to.yaw - sample.from.yaw
    if (dyaw > Math.PI) dyaw -= Math.PI * 2
    if (dyaw < -Math.PI) dyaw += Math.PI * 2
    out.push({
      ...actor,
      x: mix(sample.from.x, sample.to.x),
      y: mix(sample.from.y, sample.to.y),
      z: mix(sample.from.z, sample.to.z),
      yaw: sample.from.yaw + dyaw * u
    })
  }
  for (const id of [...samples.keys()]) if (!seen.has(id)) samples.delete(id)
  return out
}

function drawMini(you, actors) {
  const s = mini.width
  miniCtx.clearRect(0, 0, s, s)
  miniCtx.fillStyle = 'rgba(6, 10, 18, 0.72)'
  miniCtx.fillRect(0, 0, s, s)
  miniCtx.save()
  miniCtx.translate(s / 2, s / 2)
  const scale = theme.mode === 'explore' ? 3.1 : theme.mode === 'race' ? 3.2 : 2.8
  miniCtx.rotate(-(you ? you.yaw : 0))
  miniCtx.fillStyle = wallColor
  for (const wall of local.map.walls) {
    const x = (wall.x - (you ? you.x : 0)) * scale
    const z = (wall.z - (you ? you.z : 0)) * scale
    miniCtx.fillRect(x - wall.w * scale / 2, z - wall.d * scale / 2, Math.max(2, wall.w * scale), Math.max(2, wall.d * scale))
  }
  for (const actor of actors) {
    if (!actor.alive) continue
    miniCtx.fillStyle = actor.id === (you && you.id) ? '#ffffff' : (actor.color || accent)
    const x = (actor.x - (you ? you.x : 0)) * scale
    const z = (actor.z - (you ? you.z : 0)) * scale
    miniCtx.fillRect(x - 2, z - 2, 4, 4)
  }
  miniCtx.restore()
}

function drawFlat(you, actors) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const w = canvas.width
  const h = canvas.height
  ctx.fillStyle = skyHex[theme.sky] || '#10131c'
  ctx.fillRect(0, 0, w, h)
  ctx.save()
  ctx.translate(w / 2, h / 2)
  const scale = 8
  ctx.fillStyle = floorColor
  ctx.fillRect(-160, -160, 320, 320)
  ctx.fillStyle = wallColor
  for (const wall of local.map.walls) {
    ctx.fillRect((wall.x - wall.w / 2) * scale, (wall.z - wall.d / 2) * scale, wall.w * scale, wall.d * scale)
  }
  for (const actor of actors) {
    if (!actor.alive) continue
    ctx.fillStyle = actor.color || accent
    ctx.fillRect(actor.x * scale - 5, actor.z * scale - 5, 10, 10)
  }
  ctx.restore()
}

function award(score) {
  const n = Math.max(0, Math.min(100000, Math.floor(Number(score) || 0)))
  if (authority === 'wait') return
  if (n < (window.__state.score || 0) && !local.over && !(netSnap && netSnap.over)) return
  window.__state.score = n
  window.__posted = true
  try { parent.postMessage({ type: 'playground-score', points: n }, '*') } catch (err) {}
}

function tone(freq) {
  try {
    const ctx = tone.ctx || (tone.ctx = new (window.AudioContext || window.webkitAudioContext)())
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.frequency.value = freq
    osc.type = 'square'
    osc.connect(gain)
    gain.connect(ctx.destination)
    gain.gain.setValueAtTime(0.03, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.07)
    osc.start()
    osc.stop(ctx.currentTime + 0.08)
  } catch (err) {}
}

function trackNearest() {
  const actors = authority === 'remote' && netActors ? netActors : local.actors
  const self = currentYou(actors)
  let best = null
  let bestD = Infinity
  for (const actor of actors) {
    if (!self || actor.id === self.id || !actor.alive) continue
    if (actor.kind === 'buoy' && theme.mode !== 'explore') continue
    const dist = Math.hypot(actor.x - self.x, actor.z - self.z)
    if (dist < bestD) {
      best = actor
      bestD = dist
    }
  }
  if (!best || !self) return false
  scripted.on = true
  scripted.yaw = Math.atan2(best.x - self.x, best.z - self.z)
  scripted.pitch = 0
  scripted.fire = 1
  scripted.mx = 0
  scripted.mz = 0
  yaw = scripted.yaw
  pitch = 0
  return true
}

function readKeys() {
  let mx = 0
  let mz = 0
  if (held.KeyA || held.ArrowLeft) mx -= 1
  if (held.KeyD || held.ArrowRight) mx += 1
  if (held.KeyW || held.ArrowUp) mz += 1
  if (held.KeyS || held.ArrowDown) mz -= 1
  mx += stick.mx
  mz += stick.mz
  if (scripted.on) {
    mx = scripted.mx
    mz = scripted.mz
    if (scripted.yaw !== null) yaw = scripted.yaw
    if (scripted.pitch !== null) pitch = scripted.pitch
  }
  const len = Math.hypot(mx, mz)
  if (len > 1) {
    mx /= len
    mz /= len
  }
  return {
    mx,
    mz,
    yaw,
    pitch,
    fire: (fireHeld || (scripted.on && scripted.fire)) ? 1 : 0,
    jump: jumpEdge ? 1 : 0
  }
}

function applyLocalInput(input) {
  youLocal.yaw = input.yaw
  youLocal.pitch = input.pitch
  youLocal.input.mx = input.mx
  youLocal.input.mz = input.mz
  youLocal.input.fire = input.fire === 1
  youLocal.input.jump = input.jump === 1
}

function currentYou(actors) {
  if (authority === 'remote' && netSnap) return actors.find((actor) => actor.id === netSnap.you) || actors[0]
  return actors.find((actor) => actor.id === youLocal.id) || youLocal
}

function paint(actors, you, left, feed, over) {
  const drawn = sampleActors(actors, performance.now())
  const self = drawn.find((actor) => actor.id === (you && you.id)) || drawn[0]
  if (glOk && self) {
    const eye = theme.mode === 'race' ? 1.15 : 1.5
    const bob = theme.mode === 'race' ? 0 : self.y
    const dx = Math.sin(self.yaw) * Math.cos(self.pitch)
    const dy = Math.sin(self.pitch)
    const dz = Math.cos(self.yaw) * Math.cos(self.pitch)
    camera.position.set(self.x, bob + eye, self.z)
    camera.lookAt(self.x + dx, bob + eye + dy, self.z + dz)
    const aliveIds = new Set()
    for (const actor of drawn) {
      if (!actor.alive || actor.id === self.id) {
        const hidden = meshes.get(actor.id)
        if (hidden) hidden.visible = false
        continue
      }
      aliveIds.add(actor.id)
      const mesh = actorMesh(actor)
      mesh.visible = true
      mesh.position.set(actor.x, actor.y || 0, actor.z)
      mesh.rotation.y = actor.yaw
    }
    for (const [id, mesh] of meshes) if (!aliveIds.has(id)) mesh.visible = false
    renderer.render(scene, camera)
  } else if (!glOk) {
    drawFlat(self, drawn)
  }
  drawMini(self, drawn)
  const hp = self ? self.hp : 100
  const ammo = self ? self.ammo : 0
  hpEl.style.setProperty('--p', `${Math.max(0, Math.min(100, hp))}%`)
  hpEl.dataset.hp = String(Math.max(0, hp | 0))
  ammoEl.textContent = theme.weapon === 'none' ? (theme.mode === 'race' ? 'BOOST' : 'WALK') : `${ammo}`
  const score = self ? self.score : 0
  pointsEl.textContent = String(score | 0)
  timerEl.textContent = over ? 'END' : `${left | 0}s`
  if (self && self.it) title.textContent = 'You are it'
  else title.textContent = THEME.names.title || 'Arena'
  feedEl.textContent = (feed || []).map((item) => item.text).slice(-3).join('  ·  ')
  overEl.hidden = !over
  if (over) overEl.textContent = `${THEME.names.over || 'Round over'} · ${score | 0}`
  if (score !== shownScore) {
    if (score > shownScore && shownScore >= 0) tone(score > shownScore ? 640 : 180)
    shownScore = score
    award(score)
  }
  if (self) {
    if (havePos) travel += Math.hypot(self.x - lastX, self.z - lastZ)
    lastX = self.x
    lastZ = self.z
    havePos = true
  }
}

function onNet(payload) {
  if (!payload || typeof payload !== 'object') return
  if (payload.t === 'bye') {
    if (authority === 'wait') authority = 'local'
    return
  }
  if (payload.t === 'reject') return
  if (payload.t === 'welcome') {
    authority = 'remote'
    netSnap = payload.snap
    if (payload.snap) netActors = payload.snap.actors
    yaw = (payload.snap?.actors || []).find((actor) => actor.id === payload.id)?.yaw || yaw
    return
  }
  if (payload.t === 'snap') {
    authority = 'remote'
    netSnap = payload
    netActors = payload.actors
    for (const tracer of payload.tracers || []) spawnBolt(tracer)
  }
}

function loop(now) {
  requestAnimationFrame(loop)
  const dt = Math.min(0.05, clock.getDelta ? clock.getDelta() : 0.016)
  frames += 1
  if (!fpsAt) fpsAt = now
  if (now - fpsAt > 500) {
    fps = Math.round(frames * 1000 / (now - fpsAt))
    frames = 0
    fpsAt = now
    if (fps && fps < 30 && pixelRatio > 0.75) {
      slow += 1
      if (slow >= 3) {
        pixelRatio = Math.max(0.75, pixelRatio * 0.8)
        qualityName = 'low'
        if (renderer) renderer.setPixelRatio(pixelRatio)
        qualityBtn.textContent = 'Low'
        slow = 0
      }
    } else slow = 0
  }
  if (aimLock) trackNearest()
  const input = readKeys()
  jumpEdge = false
  yaw += stick.yaw
  pitch = Math.max(-1.05, Math.min(1.05, pitch + stick.pitch))
  stick.yaw = 0
  stick.pitch = 0
  input.yaw = yaw
  input.pitch = pitch
  if (framed) {
    try {
      parent.postMessage({
        type: 'playground-arena-input',
        seq: seq++,
        yaw: input.yaw,
        pitch: input.pitch,
        mx: input.mx,
        mz: input.mz,
        fire: input.fire,
        jump: input.jump
      }, '*')
    } catch (err) {}
  }
  for (let i = bolts.length - 1; i >= 0; i--) {
    bolts[i].life -= dt
    if (bolts[i].life <= 0) {
      scene.remove(bolts[i].mesh)
      bolts.splice(i, 1)
    }
  }
  if (authority === 'remote' && netActors) {
    const you = currentYou(netActors)
    paint(netActors, you, netSnap.left, netSnap.feed, netSnap.over === 1)
    if (netSnap.over === 1) award(you ? you.score : 0)
    return
  }
  if (authority === 'wait') {
    waitLeft -= dt
    if (waitLeft <= 0) authority = 'local'
  }
  if (authority === 'local') {
    applyLocalInput(input)
    const before = youLocal.score
    stepMatch(local, dt)
    for (const tracer of local.tracers) spawnBolt(tracer)
    local.tracers = []
    if (youLocal.score > before) tone(720)
    yaw = youLocal.yaw
  }
  const snap = authority === 'local' ? local : local
  const you = currentYou(snap.actors)
  paint(snap.actors, you, Math.max(0, Math.ceil(config.seconds - snap.elapsed)), snap.feed, snap.over)
  if (snap.over) award(you ? you.score : 0)
}

function bindStick(el, look) {
  const knob = el.querySelector('i')
  const set = (clientX, clientY) => {
    const rect = el.getBoundingClientRect()
    const dx = clientX - (rect.left + rect.width / 2)
    const dy = clientY - (rect.top + rect.height / 2)
    const max = rect.width * 0.38
    const dist = Math.hypot(dx, dy) || 1
    const scale = Math.min(1, max / dist)
    knob.style.transform = `translate(${dx * scale}px, ${dy * scale}px)`
    if (look) {
      stick.yaw = (dx / max) * 0.07
      stick.pitch = (dy / max) * 0.04
    } else {
      stick.mx = Math.max(-1, Math.min(1, dx / max))
      stick.mz = Math.max(-1, Math.min(1, -dy / max))
    }
  }
  const end = () => {
    knob.style.transform = 'translate(0, 0)'
    if (look) {
      stick.yaw = 0
      stick.pitch = 0
    } else {
      stick.mx = 0
      stick.mz = 0
    }
  }
  el.addEventListener('pointerdown', (event) => {
    el.setPointerCapture(event.pointerId)
    set(event.clientX, event.clientY)
  })
  el.addEventListener('pointermove', (event) => {
    if (!el.hasPointerCapture(event.pointerId)) return
    set(event.clientX, event.clientY)
  })
  el.addEventListener('pointerup', end)
  el.addEventListener('pointercancel', end)
}

addEventListener('keydown', (event) => {
  held[event.code] = true
  if (event.code === 'Space') jumpEdge = true
  window.__state.input += 1
})
addEventListener('keyup', (event) => { held[event.code] = false })
canvas.addEventListener('pointerdown', (event) => {
  pointer.down = true
  pointer.lx = event.clientX
  pointer.ly = event.clientY
  fireHeld = !coarse
  if (!coarse && canvas.requestPointerLock) {
    const lock = canvas.requestPointerLock()
    if (lock && lock.catch) lock.catch(() => {})
  }
})
addEventListener('pointerup', () => {
  pointer.down = false
  if (!coarse) fireHeld = false
})
addEventListener('mousemove', (event) => {
  if (document.pointerLockElement === canvas) {
    yaw += event.movementX * 0.0022
    pitch = Math.max(-1.05, Math.min(1.05, pitch - event.movementY * 0.002))
    return
  }
  if (!pointer.down || coarse) return
  yaw += (event.clientX - pointer.lx) * 0.005
  pitch = Math.max(-1.05, Math.min(1.05, pitch - (event.clientY - pointer.ly) * 0.004))
  pointer.lx = event.clientX
  pointer.ly = event.clientY
})
document.querySelector('#fire').addEventListener('pointerdown', (event) => {
  event.preventDefault()
  fireHeld = true
})
document.querySelector('#fire').addEventListener('pointerup', () => { fireHeld = false })
document.querySelector('#fire').addEventListener('pointerleave', () => { fireHeld = false })
qualityBtn.addEventListener('click', () => {
  if (qualityName === 'high') {
    qualityName = 'low'
    pixelRatio = 1
    qualityBtn.textContent = 'Low'
  } else {
    qualityName = 'high'
    pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5)
    qualityBtn.textContent = 'High'
  }
  if (renderer) renderer.setPixelRatio(pixelRatio)
})
bindStick(document.querySelector('#move'), false)
bindStick(document.querySelector('#look'), true)
addEventListener('resize', resize)
addEventListener('message', (event) => {
  if (event.source !== parent) return
  const data = event.data
  if (!data || data.type !== 'playground-arena-state') return
  onNet(data.payload)
})

window.__state.phase = 'play'
window.__arena = {
    get fps() { return fps },
    get gl() { return glOk },
  get quality() { return qualityName },
  get ratio() { return pixelRatio },
  moved() { return travel },
  push(partial) {
    scripted.on = true
    if (partial.mx !== undefined) scripted.mx = partial.mx
    if (partial.mz !== undefined) scripted.mz = partial.mz
    if (partial.yaw !== undefined) scripted.yaw = partial.yaw
    if (partial.pitch !== undefined) scripted.pitch = partial.pitch
    if (partial.fire !== undefined) scripted.fire = partial.fire ? 1 : 0
    window.__state.input += 1
  },
  lookAtNearest() {
    aimLock = true
    return trackNearest()
  }
}

bootGL()
if (!glOk) {
  canvas.width = Math.max(2, innerWidth)
  canvas.height = Math.max(2, innerHeight)
}
if (framed) {
  try { parent.postMessage({ type: 'playground-arena-hello' }, '*') } catch (err) {}
}
requestAnimationFrame(loop)
