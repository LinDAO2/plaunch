import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { runBakeoff } from '../src/ai/bakeoff.js'
import { launchCaptureBrowser, serveCapture, arenaAssetFiles } from '../src/capture-browser.js'

function arg(name, fallback) {
  const index = process.argv.indexOf(name)
  if (index < 0) return fallback
  return process.argv[index + 1] || fallback
}

const promptsPath = arg('--prompts', 'test/bakeoff-prompts.txt')
const providers = String(arg('--providers', 'gemini,openai,anthropic')).split(',').map((item) => item.trim()).filter(Boolean)
const text = await readFile(path.resolve(promptsPath), 'utf8')
const prompts = text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#'))
const outDir = path.resolve(arg('--out', 'artifacts/bakeoff'))
const smoke = !process.argv.includes('--no-smoke')
function reopenRow(row) {
  const errors = Array.isArray(row.errors) ? [...row.errors] : []
  const fallback = Boolean(row.fallback) || row.mode === 'template'
  if (fallback && !errors.includes('template fallback')) errors.push('template fallback')
  return {
    ...row,
    errors,
    fallback,
    ok: errors.length === 0 && row.mode !== 'error' && !fallback,
    mode: fallback ? 'template' : row.mode,
    model: fallback ? null : (row.model ?? null)
  }
}
const research = !process.argv.includes('--no-research')
const results = process.argv.includes('--resmoke')
  ? JSON.parse(await readFile(path.join(outDir, 'bakeoff.json'), 'utf8')).results.map(reopenRow)
  : await runBakeoff({ prompts, providers, outDir, smoke, research })
if (smoke) {
  const browser = await launchCaptureBrowser()
  if (!browser) {
    console.error('Playwright is not available, so headless smoke was skipped.')
  } else {
    const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
    const shared = new Map()
    shared.set('/kaplay.js', await readFile(path.join(root, 'vendor/kaplay/kaplay-3001.0.19.js')))
    shared.set('/zzfx.js', await readFile(path.join(root, 'vendor/zzfx/zzfx.js')))
    shared.set('/three.js', await readFile(path.join(root, 'vendor/three/three.min.js')))
    for (const name of ['lilita-one-latin.woff2', 'rubik-latin-700.woff2', 'chakra-petch-latin-600.woff2']) {
      shared.set(`/fonts/${name}`, await readFile(path.join(root, 'public/fonts', name)))
    }
    for (const name of ['kenney-chars.png', 'kenney-tiles.png']) shared.set(`/sprites/${name}`, await readFile(path.join(root, 'public/sprites', name)))
    for (const [name, body] of arenaAssetFiles()) shared.set(name, body)
    const shotDir = path.join(outDir, 'posters')
    const { mkdir } = await import('node:fs/promises')
    await mkdir(shotDir, { recursive: true })
    for (const row of results) {
      if (!row.file) continue
      const saved = JSON.parse(await readFile(path.join(outDir, 'games', row.file), 'utf8'))
      if (!saved.html) {
        row.smoke = 'no-html'
        continue
      }
      const files = new Map(shared)
      files.set('/game.html', saved.html)
      const server = serveCapture(files)
      const port = await server.listen()
      const page = await browser.newPage({ viewport: { width: 480, height: 480 } })
      const errors = []
      page.on('pageerror', (err) => errors.push(String(err)))
      await page.addInitScript(() => {
        window.__scores = []
        window.__inputSeen = false
        window.addEventListener('message', (event) => {
          const data = event.data
          if (data && data.type === 'playground-score' && Number.isFinite(Number(data.points))) {
            window.__scores.push(Number(data.points))
          }
        })
        window.addEventListener('keydown', () => { window.__inputSeen = true }, true)
        window.addEventListener('pointerdown', () => { window.__inputSeen = true }, true)
      })
      try {
        await page.goto(`http://127.0.0.1:${port}/game.html`, { waitUntil: 'domcontentloaded', timeout: 20000 })
        await page.waitForTimeout(300)
        const beforeScores = await page.evaluate(() => (window.__scores || []).length)
        await page.keyboard.press('Enter')
        await page.keyboard.press('ArrowRight')
        await page.keyboard.press('Space')
        await page.mouse.click(240, 320).catch(() => {})
        await page.evaluate(() => {
          if (window.__arena && window.__arena.push) {
            window.__arena.begin()
            window.__arena.lookAtNearest()
            window.__arena.push({ mz: 1, mx: 0.2, fire: 1 })
            window.__inputSeen = true
          }
        }).catch(() => {})
        await page.waitForFunction(() => {
          const scores = window.__scores || []
          const input = window.__inputSeen || (window.__state && window.__state.input > 0)
          return input && (window.__posted === true || scores.length > 0)
        }, null, { timeout: 15000 }).catch(() => {})
        const probe = await page.evaluate((startCount) => ({
          input: window.__inputSeen || (window.__state && window.__state.input > 0),
          scores: window.__scores || [],
          grew: (window.__scores || []).length > startCount || window.__posted === true
        }), beforeScores)
        const shot = path.join(shotDir, row.file.replace(/\.json$/, '.png'))
        await page.screenshot({ path: shot })
        const scoreOk = probe.scores.length > 0 || probe.grew
        row.poster = shot
        row.input = Boolean(probe.input)
        row.score = probe.scores.at(-1) ?? null
        if (errors.length) row.smoke = `errors: ${errors[0]}`
        else if (!probe.input) row.smoke = 'no-input'
        else if (!scoreOk) row.smoke = 'no-score'
        else row.smoke = 'ok'
        if (row.smoke !== 'ok') row.ok = false
      } catch (err) {
        row.smoke = err.message
        row.ok = false
      } finally {
        await page.close()
        await server.close()
      }
      console.log('smoke', row.provider, row.prompt, row.smoke)
    }
    await browser.close()
    const markdown = [
      '# Bakeoff',
      '',
      'Token counts are from the fixture usage field. USD is omitted when the model has no confirmed price.',
      '',
      '| Prompt | Provider | OK | Mode | Smoke | Score | ms | in | out |',
      '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
      ...results.map((row) => `| ${row.prompt} | ${row.provider} | ${row.ok} | ${row.mode} | ${row.smoke} | ${row.score ?? ''} | ${row.ms} | ${row.tokens.input} | ${row.tokens.output} |`)
    ].join('\n')
    await writeFile(path.join(outDir, 'bakeoff.md'), markdown)
    await writeFile(path.join(outDir, 'bakeoff.json'), JSON.stringify({ results }, null, 2))
  }
}
const failed = results.filter((row) => !row.ok).length
console.log(`bakeoff ${results.length} rows, ${failed} failed, report ${outDir}/bakeoff.md`)
if (failed) process.exitCode = 1
