import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'

const base = 'http://127.0.0.1:43217'
const out = '/opt/cursor/artifacts/worlds'
await mkdir(out, { recursive: true })

const prompts = [
  ['forest', 'a dense green forest with tall trees'],
  ['lake-mountains', 'mountains with a lake'],
  ['beach', 'a sandy beach along the coast'],
  ['snow-peaks', 'snowy mountain peaks'],
  ['desert-canyon', 'a desert canyon']
]

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader'] })
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
const errors = []
page.on('pageerror', (error) => errors.push(String(error)))
await page.goto(base + '/', { waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => document.querySelector('#gen-mode')?.textContent)
await page.screenshot({ path: path.join(out, 'create.png') })
const csrf = await page.evaluate(async () => {
  const token = (await (await fetch('/api/auth/csrf', { credentials: 'same-origin' })).json()).csrfToken
  const res = await fetch('/api/auth/register', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json', 'x-csrf-token': token },
    body: JSON.stringify({ email: `shots-${Date.now()}@example.com`, password: 'test-password-123', displayName: 'Shots' })
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || ('register ' + res.status))
  return body.csrfToken || token
})

for (const [name, prompt] of prompts) {
  const made = await page.evaluate(async ({ token, prompt }) => {
    const generated = await fetch('/api/ai/generate', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json', 'x-csrf-token': token },
      body: JSON.stringify({ prompt, kind: 'world', tier: 'auto' })
    })
    const result = await generated.json()
    if (!generated.ok) throw new Error(result.error || 'generate failed')
    const published = await fetch('/api/games', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json', 'x-csrf-token': token },
      body: JSON.stringify({
        name: result.game.name,
        description: result.game.description,
        type: 'world',
        duration: result.game.duration,
        accent: result.game.accent,
        generation: result.game.generation,
        tier: 'spec',
        spec: result.spec,
        credit: result.credit,
        prompt
      })
    })
    const game = await published.json()
    if (!published.ok) throw new Error(game.error || 'publish failed')
    return { id: game.game.id, biome: result.spec.biome, landform: result.spec.terrain?.landform, structure: result.spec.structure, music: result.spec.music, cycle: result.spec.cycle }
  }, { token: csrf, prompt })
  await page.goto(`${base}/play/${made.id}`, { waitUntil: 'networkidle' })
  const start = page.locator('#world-start')
  if (await start.count() && await start.isVisible()) await start.click()
  try {
    await page.waitForFunction(() => window.__blocks && window.__blocks.ready && (window.__blocks.lit || window.__blocks.note), null, { timeout: 20000 })
  } catch (error) {
    const info = await page.evaluate(() => ({
      blocks: window.__blocks || null,
      text: document.body.innerText.slice(0, 400),
      errors: window.__errs || []
    })).catch(() => ({}))
    await page.screenshot({ path: path.join(out, `${name}-failed.png`) })
    console.log('fail', name, info)
    throw error
  }
  await page.waitForTimeout(1600)
  await page.screenshot({ path: path.join(out, `${name}.png`) })
  console.log(name, made.id, made.biome, made.landform, made.structure, made.music, made.cycle)
}
if (errors.length) console.log('page errors', errors)
await browser.close()
