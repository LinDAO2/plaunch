const FREEFORM = [
  'tetris', 'chess', 'poker', 'rpg', 'dialogue', 'story', 'racing', 'match-3', 'match3',
  'card game', 'tower defense', 'minecraft', 'inventory', 'crafting', 'board game',
  'wordle', 'trivia', 'rhythm', 'fighting', 'metroidvania', 'roguelike', 'visual novel',
  'paint', 'drawing game', 'physics', 'platformer with'
]

const SPEC = [
  'tap', 'click', 'reaction', 'reflex', 'guess', 'dodge', 'meteor', 'falling', 'whack',
  'mole', 'chase', 'homing', 'shoot', 'shmup', 'platform', 'jump', 'maze', 'lane',
  'catch', 'avoid', 'arcade', 'survive'
]

export function classifyTier(prompt) {
  const text = String(prompt || '').toLowerCase()
  if (FREEFORM.some((hint) => text.includes(hint))) return 'freeform'
  if (SPEC.some((hint) => text.includes(hint))) return 'spec'
  return 'freeform'
}

export function normalizeTier(tier, prompt) {
  if (tier === 'spec' || tier === 'freeform') return tier
  if (tier === undefined || tier === null || tier === '' || tier === 'auto') return classifyTier(prompt)
  return null
}
