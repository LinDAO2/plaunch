import { BLOCKS, HOTBAR, blockHex, blockOf, blockRgb, isSolid } from '/blocks/blocks.js'
import { goalProgress, lookYaw, skyCycle, skyPhase, sparkHit, sparkSpots } from '/blocks/goals.js'
import { meshRegion } from '/blocks/mesh.js'
import { blockAt, skyHex, spawnPoint, worldFromSpec } from '/blocks/terrain.js'

const EYE = 1.62
const HINT = 'Click or drag to look. WASD moves, space jumps. Left click breaks. Right click or E places. Walk over the yellow sparks.'
const TOUCH_HINT = 'Drag the right side to look. The left stick moves. Tap to break. Walk over the yellow sparks.'

function skyRgb(hex) {
  const n = Number.parseInt(String(hex).slice(1), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

function multiply(out, a, b) {
  const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3]
  const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7]
  const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11]
  const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15]
  let b0 = b[0], b1 = b[1], b2 = b[2], b3 = b[3]
  out[0] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30
  out[1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31
  out[2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32
  out[3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33
  b0 = b[4]; b1 = b[5]; b2 = b[6]; b3 = b[7]
  out[4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30
  out[5] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31
  out[6] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32
  out[7] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33
  b0 = b[8]; b1 = b[9]; b2 = b[10]; b3 = b[11]
  out[8] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30
  out[9] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31
  out[10] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32
  out[11] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33
  b0 = b[12]; b1 = b[13]; b2 = b[14]; b3 = b[15]
  out[12] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30
  out[13] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31
  out[14] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32
  out[15] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33
  return out
}

function perspective(out, fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2)
  out.fill(0)
  out[0] = f / aspect
  out[5] = f
  out[10] = (far + near) / (near - far)
  out[11] = -1
  out[14] = (2 * far * near) / (near - far)
  return out
}

function lookAt(out, eye, center, up) {
  let z0 = eye[0] - center[0]
  let z1 = eye[1] - center[1]
  let z2 = eye[2] - center[2]
  let len = Math.hypot(z0, z1, z2) || 1
  z0 /= len; z1 /= len; z2 /= len
  let x0 = up[1] * z2 - up[2] * z1
  let x1 = up[2] * z0 - up[0] * z2
  let x2 = up[0] * z1 - up[1] * z0
  len = Math.hypot(x0, x1, x2)
  if (!len) { x0 = 0; x1 = 0; x2 = 0 } else { x0 /= len; x1 /= len; x2 /= len }
  let y0 = z1 * x2 - z2 * x1
  let y1 = z2 * x0 - z0 * x2
  let y2 = z0 * x1 - z1 * x0
  len = Math.hypot(y0, y1, y2)
  if (!len) { y0 = 0; y1 = 0; y2 = 0 } else { y0 /= len; y1 /= len; y2 /= len }
  out[0] = x0; out[1] = y0; out[2] = z0; out[3] = 0
  out[4] = x1; out[5] = y1; out[6] = z1; out[7] = 0
  out[8] = x2; out[9] = y2; out[10] = z2; out[11] = 0
  out[12] = -(x0 * eye[0] + x1 * eye[1] + x2 * eye[2])
  out[13] = -(y0 * eye[0] + y1 * eye[1] + y2 * eye[2])
  out[14] = -(z0 * eye[0] + z1 * eye[1] + z2 * eye[2])
  out[15] = 1
  return out
}

function compile(gl, type, source) {
  const shader = gl.createShader(type)
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new Error(log || 'shader')
  }
  return shader
}

function paintTile(ctx, id, color, texture) {
  const x0 = id * 16
  ctx.fillStyle = color
  ctx.fillRect(x0, 0, 16, 16)
  if (texture === 'stripe') {
    ctx.fillStyle = 'rgba(0,0,0,0.22)'
    for (let y = 2; y < 16; y += 4) ctx.fillRect(x0, y, 16, 1)
    return
  }
  if (texture === 'brick') {
    ctx.strokeStyle = 'rgba(0,0,0,0.28)'
    ctx.strokeRect(x0 + 0.5, 0.5, 7, 7)
    ctx.strokeRect(x0 + 8.5, 8.5, 7, 7)
    return
  }
  if (texture === 'dots') {
    ctx.fillStyle = 'rgba(255,255,255,0.4)'
    for (let i = 0; i < 6; i++) ctx.fillRect(x0 + (i * 5) % 13 + 1, (i * 7) % 13 + 1, 2, 2)
    return
  }
  if (texture === 'solid') return
  for (let i = 0; i < 48; i++) {
    const n = Math.imul(id * 131 + i * 17, 2246822519) >>> 0
    const dark = (n >>> 16) % 3 === 0
    ctx.fillStyle = dark ? 'rgba(0,0,0,0.22)' : 'rgba(255,255,255,0.16)'
    ctx.fillRect(x0 + (n % 16), (n >>> 8) % 16, 1, 1)
  }
}

function makeAtlas(blockSet) {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 16
  const ctx = canvas.getContext('2d')
  const overrides = new Map()
  for (const block of blockSet || []) {
    const found = BLOCKS.find((item) => item.name.toLowerCase() === String(block.name || '').toLowerCase())
    if (found) overrides.set(found.id, block)
  }
  for (let id = 0; id <= 12; id++) {
    const custom = overrides.get(id)
    const [r, g, b] = custom?.color ? hexToRgb(custom.color) : blockRgb(id)
    paintTile(ctx, id, `rgb(${r},${g},${b})`, custom?.texture || 'speckle')
  }
  return canvas
}

function hexToRgb(hex) {
  const n = Number.parseInt(String(hex).replace('#', ''), 16)
  if (!Number.isFinite(n)) return [128, 128, 128]
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function packMesh(mesh, rgbOf) {
  const verts = mesh.count * 3
  const data = new Float32Array(verts * 9)
  for (let i = 0; i < verts; i++) {
    const o = i * 9
    const c = rgbOf ? rgbOf(i) : null
    data[o] = mesh.positions[i * 3]
    data[o + 1] = mesh.positions[i * 3 + 1]
    data[o + 2] = mesh.positions[i * 3 + 2]
    const shade = mesh.colors[i * 3]
    if (c) {
      data[o + 3] = (c[0] / 255) * shade
      data[o + 4] = (c[1] / 255) * shade
      data[o + 5] = (c[2] / 255) * shade
    } else {
      data[o + 3] = shade
      data[o + 4] = shade
      data[o + 5] = shade
    }
    data[o + 6] = mesh.uvs[i * 2]
    data[o + 7] = mesh.uvs[i * 2 + 1]
    data[o + 8] = mesh.tiles[i]
  }
  return { data, count: verts }
}

function pushBox(target, x, y, z, w, h, d, rgb) {
  const sample = (sx, sy, sz) => (sx === 0 && sy === 0 && sz === 0 ? 1 : 0)
  const mesh = meshRegion(sample, 0, 0, 0, 1, 1, 1)
  const scale = [w, h, d]
  for (let i = 0; i < mesh.positions.length; i += 3) {
    target.positions.push(x + mesh.positions[i] * scale[0], y + mesh.positions[i + 1] * scale[1], z + mesh.positions[i + 2] * scale[2])
    const shade = mesh.colors[i]
    target.colors.push((rgb[0] / 255) * shade, (rgb[1] / 255) * shade, (rgb[2] / 255) * shade)
    target.uvs.push(0, 0)
    target.tiles.push(0)
  }
  target.count += mesh.count
}

export function mountWorld({ spec, slug, field, offline = false, onStats } = {}) {
  const world = worldFromSpec(spec || {})
  const edits = new Map()
  const spots = sparkSpots(world)
  const picked = new Set()
  const pending = new Set()
  const coarse = window.matchMedia('(pointer: coarse)').matches
  const far = coarse ? 42 : 78
  const fogNear = coarse ? 14 : 28
  const fogFar = coarse ? 40 : 70
  const spawn = spawnPoint(world, edits)
  const pos = { x: spawn.x, y: spawn.y, z: spawn.z }
  let yaw = lookYaw(world, pos.x, pos.z)
  let pitch = -0.22
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
    <p class="world-mood" id="world-mood"></p>
    <p class="world-hint" id="world-hint"></p>
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
  const hintEl = ui.querySelector('#world-hint')
  const goalEl = ui.querySelector('#world-goal')
  const goalTitle = ui.querySelector('#world-goal-title')
  const goalSub = ui.querySelector('#world-goal-sub')
  const goalFill = ui.querySelector('#world-goal-fill')
  const namesEl = ui.querySelector('#world-names')
  const hotbar = ui.querySelector('#world-hotbar')
  const stickEl = ui.querySelector('#world-stick')
  const knob = stickEl.querySelector('i')
  hintEl.textContent = coarse ? TOUCH_HINT : HINT
  const moodEl = ui.querySelector('#world-mood')
  const npc = spec?.npcs?.[0]
  const moodBits = [spec?.music ? `${spec.music} mood` : '', npc ? `${npc.name}: ${npc.flavor}` : ''].filter(Boolean)
  moodEl.textContent = moodBits.join(' · ')
  moodEl.hidden = moodBits.length === 0
  setTimeout(() => { hintEl.hidden = true }, 6500)

  let audioCtx = null
  let skyProgram = null
  let skyBuf = null
  const skyLoc = {}
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

  const buttons = HOTBAR.map((id, index) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.style.background = blockHex(id)
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

  const gl = canvas.getContext('webgl', {
    alpha: false,
    antialias: false,
    depth: true,
    stencil: false,
    preserveDrawingBuffer: true,
    powerPreference: 'high-performance'
  })
  state.gl = Boolean(gl)
  let program = null
  let atlas = null
  const chunks = new Map()
  let avatarBuf = null
  let avatarCount = 0
  let sparkBuf = null
  let sparkCount = 0
  let moteBuf = null
  let moteCount = 0
  let moteAt = 0
  const motes = Array.from({ length: 14 }, (_, index) => ({
    x: spawn.x + ((index % 7) - 3) * 0.7,
    y: spawn.y + 1.2 + (index % 4) * 0.35,
    z: spawn.z + (index % 5) * 0.4 - 0.8,
    vy: 0.25 + (index % 3) * 0.08
  }))
  const proj = new Float32Array(16)
  const view = new Float32Array(16)
  const mvp = new Float32Array(16)
  const loc = {}

  if (gl) {
    try {
    const vs = compile(gl, gl.VERTEX_SHADER, `
      attribute vec3 aPos;
      attribute vec3 aColor;
      attribute vec2 aUv;
      attribute float aTile;
      uniform mat4 uMvp;
      uniform vec3 uCam;
      uniform float uBob;
      varying vec3 vColor;
      varying vec2 vUv;
      varying float vFog;
      varying float vTile;
      void main() {
        gl_Position = uMvp * vec4(aPos.x, aPos.y + uBob, aPos.z, 1.0);
        vColor = aColor;
        vUv = vec2((aTile + aUv.x) / 16.0, aUv.y);
        vTile = aTile;
        vec3 d = aPos - uCam;
        vFog = length(d);
      }`)
    const fs = compile(gl, gl.FRAGMENT_SHADER, `
      precision mediump float;
      uniform sampler2D uAtlas;
      uniform vec3 uSky;
      uniform float uFogNear;
      uniform float uFogFar;
      uniform float uTex;
      uniform float uLight;
      uniform float uTime;
      varying vec3 vColor;
      varying vec2 vUv;
      varying float vFog;
      varying float vTile;
      void main() {
        vec3 tex = texture2D(uAtlas, vUv).rgb;
        float shimmer = 0.0;
        if (vTile > 4.5 && vTile < 5.5) shimmer = sin(vUv.y * 36.0 + uTime * 2.2) * 0.08;
        vec3 albedo = mix(vColor, tex * vColor, uTex) * (uLight + shimmer);
        float fog = clamp((vFog - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
        gl_FragColor = vec4(mix(albedo, uSky, fog), 1.0);
      }`)
    program = gl.createProgram()
    gl.attachShader(program, vs)
    gl.attachShader(program, fs)
    gl.bindAttribLocation(program, 0, 'aPos')
    gl.bindAttribLocation(program, 1, 'aColor')
    gl.bindAttribLocation(program, 2, 'aUv')
    gl.bindAttribLocation(program, 3, 'aTile')
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || 'link')
    gl.useProgram(program)
    loc.mvp = gl.getUniformLocation(program, 'uMvp')
    loc.cam = gl.getUniformLocation(program, 'uCam')
    loc.sky = gl.getUniformLocation(program, 'uSky')
    loc.near = gl.getUniformLocation(program, 'uFogNear')
    loc.far = gl.getUniformLocation(program, 'uFogFar')
    loc.tex = gl.getUniformLocation(program, 'uTex')
    loc.light = gl.getUniformLocation(program, 'uLight')
    loc.bob = gl.getUniformLocation(program, 'uBob')
    loc.time = gl.getUniformLocation(program, 'uTime')
    atlas = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, atlas)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, makeAtlas(spec?.blockSet))
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.enable(gl.DEPTH_TEST)
    gl.disable(gl.CULL_FACE)
    const skyVs = compile(gl, gl.VERTEX_SHADER, `
      attribute vec2 aPos;
      void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`)
    const skyFs = compile(gl, gl.FRAGMENT_SHADER, `
      precision mediump float;
      uniform vec3 uZenith;
      uniform vec3 uHorizon;
      uniform float uHeight;
      void main() {
        float t = clamp(gl_FragCoord.y / max(uHeight, 1.0), 0.0, 1.0);
        gl_FragColor = vec4(mix(uHorizon, uZenith, t), 1.0);
      }`)
    skyProgram = gl.createProgram()
    gl.attachShader(skyProgram, skyVs)
    gl.attachShader(skyProgram, skyFs)
    gl.bindAttribLocation(skyProgram, 0, 'aPos')
    gl.linkProgram(skyProgram)
    if (!gl.getProgramParameter(skyProgram, gl.LINK_STATUS)) {
      skyProgram = null
    } else {
      skyLoc.zenith = gl.getUniformLocation(skyProgram, 'uZenith')
      skyLoc.horizon = gl.getUniformLocation(skyProgram, 'uHorizon')
      skyLoc.height = gl.getUniformLocation(skyProgram, 'uHeight')
      skyBuf = gl.createBuffer()
      gl.bindBuffer(gl.ARRAY_BUFFER, skyBuf)
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    }
    for (let i = 0; i < 4; i++) gl.enableVertexAttribArray(i)
    buildAll()
    } catch (error) {
      state.note = error.message || 'webgl'
      state.gl = false
    }
  }

  function upload(mesh, colored) {
    const packed = packMesh(mesh, colored)
    if (!packed.count) return null
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, packed.data, gl.STATIC_DRAW)
    return { buf, count: packed.count }
  }

  function chunkKey(x, z) {
    return `${Math.floor(x / 16)},${Math.floor(z / 16)}`
  }

  function remeshKey(key) {
    if (!state.gl) return
    const [cx, cz] = key.split(',').map(Number)
    const prev = chunks.get(key)
    if (prev) gl.deleteBuffer(prev.buf)
    const mesh = meshRegion(sample, cx * 16, 0, cz * 16, Math.min(world.size, cx * 16 + 16), world.height, Math.min(world.size, cz * 16 + 16))
    const next = mesh.count ? upload(mesh) : null
    if (next) chunks.set(key, next)
    else chunks.delete(key)
  }

  function buildAll() {
    const n = Math.ceil(world.size / 16)
    for (let cz = 0; cz < n; cz++) {
      for (let cx = 0; cx < n; cx++) remeshKey(`${cx},${cz}`)
    }
  }

  function remeshAt(x, z) {
    const keys = new Set([chunkKey(x, z)])
    if (x % 16 === 0) keys.add(chunkKey(x - 1, z))
    if (x % 16 === 15) keys.add(chunkKey(x + 1, z))
    if (z % 16 === 0) keys.add(chunkKey(x, z - 1))
    if (z % 16 === 15) keys.add(chunkKey(x, z + 1))
    for (const key of keys) {
      const [cx, cz] = key.split(',').map(Number)
      if (cx < 0 || cz < 0 || cx * 16 >= world.size || cz * 16 >= world.size) continue
      remeshKey(key)
    }
  }

  function applyEdit(x, y, z, block) {
    edits.set(`${x},${y},${z}`, block)
    remeshAt(x, z)
    state.lastEdit = { x, y, z, block }
    state.editCount += 1
    if (state.ready) cue(block ? 'place' : 'break')
    paintGoal()
  }

  function bind(buf) {
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    const stride = 36
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0)
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 12)
    gl.vertexAttribPointer(2, 2, gl.FLOAT, false, stride, 24)
    gl.vertexAttribPointer(3, 1, gl.FLOAT, false, stride, 32)
  }

  function resize() {
    const rect = canvas.getBoundingClientRect()
    const dpr = Math.min(coarse ? 1.25 : 1.75, window.devicePixelRatio || 1)
    const w = Math.max(2, Math.round(rect.width * dpr))
    const h = Math.max(2, Math.round(rect.height * dpr))
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
    }
    if (gl) gl.viewport(0, 0, canvas.width, canvas.height)
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
          yaw = msg.spawn.yaw || 0
          pitch = msg.spawn.pitch ?? -0.28
        }
        edits.clear()
        const loaded = msg.edits || []
        for (const [x, y, z, block] of loaded) edits.set(`${x},${y},${z}`, block)
        state.editCount = loaded.length
        const last = loaded[loaded.length - 1]
        state.lastEdit = last ? { x: last[0], y: last[1], z: last[2], block: last[3] } : null
        if (gl) buildAll()
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
        if (gl) buildAll()
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
    if (!live) {
      yaw += dt * 0.35
      return
    }
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

  function drawNames() {
    namesEl.replaceChildren()
    if (!gl) return
    const rect = canvas.getBoundingClientRect()
    for (const player of remotes.values()) {
      const clip = project(player.x, player.y + 2.05, player.z)
      if (!clip) continue
      const tag = document.createElement('span')
      tag.className = 'world-tag'
      tag.textContent = player.name
      tag.style.left = `${(clip[0] * 0.5 + 0.5) * rect.width}px`
      tag.style.top = `${(-clip[1] * 0.5 + 0.5) * rect.height}px`
      namesEl.append(tag)
    }
  }

  function project(x, y, z) {
    const px = mvp[0] * x + mvp[4] * y + mvp[8] * z + mvp[12]
    const py = mvp[1] * x + mvp[5] * y + mvp[9] * z + mvp[13]
    const pz = mvp[2] * x + mvp[6] * y + mvp[10] * z + mvp[14]
    const pw = mvp[3] * x + mvp[7] * y + mvp[11] * z + mvp[15]
    if (pw <= 0.05) return null
    return [px / pw, py / pw, pz / pw]
  }

  function drawAvatars() {
    if (!remotes.size) {
      avatarCount = 0
      return
    }
    const bag = { positions: [], colors: [], uvs: [], tiles: [], count: 0 }
    for (const player of remotes.values()) {
      const rgb = hexRgb(player.color || '#e6ff3a')
      pushBox(bag, player.x - 0.28, player.y, player.z - 0.18, 0.56, 1.05, 0.36, rgb)
      pushBox(bag, player.x - 0.22, player.y + 1.05, player.z - 0.16, 0.44, 0.4, 0.32, rgb)
    }
    const packed = packMesh(bag, (i) => {
      const o = i * 3
      return [bag.colors[o] * 255, bag.colors[o + 1] * 255, bag.colors[o + 2] * 255]
    })
    // packMesh multiplies shade again. Avatars already store shaded rgb in colors,
    // and packMesh treats colors[i*3] as shade. Rebuild manually.
    const verts = bag.positions.length / 3
    const data = new Float32Array(verts * 9)
    for (let i = 0; i < verts; i++) {
      const o = i * 9
      data[o] = bag.positions[i * 3]
      data[o + 1] = bag.positions[i * 3 + 1]
      data[o + 2] = bag.positions[i * 3 + 2]
      data[o + 3] = bag.colors[i * 3]
      data[o + 4] = bag.colors[i * 3 + 1]
      data[o + 5] = bag.colors[i * 3 + 2]
      data[o + 6] = 0
      data[o + 7] = 0
      data[o + 8] = 0
    }
    if (!avatarBuf) avatarBuf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, avatarBuf)
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW)
    avatarCount = verts
    void packed
  }

  function hexRgb(hex) {
    const n = Number.parseInt(String(hex).replace('#', ''), 16)
    if (!Number.isFinite(n)) return [230, 255, 58]
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  }

  function rebuildSparks() {
    if (!gl) return
    const bag = { positions: [], colors: [], uvs: [], tiles: [], count: 0 }
    const rgb = [230, 255, 58]
    for (const spot of spots) {
      if (picked.has(spot.id)) continue
      pushBox(bag, spot.x - 0.18, spot.y - 0.18, spot.z - 0.18, 0.36, 0.36, 0.36, rgb)
    }
    if (!bag.positions.length) {
      sparkCount = 0
      sparkDirty = false
      return
    }
    const verts = bag.positions.length / 3
    const data = new Float32Array(verts * 9)
    for (let i = 0; i < verts; i++) {
      const o = i * 9
      data[o] = bag.positions[i * 3]
      data[o + 1] = bag.positions[i * 3 + 1]
      data[o + 2] = bag.positions[i * 3 + 2]
      data[o + 3] = bag.colors[i * 3]
      data[o + 4] = bag.colors[i * 3 + 1]
      data[o + 5] = bag.colors[i * 3 + 2]
      data[o + 6] = 0
      data[o + 7] = 0
      data[o + 8] = 0
    }
    if (!sparkBuf) sparkBuf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, sparkBuf)
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW)
    sparkCount = verts
    sparkDirty = false
  }

  function checkSparks() {
    const solo = offline || !slug
    const live = socket && socket.readyState === 1
    if (!solo && !live) return
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

  function draw(now) {
    resize()
    const forced = spec?.cycle === 'day' ? 0.18 : spec?.cycle === 'night' ? 0.82 : spec?.cycle === 'dusk' ? 0.55 : null
    const cycle = skyCycle(world.biome, forced === null ? skyPhase(now) : forced)
    state.sky = cycle.hex
    if (!state.gl) {
      drawFlat(cycle)
      return
    }
    const sky = [cycle.r / 255, cycle.g / 255, cycle.b / 255]
    if (skyProgram && skyBuf) {
      const lift = (sky[0] + sky[1] + sky[2]) / 3
      const wash = lift > 0.35 ? 0.55 : 0.22
      const horizon = sky.map((channel) => Math.min(1, channel * (1 - wash) + wash))
      gl.disable(gl.DEPTH_TEST)
      gl.useProgram(skyProgram)
      gl.uniform3f(skyLoc.zenith, sky[0], sky[1], sky[2])
      gl.uniform3f(skyLoc.horizon, horizon[0], horizon[1], horizon[2])
      gl.uniform1f(skyLoc.height, canvas.height)
      gl.bindBuffer(gl.ARRAY_BUFFER, skyBuf)
      gl.enableVertexAttribArray(0)
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
      gl.disableVertexAttribArray(1)
      gl.disableVertexAttribArray(2)
      gl.disableVertexAttribArray(3)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      gl.enableVertexAttribArray(1)
      gl.enableVertexAttribArray(2)
      gl.enableVertexAttribArray(3)
      gl.enable(gl.DEPTH_TEST)
      gl.clear(gl.DEPTH_BUFFER_BIT)
    } else {
      gl.clearColor(sky[0], sky[1], sky[2], 1)
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
    }
    const aspect = canvas.width / Math.max(1, canvas.height)
    perspective(proj, 1.15, aspect, 0.08, far)
    const eye = [pos.x, pos.y + EYE, pos.z]
    const dir = lookVector()
    lookAt(view, eye, [eye[0] + dir.x, eye[1] + dir.y, eye[2] + dir.z], [0, 1, 0])
    multiply(mvp, proj, view)
    gl.useProgram(program)
    gl.uniformMatrix4fv(loc.mvp, false, mvp)
    gl.uniform3f(loc.cam, eye[0], eye[1], eye[2])
    gl.uniform3f(loc.sky, sky[0], sky[1], sky[2])
    gl.uniform1f(loc.near, fogNear)
    gl.uniform1f(loc.far, fogFar)
    gl.uniform1f(loc.light, cycle.light)
    gl.uniform1f(loc.time, now / 1000)
    gl.uniform1f(loc.bob, 0)
    gl.uniform1f(loc.tex, 1)
    for (const chunk of chunks.values()) {
      bind(chunk.buf)
      gl.drawArrays(gl.TRIANGLES, 0, chunk.count)
    }
    if (remotes.size) {
      drawAvatars()
      gl.uniform1f(loc.tex, 0)
      gl.uniform1f(loc.bob, 0)
      bind(avatarBuf)
      gl.drawArrays(gl.TRIANGLES, 0, avatarCount)
    }
    if (sparkDirty) rebuildSparks()
    if (sparkCount && sparkBuf) {
      gl.uniform1f(loc.tex, 0)
      gl.uniform1f(loc.light, 1)
      gl.uniform1f(loc.bob, Math.sin(now / 420) * 0.12)
      bind(sparkBuf)
      gl.drawArrays(gl.TRIANGLES, 0, sparkCount)
    }
    if (now - moteAt > 90) {
      moteAt = now
      rebuildMotes()
    }
    if (moteCount && moteBuf) {
      gl.uniform1f(loc.tex, 0)
      gl.uniform1f(loc.light, 1.15)
      gl.uniform1f(loc.bob, 0)
      bind(moteBuf)
      gl.drawArrays(gl.TRIANGLES, 0, moteCount)
    }
    drawNames()
  }

  function rebuildMotes() {
    if (!gl) return
    const bag = { positions: [], colors: [], uvs: [], tiles: [], count: 0 }
    for (const mote of motes) {
      mote.y += mote.vy * 0.08
      if (mote.y > pos.y + 4) mote.y = pos.y + 0.4
      mote.x += Math.sin(mote.y * 3) * 0.01
      pushBox(bag, mote.x, mote.y, mote.z, 0.08, 0.08, 0.08, [255, 236, 160])
    }
    const verts = bag.positions.length / 3
    const data = new Float32Array(verts * 9)
    for (let i = 0; i < verts; i++) {
      const o = i * 9
      data[o] = bag.positions[i * 3]
      data[o + 1] = bag.positions[i * 3 + 1]
      data[o + 2] = bag.positions[i * 3 + 2]
      data[o + 3] = bag.colors[i * 3]
      data[o + 4] = bag.colors[i * 3 + 1]
      data[o + 5] = bag.colors[i * 3 + 2]
      data[o + 6] = 0
      data[o + 7] = 0
      data[o + 8] = 0
    }
    if (!moteBuf) moteBuf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, moteBuf)
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW)
    moteCount = verts
  }

  function drawFlat(cycle) {
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const w = canvas.width
    const h = canvas.height
    const skyPaint = cycle?.hex || skyHex(world.biome)
    ctx.fillStyle = skyPaint
    ctx.fillRect(0, 0, w, h * 0.62)
    ctx.fillStyle = skyPaint
    ctx.globalAlpha = 0.72
    ctx.fillRect(0, h * 0.62, w, h * 0.38)
    ctx.globalAlpha = 1
    const scale = Math.min(w, h) / 22
    const ox = w / 2
    const oy = h * 0.72
    const cells = []
    const x0 = Math.floor(pos.x) - 8
    const z0 = Math.floor(pos.z) - 8
    for (let z = z0; z < z0 + 16; z++) {
      for (let x = x0; x < x0 + 16; x++) {
        let top = 0
        let id = 0
        for (let y = Math.min(world.height - 1, Math.floor(pos.y) + 6); y >= 0; y--) {
          const block = sample(x, y, z)
          if (block) { top = y; id = block; break }
        }
        if (id) cells.push({ x, z, y: top, color: blockHex(id) })
      }
    }
    cells.sort((a, b) => (a.x + a.z) - (b.x + b.z) || a.y - b.y)
    for (const cell of cells) {
      const sx = ox + (cell.x - cell.z) * scale * 0.5
      const sy = oy + (cell.x + cell.z - cell.y) * scale * 0.25 - (pos.x + pos.z) * scale * 0.25
      ctx.fillStyle = cell.color
      ctx.fillRect(sx, sy, scale * 0.48, scale * 0.28)
    }
    ctx.fillStyle = '#e6ff3a'
    for (const spot of spots) {
      if (picked.has(spot.id)) continue
      const sx = ox + (spot.x - spot.z) * scale * 0.5
      const sy = oy + (spot.x + spot.z - spot.y) * scale * 0.25 - (pos.x + pos.z) * scale * 0.25
      ctx.fillRect(sx, sy, scale * 0.22, scale * 0.22)
    }
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
      if (gl) {
        for (const chunk of chunks.values()) gl.deleteBuffer(chunk.buf)
        if (avatarBuf) gl.deleteBuffer(avatarBuf)
        if (sparkBuf) gl.deleteBuffer(sparkBuf)
      }
      try { audioCtx?.close() } catch { /* already closed */ }
      field.classList.remove('world-on')
      field.replaceChildren()
      if (window.__blocks === state) delete window.__blocks
    }
  }
}
