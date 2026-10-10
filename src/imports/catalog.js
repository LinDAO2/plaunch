import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'imports')

export const CURATED = [
  {
    id: 'tile-2048',
    name: '2048',
    description: 'Slide matching numbers together on a 4 by 4 board.',
    accent: '#edc22e',
    tags: ['puzzle', 'casual', 'opensource'],
    credit: {
      author: 'Gabriele Cirulli',
      license: 'MIT',
      source: 'https://github.com/gabrielecirulli/2048/tree/478b6ec346e3787f589e4af751378d06ded4cbbc',
      sha: '478b6ec346e3787f589e4af751378d06ded4cbbc',
      origin: 'curated',
      copyleftConfirmed: false,
      permissionConfirmed: false
    }
  },
  {
    id: 'lane-racer',
    name: 'Lane Racer',
    description: 'Drive a car along a scrolling road.',
    accent: '#3c7a3c',
    tags: ['action', 'arcade', 'opensource'],
    credit: {
      author: 'Jake Gordon',
      license: 'MIT',
      source: 'https://github.com/jakesgordon/javascript-racer/tree/3e8a060b5900755db27f899612a74a77427c853e',
      sha: '3e8a060b5900755db27f899612a74a77427c853e',
      origin: 'curated',
      copyleftConfirmed: false,
      permissionConfirmed: false
    }
  },
  {
    id: 'stack-blocks',
    name: 'Stack',
    description: 'Drop falling pieces and clear full rows.',
    accent: '#333333',
    tags: ['puzzle', 'arcade', 'opensource'],
    credit: {
      author: 'Jake Gordon',
      license: 'MIT',
      source: 'https://github.com/jakesgordon/javascript-tetris/tree/e5c0c42f7dac0f3514a55eff656c6e22e95d68ed',
      sha: 'e5c0c42f7dac0f3514a55eff656c6e22e95d68ed',
      origin: 'curated',
      copyleftConfirmed: false,
      permissionConfirmed: false
    }
  },
  {
    id: 'grid-snake',
    name: 'Grid Snake',
    description: 'Steer a snake toward the apples.',
    accent: '#22c55e',
    tags: ['arcade', 'casual', 'opensource'],
    credit: {
      author: 'Christopher Straker',
      license: 'CC0-1.0',
      source: 'https://gist.github.com/straker/ff00b4b49669ad3dec890306d348adc4',
      sha: '728aa4da4835c0d321a22ea4ccbe588a8c28c418',
      origin: 'curated',
      copyleftConfirmed: false,
      permissionConfirmed: false
    }
  },
  {
    id: 'brick-bounce',
    name: 'Brick Bounce',
    description: 'Bounce a ball and clear the bricks.',
    accent: '#e11d48',
    tags: ['arcade', 'casual', 'opensource'],
    credit: {
      author: 'Christopher Straker',
      license: 'CC0-1.0',
      source: 'https://gist.github.com/straker/98a2aed6a7686d26c04810f08bfaf66b',
      sha: '9e2eb0baf8cc542ae08f21bb8f543a093da3fc3d',
      origin: 'curated',
      copyleftConfirmed: false,
      permissionConfirmed: false
    }
  },
  {
    id: 'tower-bounce',
    name: 'Tower Bounce',
    description: 'Bounce up a tower of platforms.',
    accent: '#e6ff3a',
    tags: ['arcade', 'casual', 'opensource'],
    credit: {
      author: 'Christopher Straker',
      license: 'CC0-1.0',
      source: 'https://gist.github.com/straker/b96a4a68bd6d79cf75a833d98a2b654f',
      sha: '8ceae530dc7e03987c38622e22c7de5251b619cc',
      origin: 'curated',
      copyleftConfirmed: false,
      permissionConfirmed: false
    }
  }
]

export async function loadCurated() {
  const games = []
  for (const entry of CURATED) {
    const html = await readFile(path.join(ROOT, entry.id, 'game.html'), 'utf8')
    games.push({
      ...entry,
      type: 'arcade',
      duration: 60,
      createdAt: '2026-10-10T12:00:00Z',
      freeformHtml: html
    })
  }
  return games
}
