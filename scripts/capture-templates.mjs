import { readFile, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { arenaAssetFiles, captureGame, launchCaptureBrowser, serveCapture } from '../src/capture-browser.js'
import { TEMPLATES } from '../src/templates/catalog.js'
import { renderTemplate } from '../src/templates/render.js'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(root, 'public', 'posters')

const files = new Map()
for (const spec of TEMPLATES) files.set(`/${spec.id}`, renderTemplate(spec))
files.set('/kaplay.js', await readFile(path.join(root, 'vendor/kaplay/kaplay-3001.0.19.js')))
files.set('/zzfx.js', await readFile(path.join(root, 'vendor/zzfx/zzfx.js')))
files.set('/three.js', await readFile(path.join(root, 'vendor/three/three.min.js')))
for (const name of ['lilita-one-latin.woff2', 'rubik-latin-700.woff2']) {
  files.set(`/fonts/${name}`, await readFile(path.join(root, 'public/fonts', name)))
}
for (const name of ['kenney-chars.png', 'kenney-tiles.png']) {
  files.set(`/sprites/${name}`, await readFile(path.join(root, 'public/sprites', name)))
}
for (const [name, body] of arenaAssetFiles()) files.set(name, body)

const browser = await launchCaptureBrowser()
if (!browser) {
  console.error('Playwright is not available. Template posters were not captured.')
  process.exit(1)
}
const server = serveCapture(files)
const port = await server.listen()
await mkdir(outDir, { recursive: true })
try {
  for (const spec of TEMPLATES) {
    if (spec.engine === 'three') continue
    const png = await captureGame(browser, `http://127.0.0.1:${port}/${spec.id}`, spec.id)
    await writeFile(path.join(outDir, `${spec.id}.png`), png)
    console.log(spec.id, png.length)
  }
} finally {
  await browser.close()
  await server.close()
}
