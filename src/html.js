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

export async function renderPlayPage(game, { embed = false } = {}) {
  if (!playTemplate) playTemplate = await readFile(path.join(ROOT, 'play.html'), 'utf8')
  const accent = /^#[0-9a-fA-F]{6}$/.test(game.accent) ? game.accent : '#a88bff'
  const values = {
    TITLE: escapeHtml(`${game.name} — playground`),
    NAME: escapeHtml(game.name),
    DESCRIPTION: escapeHtml(game.description || ''),
    SLUG: escapeHtml(game.id),
    ACCENT: accent,
    MECHANIC: escapeHtml(String(game.type || '').toUpperCase()),
    BODY_CLASS: embed ? `play-body embed${game.tier === 'freeform' ? ' freeform-play' : ''}` : 'play-body',
    GATE_ATTR: embed ? '' : 'hidden',
    CREDIT: creditMarkup(game.credit)
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

export function renderSharePage(game, { origin, site = '', scores = [], unverified = [] } = {}) {
  const name = escapeHtml(game.name)
  const description = escapeHtml(game.description || 'A playable mini-game on Playground.')
  const slug = escapeHtml(game.id)
  const base = safeOrigin(origin)
  const playUrl = escapeHtml(`${base}/play/${game.id}?embed=1`)
  const pageUrl = escapeHtml(`${base}/r/${game.id}`)
  const posterUrl = escapeHtml(`${base}/api/games/${game.id}/poster.png`)
  const playPath = `/play/${slug}`
  const studioPath = `/g/${slug}`
  const siteTag = site ? `<meta name="twitter:site" content="${escapeHtml(site)}">` : ''
  const checkedRows = scores.length ? leaderRows(scores) : '<p class="hint">No checked scores yet. Play a round and claim one.</p>'
  const unverifiedRows = leaderRows(unverified)
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${name} — playground</title>
<meta name="twitter:card" content="player">
${siteTag}
<meta name="twitter:title" content="${name}">
<meta name="twitter:description" content="${description}">
<meta name="twitter:player" content="${playUrl}">
<meta name="twitter:player:width" content="480">
<meta name="twitter:player:height" content="480">
<meta name="twitter:image" content="${posterUrl}">
<meta property="og:title" content="${name}">
<meta property="og:description" content="${description}">
<meta property="og:type" content="website">
<meta property="og:url" content="${pageUrl}">
<meta property="og:image" content="${posterUrl}">
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
