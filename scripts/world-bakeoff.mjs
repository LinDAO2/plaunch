// Compare world specs for the same prompts. With ANTHROPIC_API_KEY this calls Claude.
// Without a key it prints the repair-path specs and exits 2.
import { generateWorldFromPrompt } from '../src/ai/worldgen.js'

const prompts = [
  'a dense green forest with tall trees',
  'mountains with a lake',
  'a sandy beach along the coast',
  'snowy mountain peaks',
  'a desert canyon',
  'a candy island with a pyramid',
  'build a castle together'
]

const env = { ...process.env }
if (env.ANTHROPIC_API_KEY) {
  env.AI_PROVIDER = env.AI_PROVIDER || 'anthropic'
  env.ANTHROPIC_MODEL = env.ANTHROPIC_MODEL || 'claude-sonnet-5-5'
}

const rows = []
for (const prompt of prompts) {
  const idea = await generateWorldFromPrompt({ prompt, env })
  const spec = idea.spec
  const row = {
    prompt,
    provider: idea.provider,
    model: idea.model,
    fallback: Boolean(idea.fallback),
    name: spec.name,
    biome: spec.biome,
    landform: spec.terrain?.landform,
    seed: spec.terrainSeed,
    structure: spec.structure,
    music: spec.music,
    cycle: spec.cycle
  }
  rows.push(row)
  console.log(`${row.biome.padEnd(10)} ${String(row.landform).padEnd(10)} seed=${row.seed} ${row.structure.padEnd(8)} ${row.music} ${row.cycle}  ${row.name}  — ${prompt}`)
}

const keys = new Set(rows.map((row) => `${row.biome}:${row.landform}:${row.seed}`))
console.log(`distinct biome/landform/seed: ${keys.size}/${rows.length}`)
if (!env.ANTHROPIC_API_KEY) {
  console.log('No ANTHROPIC_API_KEY. These rows are the repair path. Re-run with the key to call Claude.')
  process.exitCode = 2
}
