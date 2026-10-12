import http from 'node:http'
import { once } from 'node:events'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const LAUNCH_ARGS = ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist']

export function arenaAssetFiles() {
  const root = fileURLToPath(new URL('../vendor/arena-assets', import.meta.url))
  const files = new Map()
  const walk = (dir, prefix) => {
    for (const name of readdirSync(dir)) {
      if (name.startsWith('.')) continue
      const full = path.join(dir, name)
      if (statSync(full).isDirectory()) walk(full, `${prefix}${name}/`)
      else files.set(`/assets/${prefix}${name}`, readFileSync(full))
    }
  }
  walk(root, '')
  return files
}

function contentType(name) {
  if (name.endsWith('.js')) return 'text/javascript; charset=utf-8'
  if (name.endsWith('.glb')) return 'model/gltf-binary'
  if (name.endsWith('.png')) return 'image/png'
  if (name.endsWith('.woff2')) return 'font/woff2'
  return 'text/html; charset=utf-8'
}
const VENDOR_FILES = {
  '/three.js': fileURLToPath(new URL('../vendor/three/three.min.js', import.meta.url)),
  '/kaplay.js': fileURLToPath(new URL('../vendor/kaplay/kaplay-3001.0.19.js', import.meta.url)),
  '/zzfx.js': fileURLToPath(new URL('../vendor/zzfx/zzfx.js', import.meta.url))
}

export async function launchCaptureBrowser() {
  let chromium
  try {
    ;({ chromium } = await import('playwright'))
  } catch {
    return null
  }
  try {
    return await chromium.launch({ headless: true, args: LAUNCH_ARGS })
  } catch {
    return null
  }
}

export function serveCapture(files) {
  const server = http.createServer((req, res) => {
    const name = new URL(req.url || '/', 'http://127.0.0.1').pathname
    const body = files.get(name)
    if (!body) {
      res.writeHead(404)
      res.end()
      return
    }
    res.writeHead(200, { 'content-type': contentType(name), 'cache-control': 'no-store', 'access-control-allow-origin': '*' })
    res.end(body)
  })
  return {
    async listen() {
      server.listen(0, '127.0.0.1')
      await once(server, 'listening')
      return server.address().port
    },
    close() {
      return new Promise((resolve) => server.close(() => resolve()))
    }
  }
}

async function frameFromPage(page) {
  const sampled = await page.evaluate(async () => {
    const canvases = [...document.querySelectorAll('#game, canvas')]
    const canvas = canvases.sort((a, b) => (b.width * b.height) - (a.width * a.height))[0]
    if (!canvas || canvas.width < 8 || canvas.height < 8) return { ok: false }
    let url = ''
    try { url = canvas.toDataURL('image/png') } catch { return { ok: false } }
    if (!url.startsWith('data:image/png;base64,')) return { ok: false }
    const img = new Image()
    img.src = url
    try { await img.decode() } catch { return { ok: false, url } }
    const probe = document.createElement('canvas')
    probe.width = 24
    probe.height = 24
    const ctx = probe.getContext('2d', { willReadFrequently: true })
    ctx.drawImage(img, 0, 0, 24, 24)
    const data = ctx.getImageData(0, 0, 24, 24).data
    let min = 765
    let max = 0
    for (let i = 0; i < data.length; i += 4) {
      const tone = data[i] + data[i + 1] + data[i + 2]
      if (tone < min) min = tone
      if (tone > max) max = tone
    }
    return { ok: max - min > 24 && url.length > 8000, url }
  })
  if (sampled?.ok) return Buffer.from(sampled.url.slice(sampled.url.indexOf(',') + 1), 'base64')
  const canvas = page.locator('#game, canvas')
  const count = await canvas.count()
  let best = null
  let bestArea = 0
  for (let i = 0; i < count; i++) {
    const box = await canvas.nth(i).boundingBox()
    const area = box ? box.width * box.height : 0
    if (box && area > bestArea) {
      best = canvas.nth(i)
      bestArea = area
    }
  }
  if (best && bestArea >= 32 * 32) return best.screenshot({ type: 'png' })
  const root = page.locator('#pg-root')
  if (await root.count()) {
    const box = await root.boundingBox()
    if (box && box.width >= 32 && box.height >= 32) return root.screenshot({ type: 'png' })
  }
  return page.screenshot({ type: 'png' })
}

async function wake(page, id) {
  const start = page.locator('#pg-start')
  if (await start.count()) {
    await start.click({ timeout: 3000 }).catch(() => {})
  }
  const engine = await page.evaluate(() => window.__engine || '').catch(() => '')
  if (engine === 'kaplay') {
    await page.waitForFunction(() => window.__state && window.__state.phase === 'start', null, { timeout: 8000 })
    await page.keyboard.press('Enter')
    await page.waitForFunction(() => window.__state && window.__state.phase === 'play', null, { timeout: 8000 })
    await page.waitForTimeout(id === 'word-guess' ? 1400 : id === 'block-drop' ? 900 : 640)
    return
  }
  const phase = await page.evaluate(() => (window.__state && window.__state.phase) || '').catch(() => '')
  if (await page.evaluate(() => window.__state && window.__state.engine === 'three').catch(() => false)) {
    await page.waitForFunction(() => window.__arena && window.__arena.ready, null, { timeout: 20000 })
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
    return
  }
  if (phase === 'start') {
    await page.keyboard.press('Enter')
    await page.waitForFunction(() => window.__state.phase === 'play' || window.__state.phase === 'over', null, { timeout: 8000 })
  }
  if (id === 'lane-racer') {
    await page.keyboard.down('ArrowUp')
    await page.waitForTimeout(900)
    await page.keyboard.up('ArrowUp')
    return
  }
  if (id === 'tile-2048') {
    await page.waitForSelector('.tile-inner', { timeout: 8000 })
    await page.evaluate(() => {
      const root = document.getElementById('pg-root')
      if (root) root.style.transform = 'none'
    })
    for (let i = 0; i < 16; i++) {
      await page.keyboard.press(['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'][i % 4])
      await page.waitForTimeout(80)
    }
    const painted = await page.evaluate(() => {
      const tiles = [...document.querySelectorAll('.tile-inner')]
      const colors = tiles.map((el) => getComputedStyle(el).backgroundColor)
      return tiles.length >= 2 && colors.some((color) => color && color !== 'rgba(0, 0, 0, 0)' && color !== 'rgb(0, 0, 0)')
    })
    if (!painted) throw new Error('2048 tiles are not painted')
    return
  }
  if (id === 'stack-blocks') {
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('Space')
      await page.waitForTimeout(220)
    }
    await page.evaluate(() => {
      const canvas = document.querySelector('canvas')
      if (!canvas) return
      canvas.style.width = '420px'
      canvas.style.height = 'auto'
      canvas.style.imageRendering = 'pixelated'
    })
    return
  }
  if (id === 'tower-bounce') {
    await page.keyboard.down('ArrowLeft')
    await page.waitForTimeout(400)
    await page.keyboard.up('ArrowLeft')
    await page.waitForTimeout(900)
    return
  }
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Space')
  await page.waitForTimeout(id === 'flap' ? 180 : 520)
}

export async function captureGame(browser, url, id) {
  const page = await browser.newPage({ viewport: { width: 480, height: 480 }, deviceScaleFactor: 1 })
  try {
    const errors = []
    page.on('pageerror', (error) => errors.push(String(error)))
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 })
    await page.waitForTimeout(250)
    await wake(page, id)
    const png = id === 'tile-2048'
      ? await page.locator('.game-container').screenshot({ type: 'png' })
      : await frameFromPage(page)
    if (!png || png.length < 800 || png.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') {
      throw new Error(`empty poster for ${id}`)
    }
    return png
  } finally {
    await page.close()
  }
}

export async function captureHtml(browser, html) {
  const files = new Map([['/game.html', html]])
  for (const [name, file] of Object.entries(VENDOR_FILES)) {
    if (html.includes(`src="${name}"`)) files.set(name, readFileSync(file))
  }
  if (html.includes('/assets/')) {
    for (const [name, body] of arenaAssetFiles()) files.set(name, body)
  }
  const server = serveCapture(files)
  const port = await server.listen()
  const page = await browser.newPage({ viewport: { width: 480, height: 480 }, deviceScaleFactor: 1 })
  try {
    await page.goto(`http://127.0.0.1:${port}/game.html`, { waitUntil: 'load', timeout: 15000 })
    await wake(page, 'import')
    const png = await frameFromPage(page)
    if (!png || png.length < 800 || png.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') return null
    return png
  } catch {
    return null
  } finally {
    await page.close()
    await server.close()
  }
}
