import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { escapeHtml } from './http.js'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public')

let playTemplate

export function creditMarkup(credit) {
  if (!credit?.author) return ''
  const label = `Original by ${escapeHtml(credit.author)} (${escapeHtml(credit.license || 'unspecified')})`
  if (typeof credit.source === 'string' && /^https:\/\/\S+$/.test(credit.source)) {
    return `${label} - <a href="${escapeHtml(credit.source)}" rel="noreferrer">source</a>`
  }
  return label
}

export async function renderPlayPage(game, { embed = false, origin = '', site = '' } = {}) {
  if (!playTemplate) playTemplate = await readFile(path.join(ROOT, 'play.html'), 'utf8')
  const accent = /^#[0-9a-fA-F]{6}$/.test(game.accent) ? game.accent : '#a88bff'
  const classes = ['play-body']
  if (embed) classes.push('embed')
  if (game.type === 'world') classes.push('world-play')
  if (embed && game.tier === 'freeform') classes.push('freeform-play')
  const card = game.type === 'world' ? playerCard(game, { origin, site, page: 'play' }) : null
  const values = {
    TITLE: escapeHtml(`${game.name} — playground`),
    NAME: escapeHtml(game.name),
    DESCRIPTION: escapeHtml(game.description || ''),
    SLUG: escapeHtml(game.id),
    ACCENT: accent,
    MECHANIC: escapeHtml(String(game.type || '').toUpperCase()),
    BODY_CLASS: classes.join(' '),
    GATE_ATTR: embed ? '' : 'hidden',
    CREDIT: creditMarkup(game.credit),
    SHARE_META: card ? card.tags : ''
  }
  return playTemplate.replace(/__([A-Z_]+)__/g, (_, key) => values[key] ?? '')
}

function safeOrigin(origin) {
  try {
    const url = new URL(origin)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return 'http://localhost'
    return url.origin
  } catch {
    return 'http://localhost'
  }
}

function leaderRows(scores) {
  if (!scores.length) return '<p class="hint">None yet.</p>'
  return scores.map((score) => {
    const assurance = score.assurance === 'checked' ? 'checked' : 'unverified'
    const value = score.mechanic === 'reaction' ? `${score.points} ms` : String(score.points)
    return `<div class="leader-row"><span>#${score.rank} ${escapeHtml(score.name)}</span><b>${escapeHtml(value)}</b><span class="${assurance}">${assurance}</span></div>`
  }).join('')
}

export function playerCard(game, { origin, site = '', page = 'share' } = {}) {
  const name = escapeHtml(game.name)
  const description = escapeHtml(game.description || 'A playable mini-game on Playground.')
  const base = safeOrigin(origin)
  const playUrl = escapeHtml(`${base}/play/${game.id}?embed=1`)
  const pageUrl = escapeHtml(page === 'play' ? `${base}/play/${game.id}` : `${base}/r/${game.id}`)
  const posterUrl = escapeHtml(`${base}/api/games/${game.id}/poster.png`)
  const siteTag = site ? `<meta name="twitter:site" content="${escapeHtml(site)}">\n` : ''
  const tags = `<meta name="twitter:card" content="player">
${siteTag}<meta name="twitter:title" content="${name}">
<meta name="twitter:description" content="${description}">
<meta name="twitter:player" content="${playUrl}">
<meta name="twitter:player:width" content="480">
<meta name="twitter:player:height" content="480">
<meta name="twitter:image" content="${posterUrl}">
<meta property="og:title" content="${name}">
<meta property="og:description" content="${description}">
<meta property="og:type" content="website">
<meta property="og:url" content="${pageUrl}">
<meta property="og:image" content="${posterUrl}">`
  return { tags, name, description, playUrl, pageUrl, posterUrl }
}

function worldShareChecklist(game, card) {
  if (game.type !== 'world') return ''
  const slug = escapeHtml(game.id)
  return `<section class="x-check" aria-label="Share on X">
<h2>Share on X</h2>
<p class="hint">Card title, player URL, and image for this world. Open each one on this machine before the origin is public.</p>
<ul>
<li><span>Card title</span><b>${card.name}</b></li>
<li><span>Player URL</span><a href="/play/${slug}?embed=1">${card.playUrl}</a></li>
<li><span>Image</span><a href="/api/games/${slug}/poster.png">${card.posterUrl}</a></li>
</ul>
</section>`
}

export function renderSharePage(game, { origin, site = '', scores = [], unverified = [] } = {}) {
  const card = playerCard(game, { origin, site, page: 'share' })
  const { name, description, pageUrl, tags } = card
  const slug = escapeHtml(game.id)
  const playPath = `/play/${slug}`
  const studioPath = `/g/${slug}`
  const checkedRows = scores.length ? leaderRows(scores) : '<p class="hint">No checked scores yet. Play a round and claim one.</p>'
  const unverifiedRows = leaderRows(unverified)
  const checklist = worldShareChecklist(game, card)
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${name} — playground</title>
${tags}
<link rel="canonical" href="${pageUrl}">
<link rel="stylesheet" href="/style.css">
<link rel="stylesheet" href="/play.css">
</head>
<body class="share-body">
<header class="top">
<a class="brand" href="/"><svg class="mark" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><rect width="16" height="16" fill="#e6ff3a"/></svg>playground</a>
<nav><a href="/discover">Discover</a></nav>
</header>
<main class="shell share">
<img class="poster" src="/api/games/${slug}/poster.png" width="480" height="480" alt="${name} poster">
<div class="share-copy">
<h1>${name}</h1>
<p>${description}</p>
<p class="by">By ${escapeHtml(game.creator || 'Playground')}</p>
${game.credit?.author ? `<p class="hint">${creditMarkup(game.credit)}</p>` : ''}
<a class="primary" href="${playPath}">Play</a>
<a href="${studioPath}">Open in studio</a>
${checklist}
<section class="leaderboard">
<div class="leaderboard-head"><h2>Top scores</h2><span>Top 20</span></div>
<h2>Checked</h2>
<div class="leaders">${checkedRows}</div>
<h2>Unverified</h2>
<div class="leaders">${unverifiedRows}</div>
</section>
</div>
</main>
</body>
</html>`
}
