import assert from 'node:assert/strict'
import { mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, test } from 'node:test'
import { bundleFiles, inspectImport } from '../src/imports/bundle.js'
import { fetchGithubRepo, parseGithubUrl } from '../src/imports/github.js'
import { detectLicense, gateLicense } from '../src/imports/license.js'
import { zipDeflate, zipStore, unzip } from '../src/imports/zip.js'
import { wrapDocument } from '../src/imports/wrapper.js'
import { createClient, startServer } from '../testing/helpers.js'

const SHA = 'a'.repeat(40)
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')

function b64(text) {
  return Buffer.from(text).toString('base64')
}

function fixture({ spdx = 'MIT', license = true, calls }) {
  const licenseText = 'MIT License\n\nCopyright (c) 2020 Ada Lovelace\n\nPermission is hereby granted, free of charge, to any person obtaining a copy'
  const html = '<!DOCTYPE html><html><head><title>Ada Run</title><link rel="stylesheet" href="game.css"></head><body><canvas id="c" width="200" height="200"></canvas><img src="dot.png" alt=""><script src="game.js"></script></body></html>'
  const tree = [
    { path: 'index.html', type: 'blob' },
    { path: 'game.css', type: 'blob' },
    { path: 'game.js', type: 'blob' },
    { path: 'dot.png', type: 'blob' }
  ]
  const files = {
    '/contents/index.html': b64(html),
    '/contents/game.css': b64('canvas { background: #000; }'),
    '/contents/game.js': b64('document.getElementById("c").getContext("2d").fillRect(0,0,8,8);'),
    '/contents/dot.png': PNG.toString('base64')
  }
  return async (url) => {
    calls.push(String(url))
    if (!String(url).startsWith('https://api.github.com/')) throw new Error(`live network is not allowed: ${url}`)
    const path = new URL(url).pathname
    const json = (data, status = 200) => ({ status, text: async () => JSON.stringify(data) })
    if (path.includes('/commits/')) return json({ sha: SHA })
    if (path.endsWith('/license')) {
      if (!license) return json({ message: 'Not Found' }, 404)
      return json({ license: { spdx_id: spdx }, encoding: 'base64', content: b64(licenseText) })
    }
    if (path.includes('/git/trees/')) return json({ tree, truncated: false })
    const file = Object.keys(files).find((key) => path.includes(key))
    if (file) return json({ encoding: 'base64', content: files[file], path: file })
    throw new Error(`unexpected GitHub URL ${url}`)
  }
}

describe('license and bundle', () => {
  test('detects SPDX ids and license text', () => {
    assert.equal(detectLicense({ spdx: 'MIT' }), 'MIT')
    assert.equal(detectLicense({ spdx: 'NOASSERTION', text: 'CC0 1.0 Universal' }), 'CC0-1.0')
    assert.equal(detectLicense({ text: 'GNU General Public License\nVersion 3' }), 'GPL-3.0-only')
    assert.equal(detectLicense({ text: 'BSD 2-Clause License' }), 'BSD-2-Clause')
    assert.equal(detectLicense({ text: 'nothing here' }), '')
  })

  test('gates permissive, copyleft, and missing licenses', () => {
    assert.equal(gateLicense({ spdx: 'Apache-2.0' }).ok, true)
    assert.equal(gateLicense({ spdx: 'WTFPL' }).ok, true)
    const copyleft = gateLicense({ spdx: 'GPL-3.0-only' })
    assert.equal(copyleft.ok, false)
    assert.match(copyleft.error, /unmodified/)
    const allowed = gateLicense({ spdx: 'AGPL-3.0-only', confirmUnmodified: true })
    assert.equal(allowed.ok, true)
    assert.equal(allowed.copyleftConfirmed, true)
    const missing = gateLicense({ spdx: '' })
    assert.equal(missing.ok, false)
    assert.match(missing.error, /I am the author/)
    const permitted = gateLicense({ spdx: 'NOASSERTION', confirmPermission: true })
    assert.equal(permitted.ok, true)
    assert.equal(permitted.permissionConfirmed, true)
    assert.equal(gateLicense({ spdx: 'Proprietary' }).ok, false)
  })

  test('inlines css, js, and images and rejects network and eval', () => {
    const png = PNG
    const ok = bundleFiles({
      'index.html': '<!DOCTYPE html><html><head><link rel="stylesheet" href="game.css"><!-- https://example.com/old --></head><body><img src="dot.png" alt=""><script src="game.js"></script><script>// https://cdn.example/app.js\nlocalStorage.setItem("score","1")</script></body></html>',
      'game.css': 'img { background: url("dot.png"); }',
      'game.js': 'document.body.dataset.ready = "1"',
      'dot.png': png
    })
    assert.equal(ok.ok, true, ok.errors.join('; '))
    assert.equal(ok.html.includes('<link'), false)
    assert.equal(ok.html.includes('src="game.js"'), false)
    assert.match(ok.html, /data:image\/png;base64,/)
    assert.match(ok.html, /document\.body\.dataset\.ready/)
    assert.match(ok.html, /localStorage/)
    assert.equal(ok.html.includes('example.com'), false)
    const fetched = bundleFiles({ 'index.html': '<!DOCTYPE html><html><body><script>fetch("https://evil.test")</script></body></html>' })
    assert.equal(fetched.ok, false)
    assert.match(fetched.errors.join(' '), /fetch is not allowed|External URL/)
    const evil = bundleFiles({ 'index.html': '<html><body><script>eval("1")</script></body></html>' })
    assert.equal(evil.ok, false)
    assert.match(evil.errors.join(' '), /eval is not allowed/)
  })

  test('reads store and deflate zips', () => {
    const stored = unzip(zipStore({ 'index.html': '<html></html>', 'js/app.js': 'var ready = true' }))
    assert.equal(stored['index.html'].toString(), '<html></html>')
    assert.equal(stored['js/app.js'].toString(), 'var ready = true')
    const packed = unzip(zipDeflate({ 'index.html': '<html><canvas></canvas></html>' }))
    assert.match(packed['index.html'].toString(), /canvas/)
  })

  test('pins a GitHub repo with a local fixture and no other hosts', async () => {
    assert.deepEqual(parseGithubUrl('https://github.com/ada/run/tree/main/src'), {
      owner: 'ada', repo: 'run', ref: 'main', subpath: 'src'
    })
    const calls = []
    const repo = await fetchGithubRepo({
      url: 'https://github.com/ada/run',
      ref: 'main',
      token: '',
      fetchImpl: fixture({ calls })
    })
    assert.equal(repo.sha, SHA)
    assert.equal(repo.license, 'MIT')
    assert.equal(repo.author, 'Ada Lovelace')
    assert.equal(calls.every((url) => url.startsWith('https://api.github.com/')), true)
    assert.equal(calls.some((url) => url.includes(`/commits/`)), true)
    assert.ok(repo.files['index.html'])
  })
})

describe('bring your game', () => {
  test('imports, gates licenses, shims storage, scales in the embed, and lets an admin hide one', async () => {
    const calls = []
    const server = await startServer({
      fetchImpl: fixture({ calls }),
      env: { ADMIN_EMAILS: 'mod@example.com' }
    })
    const shots = path.join('/tmp', 'pg-v11')
    await mkdir(shots, { recursive: true })
    const { chromium } = await import('playwright')
    const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
    try {
      const guest = createClient(server.base)
      await guest.prime()
      const catalog = await guest.request('GET', '/api/discover?view=new')
      const catalogNames = catalog.data.games.map((game) => game.name)
      assert.equal(catalogNames.includes('Ada Run'), false)
      assert.equal(catalogNames.includes('Zip Run'), false)
      assert.equal(catalogNames.includes('Dot Run'), false)
      assert.equal(catalogNames.includes('Word Guess'), true)
      const clean = await browser.newPage({ viewport: { width: 1440, height: 900 } })
      await clean.goto(server.base + '/discover', { waitUntil: 'domcontentloaded' })
      await clean.waitForFunction(() => document.body.innerText.includes('Word Guess') && document.body.innerText.includes('Original by Gabriele Cirulli (MIT)'))
      assert.equal(await clean.evaluate(() => /Ada Run|Zip Run|Dot Run|Submitter/.test(document.body.innerText)), false)
      const card = clean.locator('.card', { hasText: '2048' }).first()
      assert.match(await card.locator('.card-credit').innerText(), /Original by Gabriele Cirulli \(MIT\)/)
      assert.equal(await card.locator('img.poster-shot').count(), 1)
      await clean.screenshot({ path: path.join(shots, 'discover-credits.png'), fullPage: true })
      await clean.close()
      const blocked = await guest.request('POST', '/api/import', { html: '<!DOCTYPE html><html><body><canvas></canvas></body></html>' })
      assert.equal(blocked.status, 400)
      assert.match(blocked.data.error, /I am the author/)
      const hostile = await guest.request('POST', '/api/import', {
        html: '<!DOCTYPE html><html><body><script>eval("1")</script></body></html>',
        confirmPermission: true,
        name: 'Nope'
      })
      assert.equal(hostile.status, 400)
      assert.match(hostile.data.error, /eval is not allowed/)
      const named = await guest.request('POST', '/api/import', {
        html: '<!DOCTYPE html><html><body><canvas></canvas></body></html>',
        confirmPermission: true,
        name: 'Tetris Clone'
      })
      assert.equal(named.status, 400)
      assert.match(named.data.error, /trademark/)

      const pasted = await guest.request('POST', '/api/import', {
        html: '<!DOCTYPE html><html><head><title>Dot Run</title></head><body><canvas id="c" width="200" height="200"></canvas><script>localStorage.setItem("hi","9");parent.postMessage({type:"pg-store",shim:localStorage.__playground===true,value:localStorage.getItem("hi"),session:sessionStorage.length},"*")</script></body></html>',
        confirmPermission: true,
        name: 'Dot Run',
        author: 'Ada Lovelace'
      })
      assert.equal(pasted.status, 201, pasted.data?.error)
      assert.equal(pasted.data.game.generation, 'import')
      assert.equal(pasted.data.game.credit.permissionConfirmed, true)
      assert.equal(pasted.data.game.credit.author, 'Ada Lovelace')
      assert.ok(pasted.data.game.tags.includes('community'))
      assert.equal(pasted.data.game.tags.includes('opensource'), false)
      assert.match(pasted.data.game.sandboxUrl, /\/g\//)

      const zip = zipStore({
        'index.html': '<!DOCTYPE html><html><head><title>Zip Run</title><link rel="stylesheet" href="game.css"></head><body><canvas id="c" width="160" height="160"></canvas><img src="dot.png" alt=""></body></html>',
        'game.css': 'canvas { background: #111; }',
        'dot.png': PNG
      })
      const uploaded = await guest.request('POST', '/api/import', {
        filename: 'game.zip',
        dataBase64: zip.toString('base64'),
        confirmPermission: true,
        name: 'Zip Run'
      })
      assert.equal(uploaded.status, 201, uploaded.data?.error)
      assert.match(uploaded.data.game.html, /data:image\/png;base64,/)
      assert.equal(uploaded.data.game.html.includes('href="game.css"'), false)
      assert.match(uploaded.data.game.html, /canvas \{ background: #111; \}/)

      const brought = await guest.request('POST', '/api/import', { url: 'https://github.com/ada/run' })
      assert.equal(brought.status, 201, brought.data?.error)
      assert.equal(brought.data.game.credit.license, 'MIT')
      assert.equal(brought.data.game.credit.sha, SHA)
      assert.equal(brought.data.game.credit.copyleftConfirmed, false)
      assert.ok(brought.data.game.tags.includes('opensource'))
      assert.ok(brought.data.game.tags.includes('community'))
      assert.match(brought.data.game.html, /data:image\/png;base64,/)
      assert.equal(calls.every((url) => url.startsWith('https://api.github.com/')), true)

      const copyleft = await startServer({ fetchImpl: fixture({ spdx: 'GPL-3.0-only', calls: [] }), seed: false })
      try {
        const other = createClient(copyleft.base)
        await other.prime()
        const denied = await other.request('POST', '/api/import', { url: 'https://github.com/ada/run', name: 'Copyleft Run' })
        assert.equal(denied.status, 400)
        assert.match(denied.data.error, /unmodified/)
        const accepted = await other.request('POST', '/api/import', {
          url: 'https://github.com/ada/run',
          name: 'Copyleft Run',
          confirmUnmodified: true
        })
        assert.equal(accepted.status, 201, accepted.data?.error)
        assert.equal(accepted.data.game.credit.copyleftConfirmed, true)
        assert.equal(accepted.data.game.credit.license, 'GPL-3.0-only')
      } finally {
        await copyleft.close()
      }

      const none = await startServer({ fetchImpl: fixture({ license: false, calls: [] }), seed: false })
      try {
        const other = createClient(none.base)
        await other.prime()
        const denied = await other.request('POST', '/api/import', { url: 'https://github.com/ada/run', name: 'Private Run' })
        assert.equal(denied.status, 400)
        assert.match(denied.data.error, /No license/)
        const accepted = await other.request('POST', '/api/import', {
          url: 'https://github.com/ada/run',
          name: 'Private Run',
          confirmPermission: true
        })
        assert.equal(accepted.status, 201, accepted.data?.error)
        assert.equal(accepted.data.game.credit.permissionConfirmed, true)
      } finally {
        await none.close()
      }

      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
      await page.addInitScript(() => {
        window.__fits = []
        window.__store = null
        window.addEventListener('message', (event) => {
          if (event.data?.type === 'playground-fit') window.__fits.push(event.data)
          if (event.data?.type === 'pg-store') window.__store = event.data
        })
      })
      await page.goto(server.base + '/', { waitUntil: 'domcontentloaded' })
      await page.click('#bring-open')
      await page.waitForSelector('#bring-dialog', { state: 'visible' })
      await page.screenshot({ path: path.join(shots, 'import-flow.png') })

      await page.setViewportSize({ width: 480, height: 480 })
      await page.goto(`${server.base}/play/${pasted.data.game.id}?embed=1`, { waitUntil: 'domcontentloaded' })
      await page.click('#embed-play')
      await page.waitForFunction(() => window.__fits.length > 0 && window.__store)
      const fit = await page.evaluate(() => window.__fits[window.__fits.length - 1])
      const store = await page.evaluate(() => window.__store)
      assert.equal(store.shim, true)
      assert.equal(store.value, '9')
      assert.equal(fit.width <= 480 && fit.height <= 480, true)
      assert.ok(Math.max(fit.width, fit.height) >= 440, `fit ${fit.width}x${fit.height}`)
      const frame = await page.evaluate(() => ({ w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight }))
      assert.ok(frame.w <= 480 && frame.h <= 480, `embed ${frame.w}x${frame.h}`)
      await page.frameLocator('iframe.freeform-frame').locator('#pg-start').click()

      await page.setViewportSize({ width: 900, height: 900 })
      await page.evaluate(() => {
        const frame = document.querySelector('iframe.freeform-frame')
        const src = frame.src
        frame.style.cssText = 'position:fixed;left:0;top:0;width:800px;height:800px;border:0;z-index:5'
        frame.src = src
      })
      await page.waitForFunction(() => window.__fits.some((item) => Math.max(item.width, item.height) > 500))
      const bigger = await page.evaluate(() => window.__fits[window.__fits.length - 1])
      assert.ok(bigger.width <= 800 && bigger.height <= 800)
      assert.ok(Math.max(bigger.width, bigger.height) >= 760, `larger fit ${bigger.width}x${bigger.height}`)

      await page.setViewportSize({ width: 480, height: 480 })
      await page.goto(`${server.base}/play/grid-snake?embed=1`, { waitUntil: 'domcontentloaded' })
      await page.click('#embed-play')
      const snake = page.frameLocator('iframe.freeform-frame')
      await snake.locator('#pg-start').click()
      await page.waitForTimeout(400)
      await page.screenshot({ path: path.join(shots, 'import-embed.png') })

      const share = await guest.request('GET', '/r/tile-2048')
      assert.match(share.text, /Original by Gabriele Cirulli \(MIT\) - <a href="https:\/\/github.com\/gabrielecirulli\/2048/)
      const play = await guest.request('GET', '/play/stack-blocks')
      assert.match(play.text, /Original by Jake Gordon \(MIT\)/)
      assert.equal(/tetris/i.test(play.text.replace(/javascript-tetris/g, '')), false)
      const terms = await guest.request('GET', '/terms')
      assert.match(terms.text, /legal-review@playground\.invalid/)
      assert.match(terms.text, /not in effect/)

      const mod = createClient(server.base)
      await mod.prime()
      assert.equal((await mod.request('POST', '/api/auth/register', {
        email: 'mod@example.com', password: 'test-password-123', displayName: 'Mod'
      })).status, 201)
      const hidden = await mod.request('POST', `/api/admin/games/${pasted.data.game.id}/hide`, {})
      assert.equal(hidden.status, 200)
      assert.equal(hidden.data.game.status, 'hidden')
      assert.equal((await guest.request('GET', `/play/${pasted.data.game.id}`)).status, 404)

      const stack = await readFile(path.join(process.cwd(), 'imports/stack-blocks/game.html'), 'utf8')
      assert.equal(/tetris/i.test(stack), false)
      assert.equal(inspectImport(stack).length, 0)
      const racer = await readFile(path.join(process.cwd(), 'imports/lane-racer/game.html'), 'utf8')
      assert.equal(racer.includes('data:image/png'), false)
      assert.match(racer, /window\.PG_IMAGES/)
      assert.match(racer, /#e6ff3a/)
      assert.equal(inspectImport(racer).length, 0)
      const board = await readFile(path.join(process.cwd(), 'imports/tile-2048/game.html'), 'utf8')
      assert.match(board, /\.game-container\s*\{/)
      assert.match(board, /\.tile\.tile-2/)
      const wrapped = wrapDocument('<!DOCTYPE html><html><body><canvas width="100" height="100"></canvas><script>localStorage.setItem("k","v")</script></body></html>', { author: 'Ada', license: 'MIT' })
      const probe = await browser.newPage()
      await probe.setContent(wrapped)
      const memory = await probe.evaluate(() => ({ shim: localStorage.__playground === true, value: localStorage.getItem('k') }))
      assert.equal(memory.shim, true)
      assert.equal(memory.value, 'v')
      await probe.close()
      await page.close()
    } finally {
      await browser.close()
      await server.close()
    }
  })
})
