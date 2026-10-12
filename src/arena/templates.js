const palette = (accent, extra) => ({
  bg: '#07081a',
  ink: '#e7fbff',
  accent,
  mute: '#1c2438',
  floor: '#12182c',
  wall: '#2a3554',
  sky: '#1a2744',
  ...extra
})

function arenaFields() {
  return {
    CONFIG: {
      speed: { min: 4, max: 18 },
      bots: { min: 0, max: 8 },
      seconds: { min: 30, max: 180 },
      range: { min: 8, max: 40 },
      damage: { min: 10, max: 80 },
      quality: { min: 0, max: 2 }
    },
    THEME: {
      'palette.bg': 'color',
      'palette.ink': 'color',
      'palette.accent': 'color',
      'palette.mute': 'color',
      'palette.floor': 'color',
      'palette.wall': 'color',
      'palette.sky': 'color',
      'names.title': 'text',
      'names.hint': 'text',
      'names.over': 'text',
      mode: 'text',
      weapon: 'text',
      sky: 'text'
    },
    RULES: { scoreKill: 'function' }
  }
}

const fields = arenaFields()

export const ARENA_TEMPLATES = [
  {
    id: 'arena',
    engine: 'three',
    featured: true,
    duration: 60,
    name: 'Arena',
    tags: ['action', 'arcade'],
    keywords: ['arena', 'blaster', 'multiplayer'],
    description: 'Sci-fi arena. Pointer look, a blaster, bots, and a round timer. No neighborhood and no real-world weapons.',
    match: {
      high: ['arena', 'deathmatch', 'first person', 'fps', 'blaster'],
      medium: ['3d', 'multiplayer', 'sci-fi', 'scifi']
    },
    config: { speed: 9, bots: 5, seconds: 120, range: 28, damage: 34, quality: 0 },
    theme: {
      palette: palette('#3ee0ff'),
      names: { title: 'Arena', hint: 'WASD moves. Mouse looks. Click fires.', over: 'Round over' },
      mode: 'deathmatch',
      weapon: 'blaster',
      sky: 'dusk'
    },
    fields,
    credit: {
      author: 'Playground',
      title: 'Arena',
      license: 'MIT',
      source: 'https://github.com/mrdoob/three.js/tree/r170',
      sha: 'r170',
      origin: 'template',
      note: 'Procedural geometry is original. three.js r170 is MIT.'
    }
  },
  {
    id: 'circuit-dash',
    engine: 'three',
    featured: true,
    duration: 60,
    name: 'Circuit Dash',
    tags: ['action', 'arcade'],
    keywords: ['kart', 'race', 'circuit'],
    description: 'A low-poly kart loop. Drive through the gates and finish the laps. Bots take the other lanes.',
    match: {
      high: ['kart', 'kart race', '3d race', 'circuit dash'],
      medium: ['race', 'racing', 'laps']
    },
    config: { speed: 14, bots: 4, seconds: 90, range: 12, damage: 10, quality: 0 },
    theme: {
      palette: palette('#ffb020', { bg: '#140c08', ink: '#fff4e4', mute: '#3a2418', floor: '#2a160e', wall: '#5a341c', sky: '#ff8a3d' }),
      names: { title: 'Circuit Dash', hint: 'WASD drives. Fire or space boosts.', over: 'Race over' },
      mode: 'race',
      weapon: 'none',
      sky: 'day'
    },
    fields,
    credit: {
      author: 'Playground',
      title: 'Circuit Dash',
      license: 'MIT',
      source: 'https://github.com/mrdoob/three.js/tree/r170',
      sha: 'r170',
      origin: 'template',
      note: 'Procedural geometry is original. three.js r170 is MIT.'
    }
  },
  {
    id: 'beacon-isle',
    engine: 'three',
    featured: true,
    duration: 60,
    name: 'Beacon Isle',
    tags: ['arcade', 'casual'],
    keywords: ['explore', 'island', 'beacon'],
    description: 'Walk a low-poly island, light the beacons, and pop the buoys. Nothing on the island is a zombie.',
    match: {
      high: ['beacon isle', 'exploration', 'explore', 'island'],
      medium: ['survival', 'beacons', 'stroll']
    },
    config: { speed: 8, bots: 2, seconds: 120, range: 24, damage: 34, quality: 0 },
    theme: {
      palette: palette('#3ddc97', { bg: '#062028', ink: '#e7fff6', mute: '#12343a', floor: '#1d4a3c', wall: '#245046', sky: '#8fd4ff' }),
      names: { title: 'Beacon Isle', hint: 'Walk the shore. Light beacons. Pop buoys.', over: 'Tide turns' },
      mode: 'explore',
      weapon: 'blaster',
      sky: 'day'
    },
    fields,
    credit: {
      author: 'Playground',
      title: 'Beacon Isle',
      license: 'MIT',
      source: 'https://github.com/mrdoob/three.js/tree/r170',
      sha: 'r170',
      origin: 'template',
      note: 'Procedural geometry is original. three.js r170 is MIT.'
    }
  }
]
