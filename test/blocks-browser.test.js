import assert from 'node:assert/strict'
import path from 'node:path'
import { test } from 'node:test'
import { resolveArtifactsDir, startServer } from '../testing/helpers.js'

test('two embed players share a placed block', { timeout: 120000 }, async () => {
  const { chromium } = await import('playwright')
  const server = await startServer()
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
  const artifacts = await resolveArtifactsDir()
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  const left = await browser.newContext({ viewport: { width: 480, height: 480 } })
  const right = await browser.newContext({ viewport: { width: 480, height: 480 } })
  const errors = []
  try {
    const page = await left.newPage()
    const other = await right.newPage()
    page.on('pageerror', (error) => errors.push(String(error)))
    other.on('pageerror', (error) => errors.push(String(error)))
    await page.goto(`${server.base}/play/blocks-grassland?embed=1`, { waitUntil: 'domcontentloaded' })
    await other.goto(`${server.base}/play/blocks-grassland?embed=1`, { waitUntil: 'domcontentloaded' })
    await page.click('#embed-play')
    await other.click('#embed-play')
    await page.waitForFunction(() => window.__blocks?.ready)
    await other.waitForFunction(() => window.__blocks?.ready)
    const box = await page.locator('body').evaluate((el) => ({ w: el.scrollWidth, h: el.scrollHeight }))
    assert.ok(box.w <= 480 && box.h <= 480, `embed overflow ${box.w}x${box.h}`)
    await page.keyboard.down('KeyW')
    await page.waitForTimeout(350)
    await page.keyboard.up('KeyW')
    await page.keyboard.press('KeyE')
    await other.waitForFunction(() => (window.__blocks?.editCount || 0) > 0, null, { timeout: 8000 })
    const seen = await other.evaluate(() => window.__blocks.lastEdit)
    assert.equal(typeof seen.x, 'number')
    assert.equal(await page.locator('#world-online').innerText(), '2 online')
    await other.waitForFunction(() => (window.__blocks.others || []).length > 0)
    await other.evaluate(() => {
      const mine = window.__blocks.pos()
      const them = window.__blocks.others[0]
      const yaw = Math.atan2(them.x - mine.x, them.z - mine.z)
      window.__blocks.aim(yaw, -0.15)
    })
    await other.waitForTimeout(200)
    await page.screenshot({ path: path.join(artifacts, 'blocks-embed-480.png') })
    await other.screenshot({ path: path.join(artifacts, 'blocks-two-player.png') })
    await left.close()
    await right.close()

    const wide = await desktop.newPage()
    wide.on('pageerror', (error) => errors.push(String(error)))
    await wide.goto(`${server.base}/play/blocks-grassland`, { waitUntil: 'domcontentloaded' })
    await wide.waitForFunction(() => window.__blocks?.ready)
    await wide.waitForFunction(() => (window.__blocks?.editCount || 0) > 0)
    await wide.screenshot({ path: path.join(artifacts, 'blocks-play-desktop.png') })

    const handset = await phone.newPage()
    handset.on('pageerror', (error) => errors.push(String(error)))
    await handset.goto(`${server.base}/play/blocks-candy-moon`, { waitUntil: 'domcontentloaded' })
    await handset.waitForFunction(() => window.__blocks?.ready)
    await handset.screenshot({ path: path.join(artifacts, 'blocks-phone.png') })
    assert.deepEqual(errors, [])
  } finally {
    await browser.close()
    await server.close()
  }
})
