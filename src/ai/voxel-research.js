// Small CC0 / MIT set. No copyleft, no unlicensed repos, no trademarked games.
const REFS = [
  {
    name: 'Kenney Prototype Textures',
    author: 'Kenney',
    license: 'CC0-1.0',
    source: 'https://kenney.nl/assets/prototype-textures',
    tags: ['block', 'texture', 'palette', 'voxel', 'color']
  },
  {
    name: 'Kenney Nature Kit',
    author: 'Kenney',
    license: 'CC0-1.0',
    source: 'https://kenney.nl/assets/nature-kit',
    tags: ['tree', 'grass', 'island', 'terrain', 'forest', 'nature']
  },
  {
    name: 'Kenney Blocky Characters',
    author: 'Kenney',
    license: 'CC0-1.0',
    source: 'https://kenney.nl/assets/blocky-characters',
    tags: ['character', 'npc', 'mob', 'people']
  },
  {
    name: 'Kenney Castle Kit',
    author: 'Kenney',
    license: 'CC0-1.0',
    source: 'https://kenney.nl/assets/castle-kit',
    tags: ['castle', 'tower', 'prefab', 'wall', 'gate']
  },
  {
    name: 'Kenney Food Kit',
    author: 'Kenney',
    license: 'CC0-1.0',
    source: 'https://kenney.nl/assets/food-kit',
    tags: ['candy', 'sweet', 'food', 'dessert']
  }
]

const BUILT_ON = { name: 'Blocks', author: 'Playground', license: 'MIT', source: '' }

function tokens(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(/\s+/).filter((token) => token.length > 2)
}

function score(promptTokens, tags) {
  let n = 0
  for (const tag of tags) {
    if (promptTokens.includes(tag)) n += 2
  }
  return n
}

export function researchWorld({ prompt, published } = {}) {
  const started = Date.now()
  const words = tokens(prompt)
  const inspiredBy = []
  for (const ref of REFS) {
    if (score(words, ref.tags) > 0) inspiredBy.push({ name: ref.name, author: ref.author, license: ref.license, source: ref.source })
  }
  for (const game of Array.isArray(published) ? published : []) {
    if (!game || game.type !== 'world') continue
    const hay = tokens(`${game.name || ''} ${game.description || ''}`)
    const hit = words.some((word) => hay.includes(word) && !['the', 'and', 'with', 'world', 'block', 'blocks'].includes(word))
    if (!hit || !game.name) continue
    inspiredBy.push({ name: game.name, author: 'Playground', license: 'MIT', source: '' })
    if (inspiredBy.length >= 6) break
  }
  if (!inspiredBy.length) {
    inspiredBy.push({ name: REFS[0].name, author: REFS[0].author, license: REFS[0].license, source: REFS[0].source })
  }
  return {
    strategy: 'world',
    builtOn: BUILT_ON,
    inspiredBy: inspiredBy.slice(0, 6),
    brief: {
      coreLoop: 'Shape a shared voxel world and finish its quest.',
      controls: 'Move, look, jump, break, and place.',
      juice: 'Soft light, fog, water, and a spark chime.',
      fun: 'Friends edit the same map.',
      source: 'heuristic'
    },
    ms: Date.now() - started
  }
}
