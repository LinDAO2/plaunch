import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createServer } from 'node:http'
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { once } from 'node:events'
import { test } from 'node:test'
import { inspectFreeform } from '../src/ai/freeform-check.js'
import { TRADEMARK, templateById } from '../src/templates/catalog.js'
import { generateTemplateGame, restyleTemplate, templateCatalog, templateHtml } from '../src/templates/generate.js'
import { spliceTemplate } from '../src/templates/splice.js'
import { wordCount } from '../src/templates/render.js'
import { createClient, resolveArtifactsDir, startServer } from '../testing/helpers.js'

function gemini(payload) {
  return new Response(JSON.stringify({
    candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }]
  }), { status: 200, headers: { 'content-type': 'application/json' } })
}

const MARK = /wordle|tetris|pac-man|pacman|flappy bird|space invaders|\bmario\b/i

test('the template catalog and word list are complete', () => {
  const catalog = templateCatalog()
  assert.equal(catalog.length, 15)
  const ids = catalog.map((item) => item.id)
  assert.deepEqual(ids, [
    'word-guess', 'block-drop', 'snake', 'merge-tiles', 'flap', 'breakout',
    'platformer', 'endless-runner', 'space-shooter', 'maze-chomper', 'jump-up', 'match-3',
    'arena', 'circuit-dash', 'beacon-isle'
  ])
  const three = new Set(['arena', 'circuit-dash', 'beacon-isle'])
  for (const item of catalog) {
    assert.ok(item.name)
    assert.ok(item.tags.length)
    assert.ok(item.keywords.length)
    assert.ok(item.description)
    assert.ok(Object.keys(item.editable.CONFIG).length)
    assert.equal(item.editable.THEME['palette.bg'], 'color')
    assert.equal(item.editable.THEME['names.title'], 'text')
    const html = templateHtml(item.id)
    assert.equal(inspectFreeform(html).join('; '), '')
    assert.match(html, new RegExp(`playground-template: ${item.id}`))
    if (three.has(item.id)) {
      assert.match(html, /src="\/three.js"/)
      assert.match(html, /playground-engine: three/)
      assert.doesNotMatch(html, /src="\/kaplay.js"/)
    } else {
      assert.match(html, /src="\/kaplay.js"/)
      assert.match(html, /src="\/zzfx.js"/)
      assert.match(html, /function squash\(\)/)
      assert.match(html, /Post to X/)
      assert.match(html, /shake\(6\)/)
    }
    if (item.id === 'word-guess') {
      assert.match(html, /revealedAt/)
      assert.match(html, /c \* 0\.1/)
      assert.match(html, /age < 0\.25/)
      assert.match(html, /__share/)
    }
    assert.match(html, /PLAYGROUND CONFIG/)
    assert.match(html, /PLAYGROUND THEME/)
    assert.match(html, /PLAYGROUND RULES/)
    assert.doesNotMatch(html, MARK)
    assert.doesNotMatch(html, TRADEMARK)
  }
  assert.equal(wordCount(), 2300)
  const words = readFileSync(new URL('../templates/words-5.txt', import.meta.url), 'utf8').split(/\s+/)
  assert.equal(words.includes('crane'), true)
  assert.equal(words.includes('mario'), false)
  const manifest = JSON.parse(readFileSync(new URL('../templates/manifest.json', import.meta.url), 'utf8'))
  assert.deepEqual(manifest.map((item) => item.id), ids)
})

test('the splicer rejects edits outside the allowed blocks', () => {
  const guess = templateById('word-guess')
  const source = templateHtml('word-guess')
  const outside = spliceTemplate(source, { html: '<p>nope</p>', CONFIG: { maxGuesses: 4 } }, guess)
  assert.equal(outside.ok, false)
  assert.match(outside.error, /not allowed/)
  const unknown = spliceTemplate(source, { CONFIG: { lives: 3 } }, guess)
  assert.equal(unknown.ok, false)
  assert.match(unknown.error, /not editable/)
  const range = spliceTemplate(source, { CONFIG: { maxGuesses: 99 } }, guess)
  assert.equal(range.ok, false)
  assert.match(range.error, /not an allowed number/)
  const title = spliceTemplate(source, { THEME: { names: { title: 'Wordle' } } }, guess)
  assert.equal(title.ok, false)
  assert.match(title.error, /not an allowed value/)
  const fetched = spliceTemplate(source, {
    RULES: { scoreGuess: 'function scoreGuess(guess, answer) { return fetch("https://example.com") }' }
  }, guess)
  assert.equal(fetched.ok, false)
  assert.match(fetched.error, /not an allowed function/)
  const broken = spliceTemplate(source, {
    RULES: { scoreGuess: 'function scoreGuess(guess, answer) { return' }
  }, guess)
  assert.equal(broken.ok, false)
  const ok = spliceTemplate(source, {
    CONFIG: { maxGuesses: 4 },
    THEME: { names: { title: 'Citrus Guess' } },
    RULES: { scoreGuess: 'function scoreGuess(guess, answer) { return guess === answer ? 40 : 1 }' }
  }, guess)
  assert.equal(ok.ok, true, ok.error)
  assert.match(ok.html, /"maxGuesses":4/)
  assert.match(ok.html, /Citrus Guess/)
  assert.match(ok.html, /guess === answer/)
  assert.equal(source.includes('"maxGuesses":4'), false)
  assert.equal(inspectFreeform(ok.html).join('; '), '')
})

test('mocked Gemini uses at most two calls and falls back to a playable template', async () => {
  let calls = 0
  const maze = await generateTemplateGame({
    prompt: 'a maze game',
    env: { AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'test-key' },
    fetchImpl: async () => {
      calls += 1
      if (calls === 1) return gemini({ templateId: 'maze-chomper', confidence: 0.9, changes: ['moon colors'] })
      return gemini({ THEME: { names: { title: 'Moon Maze' } }, html: '<script>fetch(1)</script>' })
    }
  })
  assert.equal(calls, 2)
  assert.equal(maze.templateId, 'maze-chomper')
  assert.equal(maze.templateName, 'Maze Chomper')
  assert.equal(maze.fallback, false)
  assert.equal(maze.mode, 'ai')
  assert.match(maze.html, /Moon Maze/)
  assert.doesNotMatch(maze.html, /fetch\(/)
  assert.equal(inspectFreeform(maze.html).join('; '), '')

  let editCalls = 0
  const themed = await generateTemplateGame({
    prompt: 'wordle',
    env: { AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'test-key' },
    fetchImpl: async () => {
      editCalls += 1
      return gemini({ THEME: { names: { title: 'Citrus Guess' } } })
    }
  })
  assert.equal(editCalls, 1)
  assert.equal(themed.templateId, 'word-guess')
  assert.match(themed.html, /Citrus Guess/)
  assert.equal(themed.fallback, false)

  let busyCalls = 0
  const busy = await generateTemplateGame({
    prompt: 'wordle',
    env: { AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'test-key' },
    fetchImpl: async () => {
      busyCalls += 1
      return new Response(JSON.stringify({ error: { code: 503, status: 'UNAVAILABLE', message: 'overloaded' } }), { status: 503 })
    }
  })
  assert.equal(busyCalls, 1)
  assert.equal(busy.fallback, true)
  assert.equal(busy.mode, 'template')
  assert.equal(busy.provider, null)
  assert.equal(busy.model, null)
  assert.equal(busy.game.generation, 'rule-based-template')
  assert.equal(busy.templateId, 'word-guess')
  assert.equal(busy.templateName, 'Word Guess')
  assert.equal(busy.tier, 'freeform')
  assert.match(busy.html, /<canvas/i)
  assert.equal(inspectFreeform(busy.html).join('; '), '')
  assert.doesNotMatch(busy.html, MARK)

  let rejectedCalls = 0
  const rejected = await generateTemplateGame({
    prompt: 'tetris',
    env: { AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'test-key' },
    fetchImpl: async () => {
      rejectedCalls += 1
      return new Response(JSON.stringify({ error: { code: 400, status: 'INVALID_ARGUMENT', message: 'bad' } }), { status: 400 })
    }
  })
  assert.equal(rejectedCalls, 1)
  assert.equal(rejected.fallback, true)
  assert.equal(rejected.templateId, 'block-drop')
  assert.doesNotMatch(rejected.html, /tetris/i)

  const restyle = await restyleTemplate({
    templateId: 'word-guess',
    html: templateHtml('word-guess'),
    prompt: 'night letters',
    turn: 2,
    env: { AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'test-key' },
    fetchImpl: async () => gemini({
      CONFIG: { maxGuesses: 3 },
      THEME: { names: { title: 'Night Letters' } },
      RULES: { scoreGuess: 'function scoreGuess(){ return fetch("https://example.com") }' }
    })
  })
  assert.match(restyle.html, /Night Letters/)
  assert.match(restyle.html, /"maxGuesses":6/)
  assert.doesNotMatch(restyle.html, /fetch\(/)
})

test('template mode still plays the six named prompts with no provider key', async () => {
  const server = await startServer()
  const client = createClient(server.base)
  await client.prime()
  const cases = [
    ['wordle', 'word-guess', 'Word Guess'],
    ['tetris', 'block-drop', 'Block Drop'],
    ['snake game', 'snake', 'Snake'],
    ['flappy', 'flap', 'Flap'],
    ['mario platformer', 'platformer', 'Platformer'],
    ['space invaders', 'space-shooter', 'Space Shooter']
  ]
  try {
    for (const [prompt, id, name] of cases) {
      const res = await client.request('POST', '/api/ai/generate', { prompt })
      assert.equal(res.status, 200, prompt)
      assert.equal(res.data.mode, 'template')
      assert.equal(res.data.provider, null)
      assert.equal(res.data.tier, 'freeform')
      assert.equal(res.data.templateId, id)
      assert.equal(res.data.templateName, name)
      assert.equal(res.data.game.name, name)
      assert.equal(inspectFreeform(res.data.html).join('; '), '')
      assert.doesNotMatch(res.data.html, MARK)
      assert.match(res.data.html, /playground-score/)
    }
    const chess = await client.request('POST', '/api/ai/generate', { prompt: 'a chess match on a board' })
    assert.equal(chess.data.templateId, null)
    assert.equal(chess.data.tier, 'freeform')
  } finally {
    await server.close()
  }
})

test('every template boots, takes input, and posts a score', { timeout: 240000 }, async () => {
  const html = Object.fromEntries([
    'word-guess', 'block-drop', 'snake', 'merge-tiles', 'flap', 'breakout',
    'platformer', 'endless-runner', 'space-shooter', 'maze-chomper', 'jump-up', 'match-3'
  ].map((id) => [id, templateHtml(id)]))
  const shots = path.join(tmpdir(), 'pg-template-shots')
  mkdirSync(shots, { recursive: true })
  const vendor = {
    '/kaplay.js': readFileSync(new URL('../vendor/kaplay/kaplay-3001.0.19.js', import.meta.url)),
    '/zzfx.js': readFileSync(new URL('../vendor/zzfx/zzfx.js', import.meta.url))
  }
  const server = createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1')
    if (vendor[url.pathname]) {
      res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' })
      res.end(vendor[url.pathname])
      return
    }
    const id = url.pathname.slice(1)
    if (!html[id]) {
      res.writeHead(404)
      res.end('missing')
      return
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    res.end(html[id])
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const port = server.address().port
  const { chromium } = await import('playwright')
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist']
  })
  const names = {
    'word-guess': 'Word Guess',
    'block-drop': 'Block Drop',
    snake: 'Snake',
    'merge-tiles': 'Merge Tiles',
    flap: 'Flap',
    breakout: 'Breakout',
    platformer: 'Platformer',
    'endless-runner': 'Endless Runner',
    'space-shooter': 'Space Shooter',
    'maze-chomper': 'Maze Chomper',
    'jump-up': 'Jump Up',
    'match-3': 'Match-3'
  }
  try {
    for (const id of Object.keys(html)) {
      for (const viewport of [{ width: 480, height: 480 }, { width: 1440, height: 900 }]) {
        const page = await browser.newPage({ viewport })
        const errors = []
        page.on('pageerror', (error) => errors.push(String(error)))
        await page.addInitScript(() => {
          window.__scores = []
          addEventListener('message', (event) => {
            if (event.data && event.data.type === 'playground-score') window.__scores.push(event.data)
          })
        })
        try {
          await page.goto(`http://127.0.0.1:${port}/${id}`, { waitUntil: 'domcontentloaded' })
          await page.waitForFunction(() => window.__engine === 'kaplay' && window.__state && window.__state.phase === 'start', null, { timeout: 8000 })
          await page.keyboard.press('Enter')
          await page.waitForFunction(() => window.__state.phase === 'play' || window.__state.phase === 'over', null, { timeout: 8000 })
          const box = await page.evaluate(() => {
            const rect = document.querySelector('#game').getBoundingClientRect()
            return {
              w: rect.width,
              h: rect.height,
              sw: document.documentElement.scrollWidth,
              sh: document.documentElement.scrollHeight
            }
          })
          assert.equal(box.w <= viewport.width + 2 && box.h <= viewport.height + 2, true, `${id} canvas ${box.w}x${box.h}`)
          assert.equal(box.w >= viewport.width * 0.9 || box.h >= viewport.height * 0.9, true, `${id} did not scale`)
          assert.equal(box.sw <= viewport.width + 2, true, `${id} overflow ${box.sw}`)
          if (viewport.width === 480) {
            await page.waitForTimeout(160)
            const png = await page.evaluate(() => document.querySelector('#game').toDataURL('image/png'))
            writeFileSync(path.join(shots, `${id}.png`), Buffer.from(png.split(',')[1], 'base64'))
          }
          const before = await page.evaluate(() => window.__state.input)
          await page.keyboard.press('ArrowRight')
          await page.waitForFunction((value) => window.__state.input > value, before, { timeout: 4000 })
          await page.waitForFunction(() => window.__posted === true && window.__scores.length > 0, null, { timeout: 16000 })
          const report = await page.evaluate(() => ({
            phase: window.__state.phase,
            score: window.__state.score,
            points: window.__scores[0]
          }))
          assert.equal(Number.isInteger(report.points.points), true, id)
          assert.equal(report.points.points >= 0 && report.points.points <= 100000, true)
          assert.equal(Object.keys(report.points).sort().join(','), 'points,type')
        } catch (error) {
          throw new Error(`${id} ${viewport.width}x${viewport.height}: ${error.message}; pageerrors=${errors.join(' | ')}`)
        } finally {
          await page.close()
        }
      }
    }
  } finally {
    await browser.close()
    await new Promise((resolve) => server.close(resolve))
  }
  const artifacts = await resolveArtifactsDir()
  const order = Object.keys(html)
  const sheet = path.join(artifacts, 'templates-contact.png')
  const composed = spawnSync('python3', ['-c', `
from PIL import Image, ImageDraw
import os
shots = ${JSON.stringify(shots)}
order = ${JSON.stringify(order)}
names = ${JSON.stringify(names)}
cell, label = 320, 28
sheet = Image.new('RGB', (cell * 3, (cell + label) * 4), (0, 0, 0))
draw = ImageDraw.Draw(sheet)
for i, id in enumerate(order):
    im = Image.open(os.path.join(shots, id + '.png')).convert('RGB')
    im = im.resize((cell, cell), Image.Resampling.BOX)
    x = (i % 3) * cell
    y = (i // 3) * (cell + label)
    draw.text((x + 8, y + 6), names[id], fill=(231, 233, 234))
    sheet.paste(im, (x, y + label))
sheet.save(${JSON.stringify(sheet)})
`], { encoding: 'utf8' })
  assert.equal(composed.status, 0, composed.stderr)
  for (const id of ['word-guess', 'block-drop', 'platformer']) {
    copyFileSync(path.join(shots, `${id}.png`), path.join(artifacts, `${id}.png`))
  }
})

test('Kaplay in the sandbox still cannot fetch or open a WebSocket', { timeout: 120000 }, async () => {
  const probe = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Kaplay net</title></head>
<body>
<canvas id="game" width="480" height="480"></canvas>
<script src="/kaplay.js"></script>
<script src="/zzfx.js"></script>
<script>
const violations = []
document.addEventListener('securitypolicyviolation', function (event) {
  violations.push(event.violatedDirective + ' ' + event.blockedURI)
})
let engine = 'missing'
try {
  kaplay({ canvas: document.querySelector('#game'), width: 480, height: 480, background: '#000000', debug: false })
  engine = typeof kaplay + ':' + typeof zzfx
} catch (err) {
  engine = 'error:' + err.message
}
let fetchBlocked = false
fetch('https://example.com/nope').then(function () { fetchBlocked = false }).catch(function () { fetchBlocked = true })
let wsState = 'pending'
try {
  const ws = new WebSocket('wss://example.com/nope')
  ws.addEventListener('error', function () { wsState = 'error:' + ws.readyState })
} catch (err) {
  wsState = 'thrown'
}
setTimeout(function () {
  parent.postMessage({ type: 'playground-probe', fetchBlocked: fetchBlocked, wsState: wsState, violations: violations, engine: engine }, '*')
}, 600)
</script>
</body>
</html>`
  const server = await startServer()
  const client = createClient(server.base)
  await client.prime()
  const created = await client.request('POST', '/api/games', {
    name: 'Net Probe',
    description: 'Kaplay network probe',
    type: 'tap',
    duration: 10,
    accent: '#112233'
  })
  assert.equal(created.status, 201)
  const id = created.data.game.id
  await server.db.query(
    `update games set tier = 'freeform', mechanic = 'arcade', spec = null, freeform_html = $1 where id = $2`,
    [probe, id]
  )
  const kaplay = await fetch(`${server.usercontentBase}/kaplay.js`)
  assert.equal(kaplay.status, 200)
  assert.equal(kaplay.headers.get('x-vendor-version'), '3001.0.19')
  assert.match(kaplay.headers.get('content-type'), /javascript/)
  const zzfx = await fetch(`${server.usercontentBase}/zzfx.js`)
  assert.equal(zzfx.status, 200)
  assert.equal(zzfx.headers.get('x-vendor-version'), '1.4.0')
  const { chromium } = await import('playwright')
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist']
  })
  const page = await browser.newPage({ viewport: { width: 480, height: 480 } })
  const network = []
  page.on('request', (request) => {
    if (request.url().includes('example.com')) network.push(request.url())
  })
  await page.addInitScript(() => {
    window.__probes = []
    addEventListener('message', (event) => window.__probes.push(event.data))
  })
  try {
    await page.goto(`${server.base}/play/${id}?embed=1`, { waitUntil: 'domcontentloaded' })
    const frame = page.locator('iframe.freeform-frame')
    assert.equal(await frame.getAttribute('sandbox'), 'allow-scripts allow-pointer-lock')
    await page.click('#embed-play')
    await page.waitForFunction(() => (window.__probes || []).some((item) => item && item.type === 'playground-probe'), null, { timeout: 15000 })
    const report = await page.evaluate(() => window.__probes.find((item) => item.type === 'playground-probe'))
    assert.equal(report.fetchBlocked, true)
    assert.equal(report.wsState, 'error:3')
    assert.equal(report.engine, 'function:function')
    assert.equal(report.violations.some((item) => item.startsWith('connect-src') && item.includes('https://example.com/nope')), true)
    assert.equal(report.violations.some((item) => item.startsWith('connect-src') && item.includes('wss://example.com/nope')), true)
    assert.deepEqual(network, [])
  } finally {
    await browser.close()
    await server.close()
  }
})

test('the studio names the template and can restyle it', { timeout: 120000 }, async () => {
  const server = await startServer()
  const { chromium } = await import('playwright')
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  try {
    await page.goto(server.base + '/', { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() => /Template/i.test(document.querySelector('#gen-mode')?.textContent || ''))
    await page.fill('#prompt', 'wordle')
    await page.click('#generate')
    await page.waitForFunction(() => document.querySelector('#built-on')?.hidden === false)
    assert.equal(await page.locator('#built-on-name').innerText(), 'Word Guess')
    assert.match(await page.locator('#built-on').innerText(), /Built on:/)
    assert.equal(await page.locator('#restyle').innerText(), 'Try another style')
    await page.click('#restyle')
    await page.waitForFunction(() => (document.querySelector('#toast')?.textContent || '').includes('New style ready'))
    assert.equal(await page.locator('#built-on-name').innerText(), 'Word Guess')
  } finally {
    await browser.close()
    await server.close()
  }
})
