import { ARENA_TEMPLATES } from '../arena/templates.js'

export const TRADEMARK = /wordle|tetris|pac[-\s]?man|flappy(?:\s*bird)?|super\s*mario|\bmario\b|space\s*invaders/i

const palette = (accent, extra = {}) => ({
  bg: '#000000',
  ink: '#e7e9ea',
  accent,
  mute: '#2F3336',
  a: accent,
  b: '#e7e9ea',
  c: '#2F3336',
  d: '#ffffff',
  ...extra
})

function theme(title, hint, accent, sprites = {}, extra = {}) {
  return {
    palette: palette(accent, extra),
    sprites: {
      hero: ['.a.', 'aaa', 'a.a'],
      tile: ['bb', 'bb'],
      ...sprites
    },
    names: { title, hint, over: 'Game over' }
  }
}

const colors = ['palette.bg', 'palette.ink', 'palette.accent', 'palette.mute']
const names = ['names.title', 'names.hint', 'names.over']

function fields({ config, sprites = [], rules = [] }) {
  const THEME = Object.fromEntries([
    ...colors.map((key) => [key, 'color']),
    ...names.map((key) => [key, 'text']),
    ...sprites.map((key) => [`sprites.${key}`, 'grid'])
  ])
  const RULES = Object.fromEntries(rules.map((key) => [key, 'function']))
  return { CONFIG: config, THEME, RULES }
}

export const TEMPLATES = [
  {
    id: 'word-guess',
    name: 'Word Guess',
    tags: ['puzzle', 'word'],
    keywords: ['word', 'guess', 'letters'],
    description: 'Guess a hidden five-letter word. Right place and wrong place are marked on the tile.',
    match: { high: ['wordle', 'word guess', 'word-guess'], medium: ['crossword', 'five letter'] },
    config: { letters: 5, maxGuesses: 6 },
    theme: theme('Word Guess', 'Type a word. Enter submits.', '#E6FF3A', { tile: ['aaaa', 'a..a', 'a..a', 'aaaa'] }),
    fields: fields({
      config: { letters: { min: 4, max: 6 }, maxGuesses: { min: 3, max: 8 } },
      sprites: ['hero', 'tile'],
      rules: ['scoreGuess']
    })
  },
  {
    id: 'block-drop',
    name: 'Block Drop',
    tags: ['puzzle', 'arcade'],
    keywords: ['blocks', 'drop', 'stack', 'lines'],
    description: 'Drop and rotate blocks. Complete a line to clear it.',
    match: { high: ['tetris', 'block drop', 'falling blocks'], medium: ['blocks', 'tetromino'] },
    config: { cols: 10, rows: 16, dropMs: 160 },
    theme: theme('Block Drop', 'Arrows move. Up rotates. Space drops.', '#E6FF3A', {
      block: ['aa', 'aa']
    }, { p1: '#E6FF3A', p2: '#ffffff', p3: '#b6ff3a', p4: '#ffb020' }),
    fields: fields({
      config: { cols: { min: 8, max: 12 }, rows: { min: 12, max: 20 }, dropMs: { min: 80, max: 800 } },
      sprites: ['hero', 'block'],
      rules: ['scoreLines']
    })
  },
  {
    id: 'snake',
    name: 'Snake',
    tags: ['arcade', 'action'],
    keywords: ['snake', 'grow', 'apple'],
    description: 'Steer the snake into the fruit. Do not hit a wall or yourself.',
    match: { high: ['snake', 'snake game'], medium: ['serpent'] },
    config: { cols: 16, rows: 16, stepMs: 160 },
    theme: theme('Snake', 'Arrows or WASD steer.', '#b6ff3a', { fruit: ['.a.', 'aaa', '.a.'] }),
    fields: fields({
      config: { cols: { min: 10, max: 20 }, rows: { min: 10, max: 20 }, stepMs: { min: 80, max: 400 } },
      sprites: ['hero', 'fruit'],
      rules: ['scoreFood']
    })
  },
  {
    id: 'merge-tiles',
    name: 'Merge Tiles',
    tags: ['puzzle'],
    keywords: ['merge', 'tiles', 'slide'],
    description: 'Slide the board so equal tiles combine into the next value.',
    match: { high: ['2048', 'merge tiles', 'merge-tiles'], medium: ['combine tiles'] },
    config: { size: 4, goal: 128 },
    theme: theme('Merge Tiles', 'Arrows slide the board.', '#ffb020', { tile: ['bbbb', 'b..b', 'b..b', 'bbbb'] }),
    fields: fields({
      config: { size: { min: 3, max: 5 }, goal: { min: 32, max: 512 } },
      sprites: ['hero', 'tile'],
      rules: ['scoreMerge']
    })
  },
  {
    id: 'flap',
    name: 'Flap',
    tags: ['arcade', 'action'],
    keywords: ['flap', 'fly', 'pipes'],
    description: 'Tap to flap through gaps. Touch the ground or a pipe and the run ends.',
    match: { high: ['flappy', 'flap'], medium: ['pipes'] },
    config: { gravity: 980, flap: -320, gap: 150, speed: 150 },
    theme: theme('Flap', 'Space, click, or tap to flap.', '#ff5a7a', { bird: ['.aa', 'aaa', '.a.'] }),
    fields: fields({
      config: { gravity: { min: 400, max: 1600 }, flap: { min: -520, max: -160 }, gap: { min: 110, max: 220 }, speed: { min: 80, max: 280 } },
      sprites: ['bird', 'hero'],
      rules: ['scoreGate']
    })
  },
  {
    id: 'breakout',
    name: 'Breakout',
    tags: ['arcade', 'action'],
    keywords: ['breakout', 'bricks', 'paddle'],
    description: 'Bounce a ball off the paddle and clear the bricks.',
    match: { high: ['breakout', 'brick breaker'], medium: ['bricks', 'arkanoid'] },
    config: { cols: 8, rows: 4, ballSpeed: 240 },
    theme: theme('Breakout', 'Move the paddle with arrows, mouse, or touch.', '#7ad7ff', { ball: ['aa', 'aa'] }),
    fields: fields({
      config: { cols: { min: 6, max: 10 }, rows: { min: 2, max: 6 }, ballSpeed: { min: 140, max: 420 } },
      sprites: ['ball', 'hero'],
      rules: ['scoreBrick']
    })
  },
  {
    id: 'platformer',
    name: 'Platformer',
    tags: ['action', 'platform'],
    keywords: ['platform', 'jump', 'coins'],
    description: 'Run and jump across ledges. Pick up the coin. Do not fall in the pit.',
    match: { high: ['mario', 'platformer', 'mario platformer'], medium: ['coin jump'] },
    config: { speed: 170, jump: 340, gravity: 900 },
    theme: theme('Platformer', 'Arrows run. Space or tap jumps.', '#E6FF3A', { coin: ['.a.', 'aaa', '.a.'] }),
    fields: fields({
      config: { speed: { min: 80, max: 280 }, jump: { min: 220, max: 480 }, gravity: { min: 500, max: 1400 } },
      sprites: ['hero', 'coin'],
      rules: ['scoreCoin']
    })
  },
  {
    id: 'endless-runner',
    name: 'Endless Runner',
    tags: ['action', 'runner'],
    keywords: ['runner', 'endless', 'hurdle'],
    description: 'The lane keeps moving. Jump the hurdles.',
    match: { high: ['endless runner', 'cactus'], medium: ['runner', 'hurdle'] },
    config: { speed: 240, gravity: 1100, jump: 380 },
    theme: theme('Endless Runner', 'Space, click, or the action pad jumps.', '#ffb020', { hurdle: ['a', 'a', 'a'] }),
    fields: fields({
      config: { speed: { min: 120, max: 360 }, gravity: { min: 600, max: 1600 }, jump: { min: 240, max: 520 } },
      sprites: ['hero', 'hurdle'],
      rules: ['scoreHurdle']
    })
  },
  {
    id: 'space-shooter',
    name: 'Space Shooter',
    tags: ['action', 'shooter'],
    keywords: ['shooter', 'space', 'ships'],
    description: 'Slide the ship and fire. Clear the craft coming down the lane.',
    match: { high: ['space invaders', 'space shooter'], medium: ['shooter', 'shmup'] },
    config: { speed: 220, bullet: 360, enemy: 50 },
    theme: theme('Space Shooter', 'Arrows or the pad move. Space fires.', '#7ad7ff', { ship: ['.a.', 'aaa', 'a.a'] }),
    fields: fields({
      config: { speed: { min: 100, max: 360 }, bullet: { min: 180, max: 520 }, enemy: { min: 20, max: 160 } },
      sprites: ['ship', 'hero'],
      rules: ['scoreHit']
    })
  },
  {
    id: 'maze-chomper',
    name: 'Maze Chomper',
    tags: ['arcade', 'maze'],
    keywords: ['maze', 'chomper', 'dots'],
    description: 'Eat the dots in the maze. The chaser follows. Getting caught ends the run.',
    match: { high: ['pacman', 'pac-man', 'maze chomper'], medium: ['maze', 'chomper'] },
    config: { cell: 28, ghostMs: 220 },
    theme: theme('Maze Chomper', 'Arrows move. Eat dots. Avoid the chaser.', '#E6FF3A', { chaser: ['aaa', 'a.a', 'aaa'] }),
    fields: fields({
      config: { cell: { min: 20, max: 36 }, ghostMs: { min: 120, max: 500 } },
      sprites: ['hero', 'chaser'],
      rules: ['scorePellet']
    })
  },
  {
    id: 'jump-up',
    name: 'Jump Up',
    tags: ['arcade', 'action'],
    keywords: ['jump', 'platforms', 'up'],
    description: 'Bounce up a stack of platforms. Missing one ends the climb.',
    match: { high: ['doodle', 'doodle jump', 'jump up'], medium: ['bounce up'] },
    config: { gravity: 700, jump: 460 },
    theme: theme('Jump Up', 'Arrows tilt. You bounce on each platform.', '#7dffb3', { hero: ['.aa.', 'aaaa', '.a.a'] }, { a: '#7dffb3' }),
    fields: fields({
      config: { gravity: { min: 400, max: 1200 }, jump: { min: 280, max: 620 } },
      sprites: ['hero'],
      rules: ['scorePlatform']
    })
  },
  {
    id: 'match-3',
    name: 'Match-3',
    tags: ['puzzle'],
    keywords: ['match', 'swap', 'gems'],
    description: 'Swap neighboring gems to line up three of a kind.',
    match: { high: ['match-3', 'match 3', 'bejeweled', 'candy crush'], medium: ['match3', 'gems'] },
    config: { cols: 6, rows: 6, kinds: 4 },
    theme: theme('Match-3', 'Arrows move the cursor. Space swaps right.', '#ff5a7a', { gem: ['aa', 'aa'] }, { k0: '#E6FF3A', k1: '#7ad7ff', k2: '#ff5a7a', k3: '#ffb020' }),
    fields: fields({
      config: { cols: { min: 5, max: 8 }, rows: { min: 5, max: 8 }, kinds: { min: 3, max: 5 } },
      sprites: ['gem', 'hero'],
      rules: ['scoreGroup']
    })
  },
  ...ARENA_TEMPLATES
]

export function templateById(id) {
  return TEMPLATES.find((item) => item.id === id) || null
}
