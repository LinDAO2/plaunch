import { HttpError } from '../errors.js'
import { cleanText } from '../validate.js'
import { aiStatus, requestModelText } from './generate.js'
import { assertFreeform, inspectFreeform } from './freeform-check.js'
import { resolveProvider } from './providers.js'

export const FREEFORM_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['html'],
  properties: {
    html: {
      type: 'string',
      description: 'One complete HTML document with a canvas, inline CSS, and an inline script. No external URLs.'
    }
  }
}

export const FREEFORM_PROMPT = `You build one self-contained browser game and return JSON only: {"html":"<!DOCTYPE html>..."}.
The html value is one document the player can run offline.
Rules:
- Include a <canvas> and draw the whole game on it
- Put CSS and JavaScript inline. No external scripts, stylesheets, fonts, or images
- No external URLs of any kind. No protocol-relative URLs
- Do not call fetch, XMLHttpRequest, WebSocket, eval, the Function constructor, import, or Worker
- Do not read document.cookie, localStorage, or sessionStorage
- Keep the document under 150KB
- When the score changes, call parent.postMessage({ type: "playground-score", points: score }, "*")
- points is an integer from 0 to 100000
- The message object has only the keys type and points
- Make the game actually playable with a pointer or the keyboard, and match the player's idea
- Do not wrap the JSON in markdown`

function jsString(value) {
  return JSON.stringify(String(value).slice(0, 80)).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/\u2028/g, '\\u2028')
}

export function titleFromPrompt(prompt) {
  const words = String(prompt || '').replace(/[^a-z0-9\s]/gi, ' ').trim().split(/\s+/).filter(Boolean).slice(0, 4)
  const name = words.map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ')
  if (name.length < 2) return 'Freeform Game'
  return name.slice(0, 45)
}

export function templateFreeform(prompt) {
  const title = jsString(titleFromPrompt(prompt))
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Freeform</title>
<style>
html,body{margin:0;height:100%;background:#120f1c}
canvas{width:100%;height:100%;display:block;touch-action:none}
</style>
</head>
<body>
<canvas id="c" width="480" height="480"></canvas>
<script>
const canvas = document.getElementById('c')
const ctx = canvas.getContext('2d')
const title = ${title}
let score = 0
const dots = []
function spawn() {
  dots.push({ x: 40 + Math.random() * 400, y: 40 + Math.random() * 400, r: 18 })
  if (dots.length > 6) dots.shift()
}
function draw() {
  ctx.fillStyle = '#1b1430'
  ctx.fillRect(0, 0, 480, 480)
  ctx.fillStyle = '#f4efe6'
  ctx.font = '22px sans-serif'
  ctx.fillText(title, 20, 36)
  ctx.fillText(String(score), 20, 68)
  ctx.fillStyle = '#4adeb9'
  for (const dot of dots) {
    ctx.beginPath()
    ctx.arc(dot.x, dot.y, dot.r, 0, Math.PI * 2)
    ctx.fill()
  }
}
function report() {
  parent.postMessage({ type: 'playground-score', points: score }, '*')
}
canvas.addEventListener('pointerdown', (event) => {
  const rect = canvas.getBoundingClientRect()
  const x = ((event.clientX - rect.left) / Math.max(rect.width, 1)) * 480
  const y = ((event.clientY - rect.top) / Math.max(rect.height, 1)) * 480
  const hit = dots.findIndex((dot) => Math.hypot(dot.x - x, dot.y - y) <= dot.r + 4)
  if (hit >= 0) {
    dots.splice(hit, 1)
    score += 1
    report()
  }
  draw()
})
spawn()
setInterval(spawn, 900)
draw()
report()
</script>
</body>
</html>`
}

function extractHtml(raw) {
  const text = String(raw || '').trim()
  if (/^<!doctype html/i.test(text) || /^<html[\s>]/i.test(text)) return text
  let value
  try {
    value = JSON.parse(text.replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim())
  } catch {
    return ''
  }
  return typeof value?.html === 'string' ? value.html : ''
}

function gameFields(prompt, generation) {
  const description = cleanText(prompt, 180)
  return {
    name: titleFromPrompt(prompt),
    description,
    type: 'arcade',
    duration: 30,
    accent: '#7c6bf2',
    tokenInterest: false,
    generation,
    notice: ''
  }
}

export async function generateFreeform({ prompt, env, fetchImpl = globalThis.fetch }) {
  const idea = cleanText(prompt, 600)
  if (idea.length < 6) throw new HttpError(400, 'Describe your game in more detail', 'validation_error')
  const status = aiStatus(env)
  if (status.mode !== 'ai') {
    const html = templateFreeform(idea)
    const checked = assertFreeform(html)
    if (!checked.ok) throw new HttpError(500, checked.errors.join('; '), 'freeform_rejected')
    const game = gameFields(idea, 'rule-based-template')
    game.notice = 'Template mode. This idea does not fit the arcade spec, so it runs as a sandboxed canvas game. Model output is never executed as code.'
    return {
      mode: 'template',
      tier: 'freeform',
      provider: null,
      model: null,
      game,
      spec: null,
      html,
      notice: game.notice,
      tierReason: 'Auto picked the freeform sandbox. The idea does not fit the arcade spec.'
    }
  }
  const provider = resolveProvider(env)
  const messages = [
    { role: 'system', content: FREEFORM_PROMPT },
    { role: 'user', content: `Player idea:\n${idea}` }
  ]
  let errors = ['Model output was empty']
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await requestModelText(provider, messages, fetchImpl, {
      schema: FREEFORM_SCHEMA,
      maxOutputTokens: 16384
    })
    const html = extractHtml(raw)
    errors = inspectFreeform(html)
    if (!errors.length) {
      const game = gameFields(idea, `ai:${provider.id}`)
      game.notice = `Generated with ${provider.id} (${provider.model}) as a sandboxed HTML game. The document is checked, then served from a separate origin. It is never executed on the server.`
      return {
        mode: 'ai',
        tier: 'freeform',
        provider: provider.id,
        model: provider.model,
        game,
        spec: null,
        html,
        notice: game.notice,
        tierReason: 'Auto picked the freeform sandbox. The idea does not fit the arcade spec.'
      }
    }
    messages.push({
      role: 'user',
      content: `Rejected:\n- ${errors.join('\n- ')}\nReturn one JSON object with an html string. No external URLs, fetch, XMLHttpRequest, WebSocket, eval, Function, document.cookie, or localStorage.`
    })
  }
  throw new HttpError(502, `Freeform game was rejected: ${errors.join('; ')}`, 'ai_invalid_output')
}
