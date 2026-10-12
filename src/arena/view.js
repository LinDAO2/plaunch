const coarse = matchMedia('(pointer: coarse)').matches
const narrow = innerWidth < 700
const framed = window.parent !== window
const theme = normalizeTheme(THEME)
const config = normalizeConfig(CONFIG)
const titleText = THEME.names.title || 'Arena'
const accent = THEME.palette.accent || '#3ee0ff'
const ink = THEME.palette.ink || '#e7fbff'

function pickQuality() {
  if (config.quality === 1) return 'low'
  if (config.quality === 2) return 'high'
  if (coarse || (narrow && framed)) return 'low'
  return 'medium'
}

let qualityName = pickQuality()
let pixelRatio = qualityName === 'high' ? Math.min(window.devicePixelRatio || 1, 1.5) : 1
const canvas = document.querySelector('#view')
const mini = document.querySelector('#mini')
const miniCtx = mini.getContext('2d')
const timerEl = document.querySelector('#timer')
const ptsEl = document.querySelector('#pts')
const feedEl = document.querySelector('#feed')
const hpEl = document.querySelector('#hp')
const ammoEl = document.querySelector('#ammo')
const ammoNum = ammoEl.querySelector('b')
const ammoLabel = ammoEl.querySelector('small')
const overEl = document.querySelector('#over')
const deathEl = document.querySelector('#death')
const killEl = document.querySelector('#kill')
const hurtEl = document.querySelector('#hurt')
const hitEl = document.querySelector('#hit')
const qualityBtn = document.querySelector('#quality')
const bootEl = document.querySelector('#boot')
const startEl = document.querySelector('#start')
const bootBar = document.querySelector('#boot-bar')
const floatsEl = document.querySelector('#floats')
document.querySelector('#boot-title').textContent = titleText
document.querySelector('#start-title').textContent = titleText
document.querySelector('#start-hint').textContent = THEME.names.hint || ''
document.querySelector('#nameplate').textContent = titleText
document.body.classList.toggle('touch', coarse || innerWidth < 700)
document.body.style.background = THEME.palette.bg || '#07081a'

const held = Object.create(null)
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
let playing = false
let assetsReady = false
let animT = 0
let recoil = 0
let shake = 0
let flashLeft = 0
let footT = 0
let prevAmmo = -1
let feedKey = ''
const scripted = { on: false, mx: 0, mz: 0, yaw: null, pitch: null, fire: 0 }
let aimLock = false
const prevHp = new Map()
const shooting = new Map()
const floats = []
const samples = new Map()
const proj = new THREE_SAFE_VEC()

function THREE_SAFE_VEC() {
  return (typeof THREE !== 'undefined') ? new THREE.Vector3() : { set() { return this }, project() { return this }, x: 0, y: 0, z: 0 }
}

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
let lastRender = 0

const SKY_GRADE = {
  day: { exp: 1.05, near: 28, far: 80, stars: 0, sunI: 1.3, sunY: 280, sunR: 40 },
  dusk: { exp: 1.08, near: 18, far: 62, stars: 0, sunI: 1.1, sunY: 340, sunR: 46 },
  night: { exp: 1.2, near: 16, far: 52, stars: 40, sunI: 0.75, sunY: 140, sunR: 20 },
  neon: { exp: 1.1, near: 14, far: 50, stars: 20, sunI: 1, sunY: 240, sunR: 26 }
}
const grade = SKY_GRADE[theme.sky] || SKY_GRADE.dusk
const sky = {
  zenith: THEME.palette.bg || '#10141c',
  mid: THEME.palette.sky || '#1a2744',
  horizon: accent,
  fog: THEME.palette.sky || '#1a2744',
  sun: ink,
  glow: 'rgba(255,255,255,.4)',
  hemi: THEME.palette.sky || accent,
  ground: THEME.palette.floor || '#1a2030',
  light: ink,
  ...grade
}

let renderer = null
let scene = null
let camera = null
let composer = null
let bloomOn = false
let hemi = null
let sun = null
let glOk = false
let gun = null
let flare = null
let flashLight = null
const models = Object.create(null)
const meshes = new Map()
const bolts = []
const sparks = []
const decals = []
let beaconMeshes = []
let flagMeshes = []
let sparkGeo = null
let decalGeo = null
let streakGeo = null
const clock = (typeof THREE !== 'undefined' && THREE.Clock) ? new THREE.Clock() : { getDelta: () => 0.016 }

function mulberry32(seed) {
  let a = seed >>> 0
  return function () {
    a = (a + 0x6D2B79F5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rnd = mulberry32(theme.mode === 'race' ? 3 : theme.mode === 'explore' ? 5 : 11)

function setBar(p) {
  bootBar.style.width = `${Math.max(4, Math.round(p * 100))}%`
}

function qualityLabel() {
  qualityBtn.textContent = qualityName === 'low' ? 'Low' : qualityName === 'high' ? 'High' : 'Med'
}

function packFiles() {
  if (theme.mode === 'race') return ['car.glb', 'barrier.glb', 'road.glb', 'tree.glb', 'pebble.glb']
  if (theme.mode === 'explore') return ['blaster.glb', 'bolt.glb', 'astronaut.glb', 'alien.glb', 'palm.glb', 'tree.glb', 'bush.glb', 'flower.glb', 'pebble.glb', 'grass.glb', 'beacon.glb']
  return ['blaster.glb', 'bolt.glb', 'astronaut.glb', 'alien.glb', 'wall.glb', 'barrel.glb', 'crate.glb', 'rock.glb', 'dish.glb']
}

function tune(root) {
  root.traverse((obj) => {
    if (!obj.isMesh) return
    obj.castShadow = qualityName !== 'low'
    obj.receiveShadow = true
    const list = Array.isArray(obj.material) ? obj.material : [obj.material]
    const next = []
    for (const material of list) {
      if (!material) {
        next.push(material)
        continue
      }
      if (qualityName === 'low') {
        const simple = new THREE.MeshLambertMaterial({
          color: material.color || '#ffffff',
          map: material.map || null,
          emissive: material.emissive,
          emissiveMap: material.emissiveMap || null,
          emissiveIntensity: material.emissiveIntensity || 0,
          transparent: !!material.transparent,
          opacity: material.opacity === undefined ? 1 : material.opacity,
          side: THREE.FrontSide
        })
        next.push(simple)
        continue
      }
      if (material.metalness > 0.2) material.metalness = 0.08
      if (material.roughness !== undefined && material.roughness > 0.8) material.roughness = 0.58
      material.envMapIntensity = 0.45
      material.side = THREE.FrontSide
      next.push(material)
    }
    if (next.length) obj.material = Array.isArray(obj.material) ? next : next[0]
  })
}

function prepare(gltf) {
  const root = gltf.scene
  tune(root)
  const box = new THREE.Box3().setFromObject(root)
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  root.position.sub(center)
  root.position.y += size.y / 2
  const wrap = new THREE.Group()
  wrap.add(root)
  wrap.userData.size = { x: size.x, y: size.y, z: size.z }
  return wrap
}

function take(name) {
  const src = models[name]
  if (!src) return null
  const clone = src.clone(true)
  clone.userData.size = src.userData.size
  const parts = Object.create(null)
  clone.traverse((obj) => {
    if (obj.name) parts[obj.name] = obj
  })
  clone.userData.parts = parts
  const base = Object.create(null)
  for (const key of ['armLeft', 'armRight', 'legLeft', 'legRight', 'head']) {
    if (parts[key]) base[key] = parts[key].rotation.x
  }
  clone.userData.base = base
  return clone
}

function lit(color, emissive, intensity) {
  if (qualityName === 'low') {
    return new THREE.MeshLambertMaterial({ color, emissive: emissive || '#000000', emissiveIntensity: intensity || 0 })
  }
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.62,
    metalness: 0.04,
    emissive: emissive || '#000000',
    emissiveIntensity: intensity || 0
  })
}

function skyCanvas() {
  const c = document.createElement('canvas')
  c.width = 1024
  c.height = 512
  const g = c.getContext('2d')
  const grad = g.createLinearGradient(0, 0, 0, 512)
  grad.addColorStop(0, sky.zenith)
  grad.addColorStop(0.52, sky.mid)
  grad.addColorStop(1, sky.horizon)
  g.fillStyle = grad
  g.fillRect(0, 0, 1024, 512)
  const glow = g.createRadialGradient(720, sky.sunY, 8, 720, sky.sunY, 200)
  glow.addColorStop(0, sky.glow)
  glow.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = glow
  g.fillRect(0, 0, 1024, 512)
  g.fillStyle = sky.sun
  g.beginPath()
  g.arc(720, sky.sunY, sky.sunR, 0, Math.PI * 2)
  g.fill()
  for (let i = 0; i < sky.stars; i++) {
    const x = Math.floor(rnd() * 1024)
    const y = Math.floor(rnd() * 230)
    g.fillStyle = `rgba(255,255,255,${0.35 + rnd() * 0.6})`
    g.fillRect(x, y, i % 5 === 0 ? 2 : 1, i % 5 === 0 ? 2 : 1)
  }
  const tex = new THREE.CanvasTexture(c)
  if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function floorCanvas(mode) {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 512
  const g = c.getContext('2d')
  const base = THEME.palette.floor || '#243044'
  g.fillStyle = base
  g.fillRect(0, 0, 512, 512)
  for (let i = 0; i < 900; i++) {
    const shade = rnd() > 0.5 ? 255 : 0
    g.fillStyle = `rgba(${shade},${shade},${shade},${0.025 + rnd() * 0.04})`
    g.fillRect(Math.floor(rnd() * 512), Math.floor(rnd() * 512), 3, 3)
  }
  if (mode !== 'explore') {
    g.strokeStyle = accent
    g.globalAlpha = 0.45
    g.lineWidth = 2
    for (let i = 0; i <= 512; i += 64) {
      g.beginPath()
      g.moveTo(i, 0)
      g.lineTo(i, 512)
      g.stroke()
      g.beginPath()
      g.moveTo(0, i)
      g.lineTo(512, i)
      g.stroke()
    }
    g.globalAlpha = 1
  }
  const vignette = g.createRadialGradient(256, 256, 40, 256, 256, 360)
  vignette.addColorStop(0, 'rgba(0,0,0,0)')
  vignette.addColorStop(1, 'rgba(0,0,0,0.42)')
  g.fillStyle = vignette
  g.fillRect(0, 0, 512, 512)
  const tex = new THREE.CanvasTexture(c)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(mode === 'explore' ? 4 : 8, mode === 'explore' ? 4 : 8)
  if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function markNoShadow(obj) {
  obj.userData.noShadow = true
  obj.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = false
      child.userData.noShadow = true
    }
  })
}

function applyQuality() {
  if (!renderer) return
  pixelRatio = qualityName === 'high' ? Math.min(window.devicePixelRatio || 1, 1.5) : 1
  renderer.setPixelRatio(pixelRatio)
  renderer.shadowMap.enabled = qualityName !== 'low'
  const shadows = qualityName !== 'low'
  if (sun) {
    sun.castShadow = shadows
    const size = qualityName === 'high' ? 2048 : 1024
    sun.shadow.mapSize.set(size, size)
  }
  if (scene) {
    scene.traverse((obj) => {
      if (!obj.isMesh) return
      obj.castShadow = shadows && !obj.userData.noShadow
      const list = Array.isArray(obj.material) ? obj.material : [obj.material]
      for (const material of list) if (material) material.needsUpdate = true
    })
  }
  bloomOn = qualityName !== 'low' && !!composer
  qualityLabel()
  resize()
}

function bootGL() {
  if (typeof THREE === 'undefined') return
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: qualityName !== 'low',
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
  if (THREE.ACESFilmicToneMapping !== undefined) renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = sky.exp
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  scene = new THREE.Scene()
  scene.fog = new THREE.Fog(sky.fog, sky.near, sky.far)
  camera = new THREE.PerspectiveCamera(theme.mode === 'race' ? 74 : 72, 1, 0.08, 120)
  scene.add(camera)
  const dome = new THREE.Mesh(new THREE.SphereGeometry(96, qualityName === 'low' ? 20 : 28, 16), new THREE.MeshBasicMaterial({ map: skyCanvas(), side: THREE.BackSide, fog: false, depthWrite: false }))
  markNoShadow(dome)
  scene.add(dome)
  hemi = new THREE.HemisphereLight(sky.hemi, sky.ground, theme.sky === 'night' ? 1.05 : 1.2)
  scene.add(hemi)
  sun = new THREE.DirectionalLight(sky.light, sky.sunI)
  sun.position.set(16, 28, 10)
  sun.shadow.camera.near = 2
  sun.shadow.camera.far = 70
  sun.shadow.camera.left = -26
  sun.shadow.camera.right = 26
  sun.shadow.camera.top = 26
  sun.shadow.camera.bottom = -26
  sun.shadow.bias = -0.00035
  sun.shadow.normalBias = 0.04
  scene.add(sun)
  const fill = new THREE.DirectionalLight(sky.hemi, 0.38)
  fill.position.set(-14, 10, -12)
  scene.add(fill)
  if (qualityName !== 'low') {
    try {
      const pmrem = new THREE.PMREMGenerator(renderer)
      scene.environment = pmrem.fromScene(new THREE.RoomEnvironment(), 0.04).texture
      pmrem.dispose()
    } catch (err) {}
    try {
      composer = new THREE.EffectComposer(renderer)
      composer.addPass(new THREE.RenderPass(scene, camera))
      composer.addPass(new THREE.UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.38, 0.42, 0.84))
      composer.addPass(new THREE.OutputPass())
    } catch (err) {
      composer = null
    }
  }
  sparkGeo = new THREE.BoxGeometry(0.06, 0.06, 0.06)
  decalGeo = new THREE.CircleGeometry(0.22, 10)
  streakGeo = new THREE.BoxGeometry(0.045, 0.045, 1.3)
  applyQuality()
}

function loadPack() {
  const files = packFiles()
  const loader = new THREE.GLTFLoader()
  let done = 0
  return Promise.all(files.map((file) => new Promise((resolve) => {
    loader.load('/assets/' + file, (gltf) => {
      models[file.replace('.glb', '')] = prepare(gltf)
      done += 1
      setBar(done / files.length)
      resolve()
    }, (event) => {
      if (event && event.total) setBar((done + event.loaded / event.total) / files.length)
    }, () => {
      done += 1
      setBar(done / files.length)
      resolve()
    })
  })))
}

function addTrim(w, h, d, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), lit(accent, accent, theme.sky === 'day' ? 0.45 : 1.15))
  mesh.position.set(x, y, z)
  markNoShadow(mesh)
  scene.add(mesh)
  return mesh
}

function placeFitted(name, x, y, z, height, rotY) {
  const mesh = take(name)
  if (!mesh) return null
  const size = mesh.userData.size || { y: 1 }
  mesh.scale.setScalar(height / (size.y || 1))
  mesh.position.set(x, y, z)
  if (rotY) mesh.rotation.y = rotY
  scene.add(mesh)
  return mesh
}

function buildFloor(mode) {
  const geo = mode === 'explore'
    ? new THREE.CylinderGeometry(local.map.radius, local.map.radius + 0.8, 1.15, qualityName === 'low' ? 20 : 32)
    : new THREE.BoxGeometry(mode === 'race' ? 42 : 46, 0.5, mode === 'race' ? 42 : 46)
  const floorMap = floorCanvas(mode)
  const floorMat = qualityName === 'low'
    ? new THREE.MeshLambertMaterial({ map: floorMap })
    : new THREE.MeshStandardMaterial({ map: floorMap, roughness: 0.92, metalness: 0.02 })
  const mesh = new THREE.Mesh(geo, floorMat)
  mesh.position.y = mode === 'explore' ? -0.15 : -0.25
  mesh.receiveShadow = true
  mesh.userData.noShadow = true
  scene.add(mesh)
  if (mode === 'explore') {
    const water = new THREE.Mesh(new THREE.CircleGeometry(46, 28), lit(THEME.palette.sky || accent, THEME.palette.bg || '#000000', 0.2))
    water.rotation.x = -Math.PI / 2
    water.position.y = -0.85
    markNoShadow(water)
    scene.add(water)
  }
}

function buildWalls() {
  const src = models.wall
  if (!src) return
  for (const wall of local.map.walls) {
    const alongX = wall.w >= wall.d
    const length = alongX ? wall.w : wall.d
    const thick = Math.max(0.35, alongX ? wall.d : wall.w)
    const seg = qualityName === 'low' ? length : 2
    const count = Math.max(1, Math.round(length / seg))
    const size = src.userData.size
    for (let i = 0; i < count; i++) {
      const piece = src.clone(true)
      piece.scale.set(thick / size.x, wall.h / size.y, (length / count) / size.z)
      const offset = -length / 2 + (i + 0.5) * (length / count)
      if (alongX) {
        piece.rotation.y = Math.PI / 2
        piece.position.set(wall.x + offset, 0, wall.z)
      } else piece.position.set(wall.x, 0, wall.z + offset)
      scene.add(piece)
    }
    addTrim(alongX ? wall.w : 0.08, 0.07, alongX ? 0.08 : wall.d, wall.x, wall.h + 0.02, wall.z)
  }
}

function clearLane(x, z) {
  return Math.abs(x) < 1.55 && z <= -4 && z >= -13
}

function decorateArena() {
  buildWalls()
  const props = [
    ['crate', 0, 0, 1.15, 0.4],
    ['barrel', -7, -7, 0.85, 0.2],
    ['barrel', 7, -6, 0.85, 1.1],
    ['rock', -6, 7, 1.1, 0.6],
    ['rock', 8, 7, 1.3, 0.3],
    ['crate', -8, -3, 1.05, 1.2],
    ['dish', 12, 12, 2.2, 0.5],
    ['dish', -12, 11, 2.2, 2.2],
    ['barrel', 13, -12, 0.9, 0.8],
    ['rock', -13, 4, 1.2, 1]
  ]
  for (const [name, x, z, height, rot] of props) {
    if (clearLane(x, z)) continue
    placeFitted(name, x, 0, z, height, rot)
  }
  addTrim(8, 0.035, 0.06, 0, 0.04, -9)
  addTrim(0.06, 0.035, 8, -9, 0.04, 0)
}

function decorateRace() {
  const road = models.road
  if (road) {
    const size = road.userData.size
    for (let i = -6; i <= 6; i++) {
      for (const [x, z, rot] of [[i * 2, 11, 0], [i * 2, -11, 0], [11, i * 2, Math.PI / 2], [-11, i * 2, Math.PI / 2]]) {
        const tile = road.clone(true)
        tile.scale.set(2.05 / size.x, 1, 2.05 / size.z)
        tile.rotation.y = rot
        tile.position.set(x, 0.03, z)
        markNoShadow(tile)
        tile.traverse((obj) => { if (obj.isMesh) obj.receiveShadow = true })
        scene.add(tile)
      }
    }
  }
  for (let i = -4; i <= 4; i++) {
    placeFitted('barrier', i * 1.7, 0, 3.2, 0.7, 0)
    placeFitted('barrier', i * 1.7, 0, -3.2, 0.7, Math.PI)
    placeFitted('barrier', 6.2, 0, i * 1.4, 0.7, Math.PI / 2)
    placeFitted('barrier', -6.2, 0, i * 1.4, 0.7, -Math.PI / 2)
  }
  const trees = [[15, 15], [-15, 15], [15, -15], [-15, -15], [0, 15.5], [0, -15.5], [15.5, 0], [-15.5, 0]]
  for (const [x, z] of trees) placeFitted(rnd() > 0.5 ? 'tree' : 'pebble', x, 0, z, rnd() > 0.5 ? 3.2 : 1.1, rnd() * 6)
  for (const gate of local.map.checks) {
    const wide = gate.w >= gate.d
    addTrim(wide ? gate.w : 0.16, 0.12, wide ? 0.16 : gate.d, gate.x, 2.3, gate.z)
    addTrim(0.16, 2.2, 0.16, gate.x - (wide ? gate.w : 0) / 2, 1.1, gate.z - (wide ? 0 : gate.d) / 2)
    addTrim(0.16, 2.2, 0.16, gate.x + (wide ? gate.w : 0) / 2, 1.1, gate.z + (wide ? 0 : gate.d) / 2)
  }
}

function decorateIsle() {
  const spots = [
    ['palm', -11, 6, 3.4], ['palm', 12, 7, 3.1], ['palm', 13, -3, 3.6], ['palm', -12, -8, 3.2],
    ['palm', 2, 13, 2.8], ['palm', -3, -12, 3.3], ['tree', 8, -9, 2.6], ['tree', -9, 10, 2.4],
    ['bush', -4, 4, 0.9], ['bush', 6, 2, 0.8], ['bush', -2, -5, 1], ['bush', 3, 8, 0.7],
    ['flower', 1, 4, 0.55], ['flower', -6, -1, 0.5], ['flower', 7, -2, 0.6], ['flower', 0, -7, 0.5],
    ['grass', 5, 6, 0.45], ['grass', -8, 2, 0.4], ['grass', 9, 1, 0.42], ['grass', -1, 9, 0.4],
    ['pebble', 4, -8, 0.7], ['pebble', -5, 8, 0.6]
  ]
  for (const [name, x, z, height] of spots) placeFitted(name, x, 0, z, height, rnd() * 6)
  for (const wall of local.map.walls) placeFitted('pebble', wall.x, 0, wall.z, Math.max(wall.h, 1.2), rnd() * 3)
  beaconMeshes = []
  for (const beacon of local.beacons) {
    const mesh = placeFitted('beacon', beacon.x, 0, beacon.z, 1.7, rnd() * 4)
    if (!mesh) continue
    mesh.traverse((obj) => {
      if (!obj.isMesh || !obj.material) return
      const list = Array.isArray(obj.material) ? obj.material : [obj.material]
      const next = list.map((material) => {
        const copy = material.clone()
        copy.emissive = new THREE.Color(accent)
        copy.emissiveIntensity = 0.9
        copy.metalness = 0
        return copy
      })
      obj.material = Array.isArray(obj.material) ? next : next[0]
    })
    beaconMeshes.push(mesh)
  }
}

function buildLevel() {
  buildFloor(theme.mode)
  if (theme.mode === 'race') decorateRace()
  else if (theme.mode === 'explore') decorateIsle()
  else decorateArena()
  if (theme.mode === 'ctf') {
    flagMeshes = local.flags.map((flag) => {
      const mesh = new THREE.Group()
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.8, 6), lit(ink))
      pole.position.y = 0.9
      const clothColor = flag.team === 0 ? accent : (THEME.palette.ink || accent)
      const cloth = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.32, 0.05), lit(clothColor, clothColor, 0.6))
      cloth.position.set(0.28, 1.45, 0)
      mesh.add(pole, cloth)
      mesh.position.set(flag.x, 0, flag.z)
      mesh.userData.team = flag.team
      scene.add(mesh)
      return mesh
    })
  }
  buildGun()
}

function buildGun() {
  if (theme.weapon === 'none' || theme.mode === 'race') return
  gun = take('blaster') || new THREE.Group()
  gun.scale.setScalar(1.25)
  gun.position.set(0.34, -0.26, -0.48)
  gun.rotation.y = Math.PI
  gun.userData.base = { x: gun.position.x, y: gun.position.y, z: gun.position.z, rx: gun.rotation.x }
  flare = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial({ color: ink }))
  flare.position.set(0, 0.08, 0.28)
  flare.visible = false
  flashLight = new THREE.PointLight(ink, 0, 4.5)
  flashLight.position.copy(flare.position)
  gun.add(flare, flashLight)
  markNoShadow(gun)
  camera.add(gun)
}

function makeTag(name, color) {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 64
  const g = c.getContext('2d')
  g.fillStyle = 'rgba(8,10,16,0.78)'
  g.fillRect(24, 10, 208, 44)
  g.strokeStyle = color
  g.lineWidth = 6
  g.strokeRect(24, 10, 208, 44)
  g.fillStyle = '#ffffff'
  g.font = '700 28px sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(String(name || '').slice(0, 12), 128, 34)
  const tex = new THREE.CanvasTexture(c)
  if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }))
  sprite.scale.set(1.7, 0.42, 1)
  sprite.userData.noShadow = true
  return sprite
}

function actorMesh(actor) {
  let rig = meshes.get(actor.id)
  if (rig) return rig
  rig = new THREE.Group()
  rig.rotation.order = 'YXZ'
  const tilt = new THREE.Group()
  rig.add(tilt)
  rig.userData.tilt = tilt
  rig.userData.death = 0
  if (actor.kind === 'buoy') {
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 10), lit(actor.color || accent, actor.color || accent, 0.7))
    ball.position.y = 0.7
    const rock = take('pebble')
    if (rock) {
      rock.scale.setScalar(0.8)
      tilt.add(rock)
    }
    tilt.add(ball)
  } else if (theme.mode === 'race') {
    const car = take('car') || new THREE.Group()
    car.scale.setScalar(1.65)
    tilt.add(car)
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.05, 0.18), lit(actor.color || accent, actor.color || accent, 0.8))
    stripe.position.set(0, 0.72, 0)
    tilt.add(stripe)
    rig.userData.parts = car.userData.parts || {}
    rig.userData.spin = rnd() * 3
    const tag = makeTag(actor.name, actor.color || accent)
    tag.position.y = 1.45
    rig.add(tag)
  } else {
    const useAlien = actor.bot && (String(actor.id).charCodeAt(String(actor.id).length - 1) % 2 === 0)
    const body = take(useAlien && models.alien ? 'alien' : 'astronaut') || new THREE.Group()
    const height = body.userData.size ? 1.7 / body.userData.size.y : 1
    body.scale.setScalar(height)
    tilt.add(body)
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.045, 6, 14), lit(actor.color || accent, actor.color || accent, 0.9))
    band.rotation.x = Math.PI / 2
    band.position.y = 1.05
    body.add(band)
    rig.userData.parts = body.userData.parts || {}
    rig.userData.base = body.userData.base || {}
    const tag = makeTag(actor.name, actor.color || accent)
    tag.position.y = 2.05
    rig.add(tag)
  }
  const blob = new THREE.Mesh(new THREE.CircleGeometry(0.46, 12), new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.28, depthWrite: false }))
  blob.rotation.x = -Math.PI / 2
  blob.position.y = 0.03
  markNoShadow(blob)
  rig.add(blob)
  scene.add(rig)
  meshes.set(actor.id, rig)
  return rig
}

function poseActor(rig, actor, moving, shooting, dt) {
  const tilt = rig.userData.tilt
  const parts = rig.userData.parts
  const base = rig.userData.base || {}
  if (!actor.alive) {
    rig.userData.death += dt
    if (tilt) tilt.rotation.x = Math.min(1.15, rig.userData.death * 2.2)
    if (tilt) tilt.position.y = -Math.min(0.45, rig.userData.death * 0.5)
    return
  }
  rig.userData.death = 0
  if (tilt) {
    tilt.rotation.x = 0
    tilt.position.y = moving ? Math.abs(Math.sin(animT * 10)) * 0.05 : Math.sin(animT * 2) * 0.025
  }
  if (!parts) return
  const swing = moving ? Math.sin(animT * 9) : Math.sin(animT * 2) * 0.25
  const amp = moving ? 0.7 : 0.12
  if (parts.legLeft) parts.legLeft.rotation.x = (base.legLeft || 0) + swing * amp
  if (parts.legRight) parts.legRight.rotation.x = (base.legRight || 0) - swing * amp
  if (parts.armLeft) parts.armLeft.rotation.x = (base.armLeft || 0) - swing * amp * 0.75
  if (parts.armRight) parts.armRight.rotation.x = (base.armRight || 0) + swing * amp * 0.55 + (shooting ? -1.15 : 0)
  if (parts.head) parts.head.rotation.y = Math.sin(animT * 1.4) * 0.18
  const spin = (rig.userData.spin || 0) + (moving ? 10 : 2) * dt
  rig.userData.spin = spin
  for (const key of ['wheelBackLeft', 'wheelBackRight', 'wheelFrontLeft', 'wheelFrontRight']) {
    if (parts[key]) parts[key].rotation.x = spin
  }
}

function shotEnd(tracer) {
  const dx = Math.sin(tracer.yaw) * Math.cos(tracer.pitch)
  const dy = Math.sin(tracer.pitch)
  const dz = Math.cos(tracer.yaw) * Math.cos(tracer.pitch)
  const actors = authority === 'remote' && netActors ? netActors : local.actors
  let x = tracer.x + dx * 8
  let y = tracer.y + dy * 8
  let z = tracer.z + dz * 8
  for (let t = 0.45; t <= config.range; t += 0.35) {
    x = tracer.x + dx * t
    y = tracer.y + dy * t
    z = tracer.z + dz * t
    if (wallPoint(x, y, z, local.map.walls)) return { x, y, z, hit: true }
    for (const other of actors) {
      if (!other.alive) continue
      const near = (x - other.x) ** 2 + (z - other.z) ** 2 < 0.45 && y > (other.y || 0) && y < (other.y || 0) + 1.8
      if (near) return { x, y, z, hit: true }
    }
  }
  return { x, y, z, hit: false }
}

function spawnBolt(tracer) {
  if (!glOk || theme.weapon === 'none') return
  const dx = Math.sin(tracer.yaw) * Math.cos(tracer.pitch)
  const dy = Math.sin(tracer.pitch)
  const dz = Math.cos(tracer.yaw) * Math.cos(tracer.pitch)
  const end = shotEnd(tracer)
  const streak = new THREE.Mesh(streakGeo || new THREE.BoxGeometry(0.04, 0.04, 1.2), new THREE.MeshBasicMaterial({ color: accent }))
  streak.position.set(tracer.x + dx * 1.5, tracer.y + dy * 1.5, tracer.z + dz * 1.5)
  streak.lookAt(tracer.x + dx * 4, tracer.y + dy * 4, tracer.z + dz * 4)
  markNoShadow(streak)
  scene.add(streak)
  bolts.push({ mesh: streak, life: 0.08 })
  const bolt = take('bolt')
  if (bolt && theme.weapon !== 'laser') {
    bolt.scale.setScalar(6)
    bolt.position.copy(streak.position)
    bolt.lookAt(end.x, end.y, end.z)
    scene.add(bolt)
    bolts.push({ mesh: bolt, life: 0.12 })
  }
  const actors = authority === 'remote' && netActors ? netActors : local.actors
  let shooter = null
  let best = 1.2
  for (const actor of actors) {
    const dist = Math.hypot(actor.x - tracer.x, actor.z - tracer.z)
    if (dist < best) {
      best = dist
      shooter = actor
    }
  }
  if (shooter) shooting.set(shooter.id, animT + 0.22)
  if (end.hit) {
    addSparks(end.x, end.y, end.z)
    const decal = new THREE.Mesh(decalGeo, new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.8, depthWrite: false }))
    decal.rotation.x = -Math.PI / 2
    decal.position.set(end.x, 0.045, end.z)
    markNoShadow(decal)
    scene.add(decal)
    decals.push(decal)
    if (decals.length > 16) {
      const old = decals.shift()
      scene.remove(old)
    }
  }
  const self = currentYou(authority === 'remote' && netActors ? netActors : local.actors)
  if (self && Math.hypot(tracer.x - self.x, tracer.z - self.z) < 0.8) {
    recoil = 1
    flashLeft = 0.045
    shake = Math.max(shake, 0.05)
    if (flare) flare.visible = true
    if (flashLight) flashLight.intensity = 8
  }
}

function addSparks(x, y, z) {
  const count = qualityName === 'low' ? 3 : 6
  for (let i = 0; i < count; i++) {
    const mesh = new THREE.Mesh(sparkGeo, new THREE.MeshBasicMaterial({ color: i % 2 ? accent : ink }))
    mesh.position.set(x, y, z)
    mesh.userData.v = new THREE.Vector3((rnd() - 0.5) * 3.2, 1.4 + rnd() * 2.4, (rnd() - 0.5) * 3.2)
    mesh.userData.life = 0.28 + rnd() * 0.12
    markNoShadow(mesh)
    scene.add(mesh)
    sparks.push(mesh)
  }
}

function resize() {
  const w = innerWidth
  const h = innerHeight
  if (!renderer || !camera) return
  renderer.setPixelRatio(pixelRatio)
  renderer.setSize(w, h, false)
  camera.aspect = w / Math.max(1, h)
  camera.updateProjectionMatrix()
  if (composer) {
    if (composer.setPixelRatio) composer.setPixelRatio(pixelRatio)
    composer.setSize(w, h)
  }
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
  miniCtx.fillStyle = 'rgba(8,12,20,0.2)'
  miniCtx.fillRect(0, 0, s, s)
  miniCtx.save()
  miniCtx.translate(s / 2, s / 2)
  const scale = theme.mode === 'explore' ? 3.1 : theme.mode === 'race' ? 3.2 : 2.8
  miniCtx.rotate(-(you ? you.yaw : 0))
  miniCtx.strokeStyle = 'rgba(255,255,255,.35)'
  miniCtx.lineWidth = 2
  miniCtx.strokeRect(-16 * scale, -16 * scale, 32 * scale, 32 * scale)
  miniCtx.fillStyle = 'rgba(255,255,255,.28)'
  for (const wall of local.map.walls) {
    const x = (wall.x - (you ? you.x : 0)) * scale
    const z = (wall.z - (you ? you.z : 0)) * scale
    miniCtx.fillRect(x - wall.w * scale / 2, z - wall.d * scale / 2, Math.max(2, wall.w * scale), Math.max(2, wall.d * scale))
  }
  for (const actor of actors) {
    if (!actor.alive && actor.kind !== 'buoy') continue
    miniCtx.fillStyle = actor.id === (you && you.id) ? '#ffffff' : (actor.color || accent)
    const x = (actor.x - (you ? you.x : 0)) * scale
    const z = (actor.z - (you ? you.z : 0)) * scale
    miniCtx.beginPath()
    miniCtx.arc(x, z, actor.id === (you && you.id) ? 3.5 : 2.5, 0, Math.PI * 2)
    miniCtx.fill()
  }
  miniCtx.restore()
}

function drawFlat(you, actors) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const w = canvas.width
  const h = canvas.height
  ctx.fillStyle = sky.mid
  ctx.fillRect(0, 0, w, h)
  ctx.save()
  ctx.translate(w / 2, h / 2)
  const scale = 8
  ctx.fillStyle = sky.ground
  ctx.fillRect(-160, -160, 320, 320)
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
  if (!playing) return
  if (n < (window.__state.score || 0) && !local.over && !(netSnap && netSnap.over)) return
  window.__state.score = n
  window.__posted = true
  try { parent.postMessage({ type: 'playground-score', points: n }, '*') } catch (err) {}
}

function audioCtx() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return null
    if (!audioCtx.ctx) audioCtx.ctx = new Ctx()
    return audioCtx.ctx
  } catch (err) {
    return null
  }
}

function noiseBuf(ctx) {
  if (noiseBuf.buf) return noiseBuf.buf
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.2), ctx.sampleRate)
  const data = buf.getChannelData(0)
  let n = 11
  for (let i = 0; i < data.length; i++) {
    n = (Math.imul(n, 16807) + 1) >>> 0
    data[i] = (n / 4294967296) * 2 - 1
  }
  noiseBuf.buf = buf
  return buf
}

function sfx(kind) {
  const ctx = audioCtx()
  if (!ctx) return
  if (ctx.state === 'suspended') ctx.resume().catch(() => {})
  const t0 = ctx.currentTime
  const gain = ctx.createGain()
  gain.connect(ctx.destination)
  if (kind === 'step' || kind === 'shot') {
    const src = ctx.createBufferSource()
    src.buffer = noiseBuf(ctx)
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = kind === 'shot' ? 1400 : 240
    src.connect(filter)
    filter.connect(gain)
    gain.gain.setValueAtTime(kind === 'shot' ? 0.07 : 0.035, t0)
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + (kind === 'shot' ? 0.09 : 0.05))
    src.start(t0)
    src.stop(t0 + 0.1)
    if (kind === 'step') return
  }
  const osc = ctx.createOscillator()
  osc.type = kind === 'hurt' ? 'sine' : 'triangle'
  osc.frequency.setValueAtTime(kind === 'hurt' ? 120 : kind === 'hit' ? 740 : 480, t0)
  if (kind === 'shot') osc.frequency.exponentialRampToValueAtTime(160, t0 + 0.08)
  osc.connect(gain)
  gain.gain.setValueAtTime(kind === 'step' ? 0 : 0.04, t0)
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.12)
  osc.start(t0)
  osc.stop(t0 + 0.12)
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

function drawFeed(feed) {
  const lines = (feed || []).slice(-4)
  const key = lines.map((item) => item.text).join('|')
  if (key === feedKey) return
  feedKey = key
  feedEl.replaceChildren()
  for (const item of lines) {
    const row = document.createElement('div')
    row.className = 'chip'
    row.textContent = item.text
    feedEl.appendChild(row)
  }
}

function floatNum(actor, amount) {
  const el = document.createElement('b')
  el.className = 'dmg'
  el.style.color = actor.color || '#fff'
  el.textContent = String(amount | 0)
  floatsEl.appendChild(el)
  floats.push({ el, x: actor.x, y: (actor.y || 0) + 1.8, z: actor.z, life: 0.75 })
}

function placeFloats(dt) {
  if (!camera) return
  for (let i = floats.length - 1; i >= 0; i--) {
    const item = floats[i]
    item.life -= dt
    item.y += dt * 0.9
    if (item.life <= 0) {
      item.el.remove()
      floats.splice(i, 1)
      continue
    }
    proj.set(item.x, item.y, item.z).project(camera)
    item.el.style.opacity = String(Math.max(0, item.life))
    item.el.style.left = `${(proj.x * 0.5 + 0.5) * innerWidth}px`
    item.el.style.top = `${(-proj.y * 0.5 + 0.5) * innerHeight}px`
  }
}

function paint(actors, you, left, feed, over, beacons, flags, dt, input) {
  if (!assetsReady || !scene) {
    if (glOk && renderer && scene && camera) renderer.render(scene, camera)
    return
  }
  const drawn = sampleActors(actors, performance.now())
  const self = drawn.find((actor) => actor.id === (you && you.id)) || drawn[0]
  const moving = self ? Math.hypot((self.x - lastX), (self.z - lastZ)) > 0.012 : false
  if (glOk && self) {
    const speed = Math.hypot(input.mx, input.mz)
    if (theme.mode === 'race') {
      const back = 3.1
      const ox = Math.sin(self.yaw)
      const oz = Math.cos(self.yaw)
      camera.position.set(self.x - ox * back, 1.55 + self.y, self.z - oz * back)
      camera.lookAt(self.x + ox * 8, 0.7, self.z + oz * 8)
      const base = theme.mode === 'race' ? 74 : 72
      camera.fov = base + (input.fire ? 6 : 0)
      camera.updateProjectionMatrix()
    } else {
      const eye = 1.55
      const bob = moving ? Math.sin(animT * 10) * 0.025 : 0
      const dx = Math.sin(self.yaw) * Math.cos(self.pitch)
      const dy = Math.sin(self.pitch)
      const dz = Math.cos(self.yaw) * Math.cos(self.pitch)
      camera.position.set(self.x, self.y + eye + bob, self.z)
      camera.lookAt(self.x + dx, self.y + eye + bob + dy, self.z + dz)
    }
    if (shake > 0) {
      camera.position.x += (rnd() - 0.5) * shake
      camera.position.y += (rnd() - 0.5) * shake
      shake *= 0.84
    }
    if (gun) {
      const base = gun.userData.base
      const bob = speed > 0.1 ? 1 : 0.25
      gun.position.x = base.x + Math.sin(animT * 7.5) * 0.012 * bob
      gun.position.y = base.y + Math.abs(Math.cos(animT * 7.5)) * 0.014 * bob
      gun.position.z = base.z + recoil * 0.1
      gun.rotation.x = base.rx - recoil * 0.4
    }
    const aliveIds = new Set()
    for (const actor of drawn) {
      const mesh = actorMesh(actor)
      const show = actor.alive || (mesh.userData.death !== undefined && mesh.userData.death < 0.85)
      const selfHidden = actor.id === self.id && theme.mode !== 'race'
      if (!show || selfHidden) {
        if (!actor.alive) poseActor(mesh, actor, false, false, dt)
        mesh.visible = actor.alive ? false : mesh.userData.death < 0.85 && !selfHidden
        if (!actor.alive && mesh.userData.death >= 0.85) mesh.visible = false
        continue
      }
      aliveIds.add(actor.id)
      mesh.visible = true
      const bob = actor.kind === 'buoy' ? Math.sin(animT * 2 + actor.x) * 0.08 : 0
      mesh.position.set(actor.x, (actor.y || 0) + bob, actor.z)
      mesh.rotation.y = actor.yaw
      if (theme.mode === 'race') mesh.rotation.z = -input.mx * 0.12 * (actor.id === self.id ? 1 : 0)
      const aim = (shooting.get(actor.id) || 0) > animT
      const sample = samples.get(actor.id)
      const walked = sample ? Math.hypot(actor.x - sample.from.x, actor.z - sample.from.z) > 0.02 : false
      poseActor(mesh, actor, actor.id === self.id ? moving : walked, aim, dt)
      if (prevHp.has(actor.id) && actor.hp < prevHp.get(actor.id)) {
        const lost = prevHp.get(actor.id) - actor.hp
        if (lost > 0) floatNum(actor, lost)
        if (actor.id !== self.id) paint.marked = true
        if (actor.id === self.id) {
          hurtEl.classList.add('pain')
          clearTimeout(paint.pain)
          paint.pain = setTimeout(() => hurtEl.classList.remove('pain'), 180)
          shake = Math.max(shake, 0.11)
          sfx('hurt')
        }
      }
      prevHp.set(actor.id, actor.hp)
    }
    for (const [id, mesh] of meshes) {
      if (!aliveIds.has(id) && mesh.userData.death >= 0.85) mesh.visible = false
    }
    if (beaconMeshes.length) {
      const list = beacons || []
      for (let i = 0; i < beaconMeshes.length; i++) {
        const ready = !list[i] || list[i].ready
        const pulse = 0.45 + Math.sin(animT * 3 + i) * 0.35
        beaconMeshes[i].traverse((obj) => {
          if (obj.isMesh && obj.material && obj.material.emissiveIntensity !== undefined) {
            const mats = [].concat(obj.material)
            for (const material of mats) material.emissiveIntensity = ready ? 0.7 + pulse : 0.08
          }
        })
      }
    }
    if (flagMeshes.length) {
      for (const mesh of flagMeshes) {
        const flag = (flags || []).find((item) => item.team === mesh.userData.team)
        if (!flag) continue
        mesh.visible = !flag.carried
        mesh.position.set(flag.x, 0, flag.z)
      }
    }
    const drawAt = performance.now()
    if (bloomOn && composer) composer.render()
    else renderer.render(scene, camera)
    lastRender = performance.now() - drawAt
  } else if (!glOk) {
    drawFlat(self, drawn)
  }
  drawMini(self, drawn)
  placeFloats(dt)
  const hp = self ? self.hp : 100
  const ammo = self ? self.ammo : 0
  hpEl.style.setProperty('--p', `${Math.max(0, Math.min(100, hp))}%`)
  hpEl.querySelector('b').textContent = String(Math.max(0, hp | 0))
  if (theme.weapon === 'none') {
    ammoNum.textContent = input.fire ? 'ON' : 'GO'
    ammoLabel.textContent = theme.mode === 'race' ? 'boost' : 'walk'
  } else {
    ammoNum.textContent = String(ammo | 0)
    ammoLabel.textContent = theme.weapon === 'laser' ? 'laser' : 'blaster'
  }
  const score = self ? self.score : 0
  ptsEl.textContent = String(score | 0)
  timerEl.textContent = over ? 'Round over' : `${left | 0}s`
  drawFeed(feed)
  const latest = (feed || []).slice(-1)[0]
  if (latest && self && latest.text && latest.text.indexOf(self.name + ' ') === 0 && latest.text !== paint.lastKill) {
    paint.lastKill = latest.text
    killEl.hidden = false
    killEl.textContent = latest.text
    clearTimeout(paint.kill)
    paint.kill = setTimeout(() => { killEl.hidden = true }, 900)
  }
  deathEl.hidden = !self || self.alive || over
  overEl.hidden = !over
  if (over) {
    overEl.replaceChildren()
    const heading = document.createElement('b')
    heading.textContent = THEME.names.over || 'Round over'
    const sub = document.createElement('div')
    sub.textContent = `${score | 0} points`
    overEl.append(heading, sub)
  }
  if (self && playing) {
    const didFire = prevAmmo >= 0 && ammo < prevAmmo
    if (didFire) sfx('shot')
    if (didFire && paint.marked) {
      hitEl.classList.add('on')
      clearTimeout(paint.hit)
      paint.hit = setTimeout(() => hitEl.classList.remove('on'), 120)
      sfx('hit')
    }
    paint.marked = false
    if (moving && self.alive) {
      footT += dt
      if (footT > 0.38) {
        footT = 0
        sfx('step')
      }
    }
    if (havePos) travel += Math.hypot(self.x - lastX, self.z - lastZ)
    lastX = self.x
    lastZ = self.z
    havePos = true
  }
  prevAmmo = ammo
  if (score !== shownScore) {
    if (score > shownScore && shownScore >= 0) sfx('hit')
    shownScore = score
    award(score)
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
  animT += dt
  recoil = Math.max(0, recoil - dt * 5)
  flashLeft = Math.max(0, flashLeft - dt)
  if (flare) flare.visible = flashLeft > 0
  if (flashLight) flashLight.intensity = flashLeft > 0 ? 8 : 0
  frames += 1
  if (!fpsAt) fpsAt = now
  if (now - fpsAt > 500) {
    fps = Math.round(frames * 1000 / (now - fpsAt))
    frames = 0
    fpsAt = now
    if (fps && fps < 28 && (pixelRatio > 0.75 || qualityName !== 'low')) {
      slow += 1
      if (slow >= 3) {
        qualityName = 'low'
        bloomOn = false
        pixelRatio = 1
        applyQuality()
        slow = 0
      }
    } else slow = 0
  }
  for (let i = sparks.length - 1; i >= 0; i--) {
    const mesh = sparks[i]
    mesh.userData.life -= dt
    mesh.position.addScaledVector(mesh.userData.v, dt)
    mesh.userData.v.y -= dt * 8
    if (mesh.userData.life <= 0) {
      scene.remove(mesh)
      sparks.splice(i, 1)
    }
  }
  for (let i = decals.length - 1; i >= 0; i--) {
    const mesh = decals[i]
    mesh.userData.age = (mesh.userData.age || 0) + dt
    if (mesh.material) mesh.material.opacity = Math.max(0, 0.8 - mesh.userData.age / 4)
    if (mesh.userData.age > 4) {
      scene.remove(mesh)
      decals.splice(i, 1)
    }
  }
  for (let i = bolts.length - 1; i >= 0; i--) {
    bolts[i].life -= dt
    if (bolts[i].life <= 0) {
      scene.remove(bolts[i].mesh)
      bolts.splice(i, 1)
    }
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
  if (framed && playing) {
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
  let actors = local.actors
  let left = Math.max(0, Math.ceil(config.seconds - local.elapsed))
  let feed = local.feed
  let over = local.over
  let beacons = local.beacons
  let flags = local.flags
  if (authority === 'remote' && netActors) {
    actors = netActors
    left = netSnap.left
    feed = netSnap.feed
    over = netSnap.over === 1
    beacons = netSnap.beacons
    flags = netSnap.flags
  } else if (authority === 'wait') {
    waitLeft -= dt
    if (waitLeft <= 0) authority = 'local'
  }
  if (authority === 'local' && playing) {
    applyLocalInput(input)
    stepMatch(local, dt)
    for (const tracer of local.tracers) spawnBolt(tracer)
    local.tracers = []
    yaw = youLocal.yaw
    actors = local.actors
    left = Math.max(0, Math.ceil(config.seconds - local.elapsed))
    feed = local.feed
    over = local.over
    beacons = local.beacons
    flags = local.flags
  }
  const you = currentYou(actors)
  paint(actors, you, left, feed, over, beacons, flags, dt, input)
  if (over) award(you ? you.score : 0)
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
    begin()
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

function requestLook() {
  if (coarse || !canvas.requestPointerLock) return
  const lock = canvas.requestPointerLock()
  if (lock && lock.catch) lock.catch(() => {})
}

function begin() {
  if (playing) return
  if (!assetsReady) {
    begin.queued = true
    return
  }
  playing = true
  document.body.classList.add('playing')
  startEl.hidden = true
  bootEl.hidden = true
  window.__state.phase = 'play'
  const ctx = audioCtx()
  if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {})
}

addEventListener('keydown', (event) => {
  if (!playing && (event.code === 'Enter' || event.code === 'Space')) {
    begin()
    requestLook()
    return
  }
  held[event.code] = true
  if (event.code === 'Space') jumpEdge = true
  window.__state.input += 1
})
addEventListener('keyup', (event) => { held[event.code] = false })
canvas.addEventListener('pointerdown', (event) => {
  if (!playing) return
  fireHeld = !coarse
  requestLook()
  canvas.dataset.dragX = String(event.clientX)
  canvas.dataset.dragY = String(event.clientY)
  canvas.dataset.drag = '1'
})
addEventListener('pointerup', () => {
  if (!coarse) fireHeld = false
  canvas.dataset.drag = ''
})
addEventListener('mousemove', (event) => {
  if (!playing) return
  if (document.pointerLockElement === canvas) {
    yaw += event.movementX * 0.0022
    pitch = Math.max(-1.05, Math.min(1.05, pitch - event.movementY * 0.002))
    return
  }
  if (canvas.dataset.drag !== '1' || coarse) return
  const lx = Number(canvas.dataset.dragX)
  const ly = Number(canvas.dataset.dragY)
  yaw += (event.clientX - lx) * 0.005
  pitch = Math.max(-1.05, Math.min(1.05, pitch - (event.clientY - ly) * 0.004))
  canvas.dataset.dragX = String(event.clientX)
  canvas.dataset.dragY = String(event.clientY)
})
document.querySelector('#play').addEventListener('click', () => {
  begin()
  requestLook()
})
document.querySelector('#fire').addEventListener('pointerdown', (event) => {
  event.preventDefault()
  begin()
  fireHeld = true
})
document.querySelector('#fire').addEventListener('pointerup', () => { fireHeld = false })
document.querySelector('#fire').addEventListener('pointerleave', () => { fireHeld = false })
qualityBtn.addEventListener('click', () => {
  qualityName = qualityName === 'low' ? 'medium' : qualityName === 'medium' ? 'high' : 'low'
  applyQuality()
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

window.__arena = {
  get fps() { return fps },
  get gl() { return glOk },
  get quality() { return qualityName },
  get ratio() { return pixelRatio },
  get ready() { return assetsReady },
  get renderMs() { return lastRender },
  moved() { return travel },
  begin() { begin() },
  push(partial) {
    begin()
    scripted.on = true
    if (partial.mx !== undefined) scripted.mx = partial.mx
    if (partial.mz !== undefined) scripted.mz = partial.mz
    if (partial.yaw !== undefined) scripted.yaw = partial.yaw
    if (partial.pitch !== undefined) scripted.pitch = partial.pitch
    if (partial.fire !== undefined) scripted.fire = partial.fire ? 1 : 0
    window.__state.input += 1
  },
  lookAtNearest() {
    begin()
    aimLock = true
    return trackNearest()
  }
}

function finishBoot() {
  assetsReady = true
  bootEl.hidden = true
  if (!framed || begin.queued || scripted.on) begin()
  else {
    startEl.hidden = false
    window.__state.phase = 'start'
  }
  if (glOk) renderer.render(scene, camera)
}

bootGL()
if (!glOk) {
  canvas.width = Math.max(2, innerWidth)
  canvas.height = Math.max(2, innerHeight)
  finishBoot()
} else {
  setBar(0.08)
  loadPack().then(() => {
    buildLevel()
    applyQuality()
    resize()
    finishBoot()
  }).catch(() => finishBoot())
}
if (framed) {
  try { parent.postMessage({ type: 'playground-arena-hello' }, '*') } catch (err) {}
}
requestAnimationFrame(loop)
