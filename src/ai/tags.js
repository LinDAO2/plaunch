export const TAGS = ['action', 'arcade', 'casual', 'dodge', 'guess', 'puzzle', 'reaction', 'runner', 'sandbox', 'tap']

const HINTS = [
  ['runner', ['runner', 'endless', 'cactus', 'cacti', 'flappy', 'side-scroll', 'sidescroller']],
  ['puzzle', ['puzzle', 'chess', 'wordle', 'trivia', 'riddle']],
  ['action', ['shoot', 'fighting', 'racing', 'shmup']],
  ['dodge', ['dodge', 'meteor']],
  ['tap', ['tap', 'click']],
  ['reaction', ['reaction', 'reflex']],
  ['guess', ['guess']],
  ['arcade', ['arcade']],
  ['casual', ['casual']]
]

function mentions(text, hint) {
  if (hint.includes(' ')) return text.includes(hint)
  return new RegExp(`\\b${hint}\\b`, 'i').test(text)
}

export function tagsFor({ prompt = '', name = '', description = '', mechanic = '', tier = 'spec' } = {}) {
  const text = `${prompt} ${name} ${description}`.toLowerCase()
  const found = new Set()
  if (TAGS.includes(mechanic)) found.add(mechanic)
  if (tier === 'freeform') found.add('sandbox')
  for (const [tag, hints] of HINTS) {
    if (hints.some((hint) => mentions(text, hint))) found.add(tag)
  }
  if (!found.size) found.add('casual')
  return TAGS.filter((tag) => found.has(tag))
}
