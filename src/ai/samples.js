const safety = { audience: 'general', notes: 'No executable content.' }
const scoring = { direction: 'higher', label: 'Score', unit: 'pts' }

export const SAMPLE_SPECS = [
  {
    version: '1.1',
    name: 'Mole Garden',
    description: 'Moles pop out of three lanes. Tap them before they hide.',
    theme: 'vegetable patch',
    runtime: 'arcade',
    duration: 20,
    accent: '#4adeb9',
    scoring,
    difficulty: 'normal',
    controls: { keyboard: 'Click a mole', touch: 'Tap a mole before it hides', scheme: 'tap' },
    entities: [
      { kind: 'collectible', label: 'Mole', sprite: '🐹', points: 8, speed: 0.2, shape: 'circle' },
      { kind: 'hazard', label: 'Weed', sprite: '🌿', points: 0, speed: 0.2, shape: 'circle' }
    ],
    spawn: { rate: 1.1, pattern: 'lanes' },
    safety,
    movement: 'straight',
    rules: { win: 'score', seconds: 20, lives: 3, targetScore: 48 },
    scoreRules: { pointsPerEntity: 8, comboMultiplier: 1 },
    palette: ['#4adeb9', '#163028', '#d9ffe8'],
    player: { sprite: '🔨', scheme: 'tap' },
    primitives: ['popup'],
    lifetimeMs: 900
  },
  {
    version: '1.1',
    name: 'Shadow Chase',
    description: 'A shadow peels off the wall and hunts you through the vault.',
    theme: 'candlelit vault',
    runtime: 'arcade',
    duration: 18,
    accent: '#c084fc',
    scoring,
    difficulty: 'hard',
    controls: { keyboard: 'Arrow keys or A and D to flee', touch: 'Drag away from the shadow', scheme: 'keys' },
    entities: [
      { kind: 'hazard', label: 'Shadow', sprite: '👻', points: 0, speed: 0.7, shape: 'circle' },
      { kind: 'collectible', label: 'Coin', sprite: '🪙', points: 14, speed: 0.45, shape: 'circle' }
    ],
    spawn: { rate: 0.45, pattern: 'burst' },
    safety,
    movement: 'homing',
    rules: { win: 'lives', seconds: 18, lives: 2, targetScore: 40 },
    scoreRules: { pointsPerEntity: 14, comboMultiplier: 1 },
    palette: ['#c084fc', '#1a1028', '#f3e8ff'],
    player: { sprite: '🏃', scheme: 'keys' },
    primitives: ['chase'],
    lifetimeMs: 0
  },
  {
    version: '1.1',
    name: 'Lantern Volley',
    description: 'Fire upward through a zigzag rain of lanterns and snuff the sparks.',
    theme: 'festival night',
    runtime: 'arcade',
    duration: 24,
    accent: '#fb7185',
    scoring,
    difficulty: 'normal',
    controls: { keyboard: 'Arrows to move, space to shoot', touch: 'Drag and tap to shoot', scheme: 'keys' },
    entities: [
      { kind: 'hazard', label: 'Spark', sprite: '✨', points: 0, speed: 1.4, shape: 'circle' },
      { kind: 'collectible', label: 'Lantern', sprite: '🏮', points: 6, speed: 0.9, shape: 'square' }
    ],
    spawn: { rate: 1.8, pattern: 'rain' },
    safety,
    movement: 'zigzag',
    rules: { win: 'score', seconds: 24, lives: 3, targetScore: 70 },
    scoreRules: { pointsPerEntity: 6, comboMultiplier: 4 },
    palette: ['#fb7185', '#2a121c', '#ffe4e6'],
    player: { sprite: '🏹', scheme: 'keys' },
    primitives: ['fall', 'shoot'],
    lifetimeMs: 0
  },
  {
    version: '1.1',
    name: 'Rooftop Hop',
    description: 'Jump the ledges while a slow wave of crates bounces along the roof.',
    theme: 'city dusk',
    runtime: 'arcade',
    duration: 22,
    accent: '#38bdf8',
    scoring,
    difficulty: 'normal',
    controls: { keyboard: 'A and D to run, W or space to jump', touch: 'Drag to run and tap high to jump', scheme: 'drag' },
    entities: [
      { kind: 'hazard', label: 'Crate', sprite: '📦', points: 0, speed: 0.6, shape: 'square' },
      { kind: 'collectible', label: 'Flag', sprite: '🚩', points: 11, speed: 0.5, shape: 'triangle' }
    ],
    spawn: { rate: 0.55, pattern: 'waves' },
    safety,
    movement: 'bounce',
    rules: { win: 'survive', seconds: 22, lives: 4, targetScore: 30 },
    scoreRules: { pointsPerEntity: 11, comboMultiplier: 3 },
    palette: ['#38bdf8', '#102033', '#e0f2fe'],
    player: { sprite: '🧢', scheme: 'drag' },
    primitives: ['fall', 'platform'],
    lifetimeMs: 0
  }
]
