import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { startServer } from '../testing/helpers.js'

const out = process.env.QA_OUT || '/opt/cursor/artifacts/qa-v152'
await mkdir(out, { recursive: true })

const { chromium } = await import('playwright')
const server = await startServer({ seed: true })
const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist']
})

function assertInside(name, box, width, height) {
  if (!box) throw new Error(`${name} is missing`)
  if (box.x < -1 || box.y < -1 || box.x + box.width > width + 1 || box.y + box.height > height + 1) {
    throw new Error(`${name} is off screen at ${JSON.stringify(box)} in ${width}x${height}`)
  }
}

async function painted(page) {
  return page.evaluate(async () => {
    const canvas = document.querySelector('canvas.world-canvas')
    if (!canvas || canvas.width < 32) return { ok: false, reason: 'no canvas' }
    let url = ''
    try { url = canvas.toDataURL('image/png') } catch (err) { return { ok: false, reason: String(err) } }
    const img = new Image()
    img.src = url
    try { await img.decode() } catch { return { ok: false, reason: 'decode' } }
    const probe = document.createElement('canvas')
    probe.width = 48
    probe.height = 48
    const ctx = probe.getContext('2d', { willReadFrequently: true })
    ctx.drawImage(img, 0, 0, 48, 48)
    const data = ctx.getImageData(0, 0, 48, 48).data
    let min = 765
    let max = 0
    let r = 0
    let g = 0
    let b = 0
    let n = 0
    for (let i = 0; i < data.length; i += 4) {
      const tone = data[i] + data[i + 1] + data[i + 2]
      if (tone < min) min = tone
      if (tone > max) max = tone
      r += data[i]
      g += data[i + 1]
      b += data[i + 2]
      n += 1
    }
    return {
      ok: max - min > 24 && url.length > 8000,
      span: max - min,
      bytes: url.length,
      rgb: [Math.round(r / n), Math.round(g / n), Math.round(b / n)]
    }
  })
}

async function worldReady(page) {
  await page.waitForSelector('canvas.world-canvas', { state: 'attached', timeout: 60000 })
  const box = await page.evaluate(() => {
    const canvas = document.querySelector('canvas.world-canvas')
    const rect = canvas.getBoundingClientRect()
    return { w: rect.width, h: rect.height, cw: canvas.width, ch: canvas.height }
  })
  if (box.w < 8 || box.h < 8) throw new Error(`canvas has no box ${JSON.stringify(box)}`)
  await page.waitForFunction(() => window.__blocks && window.__blocks.ready, null, { timeout: 60000 })
  await page.evaluate(() => {
    const start = document.querySelector('.world-start')
    if (start) start.hidden = true
  })
  await page.waitForFunction(async () => {
    const canvas = document.querySelector('canvas.world-canvas')
    if (!canvas || canvas.width < 32) return false
    try {
      return canvas.toDataURL('image/png').length > 8000
    } catch {
      return false
    }
  }, null, { timeout: 60000 })
  await page.waitForTimeout(2800)
}

async function openStudio(prompt) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  const errors = []
  page.on('pageerror', (err) => errors.push(String(err)))
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  await page.goto(server.base + '/', { waitUntil: 'domcontentloaded' })
  await page.fill('#prompt', prompt)
  await page.click('#generate')
  await page.waitForFunction(() => document.querySelector('#editor')?.hidden === false, null, { timeout: 60000 })
  await worldReady(page)
  return { page, errors }
}

const report = []
try {
  const studio = await openStudio('a sunny grassland with a tower')
  const preview = await painted(studio.page)
  const copy = await studio.page.evaluate(() => ({
    name: document.querySelector('#preview-name')?.textContent || '',
    description: document.querySelector('#preview-description')?.textContent || '',
    bannerHidden: document.querySelector('#goal-banner')?.hidden,
    banner: document.querySelector('#goal-banner')?.textContent || '',
    goal: document.querySelector('#world-goal-title')?.textContent || ''
  }))
  report.push({ shot: 'create-preview', ...preview, copy, errors: studio.errors })
  if (!preview.ok) throw new Error(`create preview is blank ${JSON.stringify(preview)}`)
  if (/tap as fast/i.test(`${copy.name} ${copy.description} ${copy.banner}`)) throw new Error(`stray header ${JSON.stringify(copy)}`)
  await studio.page.screenshot({ path: path.join(out, 'after-create-preview.png') })
  await studio.page.close()

  const village = await openStudio('a village with several houses')
  const villagePaint = await painted(village.page)
  const goal = await village.page.locator('#world-goal-title').innerText()
  report.push({ shot: 'village', ...villagePaint, goal, errors: village.errors })
  if (!villagePaint.ok) throw new Error(`village preview is blank ${JSON.stringify(villagePaint)}`)
  if (!/village/i.test(goal)) throw new Error(`village goal missing ${goal}`)
  await village.page.locator('#game').screenshot({ path: path.join(out, 'after-village.png') })
  await village.page.close()

  const play = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await play.goto(server.base + '/play/blocks-grassland', { waitUntil: 'domcontentloaded' })
  await worldReady(play)
  const grass = await painted(play)
  const grassGoal = await play.locator('#world-goal-title').innerText()
  report.push({ shot: 'grassland', ...grass, goal: grassGoal })
  if (!grass.ok) throw new Error(`grassland is blank ${JSON.stringify(grass)}`)
  await play.screenshot({ path: path.join(out, 'after-grassland.png') })
  await play.close()

  const phone = await browser.newPage({ viewport: { width: 375, height: 640 }, isMobile: true, hasTouch: true })
  await phone.goto(`${server.base}/play/blocks-grassland?embed=1`, { waitUntil: 'domcontentloaded' })
  await phone.click('#embed-play')
  await worldReady(phone)
  const box = await phone.evaluate(() => {
    const rect = (sel) => {
      const el = document.querySelector(sel)
      if (!el) return null
      const r = el.getBoundingClientRect()
      return { x: r.x, y: r.y, width: r.width, height: r.height }
    }
    return { place: rect('#world-place'), hotbar: rect('#world-hotbar') }
  })
  assertInside('place', box.place, 375, 640)
  assertInside('hotbar', box.hotbar, 375, 640)
  const frame = await painted(phone)
  report.push({ shot: 'embed-375', ...frame, box })
  if (!frame.ok) throw new Error(`embed 375 is blank ${JSON.stringify(frame)}`)
  await phone.screenshot({ path: path.join(out, 'after-embed-375.png') })
  await phone.close()

  console.log(JSON.stringify(report, null, 2))
} finally {
  await browser.close()
  await server.close()
}
