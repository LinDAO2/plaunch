import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { posterPng } from './poster.js'
import { captureHtml, launchCaptureBrowser } from './capture-browser.js'

const POSTERS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'posters')
const SLUG = /^[a-z0-9-]{1,80}$/

export function committedPosterPath(id) {
  if (!SLUG.test(String(id || ''))) return ''
  const file = path.join(POSTERS, `${id}.png`)
  return existsSync(file) ? file : ''
}

export function posterKind(game) {
  if (!game) return 'live'
  if (committedPosterPath(game.id) || game.posterState === 'shot') return 'shot'
  if (game.tier === 'freeform') return 'card'
  return 'live'
}

function asPng(value) {
  if (!value) return null
  let buf = null
  if (Buffer.isBuffer(value)) buf = value
  else if (value instanceof Uint8Array) buf = Buffer.from(value)
  else if (typeof value === 'string') {
    const hex = value.startsWith('\\x') ? value.slice(2) : value
    if (/^[0-9a-fA-F]+$/.test(hex) && hex.length % 2 === 0) buf = Buffer.from(hex, 'hex')
  }
  if (!buf || buf.length < 8 || buf.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') return null
  return buf
}

export async function readStoredPoster(db, id) {
  const result = await db.query('select png from game_posters where game_id = $1', [id])
  return asPng(result.rows[0]?.png)
}

export async function saveStoredPoster(db, id, png) {
  const bytes = asPng(png)
  if (!bytes) return false
  await db.query(
    `insert into game_posters (game_id, png) values ($1, $2)
     on conflict (game_id) do update set png = excluded.png, updated_at = now()`,
    [id, bytes]
  )
  await db.query(`update games set poster_state = 'shot' where id = $1`, [id])
  return true
}

export async function resolvePoster(db, game) {
  const file = committedPosterPath(game.id)
  if (file) return { bytes: await readFile(file), kind: 'shot' }
  if (game.posterState === 'shot') {
    const stored = await readStoredPoster(db, game.id)
    if (stored) return { bytes: stored, kind: 'shot' }
  }
  return { bytes: posterPng(game), kind: 'card' }
}

let captureChain = Promise.resolve()

export function schedulePosterCapture(db, game, env = process.env.NODE_ENV) {
  if (env === 'test') return
  if (!game || game.tier !== 'freeform' || !game.freeformHtml) return
  if (committedPosterPath(game.id)) return
  const html = game.freeformHtml
  const id = game.id
  captureChain = captureChain.then(() => captureOne(db, id, html)).catch(() => {})
}

async function captureOne(db, id, html) {
  const browser = await launchCaptureBrowser()
  if (!browser) return
  try {
    const png = await captureHtml(browser, html)
    if (png) await saveStoredPoster(db, id, png)
  } finally {
    await browser.close()
  }
}
