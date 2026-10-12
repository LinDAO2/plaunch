import { HttpError } from '../errors.js'
import { STYLE_GUIDE } from '../style-kit.js'
import { cleanText } from '../validate.js'
import { aiStatus, requestModelText } from './generate.js'
import { assertFreeform, inspectFreeform } from './freeform-check.js'
import { FREEFORM_MAX_OUTPUT_TOKENS, freeformTimeoutMs, resolveProviderChain } from './providers.js'

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
- The game runs in a frame about 450x520 CSS pixels. Size the canvas to window.innerWidth and window.innerHeight, handle resize, and keep every control and the in-game HUD inside the canvas
- The parent page shows best score only. Draw the current score, the best score, and any timer yourself
- Support touch (tap and drag), mouse, and keyboard. Pointer events cover a finger and a mouse. Do not rely on keyboard focus alone
- Draw with shapes and gradients. Emoji are allowed. Optional sprites are only /sprites/kenney-chars.png and /sprites/kenney-tiles.png
- ${STYLE_GUIDE}
- Track the best score in a variable across in-page restarts. Do not use storage APIs
- Write compact code. Target under 8000 output tokens and under 40KB. Do not inline Kaplay, ZzFX, or three.js. If you need one, use <script src="/kaplay.js"></script>, <script src="/zzfx.js"></script>, or <script src="/three.js"></script>. Do not paste a long stylesheet. Use the candy hex colors already listed above
- No external URLs of any kind. No protocol-relative URLs. No https images or fonts
- Do not call fetch, XMLHttpRequest, WebSocket, eval, the Function constructor, import, or Worker
- Do not read document.cookie, localStorage, or sessionStorage
- Keep the document under 150KB
- When the score or the best score changes, call parent.postMessage({ type: "playground-score", points: best }, "*")
- That postMessage is the only parent access. Do not read parent.document, parent.location, top, or contentWindow
- points is the best score, an integer from 0 to 100000
- The message object has only the keys type and points
- Make the game actually playable and match the player's idea
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
html,body{margin:0;height:100%;background:#4FB3FF;overflow:hidden}
canvas{width:100%;height:100%;display:block;touch-action:none}
</style>
</head>
<body>
<canvas id="c"></canvas>
<script>
const canvas = document.getElementById('c')
const ctx = canvas.getContext('2d')
const title = ${title}
let score = 0
let best = 0
const dots = []
function resize() {
  canvas.width = Math.max(320, window.innerWidth)
  canvas.height = Math.max(320, window.innerHeight)
  draw()
}
function spawn() {
  dots.push({ x: 36 + Math.random() * Math.max(40, canvas.width - 72), y: 80 + Math.random() * Math.max(40, canvas.height - 120), r: 18 })
  if (dots.length > 6) dots.shift()
}
function draw() {
  const sky = ctx.createLinearGradient(0, 0, 0, canvas.height)
  sky.addColorStop(0, '#4FB3FF')
  sky.addColorStop(1, '#CDEBFF')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#1B1B2F'
  ctx.font = '28px sans-serif'
  ctx.fillText(title, 20, 40)
  ctx.font = '18px sans-serif'
  ctx.fillText('Score ' + score + '   Best ' + best, 20, 68)
  for (const dot of dots) {
    ctx.fillStyle = '#1B1B2F'
    ctx.beginPath()
    ctx.arc(dot.x, dot.y + 3, dot.r + 3, 0, Math.PI * 2)
    ctx.fill()
    const glow = ctx.createRadialGradient(dot.x, dot.y, 2, dot.x, dot.y, dot.r)
    glow.addColorStop(0, '#FFD23F')
    glow.addColorStop(1, '#FF5A3C')
    ctx.fillStyle = glow
    ctx.beginPath()
    ctx.arc(dot.x, dot.y, dot.r, 0, Math.PI * 2)
    ctx.fill()
  }
}
function report() {
  if (score > best) best = score
  parent.postMessage({ type: 'playground-score', points: best }, '*')
}
function pointerAt(event) {
  const rect = canvas.getBoundingClientRect()
  return {
    x: ((event.clientX - rect.left) / Math.max(rect.width, 1)) * canvas.width,
    y: ((event.clientY - rect.top) / Math.max(rect.height, 1)) * canvas.height
  }
}
function hitAt(x, y) {
  const hit = dots.findIndex((dot) => Math.hypot(dot.x - x, dot.y - y) <= dot.r + 8)
  if (hit < 0) return
  dots.splice(hit, 1)
  score += 1
  report()
  draw()
}
canvas.addEventListener('pointerdown', (event) => {
  const point = pointerAt(event)
  hitAt(point.x, point.y)
})
canvas.addEventListener('pointermove', (event) => {
  if (event.buttons !== 1) return
  const point = pointerAt(event)
  hitAt(point.x, point.y)
})
addEventListener('keydown', () => { score += 1; report(); draw() })
addEventListener('resize', resize)
resize()
spawn()
setInterval(spawn, 900)
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

export async function generateFreeform({ prompt, env, fetchImpl = globalThis.fetch, onProgress }) {
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
  const chain = resolveProviderChain(env, 'freeform')
  let provider = chain[0]
  const messages = [
    { role: 'system', content: FREEFORM_PROMPT },
    { role: 'user', content: `Player idea:\n${idea}` }
  ]
  let errors = ['Model output was empty']
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await requestModelText(provider, messages, fetchImpl, {
      schema: FREEFORM_SCHEMA,
      schemaName: 'freeform_html',
      maxOutputTokens: FREEFORM_MAX_OUTPUT_TOKENS,
      stream: true,
      continueOnTruncation: true,
      timeoutMs: freeformTimeoutMs(env),
      stallMs: 25_000,
      fallbacks: chain.slice(1),
      onUse: (item) => { provider = item },
      onProgress
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
    const previous = (html || raw || '').slice(0, 150 * 1024)
    messages.push({ role: 'assistant', content: previous })
    messages.push({
      role: 'user',
      content: `The previous attempt was rejected.\nErrors:\n- ${errors.join('\n- ')}\nPrevious attempt:\n${previous}\nFix every error and return one JSON object with an html string. No external URLs, fetch, XMLHttpRequest, WebSocket, eval, Function, document.cookie, or localStorage.`
    })
  }
  throw new HttpError(502, `Freeform game was rejected: ${errors.join('; ')}`, 'ai_invalid_output')
}
