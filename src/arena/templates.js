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
      palette: palette('#FF5A3C', { bg: '#4FB3FF', ink: '#1B1B2F', mute: '#7C8FA6', floor: '#E9E4D8', wall: '#7C8FA6', sky: '#CDEBFF' }),
      names: { title: 'Arena', hint: 'WASD moves. Mouse looks. Click fires.', over: 'Round over' },
      mode: 'deathmatch',
      weapon: 'blaster',
      sky: 'day'
    },
    fields,
    credit: {
      author: 'Playground',
      title: 'Arena',
      license: 'MIT',
      source: 'https://github.com/mrdoob/three.js/tree/r170',
      sha: 'r170',
      origin: 'template',
      note: 'KayKit Adventurers CC0 characters and Kenney CC0 meshes in vendor/arena-assets. three.js r170 is MIT. Day, dusk, night, and neon lighting follow the v1.3.1 art-direction table.'
    }
  },
  {
    id: 'circuit-dash',
    engine: 'three',
    featured: true,
    duration: 48,
    name: 'Circuit Dash',
    tags: ['action', 'arcade'],
    keywords: ['kart', 'race', 'circuit'],
    description: 'A low-poly kart loop. Drive through the gates and finish the laps. Bots take the other lanes.',
    match: {
      high: ['kart', 'kart race', '3d race', 'circuit dash'],
      medium: ['race', 'racing', 'laps']
    },
    config: { speed: 14, bots: 4, seconds: 48, range: 12, damage: 10, quality: 0 },
    theme: {
      palette: palette('#FF9A1F', { bg: '#4FB3FF', ink: '#1B1B2F', mute: '#4A4F5A', floor: '#4A4F5A', wall: '#F4F4F4', sky: '#CDEBFF' }),
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
      note: 'KayKit Adventurers CC0 characters and Kenney CC0 meshes in vendor/arena-assets. three.js r170 is MIT. Day, dusk, night, and neon lighting follow the v1.3.1 art-direction table.'
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
      palette: palette('#7BC86C', { bg: '#4FB3FF', ink: '#1B1B2F', mute: '#9AA3AE', floor: '#F2D59A', wall: '#9AA3AE', sky: '#CDEBFF' }),
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
      note: 'KayKit Adventurers CC0 characters and Kenney CC0 meshes in vendor/arena-assets. three.js r170 is MIT. Day, dusk, night, and neon lighting follow the v1.3.1 art-direction table.'
    }
  }
]
