import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const SIM = readFileSync(fileURLToPath(new URL('./sim.js', import.meta.url)), 'utf8').replace(/^export /gm, '')
const VIEW = readFileSync(fileURLToPath(new URL('./view.js', import.meta.url)), 'utf8')

function jsonScript(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c')
}

export function renderArena(spec) {
  const rules = `function scoreKill(mode, kind) {
  if (mode === 'race' && kind === 'lap') return 300
  if (mode === 'race') return 100
  if (mode === 'ctf' && kind === 'cap') return 200
  if (mode === 'tag') return 50
  if (mode === 'explore' && kind === 'buoy') return 25
  if (mode === 'explore') return 50
  return 100
}`
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${spec.name}</title>
<style>
html,body{margin:0;height:100%;overflow:hidden;background:${spec.theme.palette.bg};color:${spec.theme.palette.ink};font:600 14px/1.3 ui-sans-serif,system-ui,sans-serif}
#view{position:fixed;inset:0;width:100%;height:100%;display:block;touch-action:none}
#hud{position:fixed;inset:0;pointer-events:none}
#top{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:10px 12px}
#title{letter-spacing:.04em;text-transform:uppercase;font-size:13px}
#timer{font:600 18px/1 ui-monospace,monospace}
#quality{pointer-events:auto;border:1px solid ${spec.theme.palette.ink};background:transparent;color:${spec.theme.palette.ink};border-radius:999px;padding:4px 10px;font:600 11px/1 inherit}
#feed{position:absolute;left:12px;top:42px;max-width:70%;color:${spec.theme.palette.ink};opacity:.9;font-size:12px}
#cross{position:absolute;left:50%;top:50%;width:14px;height:14px;transform:translate(-50%,-50%);border:2px solid ${spec.theme.palette.accent};border-radius:50%;box-shadow:0 0 0 1px rgba(0,0,0,.35)}
#cross:before,#cross:after{content:"";position:absolute;background:${spec.theme.palette.accent}}
#cross:before{left:5px;top:-6px;width:2px;height:6px}
#cross:after{left:5px;bottom:-6px;width:2px;height:6px}
#bottom{position:absolute;left:12px;right:12px;bottom:12px;display:flex;gap:10px;align-items:flex-end}
#hp{flex:1;height:10px;border-radius:99px;background:${spec.theme.palette.mute};position:relative;max-width:220px}
#hp:after{content:"";position:absolute;left:0;top:0;bottom:0;width:var(--p,100%);background:${spec.theme.palette.accent};border-radius:inherit}
#hp:before{content:attr(data-hp);position:absolute;left:0;bottom:14px;font:600 12px/1 ui-monospace,monospace}
#ammo,#points{font:600 22px/1 ui-monospace,monospace;min-width:52px}
#mini{position:absolute;right:12px;bottom:12px;width:112px;height:112px;border-radius:12px;background:rgba(0,0,0,.25)}
#over{position:absolute;left:50%;top:42%;transform:translate(-50%,-50%);background:${spec.theme.palette.bg};color:${spec.theme.palette.ink};padding:12px 16px;border:1px solid ${spec.theme.palette.accent};border-radius:12px}
#sticks{display:none;position:absolute;left:0;right:0;bottom:28px;height:140px;pointer-events:none}
body.touch #sticks{display:block}
body.touch #cross{display:none}
.stick{position:absolute;bottom:0;width:108px;height:108px;border-radius:50%;border:2px solid ${spec.theme.palette.ink};pointer-events:auto;touch-action:none}
.stick i{position:absolute;left:38px;top:38px;width:28px;height:28px;border-radius:50%;background:${spec.theme.palette.accent}}
#move{left:16px}
#look{right:92px}
#fire{position:absolute;right:16px;bottom:28px;width:64px;height:64px;border-radius:50%;border:0;background:${spec.theme.palette.accent};color:${spec.theme.palette.bg};font:700 13px/1 inherit;pointer-events:auto;touch-action:none}
</style>
</head>
<body>
<!-- playground-template: ${spec.id} | ${spec.name} -->
<!-- playground-engine: three -->
<canvas id="view"></canvas>
<div id="hud">
  <div id="top"><strong id="title"></strong><span id="timer"></span><button id="quality" type="button">Auto</button></div>
  <div id="feed"></div>
  <div id="cross"></div>
  <div id="bottom"><div id="hp" data-hp="100"></div><div id="ammo"></div><div id="points">0</div></div>
  <canvas id="mini" width="112" height="112"></canvas>
  <div id="over" hidden></div>
  <div id="sticks"><div id="move" class="stick"><i></i></div><div id="look" class="stick"><i></i></div><button id="fire" type="button">Fire</button></div>
</div>
<script src="/three.js"></script>
<script>
window.__state = { phase: 'boot', score: 0, input: 0, engine: 'three' };
window.__posted = false;
/* PLAYGROUND CONFIG */
const CONFIG = ${jsonScript(spec.config)};
/* PLAYGROUND END CONFIG */
/* PLAYGROUND THEME */
const THEME = ${jsonScript(spec.theme)};
/* PLAYGROUND END THEME */
/* PLAYGROUND RULES */
/* PLAYGROUND RULE scoreKill */
${rules}
/* PLAYGROUND END RULE scoreKill */
const RULES = { scoreKill: scoreKill };
/* PLAYGROUND END RULES */
${SIM}
${VIEW}
</script>
</body>
</html>
`
}

export function readArenaBlocks(html) {
  const read = (name) => {
    const start = String(html || '').indexOf(`/* PLAYGROUND ${name} */`)
    const end = String(html || '').indexOf(`/* PLAYGROUND END ${name} */`)
    if (start < 0 || end < start) return null
    const inner = html.slice(start, end)
    const open = inner.indexOf('{')
    const close = inner.lastIndexOf('}')
    if (open < 0 || close < open) return null
    return JSON.parse(inner.slice(open, close + 1))
  }
  return { config: read('CONFIG') || {}, theme: read('THEME') || {} }
}
