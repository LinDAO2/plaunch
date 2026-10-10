import assert from 'node:assert/strict'
import { test } from 'node:test'
import { startServer } from '../testing/helpers.js'

// Regression for "Meteor Rain doesn't work" on a laptop: the rocket ignored the
// mouse and trackpad, meteors drew in a dark color, and the canvas was stretched.
test('arcade game is playable with a mouse at desktop size', { timeout: 90000 }, async () => {
  const { chromium } = await import('playwright')
  const server = await startServer()
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const errors = []
  page.on('pageerror', (error) => errors.push(String(error)))
  try {
    await page.addInitScript(() => {
      window.__drawn = []
      const fillText = CanvasRenderingContext2D.prototype.fillText
      CanvasRenderingContext2D.prototype.fillText = function (text, x, y) {
        window.__drawn.push({ text, x, fill: String(this.fillStyle) })
        if (window.__drawn.length > 400) window.__drawn.shift()
        return fillText.apply(this, arguments)
      }
    })
    await page.goto(`${server.base}/play/meteor-rain`, { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() => document.querySelector('#preview-name')?.textContent === 'Meteor Rain')
    assert.match(await page.locator('#controls-hint').innerText(), /mouse/i)
    await page.click('#play')
    const canvas = page.locator('canvas.arcade-canvas')
    const box = await canvas.boundingBox()
    assert.ok(box.width > 300 && box.height > 300, `canvas ${box.width}x${box.height}`)
    const buffer = await canvas.evaluate((el) => ({ w: el.width, h: el.height, dpr: window.devicePixelRatio || 1 }))
    assert.ok(Math.abs(buffer.w / buffer.h - box.width / box.height) < 0.05, 'canvas buffer keeps the on-screen aspect ratio')
    assert.equal(await page.locator('#game-label').isVisible(), false)
    const rocketX = () => page.evaluate(() => window.__drawn.filter((d) => d.text === '🚀').at(-1)?.x ?? null)
    await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.7)
    await page.waitForTimeout(200)
    const start = await rocketX()
    await page.mouse.move(box.x + box.width * 0.1, box.y + box.height * 0.7, { steps: 8 })
    await page.waitForTimeout(500)
    const moved = await rocketX()
    assert.ok(start !== null && moved !== null && start - moved > 100, `rocket followed the mouse ${start} -> ${moved}`)
    await page.waitForFunction(() => window.__drawn.some((d) => d.text === '☄'), null, { timeout: 8000 })
    const meteorFill = await page.evaluate(() => window.__drawn.filter((d) => d.text === '☄').at(-1).fill)
    assert.equal(meteorFill, '#ffffff')
    assert.deepEqual(errors, [])
  } finally {
    await browser.close()
    await server.close()
  }
})
