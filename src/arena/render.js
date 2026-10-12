import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const SIM = readFileSync(fileURLToPath(new URL('./sim.js', import.meta.url)), 'utf8').replace(/^export /gm, '')
const VIEW = readFileSync(fileURLToPath(new URL('./view.js', import.meta.url)), 'utf8')

function jsonScript(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c')
}

export function renderArena(spec) {
  const accent = spec.theme.palette.accent
  const ink = spec.theme.palette.ink
  const bg = spec.theme.palette.bg
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
html,body{margin:0;height:100%;overflow:hidden;background:${bg};color:${ink};font:600 15px/1.3 ui-sans-serif,system-ui,sans-serif}
#view{position:fixed;inset:0;width:100%;height:100%;display:block;touch-action:none}
#hurt{position:fixed;inset:0;pointer-events:none;box-shadow:inset 0 0 90px rgba(0,0,0,.28);transition:box-shadow .18s}
#hurt.pain{box-shadow:inset 0 0 140px 36px rgba(210,32,48,.62)}
#boot,#start{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;z-index:6}
#boot{background:${bg};flex-direction:column;gap:18px}
#boot[hidden],#start[hidden],#death[hidden],#over[hidden],#kill[hidden]{display:none !important}
.mark{width:16px;height:16px;margin:0 auto 14px;background:${accent};transform:rotate(45deg);box-shadow:0 0 22px ${accent}}
h1{margin:0;font-size:clamp(46px,9vw,80px);letter-spacing:-.045em;line-height:.92;font-weight:800}
#start{background:linear-gradient(180deg,rgba(6,8,14,.12),rgba(6,8,14,.5));pointer-events:auto}
.card{text-align:center;padding:28px 34px 26px;border-radius:28px;background:rgba(8,10,16,.62);border:1px solid rgba(255,255,255,.16);box-shadow:0 24px 70px rgba(0,0,0,.35);max-width:min(92vw,520px)}
#start-hint{margin:10px 0 0;opacity:.82;font-weight:550;font-size:14px}
#play{margin-top:22px;border:0;background:${accent};color:#10140c;font:800 18px/1 inherit;letter-spacing:.08em;text-transform:uppercase;padding:16px 46px;border-radius:999px;cursor:pointer}
.bar{width:min(280px,70vw);height:8px;border-radius:99px;background:rgba(255,255,255,.16);overflow:hidden}
.bar i{display:block;height:100%;width:0;background:${accent};border-radius:inherit}
#boot p{margin:0;opacity:.75;font-size:13px;letter-spacing:.04em}
#playhud{position:fixed;inset:0;pointer-events:none}
body:not(.playing) #playhud{opacity:0}
#nameplate{position:absolute;left:14px;top:12px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;opacity:.9}
#board{position:absolute;left:50%;top:10px;transform:translateX(-50%);display:flex;gap:14px;align-items:baseline;padding:8px 14px;border-radius:999px;background:rgba(6,8,14,.55);border:1px solid rgba(255,255,255,.12)}
#pts{font-size:22px;font-weight:800;font-variant-numeric:tabular-nums}
#timer{opacity:.85;font-variant-numeric:tabular-nums}
#quality{position:absolute;right:12px;top:12px;pointer-events:auto;border:1px solid rgba(255,255,255,.28);background:rgba(6,8,14,.45);color:${ink};border-radius:999px;padding:6px 10px;font:700 11px/1 inherit;letter-spacing:.06em;text-transform:uppercase}
#feed{position:absolute;left:14px;top:42px;display:flex;flex-direction:column;gap:4px;max-width:min(70vw,360px)}
.chip{background:rgba(6,8,14,.55);border-radius:999px;padding:4px 10px;font-size:12px;font-weight:650}
#cross{position:absolute;left:50%;top:50%;width:18px;height:18px;transform:translate(-50%,-50%)}
#cross i{position:absolute;background:#fff;box-shadow:0 0 0 1px rgba(0,0,0,.35)}
#cross i:nth-child(1){left:8px;top:0;width:2px;height:5px}
#cross i:nth-child(2){left:8px;bottom:0;width:2px;height:5px}
#cross i:nth-child(3){top:8px;left:0;width:5px;height:2px}
#cross i:nth-child(4){top:8px;right:0;width:5px;height:2px}
#hit{position:absolute;left:50%;top:50%;width:18px;height:18px;transform:translate(-50%,-50%) rotate(45deg);border:2px solid #fff;opacity:0}
#hit.on{opacity:1}
#hp{position:absolute;left:14px;bottom:16px;width:min(240px,42vw)}
#hp b{display:block;font-size:28px;font-weight:800;font-variant-numeric:tabular-nums;line-height:1}
#hp i{display:block;margin-top:6px;height:8px;border-radius:99px;background:rgba(255,255,255,.16);position:relative;overflow:hidden}
#hp i:after{content:"";position:absolute;left:0;top:0;bottom:0;width:var(--p,100%);background:${accent}}
#ammo{position:absolute;right:14px;bottom:16px;text-align:right}
#ammo b{display:block;font-size:28px;font-weight:800;font-variant-numeric:tabular-nums;line-height:1}
#ammo small{display:block;margin-top:4px;letter-spacing:.08em;text-transform:uppercase;font-size:10px;opacity:.75}
#mini{position:absolute;right:14px;bottom:78px;width:116px;height:116px;border-radius:18px;background:rgba(6,8,14,.45);border:1px solid rgba(255,255,255,.16)}
#floats{position:fixed;inset:0;pointer-events:none;overflow:hidden}
.dmg{position:absolute;transform:translate(-50%,-50%);font-size:20px;font-weight:800;text-shadow:0 1px 2px rgba(0,0,0,.8)}
#death,#over,#kill{position:absolute;left:50%;top:42%;transform:translate(-50%,-50%);text-align:center;background:rgba(6,8,14,.72);border:1px solid rgba(255,255,255,.16);border-radius:20px;padding:16px 22px}
#death b,#over b{display:block;font-size:28px;letter-spacing:-.03em}
#kill{top:28%;padding:8px 14px;font-size:14px}
#sticks{display:none;position:absolute;left:0;right:0;bottom:18px;height:150px;pointer-events:none;z-index:4}
body.touch #sticks{display:block}
body.touch #cross,body.touch #hit{display:none}
body.touch #hp,body.touch #ammo{bottom:168px}
body.touch #mini{bottom:230px}
.stick{position:absolute;bottom:0;width:108px;height:108px;border-radius:50%;border:2px solid rgba(255,255,255,.45);pointer-events:auto;touch-action:none;background:rgba(6,8,14,.28)}
.stick i{position:absolute;left:38px;top:38px;width:28px;height:28px;border-radius:50%;background:${accent}}
#move{left:16px}
#look{right:92px}
#fire{position:absolute;right:16px;bottom:18px;width:68px;height:68px;border-radius:50%;border:0;background:${accent};color:#10140c;font:800 13px/1 inherit;pointer-events:auto;touch-action:none}
</style>
</head>
<body>
<!-- playground-template: ${spec.id} | ${spec.name} -->
<!-- playground-engine: three -->
<canvas id="view"></canvas>
<div id="hurt"></div>
<div id="boot"><div class="mark"></div><h1 id="boot-title"></h1><div class="bar"><i id="boot-bar"></i></div><p id="boot-label">Loading</p></div>
<div id="start" hidden><div class="card"><div class="mark"></div><h1 id="start-title"></h1><p id="start-hint"></p><button id="play" type="button">Play</button></div></div>
<div id="playhud">
  <div id="nameplate"></div>
  <div id="board"><span id="pts">0</span><span id="timer"></span></div>
  <button id="quality" type="button">Med</button>
  <div id="feed"></div>
  <div id="cross"><i></i><i></i><i></i><i></i></div>
  <div id="hit"></div>
  <div id="hp"><b>100</b><i></i></div>
  <div id="ammo"><b>0</b><small>ammo</small></div>
  <canvas id="mini" width="116" height="116"></canvas>
  <div id="death" hidden><b>Down</b><span>Respawning</span></div>
  <div id="over" hidden></div>
  <div id="kill" hidden></div>
</div>
<div id="floats"></div>
<div id="sticks"><div id="move" class="stick"><i></i></div><div id="look" class="stick"><i></i></div><button id="fire" type="button">Fire</button></div>
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
