import assert from 'node:assert/strict'
import path from 'node:path'
import { test } from 'node:test'
import { resolveArtifactsDir, startServer } from '../testing/helpers.js'

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
    await page.waitForFunction(() => /Template/i.test(document.querySelector('#gen-mode')?.textContent || ''))
    const mechanics = await page.locator('#type option').allTextContents()
    assert.deepEqual(mechanics, ['Tap challenge', 'Reaction test', 'Number guess', 'Meteor dodge', 'Arcade', 'Block world'])

    await page.fill('#prompt', 'a candy island with a pyramid')
    await page.click('#generate')
    await page.waitForFunction(() => document.querySelector('#editor')?.hidden === false && /Candy/.test(document.querySelector('#name')?.value || ''))
    assert.match(await page.locator('#gen-mode').innerText(), /template/i)
    assert.equal(await page.locator('#mechanic').innerText(), 'BLOCKS')

    const email = `ada-${Date.now()}@example.com`
    await page.click('#account')
    await page.click('#auth-switch')
    await page.fill('#auth-email', email)
    await page.fill('#auth-password', 'test-password-123')
    await page.fill('#auth-name', 'Ada')
    await page.click('#auth-submit')
    await page.waitForFunction(() => document.querySelector('#account')?.textContent.includes('Ada'))

    await page.click('#publish')
    await page.waitForFunction(() => (document.querySelector('#status')?.textContent || '').includes('/r/'))
    const status = await page.locator('#status').innerText()
    const slug = status.match(/\/r\/([a-z0-9-]+)/)[1]
    assert.match(slug, /candy/)
    await page.waitForFunction(() => {
      const link = document.querySelector('#share-x')
      return link && !link.hidden && link.href.includes('https://x.com/intent/post') && decodeURIComponent(link.href).includes('/r/')
    })

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
    assert.equal(await page.locator('#play').isVisible(), false)
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

test('freeform games on /play receive pointer and keyboard input and fit the frame', { timeout: 120000 }, async () => {
  const { chromium } = await import('playwright')
  const { createClient } = await import('../testing/helpers.js')
  const server = await startServer()
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
  try {
    const client = createClient(server.base)
    await client.prime()
    const reg = await client.request('POST', '/api/auth/register', { email: `ff-${Date.now()}@example.com`, password: 'test-password-123', displayName: 'Ff' })
    assert.equal(reg.status, 201)
    // An 800x600 canvas, like live Gemini output, that scores on pointer and key input.
    const html = '<!DOCTYPE html><html><head><style>body{margin:0;display:flex;justify-content:center;align-items:center;height:100vh;overflow:hidden}</style></head><body><canvas id="c" width="800" height="600"></canvas><script>let s=0;const send=()=>parent.postMessage({type:"playground-score",points:s},"*");const c=document.getElementById("c");c.addEventListener("pointerdown",()=>{s+=1;send()});addEventListener("keydown",()=>{s+=100;send()});</script></body></html>'
    const published = await client.request('POST', '/api/games', { name: 'Input Probe', description: 'probe', type: 'arcade', duration: 30, accent: '#7c6bf2', tier: 'freeform', generation: 'manual', html })
    assert.equal(published.status, 201)
    const page = await browser.newPage({ viewport: { width: 1100, height: 1000 } })
    await page.goto(`${server.base}/play/${published.data.game.id}`, { waitUntil: 'networkidle' })
    await page.click('#play')
    await page.waitForFunction(() => /scale\(/.test(document.querySelector('iframe.freeform-frame')?.style.transform || ''))
    const hit = await page.evaluate(() => {
      const r = document.querySelector('iframe.freeform-frame').getBoundingClientRect()
      return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.tagName
    })
    assert.equal(hit, 'IFRAME')
    await page.keyboard.press('KeyA')
    await page.waitForFunction(() => document.querySelector('#score')?.textContent === 'Score: 100')
    const box = await (await page.$('iframe.freeform-frame')).boundingBox()
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
    await page.waitForFunction(() => document.querySelector('#score')?.textContent === 'Score: 101')
    const top = await fetch(`${server.usercontentBase}/g/${published.data.game.id}`, { headers: { 'sec-fetch-dest': 'document' } })
    assert.equal(top.status, 403)
  } finally {
    await browser.close()
    await server.close()
  }
})

test('discover and moderation fit a 375px screen', { timeout: 120000 }, async () => {
  const { chromium } = await import('playwright')
  const { createClient } = await import('../testing/helpers.js')
  const artifacts = await resolveArtifactsDir()
  const server = await startServer({ env: { ADMIN_EMAILS: 'mod@example.com' } })
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
  try {
    const maker = createClient(server.base)
    await maker.prime()
    await maker.request('POST', '/api/auth/register', {
      email: 'maker@example.com', password: 'test-password-123', displayName: 'Maker'
    })
    await maker.request('POST', '/api/games', {
      name: 'After dark', description: 'nsfw scene', type: 'tap', duration: 10, accent: '#332244'
    })
    await maker.request('POST', '/api/abuse-reports', {
      gameId: 'click-frenzy', reason: 'spam', details: 'Too many popups'
    })
    const page = await browser.newPage({ viewport: { width: 375, height: 812 } })
    const fits = () => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)
    await page.goto(server.base + '/discover', { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() => document.body.innerText.includes('Click Frenzy'))
    assert.equal(await fits(), true)
    await page.screenshot({ path: path.join(artifacts, 'discover_375.png'), fullPage: true })
    await page.goto(server.base + '/', { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() => document.body.innerText.includes('Click Frenzy'))
    assert.equal(await fits(), true)
    await page.goto(`${server.base}/play/click-frenzy`, { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() => document.querySelector('#preview-name')?.textContent === 'Click Frenzy')
    assert.equal(await fits(), true)
    await page.goto(server.base + '/', { waitUntil: 'domcontentloaded' })
    await page.click('#account')
    await page.click('#auth-switch')
    await page.fill('#auth-email', 'mod@example.com')
    await page.fill('#auth-password', 'test-password-123')
    await page.fill('#auth-name', 'Mod')
    await page.click('#auth-submit')
    await page.waitForFunction(() => document.querySelector('#account')?.textContent.includes('Mod'))
    await page.goto(server.base + '/admin', { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() => document.body.innerText.includes('After dark') && document.body.innerText.includes('Too many popups'))
    assert.equal(await fits(), true)
    await page.locator('#admin-games').scrollIntoViewIfNeeded()
    await page.screenshot({ path: path.join(artifacts, 'moderation_375.png'), fullPage: true })
    const privacy = await page.goto(server.base + '/privacy', { waitUntil: 'domcontentloaded' })
    assert.equal(privacy.status(), 200)
    assert.match(await page.locator('.draft-banner').innerText(), /DRAFT — needs legal review/)
  } finally {
    await browser.close()
    await server.close()
  }
})

test('redesign pages fit a desktop', { timeout: 180000 }, async () => {
  const { chromium } = await import('playwright')
  const artifacts = await resolveArtifactsDir()
  const server = await startServer()
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
  const shot = async (page, name) => {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2)
    assert.equal(overflow, false, name)
    await page.screenshot({ path: path.join(artifacts, name) })
  }
  try {
    const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    await desktop.goto(server.base + '/', { waitUntil: 'domcontentloaded' })
    await desktop.waitForFunction(() => document.body.innerText.includes('Make a shared block world from one sentence') && document.body.innerText.includes('Click Frenzy'))
    assert.equal(await desktop.evaluate(() => getComputedStyle(document.body).backgroundImage), 'none')
    assert.equal(await desktop.evaluate(() => getComputedStyle(document.querySelector('#generate')).backgroundColor), 'rgb(230, 255, 58)')
    assert.match(await desktop.locator('.hero-kicker').innerText(), /SHARED BLOCK WORLDS/)
    assert.equal(await desktop.locator('.idea').count(), 6)
    await desktop.waitForFunction(() => !document.querySelector('#ai-off')?.hidden)
    assert.match(await desktop.locator('#ai-off').innerText(), /AI is off/)
    assert.equal(await desktop.evaluate(() => /arcade spec|provider key|token interest/i.test(document.body.innerText)), false)
    assert.equal(await desktop.evaluate(() => /sign in/i.test(document.querySelector('header').innerText)), false)
    assert.match(await desktop.locator('#account').innerText(), /Save your games/)
    await shot(desktop, 'create-no-signin.png')
    const fold = await desktop.evaluate(() => {
      const ask = document.querySelector('#ask').getBoundingClientRect()
      const wall = document.querySelector('#discover').getBoundingClientRect()
      return ask.bottom <= 900 && wall.top >= 860
    })
    assert.equal(fold, true)
    await shot(desktop, '01-home-desktop.png')
    await desktop.locator('.idea').first().click()
    await desktop.click('#generate')
    await desktop.waitForFunction(() => document.querySelector('#editor')?.hidden === false && /Lake/.test(document.querySelector('#name')?.value || ''))
    await shot(desktop, '01-editor-desktop.png')
    await desktop.goto(server.base + '/discover', { waitUntil: 'domcontentloaded' })
    await desktop.waitForFunction(() => document.body.innerText.includes('Click Frenzy') && document.querySelector('.card-share'))
    await shot(desktop, '02-discover-desktop.png')
    await desktop.goto(server.base + '/play/meteor-rain', { waitUntil: 'networkidle' })
    await desktop.click('#play')
    await desktop.waitForFunction(() => document.querySelector('#play')?.hidden === true)
    await desktop.waitForTimeout(700)
    const clear = await desktop.evaluate(() => {
      const goal = document.querySelector('#goal-banner')?.getBoundingClientRect()
      const canvas = document.querySelector('canvas')?.getBoundingClientRect()
      if (!goal || !canvas || goal.height === 0) return false
      return goal.bottom <= canvas.top + 1
    })
    assert.equal(clear, true)
    const stage = await desktop.evaluate(() => document.querySelector('#game').getBoundingClientRect().height)
    assert.ok(stage >= 700, `stage height ${stage}`)
    await shot(desktop, '03-play-desktop.png')
    await desktop.close()
  } finally {
    await browser.close()
    await server.close()
  }
})
