import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { renderArena } from '../arena/render.js'
import { TEMPLATES } from './catalog.js'
import { PLAY, RULES } from './plays.js'
import { SHELL } from './shell.js'

const WORDS = readFileSync(fileURLToPath(new URL('../../templates/words-5.txt', import.meta.url)), 'utf8')
  .split(/\s+/)
  .map((word) => word.trim().toLowerCase())
  .filter((word) => /^[a-z]{5}$/.test(word))

function jsonScript(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c')
}

export function wordCount() {
  return WORDS.length
}

export function renderTemplate(spec) {
  if (spec.engine === 'three') return renderArena(spec)
  const rules = RULES[spec.id]
  const play = PLAY[spec.id]
  if (!rules || !play) throw new Error(`Missing template source for ${spec.id}`)
  const names = Object.keys(spec.fields.RULES)
  const answers = spec.id === 'word-guess' ? `const ANSWERS = ${jsonScript(WORDS)};\n` : ''
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${spec.name}</title>
<style>
@font-face{font-family:"Lilita One";src:url("/fonts/lilita-one-latin.woff2") format("woff2");font-weight:400;font-display:swap}
@font-face{font-family:Rubik;src:url("/fonts/rubik-latin-700.woff2") format("woff2");font-weight:700;font-display:swap}
html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#4FB3FF}
canvas{display:block;touch-action:none}
</style>
</head>
<body>
<!-- playground-template: ${spec.id} | ${spec.name} -->
<canvas id="game" width="480" height="480"></canvas>
<script src="/kaplay.js"></script>
<script src="/zzfx.js"></script>
<script>
window.__state = { phase: 'boot', score: 0, input: 0 };
window.__posted = false;
${answers}/* PLAYGROUND CONFIG */
const CONFIG = ${jsonScript(spec.config)};
/* PLAYGROUND END CONFIG */
/* PLAYGROUND THEME */
const THEME = ${jsonScript(spec.theme)};
/* PLAYGROUND END THEME */
/* PLAYGROUND RULES */
${rules}
const RULES = { ${names.map((name) => `${name}: ${name}`).join(', ')} };
/* PLAYGROUND END RULES */
${SHELL}
${play}
boot();
</script>
</body>
</html>
`
}

export function templateMarker(html) {
  const match = String(html || '').match(/<!-- playground-template:\s*([a-z0-9-]+)\s*\|/)
  return match ? match[1] : ''
}

export function renderAll() {
  return Object.fromEntries(TEMPLATES.map((spec) => [spec.id, renderTemplate(spec)]))
}
