import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { EXAMPLE_GAMES } from '../src/arcade/examples.js'
import { featuredWorlds } from '../src/blocks/spec.js'
import { posterPng } from '../src/poster.js'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const committedDir = path.join(root, 'public', 'posters')
const outDir = process.env.POSTER_SHEET_DIR || '/opt/cursor/artifacts/posters/v135'
mkdirSync(outDir, { recursive: true })

const classics = [
  { id: 'click-frenzy', name: 'Click Frenzy', type: 'tap', accent: '#a88bff' },
  { id: 'lightning-reflex', name: 'Lightning Reflex', type: 'reaction', accent: '#4adeb9' },
  { id: 'lucky-seven', name: 'Lucky Seven', type: 'guess', accent: '#ffbd70' },
  { id: 'meteor-dodge', name: 'Meteor Dodge', type: 'dodge', accent: '#ff779e' }
]

const generated = new Map()
for (const game of [...classics, ...EXAMPLE_GAMES, ...featuredWorlds()]) {
  generated.set(game.id, game)
}

const order = [
  'word-guess', 'block-drop', 'snake', 'merge-tiles', 'flap', 'breakout', 'platformer',
  'endless-runner', 'space-shooter', 'maze-chomper', 'jump-up', 'match-3',
  'tile-2048', 'lane-racer', 'stack-blocks', 'grid-snake', 'brick-bounce', 'tower-bounce',
  'meteor-rain', 'meteor-dodge', 'homing-gems', 'lane-harvest', 'mole-garden', 'shadow-chase',
  'zigzag-orbs', 'click-frenzy', 'lightning-reflex', 'lucky-seven',
  'blocks-grassland', 'blocks-candy-moon',
  'arena', 'circuit-dash', 'beacon-isle'
]

function writeBytes(file, bytes) {
  let last = null
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      writeFileSync(file, bytes)
      return
    } catch (error) {
      last = error
      if (error?.code !== 'EAGAIN') throw error
      spawnSync('sleep', ['0.05'])
    }
  }
  throw last
}

const manifest = []
for (const id of order) {
  const committed = path.join(committedDir, `${id}.png`)
  const copy = path.join(outDir, `${id}.png`)
  let kind = 'shot'
  if (existsSync(committed)) {
    writeBytes(copy, readFileSync(committed))
  } else {
    const game = generated.get(id)
    if (!game) throw new Error(`No poster source for ${id}`)
    writeBytes(copy, posterPng({ ...game, updatedAt: 'v135' }))
    kind = 'card'
  }
  manifest.push({ id, file: copy, kind })
}

const sheet = path.join(outDir, 'contact-sheet.png')
const composed = spawnSync('python3', ['-c', `
from PIL import Image, ImageDraw, ImageStat
import json, sys
payload = json.loads(sys.stdin.read())
manifest = payload["manifest"]
sheet_path = payload["sheet"]
cell, label, cols = 168, 22, 7
rows = (len(manifest) + cols - 1) // cols
sheet = Image.new("RGB", (cols * cell, rows * (cell + label)), (11, 15, 26))
draw = ImageDraw.Draw(sheet)
for i, item in enumerate(manifest):
    im = Image.open(item["file"]).convert("RGB")
    stat = ImageStat.Stat(im.resize((48, 48)).convert("L"))
    spread = stat.stddev[0]
    if spread < 2:
        raise SystemExit(item["id"] + " poster is flat (spread %.1f)" % spread)
    w, h = im.size
    if item["kind"] == "card" and (w != 1200 or h != 1200):
        raise SystemExit(item["id"] + " card is %sx%s" % (w, h))
    if item["kind"] == "shot" and w < 200:
        raise SystemExit(item["id"] + " shot is %sx%s" % (w, h))
    x = (i % cols) * cell
    y = (i // cols) * (cell + label)
    draw.text((x + 6, y + 4), item["id"], fill=(244, 247, 251))
    sheet.paste(im.resize((cell, cell), Image.Resampling.BOX), (x, y + label))
    print("%s %sx%s %s spread %.1f" % (item["id"], w, h, item["kind"], spread))
sheet.save(sheet_path)
print("contact", sheet_path, sheet.size[0], sheet.size[1])
`], { input: JSON.stringify({ manifest, sheet }), encoding: 'utf8' })

if (composed.status !== 0) {
  console.error(composed.stdout)
  console.error(composed.stderr)
  process.exit(composed.status || 1)
}
process.stdout.write(composed.stdout)
console.log(JSON.stringify({ outDir, count: manifest.length, sheet }))
