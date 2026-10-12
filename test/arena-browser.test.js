import assert from 'node:assert/strict'
import { test } from 'node:test'
import { startServer } from '../testing/helpers.js'

test('Arena plays in the card iframe: move, fire, score, and a throttled frame rate', { timeout: 120000 }, async () => {
  const { chromium } = await import('playwright')
  const server = await startServer()
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist']
  })
  try {
    const page = await browser.newPage({ viewport: { width: 480, height: 480 } })
    const errors = []
    page.on('pageerror', (error) => errors.push(String(error)))
    await page.goto(`${server.base}/play/arena?embed=1`, { waitUntil: 'domcontentloaded' })
    await page.click('#embed-play')
    const frame = await new Promise((resolve, reject) => {
      const start = Date.now()
      const look = () => {
        const found = page.frames().find((item) => item.url().includes('/g/arena'))
        if (found) resolve(found)
        else if (Date.now() - start > 8000) reject(new Error('arena frame did not load'))
        else setTimeout(look, 50)
      }
      look()
    })
    await frame.waitForFunction(() => window.__arena && window.__state.phase === 'play', null, { timeout: 8000 })
    const boot = await frame.evaluate(() => ({ gl: window.__arena.gl, quality: window.__arena.quality }))
    assert.equal(boot.gl, true, `WebGL did not start. pageerrors=${errors.join(' | ')}`)
    await frame.evaluate(() => window.__arena.push({ mz: 1, mx: 0, yaw: 0, pitch: 0, fire: 0 }))
    await frame.waitForFunction(() => window.__arena.moved() > 0.4, null, { timeout: 4000 })
    await frame.evaluate(() => window.__arena.lookAtNearest())
    await page.waitForFunction(() => {
      const text = document.querySelector('#score')?.textContent || ''
      return Number(text.replace(/\D/g, '')) > 0
    }, null, { timeout: 12000 })
    const session = await page.context().newCDPSession(page)
    await session.send('Emulation.setCPUThrottlingRate', { rate: 4 })
    await page.waitForTimeout(1200)
    const perf = await frame.evaluate(() => ({
      fps: window.__arena.fps,
      quality: window.__arena.quality,
      ratio: window.__arena.ratio,
      score: window.__state.score
    }))
    assert.equal(perf.score > 0, true)
    assert.equal(Number.isFinite(perf.fps), true)
    console.log(`ARENA_PERF ${JSON.stringify({ ...perf, gl: boot.gl, errors })}`)

    const phone = await browser.newPage({ viewport: { width: 390, height: 700 }, hasTouch: true })
    await phone.goto(`${server.base}/play/circuit-dash?embed=1`, { waitUntil: 'domcontentloaded' })
    await phone.click('#embed-play')
    const kart = await new Promise((resolve, reject) => {
      const start = Date.now()
      const look = () => {
        const found = phone.frames().find((item) => item.url().includes('/g/circuit-dash'))
        if (found) resolve(found)
        else if (Date.now() - start > 8000) reject(new Error('kart frame did not load'))
        else setTimeout(look, 50)
      }
      look()
    })
    await kart.waitForFunction(() => document.body.classList.contains('touch') && window.__arena, null, { timeout: 8000 })
    const sticks = await kart.evaluate(() => getComputedStyle(document.querySelector('#sticks')).display)
    assert.equal(sticks, 'block')
    const isle = await phone.goto(`${server.base}/play/beacon-isle?embed=1`, { waitUntil: 'domcontentloaded' })
    assert.equal(isle.status(), 200)
    assert.match(await phone.locator('h1, #preview-name').first().innerText(), /Beacon Isle/)
  } finally {
    await browser.close()
    await server.close()
  }
})
