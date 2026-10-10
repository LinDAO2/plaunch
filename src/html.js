import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { escapeHtml } from './http.js'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public')

let playTemplate

export async function renderPlayPage(game) {
  if (!playTemplate) playTemplate = await readFile(path.join(ROOT, 'play.html'), 'utf8')
  const accent = /^#[0-9a-fA-F]{6}$/.test(game.accent) ? game.accent : '#a88bff'
  const values = {
    TITLE: escapeHtml(`${game.name} — playground`),
    NAME: escapeHtml(game.name),
    DESCRIPTION: escapeHtml(game.description || ''),
    SLUG: escapeHtml(game.id),
    ACCENT: accent,
    MECHANIC: escapeHtml(String(game.type || '').toUpperCase())
  }
  return playTemplate.replace(/__([A-Z_]+)__/g, (_, key) => values[key] ?? '')
}

// Reserved share URL for a future X Player Card.
// Not emitted yet: twitter:card=player, twitter:player, twitter:player:width/height, twitter:image.
export function renderSharePage(game, origin) {
  const name = escapeHtml(game.name)
  const description = escapeHtml(game.description || 'A playable mini-game on Playground.')
  const slug = escapeHtml(game.id)
  const playPath = `/play/${slug}`
  const studioPath = `/g/${slug}`
  const canonical = escapeHtml(`${origin}${studioPath}`)
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${name} — playground</title>
<meta property="og:title" content="${name}">
<meta property="og:description" content="${description}">
<meta property="og:type" content="website">
<link rel="canonical" href="${canonical}">
<link rel="stylesheet" href="/play.css">
</head>
<body class="play-body">
<main class="play-shell">
<p class="eyebrow">PLAYGROUND</p>
<h1>${name}</h1>
<p>${description}</p>
<p class="play-links"><a href="${playPath}">Play</a><a href="${studioPath}">Open studio page</a></p>
<p class="hint">This share page is reserved for a future X player card. Inline playback is not wired up yet.</p>
</main>
</body>
</html>`
}
