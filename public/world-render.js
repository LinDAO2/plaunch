import { frameCoverage } from '/blocks/frame-check.js'
import { meshRegion } from '/blocks/mesh.js'
import { hash2, WATER } from '/blocks/terrain.js'
import {
  CANOPY, CANDY, CLAY, COBBLE, DOOR, DUNE, FROST, GLOW, PETAL, PLANKS, POOL, ROCK, SOIL, TIMBER, TURF, WINDOW
} from '/blocks/blocks.js'

let THREE = globalThis.THREE

const TIME = { value: 0 }

function hash3(x, y, z, seed) {
  let n = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 1274126177) ^ Math.imul(seed | 0, 1442695041)
  n = Math.imul(n ^ (n >>> 13), 1274126177)
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296
}

function fade3(t) {
  return t * t * (3 - 2 * t)
}

function noise3(x, y, z, seed) {
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const z0 = Math.floor(z)
  const fx = fade3(x - x0)
  const fy = fade3(y - y0)
  const fz = fade3(z - z0)
  let acc = 0
  for (let dz = 0; dz <= 1; dz++) {
    for (let dy = 0; dy <= 1; dy++) {
      for (let dx = 0; dx <= 1; dx++) {
        const w = (dx ? fx : 1 - fx) * (dy ? fy : 1 - fy) * (dz ? fz : 1 - fz)
        acc += w * hash3(x0 + dx, y0 + dy, z0 + dz, seed)
      }
    }
  }
  return acc
}

let boulderSrc = null
function boulderSource() {
  if (boulderSrc) return boulderSrc
  const geo = new THREE.IcosahedronGeometry(1, 2)
  const pos = new Float32Array(geo.attributes.position.array)
  const index = geo.index ? new Uint32Array(geo.index.array) : null
  boulderSrc = { pos, index, count: geo.attributes.position.count }
  geo.dispose()
  return boulderSrc
}

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
    anisotropy: low ? 4 : 8
  }
}

function faceKey(tile, ny) {
  if (tile === POOL) return 'water'
  if (tile === TURF) return ny > 0.55 ? 'grass' : 'dirt'
  if (tile === SOIL || tile === CLAY) return 'dirt'
  if (tile === ROCK) return 'stone'
  if (tile === DUNE) return 'sand'
  if (tile === TIMBER) return 'wood'
  if (tile === PLANKS) return 'planks'
  if (tile === COBBLE) return 'cobble'
  if (tile === DOOR) return 'door'
  if (tile === WINDOW) return 'window'
  if (tile === CANOPY) return 'leaves'
  if (tile === FROST) return 'snow'
  if (tile === PETAL) return 'petal'
  if (tile === CANDY) return 'candy'
  if (tile === GLOW) return 'glow'
  return 'stone'
}

function loadMap(loader, url, color, repeat = 1) {
  const tex = loader.load(url)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace
  tex.generateMipmaps = true
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.magFilter = THREE.LinearFilter
  if (repeat !== 1) tex.repeat.set(repeat, repeat)
  return tex
}

const LEAF_SWAY = `transformed.x += sin(position.y * 1.6 + uTime * 1.35 + position.z * 0.7) * 0.05;
transformed.z += cos(position.x * 1.4 + uTime * 1.05) * 0.05;`
const WATER_SWAY = `transformed.y += sin(position.x * 1.7 + position.z * 1.3 + uTime * 1.6) * 0.045;`

function patchVertex(shader, motion) {
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
  const repeat = extra.repeat ?? (name === 'grass' || name === 'dirt' || name === 'sand' || name === 'stone' || name === 'snow' ? 2 : 1)
  const map = loadMap(loader, `/textures/${name}_diff.jpg`, true, repeat)
  const normalMap = loadMap(loader, `/textures/${name}_nor.jpg`, false, repeat)
  const roughnessMap = loadMap(loader, `/textures/${name}_rough.jpg`, false, repeat)
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
  material.customProgramCacheKey = () => (sway ? `sway:${name}` : `pbr:${name}:${repeat}`)
  material.onBeforeCompile = (shader) => {
    patchVertex(shader, sway ? LEAF_SWAY : '')
    if (name !== 'grass') return
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `#include <map_fragment>
      diffuseColor.rgb *= vec3(0.90, 1.12, 0.80);`
    )
  }
  return material
}

function cutoutMaterial(loader, url, extra = {}) {
  const map = loadMap(loader, url, true, 1)
  const sway = extra.sway === true
  const material = new THREE.MeshStandardMaterial({
    map,
    alphaTest: extra.alphaTest ?? 0.45,
    roughness: extra.roughness ?? 0.8,
    metalness: 0,
    vertexColors: extra.vertexColors !== false,
    side: THREE.DoubleSide
  })
  material.customProgramCacheKey = () => (sway ? `cut-sway:${url}` : `cut:${url}`)
  material.onBeforeCompile = (shader) => {
    patchVertex(shader, sway ? LEAF_SWAY : '')
  }
  return material
}

function diffuseMaterial(loader, url, extra = {}) {
  return new THREE.MeshStandardMaterial({
    map: loadMap(loader, url, true, 1),
    roughness: extra.roughness ?? 0.72,
    metalness: 0,
    vertexColors: true
  })
}

function boulderMaterial(loader) {
  const material = pbrMaterial(loader, 'stone')
  material.customProgramCacheKey = () => 'boulder-triplanar'
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uRockScale = { value: 0.62 }
    shader.vertexShader = `varying vec3 vWorldPos;\nvarying vec3 vWorldNormal;\n${shader.vertexShader}`
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
      vWorldNormal = normalize(mat3(modelMatrix) * objectNormal);`
    )
    shader.fragmentShader = `varying vec3 vWorldPos;\nvarying vec3 vWorldNormal;\nuniform float uRockScale;\n${shader.fragmentShader}`
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `vec3 rockBlend = abs(normalize(vWorldNormal));
      rockBlend = pow(rockBlend, vec3(4.0));
      rockBlend /= (rockBlend.x + rockBlend.y + rockBlend.z);
      #ifdef USE_MAP
        vec3 rockX = texture2D(map, vWorldPos.zy * uRockScale).rgb;
        vec3 rockY = texture2D(map, vWorldPos.xz * uRockScale).rgb;
        vec3 rockZ = texture2D(map, vWorldPos.xy * uRockScale).rgb;
        diffuseColor *= vec4(rockX * rockBlend.x + rockY * rockBlend.y + rockZ * rockBlend.z, 1.0);
      #endif`
    )
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <roughnessmap_fragment>',
      `float roughnessFactor = roughness;
      #ifdef USE_ROUGHNESSMAP
        float roughX = texture2D(roughnessMap, vWorldPos.zy * uRockScale).g;
        float roughY = texture2D(roughnessMap, vWorldPos.xz * uRockScale).g;
        float roughZ = texture2D(roughnessMap, vWorldPos.xy * uRockScale).g;
        roughnessFactor *= roughX * rockBlend.x + roughY * rockBlend.y + roughZ * rockBlend.z;
      #endif`
    )
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

function attachSky(scene, tier) {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uSun: { value: new THREE.Vector3(0.35, 0.82, 0.28) },
      uZenith: { value: new THREE.Color('#3e7ec4') },
      uHorizon: { value: new THREE.Color('#d5e4f2') },
      uLight: { value: 1 },
      uHalo: { value: tier === 'high' ? 1 : 0 }
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
      uniform float uHalo;
      void main() {
        vec3 dir = normalize(vDir);
        float h = clamp(dir.y * 0.55 + 0.5, 0.0, 1.0);
        vec3 col = mix(uHorizon, uZenith, pow(h, 0.62));
        vec3 sun = normalize(uSun);
        float disc = pow(max(dot(dir, sun), 0.0), mix(1400.0, 500.0, clamp(uLight, 0.0, 1.0)));
        float glow = pow(max(dot(dir, sun), 0.0), 8.0);
        float halo = pow(max(dot(dir, sun), 0.0), 32.0);
        col += vec3(1.0, 0.93, 0.78) * disc * (0.55 + uLight);
        col += uHorizon * glow * 0.18;
        col += vec3(1.0, 0.88, 0.64) * halo * 0.08 * uHalo;
        float band = pow(1.0 - max(dir.y, 0.0), 4.0);
        col = mix(col, uHorizon, band * 0.18);
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
  THREE = globalThis.THREE || THREE
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
  const hazeHex = world?.biome === 'desert' ? '#d2b48c'
    : world?.biome === 'snow' ? '#c5d4e6'
      : world?.biome === 'candy' ? '#f4d0e2'
        : world?.biome === 'moon' ? '#8aa4c8'
          : '#7aa0dc'
  const haze = new THREE.Color(hazeHex)
  const fogFar = world?.biome === 'candy' || world?.biome === 'moon'
  const fogDensity = fogFar
    ? (quality.tier === 'low' ? 0.0022 : 0.0012)
    : (quality.tier === 'low' ? 0.0018 : 0.00115)
  scene.fog = new THREE.FogExp2(haze, fogDensity)
  const camera = new THREE.PerspectiveCamera(58, 1, 0.08, 420)
  const sky = attachSky(scene, quality.tier)

  const hemi = new THREE.HemisphereLight(0xc5daf5, 0x8a623c, 0.34)
  scene.add(hemi)
  const sun = new THREE.DirectionalLight(0xffe0a8, 3.4)
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
  const fill = new THREE.DirectionalLight(0xffe6c4, 0.16)
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
    planks: pbrMaterial(loader, 'planks'),
    cobble: pbrMaterial(loader, 'cobble'),
    leaves: cutoutMaterial(loader, '/textures/leaves_cut.png', { sway: true, roughness: 0.72, alphaTest: 0.4 }),
    tuft: cutoutMaterial(loader, '/textures/grass_tuft.png', { sway: true, roughness: 0.7, alphaTest: 0.45 }),
    flower: cutoutMaterial(loader, '/textures/flower_tuft.png', { sway: true, roughness: 0.55, alphaTest: 0.4 }),
    snow: pbrMaterial(loader, 'snow'),
    door: diffuseMaterial(loader, '/textures/door_diff.jpg', { roughness: 0.7 }),
    window: cutoutMaterial(loader, '/textures/window_diff.png', { roughness: 0.28, alphaTest: 0.5, vertexColors: true }),
    water: new THREE.MeshPhysicalMaterial({
      color: 0x2f86a0,
      map: loadMap(loader, '/textures/water_diff.jpg', true),
      normalMap: loadMap(loader, '/textures/water_nor.jpg', false),
      roughnessMap: loadMap(loader, '/textures/water_rough.jpg', false),
      roughness: 0.04,
      metalness: 0.02,
      transmission: 0,
      transparent: true,
      opacity: 0.78,
      vertexColors: true,
      side: THREE.DoubleSide
    }),
    petal: flatMaterial(0xd98cab, { roughness: 0.55 }),
    candy: flatMaterial(0xe25b93, { roughness: 0.42 }),
    glow: flatMaterial(0xd6e25a, { roughness: 0.4, emissive: 0xc6d84a, emissiveIntensity: 0.6 }),
    cactus: new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.86,
      metalness: 0,
      vertexColors: true,
      side: THREE.DoubleSide
    }),
    boulder: boulderMaterial(loader)
  }
  if (quality.tier === 'high') materials.water.roughness = 0.09
  for (const material of Object.values(materials)) {
    for (const tex of [material.map, material.normalMap, material.roughnessMap]) {
      if (tex) tex.anisotropy = aniso
    }
  }
  const reflectTarget = new THREE.WebGLRenderTarget(quality.tier === 'low' ? 256 : 512, quality.tier === 'low' ? 256 : 512)
  reflectTarget.texture.colorSpace = THREE.SRGBColorSpace
  const reflectCam = new THREE.PerspectiveCamera(58, 1, 0.08, 420)
  const reflectOn = { value: 0 }
  const reflectRes = { value: new THREE.Vector2(reflectTarget.width, reflectTarget.height) }
  const softWater = quality.tier === 'high'
  materials.water.customProgramCacheKey = () => (softWater ? 'water-soft' : 'water')
  const waterReflect = softWater
    ? `#include <opaque_fragment>
      if (uReflectOn > 0.5) {
        vec2 suv = gl_FragCoord.xy / uResolution;
        vec3 mirrored = texture2D(uReflect, suv).rgb;
        float ndv = clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0);
        float fres = pow(1.0 - ndv, 2.4);
        float grazing = clamp(1.0 - abs(normalize(vViewPosition).y), 0.0, 1.0);
        gl_FragColor.rgb = mix(gl_FragColor.rgb, mirrored, mix(0.12, 0.38, fres) * mix(0.75, 1.0, grazing));
      }`
    : `#include <opaque_fragment>
      if (uReflectOn > 0.5) {
        vec2 suv = gl_FragCoord.xy / uResolution;
        vec3 mirrored = texture2D(uReflect, suv).rgb;
        float ndv = clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0);
        float fres = pow(1.0 - ndv, 2.4);
        gl_FragColor.rgb = mix(gl_FragColor.rgb, mirrored, mix(0.28, 0.78, fres));
      }`
  materials.water.onBeforeCompile = (shader) => {
    patchVertex(shader, WATER_SWAY)
    shader.uniforms.uReflect = { value: reflectTarget.texture }
    shader.uniforms.uReflectOn = reflectOn
    shader.uniforms.uResolution = reflectRes
    shader.fragmentShader = `uniform sampler2D uReflect;
uniform float uReflectOn;
uniform vec2 uResolution;
${shader.fragmentShader}`
    shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', waterReflect)
  }
  materials.leaves.color = new THREE.Color(0xffffff)

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
      view.castShadow = key !== 'water' && key !== 'window' && key !== 'leaves'
      view.receiveShadow = key !== 'water'
      if (key === 'water') {
        view.renderOrder = 2
        view.userData.water = true
      }
      scene.add(view)
      list.push(view)
    }
    addDecor(list, x0, z0, Math.min(world.size, x0 + 16), Math.min(world.size, z0 + 16))
    return list
  }

  function pushQuad(bag, corners, color) {
    const [a, b, c, d] = corners
    const ax = b[0] - a[0]
    const ay = b[1] - a[1]
    const az = b[2] - a[2]
    const bx = c[0] - a[0]
    const by = c[1] - a[1]
    const bz = c[2] - a[2]
    let nx = ay * bz - az * by
    let ny = az * bx - ax * bz
    let nz = ax * by - ay * bx
    const len = Math.hypot(nx, ny, nz) || 1
    nx /= len
    ny /= len
    nz /= len
    const pts = [a, b, c, d]
    const uvs = [[0, 0], [1, 0], [1, 1], [0, 1]]
    for (const index of [0, 1, 2, 0, 2, 3]) {
      const p = pts[index]
      bag.positions.push(p[0], p[1], p[2])
      bag.normals.push(nx, ny, nz)
      bag.uvs.push(uvs[index][0], uvs[index][1])
      bag.colors.push(color[0], color[1], color[2])
    }
  }

  function pushCross(bag, x, z, y, height, spread, color) {
    const y1 = y + height
    pushQuad(bag, [
      [x + 0.5 - spread, y, z + 0.5 - spread],
      [x + 0.5 + spread, y, z + 0.5 + spread],
      [x + 0.5 + spread, y1, z + 0.5 + spread],
      [x + 0.5 - spread, y1, z + 0.5 - spread]
    ], color)
    pushQuad(bag, [
      [x + 0.5 - spread, y, z + 0.5 + spread],
      [x + 0.5 + spread, y, z + 0.5 - spread],
      [x + 0.5 + spread, y1, z + 0.5 - spread],
      [x + 0.5 - spread, y1, z + 0.5 + spread]
    ], color)
  }

  function tint(color, scale) {
    return [color[0] * scale, color[1] * scale, color[2] * scale]
  }

  function pushBoulder(bag, x, z, y) {
    const src = boulderSource()
    const seed = ((world.seed || 1) + x * 19 + z * 37) | 0
    const a = hash2(x, z, seed + 11)
    const b = hash2(x, z, seed + 17)
    const c = hash2(x, z, seed + 23)
    const d = hash2(x, z, seed + 29)
    const e = hash2(x, z, seed + 31)
    const radius = 0.58 + a * 0.95
    const squash = 0.42 + b * 0.28
    const stretchX = 0.72 + c * 0.5
    const stretchZ = 0.7 + d * 0.55
    const yaw = a * Math.PI * 2
    const pitch = (b - 0.5) * 0.9
    const roll = (c - 0.5) * 0.7
    const cy = Math.cos(yaw)
    const sy = Math.sin(yaw)
    const cp = Math.cos(pitch)
    const sp = Math.sin(pitch)
    const cr = Math.cos(roll)
    const sr = Math.sin(roll)
    const count = src.count
    const pts = new Float32Array(count * 3)
    const shade = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      let vx = src.pos[i * 3]
      let vy = src.pos[i * 3 + 1]
      let vz = src.pos[i * 3 + 2]
      const len = Math.hypot(vx, vy, vz) || 1
      const n = noise3(vx * 1.7, vy * 1.7, vz * 1.7, seed)
      const n2 = noise3(vx * 3.3 + 2.1, vy * 3.3, vz * 3.3 - 1.4, seed + 9)
      const disp = (n - 0.5) * 0.46 + (n2 - 0.5) * 0.2
      vx = (vx / len) * (1 + disp)
      vy = (vy / len) * (1 + disp * 0.75)
      vz = (vz / len) * (1 + disp)
      vx *= radius * stretchX
      vy *= radius * squash
      vz *= radius * stretchZ
      const x1 = vx * cy + vz * sy
      const z1 = -vx * sy + vz * cy
      const y2 = vy * cp - z1 * sp
      const z2 = vy * sp + z1 * cp
      const x3 = x1 * cr - y2 * sr
      const y3 = x1 * sr + y2 * cr
      pts[i * 3] = x3
      pts[i * 3 + 1] = y3
      pts[i * 3 + 2] = z2
      shade[i] = Math.min(1, Math.max(0.86, 0.94 + (n - 0.5) * 0.1))
    }
    let minY = Infinity
    let maxY = -Infinity
    for (let i = 0; i < count; i++) {
      const py = pts[i * 3 + 1]
      if (py < minY) minY = py
      if (py > maxY) maxY = py
    }
    const span = Math.max(0.2, maxY - minY)
    const sunk = 0.3 + e * 0.18
    const lift = y - (minY + span * sunk)
    const norms = new Float32Array(count * 3)
    const triangles = src.index ? src.index.length / 3 : count / 3
    const tri = (t, k) => (src.index ? src.index[t * 3 + k] : t * 3 + k)
    for (let t = 0; t < triangles; t++) {
      const i0 = tri(t, 0)
      const i1 = tri(t, 1)
      const i2 = tri(t, 2)
      const ax = pts[i1 * 3] - pts[i0 * 3]
      const ay = pts[i1 * 3 + 1] - pts[i0 * 3 + 1]
      const az = pts[i1 * 3 + 2] - pts[i0 * 3 + 2]
      const bx = pts[i2 * 3] - pts[i0 * 3]
      const by = pts[i2 * 3 + 1] - pts[i0 * 3 + 1]
      const bz = pts[i2 * 3 + 2] - pts[i0 * 3 + 2]
      let nx = ay * bz - az * by
      let ny = az * bx - ax * bz
      let nz = ax * by - ay * bx
      const nl = Math.hypot(nx, ny, nz) || 1
      nx /= nl
      ny /= nl
      nz /= nl
      norms[i0 * 3] += nx
      norms[i0 * 3 + 1] += ny
      norms[i0 * 3 + 2] += nz
      norms[i1 * 3] += nx
      norms[i1 * 3 + 1] += ny
      norms[i1 * 3 + 2] += nz
      norms[i2 * 3] += nx
      norms[i2 * 3 + 1] += ny
      norms[i2 * 3 + 2] += nz
    }
    const cx = x + 0.5
    const cz = z + 0.5
    for (let t = 0; t < triangles; t++) {
      for (let k = 0; k < 3; k++) {
        const i = tri(t, k)
        const nl = Math.hypot(norms[i * 3], norms[i * 3 + 1], norms[i * 3 + 2]) || 1
        const nx = norms[i * 3] / nl
        const ny = norms[i * 3 + 1] / nl
        const nz = norms[i * 3 + 2] / nl
        const px = cx + pts[i * 3]
        const py = lift + pts[i * 3 + 1]
        const pz = cz + pts[i * 3 + 2]
        const ax = Math.abs(nx)
        const ay = Math.abs(ny)
        const az = Math.abs(nz)
        const u = ay >= ax && ay >= az ? px : ax >= az ? pz : px
        const v = ay >= ax && ay >= az ? pz : ax >= az ? py : py
        bag.positions.push(px, py, pz)
        bag.normals.push(nx, ny, nz)
        bag.uvs.push(u * 0.62, v * 0.62)
        const tone = shade[i]
        bag.colors.push(tone, tone, tone)
      }
    }
  }

  function pushRibTube(bag, x0, y0, z0, x1, y1, z1, radius, ribs, color, phase, dome, ribDepth = 0.48) {
    let dx = x1 - x0
    let dy = y1 - y0
    let dz = z1 - z0
    const len = Math.hypot(dx, dy, dz) || 1
    dx /= len
    dy /= len
    dz /= len
    let ux = 0
    let uy = 1
    let uz = 0
    if (Math.abs(dy) > 0.92) {
      ux = 1
      uy = 0
    }
    let rx = dy * uz - dz * uy
    let ry = dz * ux - dx * uz
    let rz = dx * uy - dy * ux
    const rl = Math.hypot(rx, ry, rz) || 1
    rx /= rl
    ry /= rl
    rz /= rl
    const bx = ry * dz - rz * dy
    const by = rz * dx - rx * dz
    const bz = rx * dy - ry * dx
    const cols = ribs * 4
    const rows = Math.max(4, Math.round(len / 0.26))
    const grid = []
    for (let row = 0; row <= rows; row++) {
      const t = row / rows
      const px = x0 + (x1 - x0) * t
      const py = y0 + (y1 - y0) * t
      const pz = z0 + (z1 - z0) * t
      let profile = 0.94 + 0.06 * Math.sin(t * Math.PI)
      if (dome && t > 0.74) profile *= Math.cos(((t - 0.74) / 0.26) * Math.PI * 0.5)
      if (t < 0.06) profile *= 0.82 + t / 0.06 * 0.18
      const ring = []
      for (let col = 0; col < cols; col++) {
        const ang = (col / cols) * Math.PI * 2 + phase
        const rib = Math.cos(ang * ribs)
        const r = Math.max(0.035, radius * profile * (1 + rib * ribDepth))
        ring.push([
          px + (rx * Math.cos(ang) + bx * Math.sin(ang)) * r,
          py + (ry * Math.cos(ang) + by * Math.sin(ang)) * r,
          pz + (rz * Math.cos(ang) + bz * Math.sin(ang)) * r,
          0.38 + (rib + 1) * 0.31
        ])
      }
      grid.push({ ring, c: [px, py, pz] })
    }
    const tone = (pts) => {
      let s = 0
      for (const p of pts) s += p[3]
      s /= pts.length
      return [color[0] * s, color[1] * s, color[2] * s]
    }
    for (let row = 0; row < rows; row++) {
      const here = grid[row]
      const next = grid[row + 1]
      for (let col = 0; col < cols; col++) {
        const col2 = (col + 1) % cols
        const a = here.ring[col]
        const b = here.ring[col2]
        const c = next.ring[col2]
        const d = next.ring[col]
        const mid = [(a[0] + c[0]) * 0.5, (a[1] + c[1]) * 0.5, (a[2] + c[2]) * 0.5]
        const axis = [(here.c[0] + next.c[0]) * 0.5, (here.c[1] + next.c[1]) * 0.5, (here.c[2] + next.c[2]) * 0.5]
        const abx = b[0] - a[0]
        const aby = b[1] - a[1]
        const abz = b[2] - a[2]
        const acx = c[0] - a[0]
        const acy = c[1] - a[1]
        const acz = c[2] - a[2]
        const nx = aby * acz - abz * acy
        const ny = abz * acx - abx * acz
        const nz = abx * acy - aby * acx
        const outward = nx * (mid[0] - axis[0]) + ny * (mid[1] - axis[1]) + nz * (mid[2] - axis[2])
        const corners = outward >= 0 ? [a, b, c, d] : [b, a, d, c]
        pushQuad(bag, corners.map((p) => [p[0], p[1], p[2]]), tone([a, b, c, d]))
      }
    }
    const cap = grid[rows]
    for (let col = 0; col < cols; col++) {
      const a = cap.ring[col]
      const b = cap.ring[(col + 1) % cols]
      pushQuad(bag, [cap.c, [a[0], a[1], a[2]], [b[0], b[1], b[2]], [b[0], b[1], b[2]]], tone([a, b]))
    }
  }

  function pushCactus(bag, x, z, y) {
    const seed = (world.seed || 1) + 67
    const roll = hash2(x, z, seed + 1)
    const vary = 0.78 + hash2(x, z, seed + 2) * 0.36
    const warm = (hash2(x, z, seed + 3) - 0.5) * 0.012
    const body = [(0.032 + warm) * vary, 0.086 * vary, (0.034 - warm * 0.4) * vary]
    const arm = tint(body, 0.9)
    const scale = 0.9 + roll * 0.38
    const trunkH = 2.05 * scale
    const trunkR = 0.27 * (0.82 + hash2(x, z, seed + 4) * 0.36)
    const leanX = (hash2(x, z, seed + 5) - 0.5) * 0.22
    const leanZ = (hash2(x, z, seed + 6) - 0.5) * 0.16
    const phase = hash2(x, z, seed + 7) * Math.PI
    const cx = x + 0.5
    const cz = z + 0.5
    const y0 = y - 0.05
    pushRibTube(bag, cx, y0, cz, cx + leanX, y0 + trunkH, cz + leanZ, trunkR, 6, body, phase, true, 0.5)
    const side = hash2(x, z, seed + 8) > 0.5 ? 1 : -1
    const armAt = (t, dir, reach, up, armPhase) => {
      const ax = cx + leanX * t + dir * trunkR * 0.55
      const ay = y0 + trunkH * t
      const az = cz + leanZ * t
      const ox = ax + dir * reach
      pushRibTube(bag, ax, ay, az, ox, ay + reach * 0.08, az, trunkR * 0.62, 5, arm, armPhase, false, 0.42)
      pushRibTube(bag, ox, ay + reach * 0.04, az, ox + dir * 0.05, ay + up, az + leanZ * 0.2, trunkR * 0.54, 5, body, armPhase + 0.6, true, 0.42)
    }
    armAt(0.4 + hash2(x, z, seed + 9) * 0.06, side, 0.32 * scale, trunkH * (0.32 + hash2(x, z, seed + 10) * 0.12), phase + 0.4)
    if (hash2(x, z, seed + 11) > 0.18) {
      armAt(0.6 + hash2(x, z, seed + 12) * 0.08, -side, 0.26 * scale * (0.75 + hash2(x, z, seed + 13) * 0.4), trunkH * (0.2 + hash2(x, z, seed + 14) * 0.16), phase + 1.3)
    }
  }

  function addDecor(list, x0, z0, x1, z1) {
    if (world?.biome === 'candy' || world?.biome === 'moon') return
    const bags = new Map()
    const take = (key) => {
      let bag = bags.get(key)
      if (!bag) {
        bag = { positions: [], normals: [], uvs: [], colors: [] }
        bags.set(key, bag)
      }
      return bag
    }
    const heights = new Map()
    const heightAt = (x, z) => {
      const key = `${x},${z}`
      const hit = heights.get(key)
      if (hit !== undefined) return hit
      let h = -1
      if (x >= 0 && z >= 0 && x < world.size && z < world.size) {
        h = 0
        for (let y = 1; y < world.height; y++) {
          const id = sample(x, y, z) | 0
          if (!id || id === POOL) {
            h = y - 1
            break
          }
          h = y
        }
      }
      heights.set(key, h)
      return h
    }
    const cliffDrop = (x, z, h) => {
      let drop = 0
      for (let dz = -3; dz <= 3; dz++) {
        for (let dx = -3; dx <= 3; dx++) {
          if (!dx && !dz) continue
          if (dx * dx + dz * dz > 10) continue
          const nh = heightAt(x + dx, z + dz)
          if (nh < 0) continue
          drop = Math.max(drop, Math.abs(nh - h))
        }
      }
      return drop
    }
    const steep = (x, z, h) => {
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nh = heightAt(x + dx, z + dz)
        if (nh >= 0 && Math.abs(nh - h) >= 2) return true
      }
      return false
    }
    const rockPatches = new Map()
    const patchRocks = (gx, gz) => {
      const key = `${gx},${gz}`
      const hit = rockPatches.get(key)
      if (hit) return hit
      const spots = []
      const gate = (world.seed || 1) + 80
      if (hash2(gx, gz, gate) >= 0.6) {
        const candidates = []
        for (let dz = 0; dz < 9; dz++) {
          for (let dx = 0; dx < 9; dx++) {
            const px = gx * 9 + dx
            const pz = gz * 9 + dz
            const ph = heightAt(px, pz)
            if (ph < 2) continue
            if (cliffDrop(px, pz, ph) < 3) continue
            candidates.push({ x: px, z: pz, r: hash2(px, pz, (world.seed || 1) + 53) })
          }
        }
        candidates.sort((p, q) => q.r - p.r)
        const want = 3 + Math.floor(hash2(gx, gz, gate + 1) * 3)
        for (const spot of candidates) {
          if (spots.length >= want) break
          if (spots.some((other) => Math.hypot(other.x - spot.x, other.z - spot.z) < 2.4)) continue
          spots.push(spot)
        }
      }
      rockPatches.set(key, spots)
      return spots
    }
    const boulderHere = (x, z) => patchRocks(Math.floor(x / 9), Math.floor(z / 9)).some((spot) => spot.x === x && spot.z === z)
    for (let z = z0; z < z1; z++) {
      for (let x = x0; x < x1; x++) {
        const h = heightAt(x, z)
        if (h < 1) continue
        const hid = sample(x, h, z) | 0
        if (hid === TIMBER || hid === CANOPY || hid === POOL) continue
        if ((sample(x, h + 1, z) | 0) !== 0) continue
        const ground = hid
        const n = hash2(x, z, (world.seed || 1) + 41)
        const low = quality.tier === 'low'
        if (ground === TURF && n > (low ? 0.93 : 0.84)) {
          pushCross(take('tuft'), x, z, h + 1, 0.48, 0.22, [1, 1, 1])
        }
        if (!low && ground === TURF && hash2(x, z, (world.seed || 1) + 47) > 0.93) {
          pushCross(take('flower'), x, z, h + 1, 0.36, 0.16, [1, 1, 1])
        }
        const stony = ground === TURF || ground === DUNE || ground === ROCK || ground === FROST
        const cactusHere = quality.tier === 'high' &&
          ground === DUNE &&
          (world.biome === 'desert' || world.landform === 'canyon') &&
          !steep(x, z, h) &&
          x % 8 === 3 &&
          z % 8 === 5 &&
          hash2(x, z, (world.seed || 1) + 67) > 0.2
        if (cactusHere) {
          pushCactus(take('cactus'), x, z, h + 1)
        } else if (stony && boulderHere(x, z) && quality.tier === 'high') {
          pushBoulder(take('rock'), x, z, h + 1)
        }
      }
    }
    for (const [key, bag] of bags) {
      if (!bag.positions.length) continue
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.Float32BufferAttribute(bag.positions, 3))
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(bag.normals, 3))
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(bag.uvs, 2))
      geo.setAttribute('color', new THREE.Float32BufferAttribute(bag.colors, 3))
      const material = key === 'flower' ? materials.flower : key === 'rock' ? (quality.tier === 'high' ? materials.boulder : materials.stone) : key === 'cactus' ? materials.cactus : materials.tuft
      const view = new THREE.Mesh(geo, material)
      const solidDecor = quality.tier === 'high' && (key === 'rock' || key === 'cactus')
      view.castShadow = solidDecor
      view.receiveShadow = solidDecor
      scene.add(view)
      list.push(view)
    }
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
    const horizon = zenith.clone().lerp(new THREE.Color('#e7eef6'), light > 0.45 ? 0.22 : 0.12)
    if (light < 0.35) horizon.lerp(new THREE.Color('#1b2433'), 0.45)
    sky.material.uniforms.uZenith.value.copy(zenith)
    sky.material.uniforms.uHorizon.value.copy(horizon)
    sky.material.uniforms.uLight.value = light
    const elev = 0.22 + light * 0.85
    sunDir.set(0.55, Math.sin(elev), 0.35 * Math.cos(elev)).normalize()
    sky.material.uniforms.uSun.value.copy(sunDir)
    scene.fog.color.copy(haze).lerp(horizon, light > 0.5 ? 0.08 : 0.28)
    scene.background.copy(horizon)
    hemi.color.copy(zenith)
    const bounce = world?.biome === 'desert' ? 0xc4a574
      : world?.biome === 'snow' ? 0xb7c4d0
        : world?.biome === 'candy' ? 0xe7a0c4
          : world?.biome === 'moon' ? 0x3a4250
            : 0x3d6b32
    hemi.groundColor.set(light > 0.4 ? bounce : 0x243028)
    hemi.intensity = 0.12 + light * 0.22
    sun.intensity = 0.45 + light * 3.6
    sun.color.set(light > 0.55 ? 0xffe2b0 : 0xffc49a)
    renderer.toneMappingExposure = 0.62 + light * 0.55
  }

  function renderReflection() {
    const plane = WATER + 1
    const waters = []
    for (const list of chunks.values()) {
      for (const mesh of list) {
        if (!mesh.userData.water) continue
        waters.push(mesh)
        mesh.visible = false
      }
    }
    reflectCam.fov = camera.fov
    reflectCam.aspect = camera.aspect
    reflectCam.near = camera.near
    reflectCam.far = camera.far
    reflectCam.position.set(camera.position.x, plane - (camera.position.y - plane), camera.position.z)
    reflectCam.up.set(0, -1, 0)
    reflectCam.lookAt(look.x, plane - (look.y - plane), look.z)
    reflectCam.updateProjectionMatrix()
    const clip = new THREE.Plane(new THREE.Vector3(0, 1, 0), -plane)
    renderer.localClippingEnabled = true
    renderer.clippingPlanes = [clip]
    sky.mesh.position.copy(reflectCam.position)
    renderer.setRenderTarget(reflectTarget)
    renderer.clear()
    renderer.render(scene, reflectCam)
    renderer.setRenderTarget(null)
    renderer.clippingPlanes = []
    renderer.localClippingEnabled = false
    for (const mesh of waters) mesh.visible = true
    reflectOn.value = 1
    reflectRes.value.set(canvas.width || 2, canvas.height || 2)
  }

  function render(frame) {
    resize()
    TIME.value = (frame.now || 0) / 1000
    const eyeY = frame.eye.y
    camera.position.set(frame.eye.x, eyeY, frame.eye.z)
    look.set(frame.eye.x + frame.dir.x, eyeY + frame.dir.y, frame.eye.z + frame.dir.z)
    camera.lookAt(look)
    applyCycle(frame.cycle)
    renderReflection()
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
