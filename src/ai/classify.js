const FREEFORM = [
  'tetris', 'chess', 'poker', 'rpg', 'dialogue', 'story', 'racing', 'match-3', 'match3',
  'card game', 'tower defense', 'minecraft', 'inventory', 'crafting', 'board game',
  'wordle', 'trivia', 'rhythm', 'fighting', 'metroidvania', 'roguelike', 'visual novel',
  'paint', 'drawing game', 'physics', 'platformer', 'endless', 'runner', 'cactus', 'cacti',
  'level', 'levels', 'flappy', 'side-scroll', 'sidescroller', 'puzzle', 'simulation',
  'custom rules', 'obstacle course'
]

const SPEC = [
  'tap', 'click', 'reaction', 'reflex', 'guess', 'dodge', 'meteor', 'falling', 'whack',
  'mole', 'chase', 'homing', 'shoot', 'shmup', 'platform', 'jump', 'maze', 'lane',
  'catch', 'avoid', 'arcade', 'survive'
]

function mentions(text, hint) {
  if (hint.includes(' ')) return text.includes(hint)
  return new RegExp(`\\b${hint}\\b`, 'i').test(text)
}

// Freeform wins when the idea needs its own rules, physics, or levels, even if it also says "jump".
// Simple tap, dodge, reaction, guess, and arcade-primitive ideas stay on the spec.
export function heuristicTier(prompt) {
  const text = String(prompt || '').toLowerCase()
  if (FREEFORM.some((hint) => mentions(text, hint))) return 'freeform'
  if (SPEC.some((hint) => mentions(text, hint))) return 'spec'
  return 'uncertain'
}

export function classifyTier(prompt) {
  const tier = heuristicTier(prompt)
  return tier === 'uncertain' ? 'freeform' : tier
}

export function normalizeTier(tier, prompt) {
  if (tier === 'spec' || tier === 'freeform') return tier
  if (tier === undefined || tier === null || tier === '' || tier === 'auto') return classifyTier(prompt)
  return null
}
