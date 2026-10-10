import { validateGameSpec } from '../ai/gamespec.js'

const shared = {
  version: '1.1',
  scoring: { direction: 'higher', label: 'Score', unit: 'pts' },
  difficulty: 'normal',
  safety: { audience: 'general', notes: 'No executable content.' }
}

function example(game) {
  const spec = validateGameSpec(game.spec)
  return { ...game, spec }
}

export const EXAMPLE_GAMES = [
  example({
    id: 'meteor-rain',
    name: 'Meteor Rain',
    description: 'Slide under a straight meteor rain and last the round.',
    type: 'arcade',
    duration: 20,
    accent: '#ff779e',
    spec: {
      ...shared,
      name: 'Meteor Rain',
      description: 'Slide under a straight meteor rain and last the round.',
      theme: 'night sky',
      runtime: 'arcade',
      duration: 20,
      accent: '#ff779e',
      controls: { keyboard: 'Arrow keys or A and D', touch: 'Drag left and right', scheme: 'keys' },
      entities: [
        { kind: 'hazard', label: 'Meteor', sprite: '☄', points: 0, speed: 1.3, shape: 'circle' },
        { kind: 'collectible', label: 'Star', sprite: '⭐', points: 10, speed: 0.9, shape: 'circle' }
      ],
      spawn: { rate: 1.3, pattern: 'rain' },
      movement: 'straight',
      rules: { win: 'survive', seconds: 20, lives: 3, targetScore: 40 },
      scoreRules: { pointsPerEntity: 10, comboMultiplier: 1 },
      palette: ['#ff779e', '#2a1020', '#ffd0e0'],
      player: { sprite: '🚀', scheme: 'keys' }
    }
  }),
  example({
    id: 'lane-harvest',
    name: 'Lane Harvest',
    description: 'Tap berries in three bouncing lanes before the bugs do.',
    type: 'arcade',
    duration: 20,
    accent: '#4adeb9',
    spec: {
      ...shared,
      name: 'Lane Harvest',
      description: 'Tap berries in three bouncing lanes before the bugs do.',
      theme: 'orchard',
      runtime: 'arcade',
      duration: 20,
      accent: '#4adeb9',
      controls: { keyboard: 'Click a berry', touch: 'Tap a berry', scheme: 'tap' },
      entities: [
        { kind: 'collectible', label: 'Berry', sprite: '🍒', points: 10, speed: 0.8, shape: 'circle' },
        { kind: 'hazard', label: 'Bug', sprite: '🐛', points: 0, speed: 0.7, shape: 'circle' }
      ],
      spawn: { rate: 1.4, pattern: 'lanes' },
      movement: 'bounce',
      rules: { win: 'score', seconds: 20, lives: 3, targetScore: 40 },
      scoreRules: { pointsPerEntity: 10, comboMultiplier: 3 },
      palette: ['#4adeb9', '#12352c', '#d9fff3'],
      player: { sprite: '🧺', scheme: 'tap' }
    }
  }),
  example({
    id: 'zigzag-orbs',
    name: 'Zigzag Orbs',
    description: 'Drag between a wave of zigzag orbs and keep your last life.',
    type: 'arcade',
    duration: 20,
    accent: '#a88bff',
    spec: {
      ...shared,
      name: 'Zigzag Orbs',
      description: 'Drag between a wave of zigzag orbs and keep your last life.',
      theme: 'neon tide',
      runtime: 'arcade',
      duration: 20,
      accent: '#a88bff',
      controls: { keyboard: 'No keys — drag', touch: 'Drag the ship', scheme: 'drag' },
      entities: [
        { kind: 'hazard', label: 'Orb', sprite: '🟣', points: 0, speed: 1.1, shape: 'circle' },
        { kind: 'collectible', label: 'Spark', sprite: '✨', points: 8, speed: 0.9, shape: 'circle' }
      ],
      spawn: { rate: 0.7, pattern: 'waves' },
      movement: 'zigzag',
      rules: { win: 'lives', seconds: 20, lives: 2, targetScore: 30 },
      scoreRules: { pointsPerEntity: 8, comboMultiplier: 2 },
      palette: ['#a88bff', '#1b1430', '#efe7ff'],
      player: { sprite: '🛸', scheme: 'drag' }
    }
  }),
  example({
    id: 'homing-gems',
    name: 'Homing Gems',
    description: 'Catch a burst of gems that steer toward you.',
    type: 'arcade',
    duration: 15,
    accent: '#ffbd70',
    spec: {
      ...shared,
      name: 'Homing Gems',
      description: 'Catch a burst of gems that steer toward you.',
      theme: 'treasure vault',
      runtime: 'arcade',
      duration: 15,
      accent: '#ffbd70',
      controls: { keyboard: 'Arrow keys or A and D', touch: 'Drag to catch gems', scheme: 'keys' },
      entities: [
        { kind: 'collectible', label: 'Gem', sprite: '💎', points: 12, speed: 0.6, shape: 'square' },
        { kind: 'hazard', label: 'Shard', sprite: '🔺', points: 0, speed: 0.8, shape: 'triangle' }
      ],
      spawn: { rate: 0.6, pattern: 'burst' },
      movement: 'homing',
      rules: { win: 'score', seconds: 15, lives: 3, targetScore: 36 },
      scoreRules: { pointsPerEntity: 12, comboMultiplier: 2 },
      palette: ['#ffbd70', '#3a2a14', '#fff1d6'],
      player: { sprite: '🧲', scheme: 'keys' }
    }
  }),
  example({
    id: 'mole-garden',
    name: 'Mole Garden',
    description: 'Moles pop out of three lanes. Tap them before they hide.',
    type: 'arcade',
    duration: 20,
    accent: '#4adeb9',
    spec: {
      ...shared,
      name: 'Mole Garden',
      description: 'Moles pop out of three lanes. Tap them before they hide.',
      theme: 'vegetable patch',
      runtime: 'arcade',
      duration: 20,
      accent: '#4adeb9',
      controls: { keyboard: 'Click a mole', touch: 'Tap a mole before it hides', scheme: 'tap' },
      entities: [
        { kind: 'collectible', label: 'Mole', sprite: '🐹', points: 8, speed: 0.2, shape: 'circle' },
        { kind: 'hazard', label: 'Weed', sprite: '🌿', points: 0, speed: 0.2, shape: 'circle' }
      ],
      spawn: { rate: 1.1, pattern: 'lanes' },
      movement: 'straight',
      rules: { win: 'score', seconds: 20, lives: 3, targetScore: 48 },
      scoreRules: { pointsPerEntity: 8, comboMultiplier: 1 },
      palette: ['#4adeb9', '#163028', '#d9ffe8'],
      player: { sprite: '🔨', scheme: 'tap' },
      primitives: ['popup'],
      lifetimeMs: 900
    }
  }),
  example({
    id: 'shadow-chase',
    name: 'Shadow Chase',
    description: 'A shadow peels off the wall and hunts you through the vault.',
    type: 'arcade',
    duration: 18,
    accent: '#c084fc',
    spec: {
      ...shared,
      name: 'Shadow Chase',
      description: 'A shadow peels off the wall and hunts you through the vault.',
      theme: 'candlelit vault',
      runtime: 'arcade',
      duration: 18,
      accent: '#c084fc',
      controls: { keyboard: 'Arrow keys or A and D to flee', touch: 'Drag away from the shadow', scheme: 'keys' },
      entities: [
        { kind: 'hazard', label: 'Shadow', sprite: '👻', points: 0, speed: 0.7, shape: 'circle' },
        { kind: 'collectible', label: 'Coin', sprite: '🪙', points: 14, speed: 0.45, shape: 'circle' }
      ],
      spawn: { rate: 0.45, pattern: 'burst' },
      movement: 'homing',
      rules: { win: 'lives', seconds: 18, lives: 2, targetScore: 40 },
      scoreRules: { pointsPerEntity: 14, comboMultiplier: 1 },
      palette: ['#c084fc', '#1a1028', '#f3e8ff'],
      player: { sprite: '🏃', scheme: 'keys' },
      primitives: ['chase'],
      lifetimeMs: 0
    }
  })
]
