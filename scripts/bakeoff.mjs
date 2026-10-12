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
const smoke = process.argv.includes('--smoke')
const results = await runBakeoff({ prompts, providers, outDir, smoke })
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
      try {
        await page.goto(`http://127.0.0.1:${port}/game.html`, { waitUntil: 'domcontentloaded', timeout: 20000 })
        await page.waitForTimeout(400)
        await page.keyboard.press('Enter')
        await page.mouse.click(240, 240).catch(() => {})
        await page.waitForTimeout(500)
        const shot = path.join(shotDir, row.file.replace(/\.json$/, '.png'))
        await page.screenshot({ path: shot })
        row.smoke = errors.length ? `errors: ${errors[0]}` : 'ok'
        row.poster = shot
        if (errors.length) row.ok = false
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
      '| Prompt | Provider | OK | Mode | Smoke | ms | in | out |',
      '| --- | --- | --- | --- | --- | --- | --- | --- |',
      ...results.map((row) => `| ${row.prompt} | ${row.provider} | ${row.ok} | ${row.mode} | ${row.smoke} | ${row.ms} | ${row.tokens.input} | ${row.tokens.output} |`)
    ].join('\n')
    await writeFile(path.join(outDir, 'bakeoff.md'), markdown)
    await writeFile(path.join(outDir, 'bakeoff.json'), JSON.stringify({ results }, null, 2))
  }
}
const failed = results.filter((row) => !row.ok).length
console.log(`bakeoff ${results.length} rows, ${failed} failed, report ${outDir}/bakeoff.md`)
if (failed) process.exitCode = 1
