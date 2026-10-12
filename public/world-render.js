import { frameCoverage } from '/blocks/frame-check.js'
import { meshRegion } from '/blocks/mesh.js'
import {
  CANOPY, CANDY, CLAY, DUNE, FROST, GLOW, PETAL, POOL, ROCK, SOIL, TIMBER, TURF
} from '/blocks/blocks.js'

const THREE = globalThis.THREE

const TIME = { value: 0 }

export function detectQuality() {
  const embed = document.body.classList.contains('embed') || new URLSearchParams(location.search).get('embed') === '1'
  const coarse = window.matchMedia('(pointer: coarse)').matches
  const narrow = Math.min(window.innerWidth, window.innerHeight) < 760
  const low = embed || coarse || narrow
  return {
    tier: low ? 'low' : 'high',
    ssao: !low,
    bloom: !low,
    shadow: low ? 512 : 2048,
    pixelRatio: low ? 1 : Math.min(window.devicePixelRatio || 1, 1.5),
    anisotropy: low ? 1 : 4
  }
}

function faceKey(tile, ny) {
  if (tile === POOL) return 'water'
  if (tile === TURF) return ny > 0.55 ? 'grass' : 'dirt'
  if (tile === SOIL || tile === CLAY) return 'dirt'
  if (tile === ROCK) return 'stone'
  if (tile === DUNE) return 'sand'
  if (tile === TIMBER) return 'wood'
  if (tile === CANOPY) return 'leaves'
  if (tile === FROST) return 'snow'
  if (tile === PETAL) return 'petal'
  if (tile === CANDY) return 'candy'
  if (tile === GLOW) return 'glow'
  return 'stone'
}

function loadMap(loader, url, color) {
  const tex = loader.load(url)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace
  return tex
}

const LEAF_SWAY = `transformed.x += sin(position.y * 1.6 + uTime * 1.35 + position.z * 0.7) * 0.05;
transformed.z += cos(position.x * 1.4 + uTime * 1.05) * 0.05;`
const WATER_SWAY = `transformed.y += sin(position.x * 1.7 + position.z * 1.3 + uTime * 1.6) * 0.045;`

function patchVertex(shader, motion) {
  shader.vertexShader = shader.vertexShader.replace(
    '#include <fog_vertex>',
    `#include <fog_vertex>
#ifdef USE_FOG
	vFogDepth *= mix(1.45, 0.72, clamp(position.y / 28.0, 0.0, 1.0));
#endif`
  )
  if (!motion) return
  shader.uniforms.uTime = TIME
  shader.vertexShader = `uniform float uTime;\n${shader.vertexShader}`
  shader.vertexShader = shader.vertexShader.replace(
    '#include <begin_vertex>',
    `#include <begin_vertex>
${motion}`
  )
}

function pbrMaterial(loader, name, extra = {}) {
  const map = loadMap(loader, `/textures/${name}_diff.jpg`, true)
  const normalMap = loadMap(loader, `/textures/${name}_nor.jpg`, false)
  const roughnessMap = loadMap(loader, `/textures/${name}_rough.jpg`, false)
  const sway = extra.sway === true
  const params = {
    map,
    normalMap,
    roughnessMap,
    roughness: extra.roughness ?? 1,
    metalness: 0,
    vertexColors: true,
    side: extra.side !== undefined ? extra.side : THREE.DoubleSide
  }
  const material = new THREE.MeshStandardMaterial(params)
  material.customProgramCacheKey = () => (sway ? `sway:${name}` : `pbr:${name}`)
  material.onBeforeCompile = (shader) => {
    patchVertex(shader, sway ? LEAF_SWAY : '')
  }
  return material
}

function flatMaterial(color, extra = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: extra.roughness ?? 0.7,
    metalness: extra.metalness ?? 0,
    emissive: extra.emissive ?? 0x000000,
    emissiveIntensity: extra.emissiveIntensity ?? 1,
    vertexColors: true
  })
}

function attachSky(scene) {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uSun: { value: new THREE.Vector3(0.35, 0.82, 0.28) },
      uZenith: { value: new THREE.Color('#3e7ec4') },
      uHorizon: { value: new THREE.Color('#d5e4f2') },
      uLight: { value: 1 }
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vDir = world.xyz - cameraPosition;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: `
      varying vec3 vDir;
      uniform vec3 uSun;
      uniform vec3 uZenith;
      uniform vec3 uHorizon;
      uniform float uLight;
      void main() {
        vec3 dir = normalize(vDir);
        float h = clamp(dir.y * 0.55 + 0.5, 0.0, 1.0);
        vec3 col = mix(uHorizon, uZenith, pow(h, 0.62));
        vec3 sun = normalize(uSun);
        float disc = pow(max(dot(dir, sun), 0.0), mix(1400.0, 500.0, clamp(uLight, 0.0, 1.0)));
        float glow = pow(max(dot(dir, sun), 0.0), 8.0);
        col += vec3(1.0, 0.93, 0.78) * disc * (0.55 + uLight);
        col += uHorizon * glow * 0.18;
        float band = pow(1.0 - max(dir.y, 0.0), 4.0);
        col = mix(col, uHorizon, band * 0.45);
        gl_FragColor = vec4(col, 1.0);
      }
    `
  })
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(380, 28, 16), material)
  mesh.frustumCulled = false
  mesh.renderOrder = -1
  scene.add(mesh)
  return { mesh, material }
}

function makeSsaoPass() {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      tDiffuse: { value: null },
      tDepth: { value: null },
      resolution: { value: new THREE.Vector2(1, 1) },
      cameraNear: { value: 0.08 },
      cameraFar: { value: 420 }
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D tDiffuse;
      uniform sampler2D tDepth;
      uniform vec2 resolution;
      uniform float cameraNear;
      uniform float cameraFar;
      varying vec2 vUv;
      float linearize(float z) {
        return (2.0 * cameraNear) / (cameraFar + cameraNear - z * (cameraFar - cameraNear));
      }
      void main() {
        vec3 color = texture2D(tDiffuse, vUv).rgb;
        float center = linearize(texture2D(tDepth, vUv).r);
        float ao = 0.0;
        vec2 texel = 1.0 / resolution;
        for (int i = 0; i < 8; i++) {
          float ang = float(i) * 2.399963;
          vec2 tap = vec2(cos(ang), sin(ang)) * texel * (3.0 + float(i) * 1.35);
          float sampleZ = linearize(texture2D(tDepth, vUv + tap).r);
          float diff = center - sampleZ;
          ao += clamp(diff * 32.0, 0.0, 1.0);
        }
        ao = 1.0 - ao / 8.0;
        color *= mix(0.68, 1.0, clamp(ao, 0.0, 1.0));
        gl_FragColor = vec4(color, 1.0);
      }
    `
  })
  const scene = new THREE.Scene()
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material))
  return {
    enabled: true,
    needsSwap: true,
    clear: false,
    material,
    render(renderer, writeBuffer, readBuffer) {
      material.uniforms.tDiffuse.value = readBuffer.texture
      material.uniforms.tDepth.value = readBuffer.depthTexture || null
      material.uniforms.resolution.value.set(readBuffer.width, readBuffer.height)
      renderer.setRenderTarget(writeBuffer)
      renderer.clear()
      renderer.render(scene, camera)
    },
    setSize() {},
    dispose() { material.dispose() }
  }
}

function ensureDepth(target) {
  const width = target.width || 2
  const height = target.height || 2
  const current = target.depthTexture
  if (current && current.image && current.image.width === width && current.image.height === height) return
  target.depthTexture = new THREE.DepthTexture(width, height)
  target.depthTexture.type = THREE.UnsignedShortType
}

export function createWorldRenderer(canvas, { world, sample, onLit } = {}) {
  if (!THREE) return { ok: false, quality: detectQuality(), remeshAll() {}, remeshAt() {}, render() {}, project() { return null }, dispose() {} }
  const quality = detectQuality()
  let renderer
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: quality.tier === 'high',
      alpha: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true
    })
  } catch {
    return { ok: false, quality, remeshAll() {}, remeshAt() {}, render() {}, project() { return null }, dispose() {} }
  }
  renderer.setPixelRatio(quality.pixelRatio)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 0.92
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap

  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#9ebfd4')
  scene.fog = new THREE.FogExp2('#b7c9d6', quality.tier === 'low' ? 0.028 : 0.016)
  const camera = new THREE.PerspectiveCamera(58, 1, 0.08, 420)
  const sky = attachSky(scene)

  const hemi = new THREE.HemisphereLight(0xd5e6f5, 0x6d5a40, 0.62)
  scene.add(hemi)
  const sun = new THREE.DirectionalLight(0xfff4df, 2.5)
  sun.castShadow = true
  sun.shadow.mapSize.set(quality.shadow, quality.shadow)
  sun.shadow.camera.near = 1
  sun.shadow.camera.far = 180
  const span = quality.tier === 'low' ? 22 : 34
  sun.shadow.camera.left = -span
  sun.shadow.camera.right = span
  sun.shadow.camera.top = span
  sun.shadow.camera.bottom = -span
  sun.shadow.bias = -0.0006
  sun.shadow.normalBias = 0.04
  scene.add(sun)
  scene.add(sun.target)
  const fill = new THREE.DirectionalLight(0xc5d4e8, 0.38)
  scene.add(fill)

  const loader = new THREE.TextureLoader()
  let lit = false
  const markLit = () => {
    if (lit) return
    lit = true
    onLit?.()
  }
  loader.manager.onLoad = markLit
  loader.manager.onError = markLit
  setTimeout(markLit, 1800)
  const aniso = Math.min(quality.anisotropy, renderer.capabilities.getMaxAnisotropy?.() || 1)
  const materials = {
    grass: pbrMaterial(loader, 'grass'),
    dirt: pbrMaterial(loader, 'dirt'),
    stone: pbrMaterial(loader, 'stone'),
    sand: pbrMaterial(loader, 'sand'),
    wood: pbrMaterial(loader, 'wood'),
    leaves: pbrMaterial(loader, 'leaves', { sway: true, roughness: 0.85, side: THREE.DoubleSide }),
    snow: pbrMaterial(loader, 'snow'),
    water: new THREE.MeshPhysicalMaterial({
      color: 0x1c6e86,
      map: loadMap(loader, '/textures/water_diff.jpg', true),
      normalMap: loadMap(loader, '/textures/water_nor.jpg', false),
      roughnessMap: loadMap(loader, '/textures/water_rough.jpg', false),
      roughness: 0.08,
      metalness: 0.04,
      transmission: 0,
      transparent: true,
      opacity: 0.88,
      vertexColors: true,
      envMapIntensity: 1.35,
      side: THREE.DoubleSide
    }),
    petal: flatMaterial(0xd98cab, { roughness: 0.55 }),
    candy: flatMaterial(0xe25b93, { roughness: 0.42 }),
    glow: flatMaterial(0xd6e25a, { roughness: 0.4, emissive: 0xc6d84a, emissiveIntensity: 0.6 })
  }
  for (const material of Object.values(materials)) {
    for (const tex of [material.map, material.normalMap, material.roughnessMap]) {
      if (tex) tex.anisotropy = aniso
    }
  }
  materials.water.customProgramCacheKey = () => 'water'
  materials.water.onBeforeCompile = (shader) => {
    patchVertex(shader, WATER_SWAY)
  }
  materials.leaves.color = new THREE.Color(0xc5d2b0)

  const pmrem = new THREE.PMREMGenerator(renderer)
  const envScene = new THREE.Scene()
  envScene.background = new THREE.Color('#9ec3dc')
  scene.environment = pmrem.fromScene(envScene, 0.04).texture

  const chunks = new Map()
  const avatarRoot = new THREE.Group()
  scene.add(avatarRoot)
  const avatars = new Map()
  const sparkRoot = new THREE.Group()
  scene.add(sparkRoot)
  const sparkMesh = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.2, 0),
    new THREE.MeshStandardMaterial({ color: 0xffe7a3, emissive: 0xffbf55, emissiveIntensity: 1.6, roughness: 0.32 })
  )
  sparkMesh.castShadow = false
  const sparkList = []

  let composer = null
  let ssao = null
  if (quality.bloom || quality.ssao) {
    composer = new THREE.EffectComposer(renderer)
    composer.addPass(new THREE.RenderPass(scene, camera))
    if (quality.ssao) {
      ssao = makeSsaoPass()
      composer.addPass(ssao)
    }
    if (quality.bloom) {
      const bloom = new THREE.UnrealBloomPass(new THREE.Vector2(canvas.width, canvas.height), 0.22, 0.42, 0.86)
      composer.addPass(bloom)
    }
    composer.addPass(new THREE.OutputPass())
  }

  const look = new THREE.Vector3()
  const ahead = new THREE.Vector3()
  const sunDir = new THREE.Vector3(0.4, 0.8, 0.3)
  const forward = new THREE.Vector3()

  function disposeChunk(list) {
    for (const mesh of list) {
      scene.remove(mesh)
      mesh.geometry.dispose()
    }
  }

  function buildChunk(cx, cz) {
    const x0 = cx * 16
    const z0 = cz * 16
    const mesh = meshRegion(
      sample,
      x0,
      0,
      z0,
      Math.min(world.size, x0 + 16),
      world.height,
      Math.min(world.size, z0 + 16)
    )
    const buckets = new Map()
    const verts = mesh.positions.length / 3
    for (let i = 0; i + 5 < verts; i += 6) {
      const o = i * 3
      const ax = mesh.positions[o]
      const ay = mesh.positions[o + 1]
      const az = mesh.positions[o + 2]
      const bx = mesh.positions[o + 3]
      const by = mesh.positions[o + 4]
      const bz = mesh.positions[o + 5]
      const cxp = mesh.positions[o + 6]
      const cyp = mesh.positions[o + 7]
      const czp = mesh.positions[o + 8]
      let nx = (by - ay) * (czp - az) - (bz - az) * (cyp - ay)
      let ny = (bz - az) * (cxp - ax) - (bx - ax) * (czp - az)
      let nz = (bx - ax) * (cyp - ay) - (by - ay) * (cxp - ax)
      const len = Math.hypot(nx, ny, nz) || 1
      nx /= len
      ny /= len
      nz /= len
      const key = faceKey(mesh.tiles[i], ny)
      let bag = buckets.get(key)
      if (!bag) {
        bag = { positions: [], normals: [], uvs: [], colors: [] }
        buckets.set(key, bag)
      }
      for (let v = 0; v < 6; v++) {
        const vi = i + v
        bag.positions.push(mesh.positions[vi * 3], mesh.positions[vi * 3 + 1], mesh.positions[vi * 3 + 2])
        bag.normals.push(nx, ny, nz)
        bag.uvs.push(mesh.uvs[vi * 2], mesh.uvs[vi * 2 + 1])
        const shade = 0.72 + mesh.colors[vi * 3] * 0.28
        bag.colors.push(shade, shade, shade)
      }
    }
    const list = []
    for (const [key, bag] of buckets) {
      if (!bag.positions.length) continue
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.Float32BufferAttribute(bag.positions, 3))
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(bag.normals, 3))
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(bag.uvs, 2))
      geo.setAttribute('color', new THREE.Float32BufferAttribute(bag.colors, 3))
      const view = new THREE.Mesh(geo, materials[key] || materials.stone)
      view.castShadow = key !== 'water' && key !== 'leaves'
      view.receiveShadow = true
      if (key === 'water') view.renderOrder = 2
      scene.add(view)
      list.push(view)
    }
    return list
  }

  function remeshKey(key) {
    const prev = chunks.get(key)
    if (prev) disposeChunk(prev)
    const [cx, cz] = key.split(',').map(Number)
    if (cx < 0 || cz < 0 || cx * 16 >= world.size || cz * 16 >= world.size) {
      chunks.delete(key)
      return
    }
    const next = buildChunk(cx, cz)
    if (next.length) chunks.set(key, next)
    else chunks.delete(key)
  }

  function remeshAll() {
    const n = Math.ceil(world.size / 16)
    for (let cz = 0; cz < n; cz++) {
      for (let cx = 0; cx < n; cx++) remeshKey(`${cx},${cz}`)
    }
  }

  function remeshAt(x, z) {
    const keys = new Set([`${Math.floor(x / 16)},${Math.floor(z / 16)}`])
    if (x % 16 === 0) keys.add(`${Math.floor((x - 1) / 16)},${Math.floor(z / 16)}`)
    if (x % 16 === 15) keys.add(`${Math.floor((x + 1) / 16)},${Math.floor(z / 16)}`)
    if (z % 16 === 0) keys.add(`${Math.floor(x / 16)},${Math.floor((z - 1) / 16)}`)
    if (z % 16 === 15) keys.add(`${Math.floor(x / 16)},${Math.floor((z + 1) / 16)}`)
    for (const key of keys) remeshKey(key)
  }

  function resize() {
    const rect = canvas.getBoundingClientRect()
    const w = Math.max(2, rect.width)
    const h = Math.max(2, rect.height)
    renderer.setPixelRatio(quality.pixelRatio)
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    if (composer) {
      composer.setSize(canvas.width, canvas.height)
      if (quality.ssao) {
        ensureDepth(composer.readBuffer)
        ensureDepth(composer.writeBuffer)
        if (ssao) ssao.material.uniforms.cameraNear.value = camera.near
        if (ssao) ssao.material.uniforms.cameraFar.value = camera.far
      }
    }
  }

  function syncPlayers(remotes) {
    const seen = new Set()
    for (const player of remotes.values()) {
      seen.add(player.id)
      let group = avatars.get(player.id)
      if (!group) {
        group = new THREE.Group()
        const color = new THREE.Color(player.color || '#d7c4a3')
        const cloth = new THREE.MeshStandardMaterial({ color, roughness: 0.7 })
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.05, 0.34), cloth)
        body.position.y = 0.52
        body.castShadow = true
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.38, 0.38), cloth)
        head.position.y = 1.24
        head.castShadow = true
        group.add(body, head)
        avatarRoot.add(group)
        avatars.set(player.id, group)
      }
      group.position.set(player.x, player.y, player.z)
      group.rotation.y = player.yaw || 0
    }
    for (const [id, group] of avatars) {
      if (seen.has(id)) continue
      avatarRoot.remove(group)
      avatars.delete(id)
    }
  }

  function syncSparks(spots, picked, now) {
    const live = []
    for (const spot of spots) {
      if (!picked.has(spot.id)) live.push(spot)
    }
    while (sparkList.length < live.length) {
      const mesh = sparkMesh.clone()
      sparkRoot.add(mesh)
      sparkList.push(mesh)
    }
    for (let i = 0; i < sparkList.length; i++) {
      const mesh = sparkList[i]
      const spot = live[i]
      mesh.visible = Boolean(spot)
      if (!spot) continue
      const bob = Math.sin(now / 420 + spot.id) * 0.08
      mesh.position.set(spot.x, spot.y + bob, spot.z)
      mesh.rotation.y = now / 900
    }
  }

  function applyCycle(cycle) {
    const light = Math.max(0.08, Math.min(1, cycle?.light ?? 1))
    const zenith = new THREE.Color(cycle?.hex || '#87b8f0')
    const horizon = zenith.clone().lerp(new THREE.Color('#f2efe6'), light > 0.45 ? 0.55 : 0.25)
    if (light < 0.35) horizon.lerp(new THREE.Color('#1b2433'), 0.45)
    sky.material.uniforms.uZenith.value.copy(zenith)
    sky.material.uniforms.uHorizon.value.copy(horizon)
    sky.material.uniforms.uLight.value = light
    const elev = -0.08 + light * 1.15
    sunDir.set(0.55, Math.sin(elev), 0.35 * Math.cos(elev)).normalize()
    sky.material.uniforms.uSun.value.copy(sunDir)
    scene.fog.color.copy(horizon)
    scene.background.copy(horizon)
    hemi.color.copy(zenith)
    hemi.intensity = 0.22 + light * 0.5
    sun.intensity = 0.15 + light * 2.7
    sun.color.set(light > 0.55 ? 0xfff4df : 0xffc2a1)
    renderer.toneMappingExposure = 0.45 + light * 0.55
  }

  function render(frame) {
    resize()
    TIME.value = (frame.now || 0) / 1000
    const eyeY = frame.eye.y
    camera.position.set(frame.eye.x, eyeY, frame.eye.z)
    look.set(frame.eye.x + frame.dir.x, eyeY + frame.dir.y, frame.eye.z + frame.dir.z)
    camera.lookAt(look)
    applyCycle(frame.cycle)
    sky.mesh.position.copy(camera.position)
    ahead.copy(camera.position)
    sun.position.set(ahead.x + sunDir.x * 48, ahead.y + Math.max(18, sunDir.y * 60), ahead.z + sunDir.z * 48)
    sun.target.position.copy(ahead)
    fill.position.set(ahead.x - 20, ahead.y + 12, ahead.z - 8)
    syncPlayers(frame.remotes)
    syncSparks(frame.spots, frame.picked, frame.now || 0)
    if (composer) {
      if (quality.ssao) {
        ensureDepth(composer.readBuffer)
        ensureDepth(composer.writeBuffer)
      }
      composer.render()
    } else {
      renderer.render(scene, camera)
    }
  }

  function project(x, y, z) {
    ahead.set(x, y, z)
    look.copy(ahead).sub(camera.position)
    camera.getWorldDirection(forward)
    if (look.dot(forward) < 0.05) return null
    ahead.project(camera)
    if (ahead.z < -1 || ahead.z > 1) return null
    return [ahead.x, ahead.y, ahead.z]
  }

  function coverage() {
    const gl = renderer.getContext()
    renderer.setRenderTarget(null)
    const w = gl.drawingBufferWidth
    const h = gl.drawingBufferHeight
    const pixels = new Uint8Array(w * h * 4)
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
    const stats = frameCoverage(pixels, w, h)
    return {
      ...stats,
      width: w,
      height: h,
      chunks: chunks.size,
      triangles: renderer.info.render.triangles,
      calls: renderer.info.render.calls
    }
  }

  remeshAll()

  return {
    ok: true,
    quality,
    remeshAll,
    remeshAt,
    render,
    coverage,
    project,
    dispose() {
      for (const list of chunks.values()) disposeChunk(list)
      chunks.clear()
      composer?.dispose?.()
      pmrem.dispose()
      renderer.dispose()
      for (const material of Object.values(materials)) material.dispose()
    }
  }
}
