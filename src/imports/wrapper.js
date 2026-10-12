function esc(value) {
  return String(value || '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[ch]))
}

const SHIM = `(function () {
  function makeStore() {
    var bag = Object.create(null);
    var keys = [];
    var api = {
      getItem: function (key) {
        key = String(key);
        return Object.prototype.hasOwnProperty.call(bag, key) ? bag[key] : null;
      },
      setItem: function (key, value) {
        key = String(key);
        if (!Object.prototype.hasOwnProperty.call(bag, key)) keys.push(key);
        bag[key] = String(value);
      },
      removeItem: function (key) {
        key = String(key);
        if (!Object.prototype.hasOwnProperty.call(bag, key)) return;
        delete bag[key];
        keys = keys.filter(function (item) { return item !== key; });
      },
      clear: function () { bag = Object.create(null); keys = []; },
      key: function (index) { return keys[index] == null ? null : keys[index]; }
    };
    Object.defineProperty(api, 'length', { get: function () { return keys.length; } });
    Object.defineProperty(api, '__playground', { value: true });
    return api;
  }
  function install(name, api) {
    try {
      Object.defineProperty(window, name, { configurable: true, get: function () { return api; } });
    } catch (err) {
      try { window[name] = api; } catch (err2) {}
    }
  }
  var memory = makeStore();
  var session = makeStore();
  install('localStorage', memory);
  install('sessionStorage', session);
  window.Playground = window.Playground || {};
  window.Playground.submitScore = function (n) {
    var points = Math.max(0, Math.min(100000, Math.floor(Number(n) || 0)));
    try { parent.postMessage({ type: 'playground-score', points: points }, '*'); } catch (err) {}
  };
})();`

const FIT = `(function () {
  var root = document.getElementById('pg-root');
  function fit() {
    if (!root) return;
    root.style.transform = 'none';
    var w = root.scrollWidth;
    var h = root.scrollHeight;
    if (w < 8 || h < 8) {
      var canvas = root.querySelector('canvas');
      if (canvas) {
        w = canvas.width || canvas.offsetWidth || w;
        h = canvas.height || canvas.offsetHeight || h;
      }
    }
    if (w < 8) w = 320;
    if (h < 8) h = 320;
    var scale = Math.min(window.innerWidth / w, window.innerHeight / h);
    if (!isFinite(scale) || scale <= 0) scale = 1;
    var tx = Math.round((window.innerWidth - w * scale) / 2);
    var ty = Math.round((window.innerHeight - h * scale) / 2);
    root.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + scale + ')';
    try {
      parent.postMessage({ type: 'playground-fit', width: Math.round(w * scale), height: Math.round(h * scale) }, '*');
    } catch (err) {}
  }
  window.addEventListener('resize', fit);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fit);
  else fit();
  window.addEventListener('load', function () { fit(); setTimeout(fit, 60); });
  var selector = document.documentElement.getAttribute('data-pg-score');
  if (selector) {
    var arm = function () {
      var el = document.querySelector(selector);
      if (!el || typeof MutationObserver !== 'function') return;
      var last = null;
      var send = function () {
        var n = parseInt(String(el.textContent).replace(/[^0-9]/g, ''), 10);
        if (!isFinite(n) || n === last) return;
        last = n;
        if (window.Playground) window.Playground.submitScore(n);
      };
      new MutationObserver(send).observe(el, { childList: true, characterData: true, subtree: true });
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arm);
    else arm();
  }
  var start = document.getElementById('pg-start');
  function unlock() {
    if (start) start.hidden = true;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (AC) {
      try {
        var ctx = new AC();
        if (ctx.resume) ctx.resume();
      } catch (err) {}
    }
    var media = document.querySelectorAll('audio,video');
    for (var i = 0; i < media.length; i++) {
      try { var play = media[i].play; if (play) play.call(media[i]); } catch (err) {}
    }
  }
  if (start) {
    start.addEventListener('pointerdown', function (event) {
      event.preventDefault();
      unlock();
    });
  }
  function emit(type, key, code) {
    var ev;
    try {
      ev = new KeyboardEvent(type, { key: key, bubbles: true, cancelable: true });
      Object.defineProperty(ev, 'keyCode', { get: function () { return code; } });
      Object.defineProperty(ev, 'which', { get: function () { return code; } });
    } catch (err) {
      ev = null;
    }
    if (!ev || ev.keyCode !== code) {
      ev = document.createEvent('Event');
      ev.initEvent(type, true, true);
      ev.key = key;
      ev.keyCode = code;
      ev.which = code;
    }
    document.dispatchEvent(ev);
    window.dispatchEvent(ev);
  }
  function bind(el, pairs) {
    if (!el) return;
    var timer = 0;
    function down(event) {
      event.preventDefault();
      pairs.forEach(function (pair) { emit('keydown', pair[0], pair[1]); });
      if (timer) clearInterval(timer);
      timer = setInterval(function () {
        pairs.forEach(function (pair) { emit('keydown', pair[0], pair[1]); });
      }, 140);
    }
    function up(event) {
      if (event) event.preventDefault();
      if (timer) clearInterval(timer);
      timer = 0;
      pairs.forEach(function (pair) { emit('keyup', pair[0], pair[1]); });
    }
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointerleave', up);
    el.addEventListener('pointercancel', up);
  }
  bind(document.getElementById('pg-up'), [['ArrowUp', 38]]);
  bind(document.getElementById('pg-down'), [['ArrowDown', 40]]);
  bind(document.getElementById('pg-left'), [['ArrowLeft', 37]]);
  bind(document.getElementById('pg-right'), [['ArrowRight', 39]]);
  bind(document.getElementById('pg-a'), [['z', 90], [' ', 32]]);
  bind(document.getElementById('pg-b'), [['x', 88]]);
})();`

const STYLE = `@font-face{font-family:"Lilita One";src:url("/fonts/lilita-one-latin.woff2") format("woff2");font-weight:400;font-display:swap}
@font-face{font-family:Rubik;src:url("/fonts/rubik-latin-700.woff2") format("woff2");font-weight:700;font-display:swap}
html,body{margin:0!important;padding:0!important;height:100%;background:#4FB3FF;overflow:hidden;}
#pg-root{position:absolute;left:0;top:0;width:max-content;height:max-content;transform-origin:0 0;}
#pg-start,#pg-credit,#pg-pad{font-family:Rubik,sans-serif;}
#pg-start{position:fixed;inset:0;z-index:8;display:flex;align-items:flex-end;justify-content:center;padding:0 0 28px;border:0;background:rgba(8,10,16,0);color:#1B1B2F;font-family:"Lilita One",sans-serif;font-size:28px;box-shadow:inset 0 -190px 0 rgba(8,10,16,.72);}
#pg-start span{display:inline-flex;align-items:center;justify-content:center;width:200px;height:64px;background:#FFD23F;border-bottom:4px solid #B8860B;border-radius:14px;}
#pg-start[hidden]{display:none;}
#pg-credit{position:fixed;top:6px;left:8px;z-index:4;margin:0;padding:2px 6px;background:#000;color:#e7e9ea;font-size:12px;}
#pg-pad{position:fixed;left:8px;right:8px;bottom:8px;z-index:6;display:flex;justify-content:space-between;align-items:flex-end;pointer-events:none;}
#pg-pad button{pointer-events:auto;width:52px;height:44px;margin:2px;background:#000;color:#e7e9ea;border:1px solid #2f3336;font-size:16px;}
#pg-dpad{display:grid;grid-template-columns:52px 52px 52px;grid-template-rows:44px 44px 44px;}
#pg-up{grid-column:2;grid-row:1;}
#pg-left{grid-column:1;grid-row:2;}
#pg-right{grid-column:3;grid-row:2;}
#pg-down{grid-column:2;grid-row:3;}
#pg-actions{display:flex;gap:8px;}`

function inner(html, tag) {
  const match = String(html || '').match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*)</${tag}>`, 'i'))
  return match ? match[1] : ''
}

export function wantsKeyboard(html) {
  return !/touchstart|touchend|pointerdown/i.test(String(html || ''))
}

export function wrapDocument(html, { keyboard = false, author = '', license = '', scoreSelector = '' } = {}) {
  const source = String(html || '')
  const head = inner(source, 'head')
  const body = /<body\b/i.test(source) ? inner(source, 'body') : source
  const credit = author
    ? `<p id="pg-credit">Original by ${esc(author)} (${esc(license || 'unspecified')})</p>`
    : ''
  const pad = keyboard ? `<div id="pg-pad">
<div id="pg-dpad">
<button id="pg-up" type="button" aria-label="Up">↑</button>
<button id="pg-left" type="button" aria-label="Left">←</button>
<button id="pg-right" type="button" aria-label="Right">→</button>
<button id="pg-down" type="button" aria-label="Down">↓</button>
</div>
<div id="pg-actions">
<button id="pg-a" type="button">A</button>
<button id="pg-b" type="button">B</button>
</div>
</div>` : ''
  const selector = String(scoreSelector || '').replace(/"/g, '')
  const scoreAttr = selector ? ` data-pg-score="${esc(selector)}"` : ''
  return `<!DOCTYPE html>
<html${scoreAttr}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<script>${SHIM}</script>
${head}
<style>${STYLE}</style>
</head>
<body>
<button id="pg-start" type="button"><span>Play</span></button>
${credit}
${pad}
<div id="pg-root">
${body}
</div>
<script>${FIT}</script>
</body>
</html>`
}
