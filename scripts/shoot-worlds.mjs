import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'
import { VISTA_PITCH } from '../src/blocks/goals.js'
import { frameProblem } from '../src/blocks/frame-check.js'

const base = 'http://127.0.0.1:43217'
const out = '/opt/cursor/artifacts/worlds'
await mkdir(out, { recursive: true })

const prompts = [
  ['forest', 'a dense green forest with tall trees'],
  ['lake-mountains', 'mountains with a lake'],
  ['clear-lake', 'mountains surrounding a clear lake'],
  ['beach', 'a sandy beach along the coast'],
  ['snow-peaks', 'snowy mountain peaks'],
  ['desert-canyon', 'a desert canyon']
]

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader'] })
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
const errors = []
page.on('pageerror', (error) => errors.push(String(error)))
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(msg.text())
})
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
  errors.length = 0
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
  await page.goto(`${base}/play/${made.id}`, { waitUntil: 'domcontentloaded', timeout: 45000 })
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
  await page.evaluate((pitch) => {
    const here = window.__blocks.pos()
    window.__blocks.aim(here.yaw, pitch)
  }, VISTA_PITCH)
  let stats = null
  let problem = 'no sample'
  for (let attempt = 0; attempt < 12; attempt++) {
    await page.waitForTimeout(400)
    stats = await page.evaluate(() => window.__blocks.measure())
    const pixel = frameProblem(stats)
    if (!stats?.chunks) problem = `${name}: no chunks`
    else if (pixel) problem = `${name}: ${pixel}`
    else problem = ''
    if (!problem) break
  }
  const thumbs = await page.evaluate(() => [...document.querySelectorAll('.hotbar button')].map((button) => button.style.backgroundImage))
  const labels = await page.evaluate(() => [...document.querySelectorAll('.hotbar button')].map((button) => button.getAttribute('aria-label')))
  if (thumbs.length !== 7 || labels.includes('Petal') || labels.includes('Candy') || thumbs.some((url) => !url.includes('/textures/'))) {
    problem = problem || `${name}: hotbar should be seven terrain textures (${labels.join(', ')})`
  }
  await page.screenshot({ path: path.join(out, `${name}.png`) })
  const pose = await page.evaluate(() => window.__blocks.pos())
  console.log(name, made.id, made.biome, made.landform, made.structure, made.music, made.cycle, JSON.stringify({ ...stats, pitch: pose.pitch }), thumbs.map((url) => url.slice(0, 48)).join(' | '))
  const shader = errors.filter((line) => /Shader Error|VALIDATE_STATUS|not compiled|program not valid/.test(line))
  if (shader.length) {
    throw new Error(`${name} shader\n${shader.slice(0, 6).join('\n')}`)
  }
  if (problem) {
    console.log('render check failed', problem, JSON.stringify(stats))
    throw new Error(problem)
  }
}
if (errors.length) console.log('page errors', errors)
await browser.close()
