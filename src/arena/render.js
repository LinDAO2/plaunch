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
@font-face{font-family:"Lilita One";src:url("/fonts/lilita-one-latin.woff2") format("woff2");font-weight:400;font-display:swap}
@font-face{font-family:Rubik;src:url("/fonts/rubik-latin-700.woff2") format("woff2");font-weight:700;font-display:swap}
@font-face{font-family:"Chakra Petch";src:url("/fonts/chakra-petch-latin-600.woff2") format("woff2");font-weight:600;font-display:swap}
html,body{margin:0;height:100%;overflow:hidden;background:${bg};color:#f4f7fb;font:700 14px/1.2 Rubik,ui-sans-serif,sans-serif}
#view{position:fixed;inset:0;width:100%;height:100%;display:block;touch-action:none}
#hurt{position:fixed;inset:0;pointer-events:none;box-shadow:inset 0 0 80px rgba(0,0,0,.18);transition:box-shadow .18s}
#hurt.pain{box-shadow:inset 0 0 120px 28px rgba(255,46,99,.55)}
#boot,#start{position:fixed;inset:0;z-index:6}
#boot{display:flex;align-items:flex-end;justify-content:center;background:${bg}}
#boot[hidden],#start[hidden],#death[hidden],#over[hidden],#kill[hidden],#banner[hidden],#coach[hidden],#place[hidden]{display:none !important}
#boot .sheet,#start .sheet{width:100%;padding:18px 16px 22px;background:linear-gradient(180deg,rgba(8,10,16,0),rgba(8,10,16,.72));text-align:center}
h1{margin:0;font-family:"Lilita One",sans-serif;font-size:40px;font-weight:400;letter-spacing:.01em;line-height:1;text-shadow:0 2px 0 rgba(11,15,26,.6)}
#start{display:flex;align-items:flex-end;pointer-events:none;background:linear-gradient(180deg,rgba(8,10,16,0) 46%,rgba(8,10,16,.55))}
#start .sheet{pointer-events:auto}
#start-hint{margin:8px 0 0;font-size:14px;font-weight:600;text-shadow:0 2px 0 rgba(11,15,26,.6)}
#play{margin-top:14px;width:200px;height:64px;border:0;border-bottom:4px solid #B8860B;background:#FFD23F;color:#1B1B2F;font-family:"Lilita One",sans-serif;font-size:28px;letter-spacing:.04em;border-radius:14px;cursor:pointer}
#play:active{transform:translateY(3px);border-bottom-width:1px}
.bar{width:min(240px,70vw);height:8px;border-radius:99px;background:rgba(255,255,255,.2);overflow:hidden;margin:12px auto 0}
.bar i{display:block;height:100%;width:0;background:#FFD23F}
#boot p{margin:8px 0 0;font-size:13px}
#playhud{position:fixed;inset:0;pointer-events:none}
body:not(.playing) #playhud{opacity:0}
#board{position:absolute;left:50%;top:12px;transform:translateX(-50%);display:flex;gap:8px;align-items:center;height:32px;max-width:200px;padding:0 12px;border-radius:999px;background:rgba(11,15,26,.55);font-variant-numeric:tabular-nums;text-shadow:0 2px 0 rgba(11,15,26,.6)}
#pts,#timer{font-family:Rubik,sans-serif;font-weight:800;font-size:14px}
#quality{position:absolute;right:12px;top:12px;width:44px;height:32px;pointer-events:auto;border:0;background:rgba(11,15,26,.45);color:#fff;border-radius:10px;font:700 11px/1 Rubik,sans-serif}
#feed{position:absolute;right:12px;top:52px;display:flex;flex-direction:column;gap:4px;align-items:flex-end;max-width:46%;font-family:"Chakra Petch",Rubik,sans-serif}
.chip{background:rgba(11,15,26,.55);border-radius:8px;padding:3px 8px;font-size:12px;font-weight:600}
#cross{position:absolute;left:50%;top:50%;width:18px;height:18px;transform:translate(-50%,-50%);transition:transform .08s}
#cross.hot{transform:translate(-50%,-50%) scale(1.44)}
#cross i{position:absolute;background:#fff;box-shadow:0 0 0 1px #0B0F1A}
#cross i:nth-child(1){left:8px;top:0;width:2px;height:5px}
#cross i:nth-child(2){left:8px;bottom:0;width:2px;height:5px}
#cross i:nth-child(3){top:8px;left:0;width:5px;height:2px}
#cross i:nth-child(4){top:8px;right:0;width:5px;height:2px}
#hit{position:absolute;left:50%;top:50%;width:28px;height:28px;transform:translate(-50%,-50%) rotate(45deg);opacity:0}
#hit.on{opacity:1}
#hit i{position:absolute;background:${accent}}
#hit.kill i{background:#FF2E63}
#hit i:nth-child(1){left:0;top:12px;width:8px;height:3px}
#hit i:nth-child(2){right:0;top:12px;width:8px;height:3px}
#hit i:nth-child(3){left:12px;top:0;width:3px;height:8px}
#hit i:nth-child(4){left:12px;bottom:0;width:3px;height:8px}
#hp{position:absolute;left:12px;bottom:12px;width:120px}
#hp b{display:block;font-family:Rubik,sans-serif;font-size:20px;font-weight:800;font-variant-numeric:tabular-nums;line-height:1;text-shadow:0 2px 0 rgba(11,15,26,.6)}
#hp i{display:block;margin-top:4px;height:10px;border-radius:5px;background:rgba(255,255,255,.2);position:relative;overflow:hidden}
#hp i:after{content:"";position:absolute;left:0;top:0;bottom:0;width:var(--p,100%);background:#3FB950}
#hp[data-band="mid"] i:after{background:#E3B341}
#hp[data-band="low"] i:after{background:#FF2E63;animation:pulse .6s steps(2) infinite}
@keyframes pulse{50%{opacity:.45}}
#ammo{position:absolute;right:12px;bottom:12px;text-align:right}
#ammo b{display:block;font-family:Rubik,sans-serif;font-size:28px;font-weight:800;font-variant-numeric:tabular-nums;line-height:1;text-shadow:0 2px 0 rgba(11,15,26,.6)}
#ammo small{display:block;margin-top:2px;letter-spacing:.08em;text-transform:uppercase;font-size:10px}
#place{position:absolute;left:12px;top:12px;font-family:"Lilita One",sans-serif;font-size:40px;text-shadow:0 2px 0 rgba(11,15,26,.6)}
#banner,#kill{position:absolute;left:50%;top:28%;transform:translate(-50%,-50%) skewX(-8deg);font-family:"Lilita One",sans-serif;font-size:42px;color:#fff;background:#111;border:3px solid #fff;padding:6px 16px;text-shadow:none}
#coach{position:absolute;left:50%;top:62%;transform:translateX(-50%);font-family:"Lilita One",sans-serif;font-size:22px;text-shadow:0 2px 0 rgba(11,15,26,.6)}
#mini{display:none}
#floats{position:fixed;inset:0;pointer-events:none;overflow:hidden}
.dmg{position:absolute;transform:translate(-50%,-50%);font-family:Rubik,sans-serif;font-size:18px;font-weight:800;text-shadow:0 2px 0 rgba(11,15,26,.6)}
#death,#over{position:absolute;left:50%;top:42%;transform:translate(-50%,-50%);text-align:center;background:rgba(11,15,26,.78);border-radius:16px;padding:16px 22px}
#death b,#over b{display:block;font-family:"Lilita One",sans-serif;font-size:36px}
#sticks{display:none;position:absolute;left:0;right:0;bottom:0;height:180px;pointer-events:none;z-index:4}
body.touch #sticks{display:block}
body.touch #cross,body.touch #hit{display:none}
body.poster #coach,body.poster #banner,body.poster #feed,body.poster #quality,body.poster #cross,body.poster #hit,body.poster #kill{display:none !important}
body.poster #place{font-size:22px;top:8px}
body.poster #board{top:8px}
body.touch #hp{bottom:150px}
body.touch #ammo{bottom:168px}
.stick{position:absolute;bottom:16px;width:104px;height:104px;border-radius:50%;border:2px solid rgba(255,255,255,.45);pointer-events:auto;touch-action:none;background:rgba(11,15,26,.28);opacity:.35}
.stick:active,.stick.hot{opacity:.7}
.stick i{position:absolute;left:30px;top:30px;width:44px;height:44px;border-radius:50%;background:${accent}}
#move{left:12px}
#look{right:96px}
#fire{position:absolute;right:16px;bottom:16px;width:72px;height:72px;border-radius:50%;border:0;background:${accent};color:#1B1B2F;font-family:"Lilita One",sans-serif;font-size:14px;pointer-events:auto;touch-action:none;opacity:.7}
#jump{position:absolute;right:96px;bottom:96px;width:52px;height:52px;border-radius:50%;border:0;background:rgba(255,255,255,.82);color:#1B1B2F;font-family:"Lilita One",sans-serif;font-size:12px;pointer-events:auto;touch-action:none;opacity:.35}
#jump:active{opacity:.7}
body.race #hp,body.race #look,body.race #jump{display:none}
@media (min-width:700px){
  body:not(.race) #mini{display:block;position:absolute;left:12px;top:56px;width:140px;height:140px;border-radius:50%;background:rgba(11,15,26,.4);border:1px solid rgba(255,255,255,.2)}
  #board{height:44px}
  #hp{width:200px}
  #hp i{height:14px}
  #fire{width:88px;height:88px}
}
</style>
</head>
<body class="${spec.theme.mode}">
<!-- playground-template: ${spec.id} | ${spec.name} -->
<!-- playground-engine: three -->
<canvas id="view"></canvas>
<div id="hurt"></div>
<div id="boot"><div class="sheet"><h1 id="boot-title"></h1><div class="bar"><i id="boot-bar"></i></div><p id="boot-label">Loading</p></div></div>
<div id="start" hidden><div class="sheet"><h1 id="start-title"></h1><p id="start-hint"></p><button id="play" type="button">Play</button></div></div>
<div id="playhud">
  <div id="nameplate" hidden></div>
  <div id="place" hidden></div>
  <div id="board"><span id="pts">0</span><span id="timer"></span></div>
  <button id="quality" type="button">Med</button>
  <div id="feed"></div>
  <div id="cross"><i></i><i></i><i></i><i></i></div>
  <div id="hit"><i></i><i></i><i></i><i></i></div>
  <div id="banner" hidden></div>
  <div id="coach" hidden></div>
  <div id="hp"><b>100</b><i></i></div>
  <div id="ammo"><b>0</b><small>ammo</small></div>
  <canvas id="mini" width="140" height="140"></canvas>
  <div id="death" hidden><b>Down</b><span>Respawning</span></div>
  <div id="over" hidden></div>
  <div id="kill" hidden></div>
</div>
<div id="floats"></div>
<div id="sticks"><div id="move" class="stick"><i></i></div><div id="look" class="stick"><i></i></div><button id="jump" type="button">Jump</button><button id="fire" type="button">${spec.theme.mode === 'race' ? 'Drift' : 'Fire'}</button></div>
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
