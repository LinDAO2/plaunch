import assert from 'node:assert/strict'
import { test } from 'node:test'
import { startServer } from '../testing/helpers.js'

test('studio and play smoke', { timeout: 120000 }, async () => {
  const { chromium } = await import('playwright')
  const server = await startServer()
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  const errors = []
  page.on('pageerror', (error) => errors.push(String(error)))
  try {
    await page.goto(server.base + '/', { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() => document.body.innerText.includes('Click Frenzy') && document.body.innerText.includes('0 plays'))
    await page.waitForFunction(() => /Template mode/i.test(document.querySelector('#gen-mode')?.textContent || ''))
    const mechanics = await page.locator('#type option').allTextContents()
    assert.deepEqual(mechanics, ['Tap challenge', 'Reaction test', 'Number guess', 'Meteor dodge', 'Arcade'])

    await page.selectOption('#type', 'reaction')
    await page.click('#play')
    await page.click('#play')
    await page.waitForFunction(() => document.querySelector('#game-label')?.textContent.includes('TOO EARLY'))

    await page.fill('#prompt', 'space dodge falling meteors')
    await page.click('#generate')
    await page.waitForFunction(() => document.querySelector('#name')?.value === 'Cosmic Rush')
    assert.match(await page.locator('#gen-mode').innerText(), /template/i)
    assert.equal(await page.locator('#mechanic').innerText(), 'METEOR DODGE')

    const email = `ada-${Date.now()}@example.com`
    await page.click('#account')
    await page.click('#auth-switch')
    await page.fill('#auth-email', email)
    await page.fill('#auth-password', 'test-password-123')
    await page.fill('#auth-name', 'Ada')
    await page.click('#auth-submit')
    await page.waitForFunction(() => document.querySelector('#account')?.textContent.includes('Ada'))

    await page.click('#publish')
    await page.waitForFunction(() => (document.querySelector('#status')?.textContent || '').includes('/g/'))
    const status = await page.locator('#status').innerText()
    const slug = status.match(/\/g\/([a-z0-9-]+)/)[1]
    assert.equal(slug, 'cosmic-rush')
    await page.waitForFunction(() => {
      const link = document.querySelector('#share-x')
      return link && !link.hidden && link.href.includes('https://x.com/intent/post') && decodeURIComponent(link.href).includes('/r/cosmic-rush')
    })

    await page.click('#play')
    await page.waitForFunction(() => document.querySelector('#game-label')?.textContent.includes('DODGE'))
    await page.keyboard.press('ArrowRight')

    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(`${server.base}/play/click-frenzy`, { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() => document.querySelector('#preview-name')?.textContent === 'Click Frenzy')
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2)
    assert.equal(overflow, false)
    await page.click('#play')
    await page.click('#play')
    await page.waitForFunction(() => document.querySelector('#score')?.textContent.includes('1'))
    await page.setViewportSize({ width: 480, height: 480 })
    await page.goto(`${server.base}/play/meteor-dodge?embed=1`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('#embed-play', { state: 'visible' })
    assert.equal((await page.locator('#embed-play').innerText()).trim(), 'Play')
    const frame = await page.evaluate(() => ({
      w: document.documentElement.scrollWidth,
      h: document.documentElement.scrollHeight
    }))
    assert.ok(frame.w <= 480, `embed width ${frame.w}`)
    assert.ok(frame.h <= 480, `embed height ${frame.h}`)
    await page.click('#embed-play')
    await page.waitForFunction(() => document.querySelector('#embed-gate')?.hidden === true)
    assert.deepEqual(errors, [])
  } finally {
    await browser.close()
    await server.close()
  }
})
