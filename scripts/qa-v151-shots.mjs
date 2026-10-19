import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { schedulePosterCapture } from '../src/poster-store.js'
import { startServer } from '../testing/helpers.js'

const out = process.env.QA_OUT || '/opt/cursor/artifacts/qa-v151'
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
    probe.width = 32
    probe.height = 32
    const ctx = probe.getContext('2d', { willReadFrequently: true })
    ctx.drawImage(img, 0, 0, 32, 32)
    const data = ctx.getImageData(0, 0, 32, 32).data
    let min = 765
    let max = 0
    for (let i = 0; i < data.length; i += 4) {
      const tone = data[i] + data[i + 1] + data[i + 2]
      if (tone < min) min = tone
      if (tone > max) max = tone
    }
    return { ok: max - min > 24 && url.length > 8000, span: max - min, bytes: url.length }
  })
}

async function worldReady(page) {
  await page.waitForSelector('canvas.world-canvas', { state: 'attached', timeout: 60000 })
  const box = await page.evaluate(() => {
    const canvas = document.querySelector('canvas.world-canvas')
    const rect = canvas.getBoundingClientRect()
    const style = getComputedStyle(canvas)
    const game = document.querySelector('#game')?.getBoundingClientRect()
    return {
      w: rect.width,
      h: rect.height,
      cw: canvas.width,
      ch: canvas.height,
      display: style.display,
      visibility: style.visibility,
      inline: canvas.getAttribute('style'),
      gameH: game?.height || 0,
      body: document.body.className
    }
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
      const url = canvas.toDataURL('image/png')
      return url.length > 8000
    } catch {
      return false
    }
  }, null, { timeout: 60000 })
  await page.waitForTimeout(600)
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

async function waitForShot(id) {
  for (let i = 0; i < 45; i++) {
    const result = await server.db.query('select poster_state from games where id = $1', [id])
    if (result.rows[0]?.poster_state === 'shot') return true
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  return false
}

const report = []
try {
  const studio = await openStudio('a sunny grassland with a tower')
  const preview = await painted(studio.page)
  const copy = await studio.page.evaluate(() => ({
    name: document.querySelector('#preview-name')?.textContent || '',
    description: document.querySelector('#preview-description')?.textContent || '',
    bannerHidden: document.querySelector('#goal-banner')?.hidden,
    banner: document.querySelector('#goal-banner')?.textContent || ''
  }))
  report.push({
    shot: 'create-preview',
    ...preview,
    copy,
    errors: studio.errors.filter((line) => /content security policy|refused to/i.test(line))
  })
  if (!preview.ok) throw new Error(`create preview is blank ${JSON.stringify(preview)}`)
  if (/tap as fast/i.test(`${copy.name} ${copy.description}`)) throw new Error(`stray header ${JSON.stringify(copy)}`)
  if (!copy.bannerHidden && /tap as fast/i.test(copy.banner)) throw new Error(`stray banner ${JSON.stringify(copy)}`)
  await studio.page.screenshot({ path: path.join(out, 'after-create-preview.png') })
  await studio.page.locator('#game').screenshot({ path: path.join(out, 'after-create-preview-world.png') })
  await studio.page.close()

  const village = await openStudio('a village with several houses')
  const villagePaint = await painted(village.page)
  report.push({ shot: 'village', ...villagePaint })
  if (!villagePaint.ok) throw new Error(`village preview is blank ${JSON.stringify(villagePaint)}`)
  const banner = await village.page.locator('#goal-banner').evaluate((el) => ({ hidden: el.hidden, text: el.textContent }))
  if (!banner.hidden || /tap as fast/i.test(banner.text)) throw new Error(`stray banner ${JSON.stringify(banner)}`)
  await village.page.locator('#game').screenshot({ path: path.join(out, 'after-village.png') })
  await village.page.click('#publish')
  await village.page.waitForFunction(() => /\/r\/[a-z0-9-]+/.test(document.querySelector('#status')?.textContent || ''), null, { timeout: 20000 })
  const status = await village.page.locator('#status').innerText()
  const publishedId = status.match(/\/r\/([a-z0-9-]+)/)[1]
  report.push({ shot: 'publish-status', status })
  await village.page.close()

  const play = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await play.goto(server.base + '/play/blocks-grassland', { waitUntil: 'domcontentloaded' })
  await worldReady(play)
  const grass = await painted(play)
  report.push({ shot: 'grassland', ...grass })
  if (!grass.ok) throw new Error(`grassland is blank ${JSON.stringify(grass)}`)
  await play.screenshot({ path: path.join(out, 'after-grassland.png') })
  await play.locator('canvas.world-canvas').screenshot({ path: path.join(out, 'after-poster-grassland.png') })
  await play.close()

  for (const width of [375, 320]) {
    const phone = await browser.newPage({ viewport: { width, height: 640 }, isMobile: true, hasTouch: true })
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
      return { place: rect('#world-place'), hotbar: rect('#world-hotbar'), body: { w: document.body.scrollWidth, h: document.body.scrollHeight } }
    })
    assertInside('place', box.place, width, 640)
    assertInside('hotbar', box.hotbar, width, 640)
    const frame = await painted(phone)
    report.push({ shot: `embed-${width}`, ...frame, box })
    if (!frame.ok) throw new Error(`embed ${width} is blank ${JSON.stringify(frame)}`)
    await phone.screenshot({ path: path.join(out, `after-embed-${width}.png`) })
    await phone.close()
  }

  schedulePosterCapture(server.db, { id: publishedId, type: 'world', tier: 'spec', spec: { runtime: 'world' } }, 'development', server.base)
  schedulePosterCapture(server.db, { id: 'blocks-grassland', type: 'world', tier: 'spec', spec: { runtime: 'world' } }, 'development', server.base)

  const shotVillage = await waitForShot(publishedId)
  const shotGrass = await waitForShot('blocks-grassland')
  report.push({ shot: 'poster-capture', village: shotVillage, grassland: shotGrass, publishedId })
  for (const id of [publishedId, 'blocks-grassland']) {
    const res = await fetch(`${server.base}/api/games/${id}/poster.png`)
    const bytes = Buffer.from(await res.arrayBuffer())
    const name = id === 'blocks-grassland' ? 'after-poster-grassland-card.png' : 'after-poster-village.png'
    await writeFile(path.join(out, name), bytes)
    report.push({ shot: name, status: res.status, bytes: bytes.length, kind: res.headers.get('x-poster-kind') || '' })
  }
  console.log(JSON.stringify(report, null, 2))
} finally {
  await browser.close()
  await server.close()
}
