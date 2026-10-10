import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createClient, startServer } from '../testing/helpers.js'

const PROBE = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Probe</title></head>
<body>
<canvas id="c" width="480" height="480"></canvas>
<script>
(async () => {
  let cookie = ''
  let cookieAccess = 'read'
  try {
    cookie = document.cookie
  } catch (err) {
    cookieAccess = 'thrown'
  }
  let fetchStatus = 'blocked'
  try {
    await fetch('https://example.com/nope')
    fetchStatus = 'ok'
  } catch (err) {
    fetchStatus = 'blocked'
  }
  parent.postMessage({ type: 'playground-probe', cookie, cookieAccess, fetchStatus }, '*')
  parent.postMessage({ type: 'playground-score', points: 17 }, '*')
})()
</script>
</body>
</html>`

test('freeform sandbox blocks parent cookies and the network, and reports a score', { timeout: 120000 }, async () => {
  const server = await startServer()
  const client = createClient(server.base)
  await client.prime()
  await client.request('POST', '/api/auth/register', {
    email: 'probe@example.com',
    password: 'test-password-123',
    displayName: 'Probe'
  })
  const created = await client.request('POST', '/api/games', {
    name: 'Probe Game',
    description: 'Isolation probe',
    type: 'tap',
    duration: 10,
    accent: '#112233'
  })
  assert.equal(created.status, 201)
  const id = created.data.game.id
  await server.db.query(
    `update games set tier = 'freeform', mechanic = 'arcade', spec = null, freeform_html = $1 where id = $2`,
    [PROBE, id]
  )

  const sandbox = await fetch(`${server.usercontentBase}/g/${id}`)
  assert.equal(sandbox.status, 200)
  const csp = sandbox.headers.get('content-security-policy')
  assert.match(csp, /default-src 'none'/)
  assert.match(csp, /connect-src 'none'/)
  assert.match(csp, new RegExp(server.base.replace(/[.]/g, '\\.')))
  assert.equal(sandbox.headers.get('set-cookie'), null)

  const { chromium } = await import('playwright')
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
  const context = await browser.newContext({ viewport: { width: 480, height: 480 } })
  await context.addCookies([{
    name: 'pg_probe',
    value: 'super-secret-session',
    url: server.base,
    httpOnly: false,
    sameSite: 'Lax'
  }])
  const page = await context.newPage()
  const network = []
  page.on('request', (request) => {
    if (request.url().includes('example.com')) network.push(request.url())
  })
  await page.addInitScript(() => {
    window.__probes = []
    window.addEventListener('message', (event) => {
      window.__probes.push({ origin: event.origin, data: event.data })
    })
  })
  try {
    await page.goto(`${server.base}/play/${id}?embed=1`, { waitUntil: 'domcontentloaded' })
    const frame = page.locator('iframe.freeform-frame')
    await frame.waitFor()
    const sandboxAttr = await frame.getAttribute('sandbox')
    assert.equal(sandboxAttr, 'allow-scripts')
    assert.equal(sandboxAttr.includes('allow-same-origin'), false)
    await page.click('#embed-play')
    await page.waitForFunction(() => {
      const score = document.querySelector('#score')?.textContent || ''
      const probe = (window.__probes || []).some((item) => item.data && item.data.type === 'playground-probe')
      return score.includes('17') && probe
    })
    const report = await page.evaluate(() => ({
      cookie: document.cookie,
      probes: window.__probes
    }))
    const probe = report.probes.find((item) => item.data?.type === 'playground-probe')
    assert.match(report.cookie, /super-secret-session/)
    assert.equal(probe.data.cookieAccess, 'thrown')
    assert.equal(String(probe.data.cookie).includes('super-secret-session'), false)
    assert.equal(probe.data.fetchStatus, 'blocked')
    assert.equal(probe.origin, 'null')
    assert.deepEqual(network, [])
    const access = await page.evaluate(() => {
      const iframe = document.querySelector('iframe.freeform-frame')
      return iframe.contentDocument === null ? 'null' : 'readable'
    })
    assert.equal(access, 'null')
  } finally {
    await browser.close()
    await server.close()
  }
})
