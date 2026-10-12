import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { runBakeoff } from '../src/ai/bakeoff.js'

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
const failed = results.filter((row) => !row.ok).length
console.log(`bakeoff ${results.length} rows, ${failed} failed, report ${outDir}/bakeoff.md`)
if (failed) process.exitCode = 1
