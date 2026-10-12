import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { arenaAssetFiles, launchCaptureBrowser, serveCapture } from '../src/capture-browser.js'
import { ARENA_TEMPLATES } from '../src/arena/templates.js'
import { renderArena } from '../src/arena/render.js'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const artDir = '/opt/cursor/artifacts/posters/v135'
const ids = ['arena', 'circuit-dash', 'beacon-isle']

const files = new Map()
for (const spec of ARENA_TEMPLATES) files.set(`/${spec.id}`, renderArena(spec))
files.set('/three.js', await readFile(path.join(root, 'vendor/three/three.min.js')))
for (const [name, body] of arenaAssetFiles()) files.set(name, body)
for (const name of ['lilita-one-latin.woff2', 'rubik-latin-700.woff2', 'chakra-petch-latin-600.woff2']) {
  files.set(`/fonts/${name}`, await readFile(path.join(root, 'public/fonts', name)))
}

function pngSize(buf) {
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) }
}

await mkdir(artDir, { recursive: true })
for (const id of ids) {
  const src = path.join(root, 'public/posters', `${id}.png`)
  await copyFile(src, path.join(artDir, `before-${id}.png`))
  const buf = await readFile(src)
  console.log('before', id, pngSize(buf), buf.length)
}

const three = files.get('/three.js')
const packs = {
  arena: ['blaster.glb', 'bolt.glb', 'astronaut.glb', 'alien.glb', 'wall.glb', 'barrel.glb', 'crate.glb', 'rock.glb', 'dish.glb'],
  'circuit-dash': ['car.glb', 'barrier.glb', 'road.glb', 'tree.glb', 'pebble.glb'],
  'beacon-isle': ['blaster.glb', 'bolt.glb', 'astronaut.glb', 'alien.glb', 'palm.glb', 'tree.glb', 'bush.glb', 'flower.glb', 'pebble.glb', 'grass.glb', 'beacon.glb']
}
const fonts = ['lilita-one-latin.woff2', 'rubik-latin-700.woff2', 'chakra-petch-latin-600.woff2']
  .reduce((n, name) => n + files.get(`/fonts/${name}`).length, 0)
console.log('three raw', three.length, 'gz', gzipSync(three).length, 'fonts', fonts)
for (const [id, list] of Object.entries(packs)) {
  let raw = 0
  for (const name of list) raw += files.get(`/assets/${name}`).length
  console.log('pack', id, raw, 'first', three.length + raw + fonts)
}

const browser = await launchCaptureBrowser()
if (!browser) {
  console.error('Playwright is not available')
  process.exit(1)
}
const server = serveCapture(files)
const port = await server.listen()
const report = []
try {
  for (const id of ids) {
    for (const sky of ['day', 'neon']) {
      const page = await browser.newPage({ viewport: { width: 480, height: 480 }, deviceScaleFactor: 1 })
      const errors = []
      page.on('pageerror', (err) => errors.push(String(err)))
      page.on('console', (msg) => {
        if (msg.type() === 'error') errors.push(msg.text())
      })
      await page.goto(`http://127.0.0.1:${port}/${id}#sky=${sky}&poster=1`, { waitUntil: 'domcontentloaded', timeout: 20000 })
      await page.waitForFunction(() => window.__arena && window.__arena.ready, null, { timeout: 25000 })
      const boot = await page.evaluate(() => ({
        quality: window.__arena.quality,
        ratio: window.__arena.ratio,
        gl: window.__arena.gl
      }))
      await page.evaluate((gameId) => {
        window.__arena.begin()
        if (gameId === 'arena') window.__arena.lookAtNearest()
        const push = gameId === 'circuit-dash'
          ? { mz: 0.2, mx: 0, fire: 0 }
          : gameId === 'beacon-isle'
            ? { mz: 0, mx: 0, fire: 0, yaw: 0 }
            : { mz: 0, mx: 0, fire: 1 }
        window.__arena.push(push)
      }, id)
      await page.waitForTimeout(800)
      const gray = await page.evaluate(() => {
        const canvas = document.querySelector('#view')
        const probe = document.createElement('canvas')
        probe.width = 48
        probe.height = 48
        const ctx = probe.getContext('2d', { willReadFrequently: true })
        ctx.drawImage(canvas, 0, 0, 48, 48)
        const data = ctx.getImageData(0, 0, 48, 48).data
        const cells = []
        for (let cy = 0; cy < 6; cy++) {
          for (let cx = 0; cx < 6; cx++) {
            let sum = 0
            let n = 0
            for (let y = cy * 8; y < cy * 8 + 8; y++) {
              for (let x = cx * 8; x < cx * 8 + 8; x++) {
                const i = (y * 48 + x) * 4
                sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]
                n++
              }
            }
            cells.push(sum / n)
          }
        }
        const mean = cells.reduce((a, b) => a + b, 0) / cells.length
        const variance = cells.reduce((a, b) => a + (b - mean) ** 2, 0) / cells.length
        const sorted = [...cells].sort((a, b) => a - b)
        return {
          std: Math.sqrt(variance),
          min: sorted[0],
          max: sorted[sorted.length - 1],
          spread: sorted[sorted.length - 1] - sorted[0]
        }
      })
      const png = await page.screenshot({ type: 'png' })
      const name = `after-${id}-${sky}.png`
      await writeFile(path.join(artDir, name), png)
      if (sky === 'day') await writeFile(path.join(root, 'public/posters', `${id}.png`), png)
      report.push({ id, sky, bytes: png.length, size: pngSize(png), boot, gray, errors })
      console.log(JSON.stringify({ id, sky, bytes: png.length, boot, gray, errors }))
      await page.close()
    }
  }
} finally {
  await browser.close()
  await server.close()
}
await writeFile(path.join(artDir, 'capture-report.json'), JSON.stringify(report, null, 2))
