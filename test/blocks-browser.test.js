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
    await wide.waitForFunction(() => {
      const goal = document.querySelector('#world-goal')
      return goal && !goal.hidden && /Tower \d+\/4/.test(goal.textContent) && /Sparks \d+\/6/.test(goal.textContent)
    })
    const grassSky = await wide.evaluate(() => window.__blocks.sky)
    assert.match(grassSky, /^#[0-9a-f]{6}$/)
    await wide.screenshot({ path: path.join(artifacts, 'blocks-play-desktop.png') })
    await wide.screenshot({ path: path.join(artifacts, 'blocks-grassland-goal.png') })

    const handset = await phone.newPage()
    handset.on('pageerror', (error) => errors.push(String(error)))
    await handset.goto(`${server.base}/play/blocks-candy-moon?embed=1`, { waitUntil: 'domcontentloaded' })
    assert.equal((await handset.locator('#embed-play').innerText()).trim(), 'Play')
    await handset.click('#embed-play')
    await handset.waitForFunction(() => window.__blocks?.ready)
    const controls = await handset.evaluate(() => {
      const box = (sel) => {
        const el = document.querySelector(sel)
        if (!el) return { w: 0, h: 0 }
        const rect = el.getBoundingClientRect()
        return { w: rect.width, h: rect.height, display: getComputedStyle(el).display }
      }
      return {
        stick: box('#world-stick'),
        place: box('#world-place'),
        jump: box('#world-jump'),
        body: { w: document.body.scrollWidth, h: document.body.scrollHeight }
      }
    })
    assert.equal(controls.stick.display, 'block')
    assert.ok(controls.place.h >= 44 && controls.jump.h >= 44, `phone actions ${controls.place.h} ${controls.jump.h}`)
    assert.ok(controls.body.w <= 480 && controls.body.h <= 480, `phone embed overflow ${controls.body.w}x${controls.body.h}`)
    await handset.goto(`${server.base}/play/blocks-candy-moon`, { waitUntil: 'domcontentloaded' })
    await handset.waitForFunction(() => window.__blocks?.ready)
    await handset.waitForFunction(() => {
      const goal = document.querySelector('#world-goal')
      return goal && !goal.hidden && /Pyramid \d+\/3/.test(goal.textContent) && /Sparks \d+\/8/.test(goal.textContent)
    })
    await handset.screenshot({ path: path.join(artifacts, 'blocks-phone.png') })
    await handset.screenshot({ path: path.join(artifacts, 'blocks-candy-goal.png') })
    assert.deepEqual(errors, [])
  } finally {
    await browser.close()
    await server.close()
  }
})
