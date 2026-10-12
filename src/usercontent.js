import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getGameRow } from './repo.js'
import { takePreview } from './repo.js'

const ASSET_ROOT = fileURLToPath(new URL('../vendor/arena-assets', import.meta.url))

function loadAssets(dir, prefix, into) {
  for (const name of readdirSync(dir)) {
    if (name.startsWith('.')) continue
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) loadAssets(full, `${prefix}${name}/`, into)
    else into.set(`/assets/${prefix}${name}`, readFileSync(full))
  }
  return into
}

const ASSETS = loadAssets(ASSET_ROOT, '', new Map())

function assetBody(pathname) {
  if (!pathname.startsWith('/assets/')) return null
  const rel = pathname.slice('/assets/'.length)
  if (!rel || rel.includes('..') || rel.includes('\\') || rel.includes('\0')) return null
  return ASSETS.get(pathname) || null
}

function assetType(pathname) {
  if (pathname.endsWith('.glb')) return 'model/gltf-binary'
  if (pathname.endsWith('.png')) return 'image/png'
  if (pathname.endsWith('.txt')) return 'text/plain; charset=utf-8'
  return 'application/octet-stream'
}

const FONT_DIR = fileURLToPath(new URL('../public/fonts', import.meta.url))
const FONTS = new Map([
  ['/fonts/lilita-one-latin.woff2', 'lilita-one-latin.woff2'],
  ['/fonts/rubik-latin-700.woff2', 'rubik-latin-700.woff2'],
  ['/fonts/chakra-petch-latin-600.woff2', 'chakra-petch-latin-600.woff2']
].map(([route, file]) => [route, readFileSync(path.join(FONT_DIR, file))]))

const VENDOR = {
  '/kaplay.js': {
    body: readFileSync(fileURLToPath(new URL('../vendor/kaplay/kaplay-3001.0.19.js', import.meta.url))),
    version: '3001.0.19'
  },
  '/zzfx.js': {
    body: readFileSync(fileURLToPath(new URL('../vendor/zzfx/zzfx.js', import.meta.url))),
    version: '1.4.0'
  },
  '/three.js': {
    body: readFileSync(fileURLToPath(new URL('../vendor/three/three.min.js', import.meta.url))),
    version: '0.170.0'
  }
}

export function sandboxCsp(config) {
  const ancestors = []
  for (const origin of [...(config.mainOrigins || []), config.publicBaseUrl]) {
    if (origin && !ancestors.includes(origin)) ancestors.push(origin)
  }
  for (const origin of ['https://x.com', 'https://*.x.com', 'https://twitter.com', 'https://*.twitter.com']) {
    ancestors.push(origin)
  }
  // script-src 'self' loads the pinned Kaplay, ZzFX, and three.js files from this origin.
  // connect-src and img-src 'self' load the CC0 glTF packs from /assets on this origin only.
  // No 'unsafe-eval' and no 'wasm-unsafe-eval' (no Draco, meshopt, or KTX2 WASM).
  // allow-pointer-lock lets our play page grant mouse look. Hold-to-drag remains if a parent frame denies it.
  return `default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data: blob:; media-src data: blob:; connect-src 'self'; font-src 'self'; frame-src 'none'; child-src 'none'; worker-src 'none'; form-action 'none'; base-uri 'none'; sandbox allow-scripts allow-pointer-lock; frame-ancestors ${ancestors.join(' ')}`
}

// CSP connect-src does not cover WebRTC, and a live probe sent STUN packets from the sandbox.
// Best-effort: remove the WebRTC constructors before game code runs, in this window and in any
// child frame. This is defense in depth, not a guarantee; see the security notes.
export const SANDBOX_PRELUDE = `<script>(()=>{const K=['RTCPeerConnection','webkitRTCPeerConnection','RTCDataChannel','RTCIceCandidate','RTCSessionDescription','RTCRtpSender','RTCRtpReceiver','RTCRtpTransceiver'];const lock=(w)=>{try{for(const k of K){try{delete w[k]}catch(e){}try{Object.defineProperty(w,k,{value:undefined,writable:false,configurable:false})}catch(e){}}}catch(e){}};lock(window);for(const [C,p] of [[HTMLIFrameElement,'contentWindow'],[HTMLFrameElement,'contentWindow'],[HTMLObjectElement,'contentWindow']]){try{const d=Object.getOwnPropertyDescriptor(C.prototype,p);Object.defineProperty(C.prototype,p,{configurable:false,get(){const w=d.get.call(this);if(w)lock(w);return w}})}catch(e){}}const ce=Document.prototype.createElement;Object.defineProperty(Document.prototype,'createElement',{configurable:false,writable:false,value:function(t,o){if(/^(i?frame|object|embed|portal|fencedframe)$/i.test(String(t)))throw new DOMException('Nested frames are disabled','SecurityError');return ce.call(this,t,o)}});const fit=()=>{let w=0,h=0;for(const c of document.querySelectorAll('canvas')){const r=c.getBoundingClientRect();w=Math.max(w,Math.ceil(r.width));h=Math.max(h,Math.ceil(r.height))}if(!w||!h)return;if(w<=innerWidth+1&&h<=innerHeight+1)return;try{parent.postMessage({type:'playground-size',width:Math.min(2400,w+8),height:Math.min(2400,h+8)},'*')}catch(e){}};addEventListener('load',()=>{fit();setTimeout(fit,400)});})()</script>`

export function withPrelude(html) {
  const text = String(html || '')
  const head = text.match(/<head\b[^>]*>/i)
  if (head) return text.slice(0, head.index + head[0].length) + SANDBOX_PRELUDE + text.slice(head.index + head[0].length)
  const root = text.match(/<html\b[^>]*>/i)
  if (root) return text.slice(0, root.index + root[0].length) + SANDBOX_PRELUDE + text.slice(root.index + root[0].length)
  return SANDBOX_PRELUDE + text
}

function headersFor(config) {
  return {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'content-security-policy': sandboxCsp(config)
  }
}

function sendHtml(res, status, html, config) {
  const headers = headersFor(config)
  headers['content-length'] = String(Buffer.byteLength(html))
  res.writeHead(status, headers)
  res.end(html)
}

function missing() {
  return '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Not found</title></head><body>Game not found</body></html>'
}

export function createUsercontentApp({ db, config }) {
  return async function usercontent(req, res) {
    try {
      const url = new URL(req.url || '/', 'http://localhost')
      const vendor = VENDOR[url.pathname]
      if (vendor && (req.method || 'GET') === 'GET') {
        res.writeHead(200, {
          'content-type': 'text/javascript; charset=utf-8',
          'content-length': String(vendor.body.length),
          'cache-control': 'public, max-age=86400',
          'x-content-type-options': 'nosniff',
          'x-vendor-version': vendor.version
        })
        res.end(vendor.body)
        return
      }
      if ((req.method || 'GET') === 'GET' && FONTS.has(url.pathname)) {
        const body = FONTS.get(url.pathname)
        res.writeHead(200, {
          'content-type': 'font/woff2',
          'content-length': String(body.length),
          'cache-control': 'public, max-age=86400',
          'x-content-type-options': 'nosniff',
          'access-control-allow-origin': '*'
        })
        res.end(body)
        return
      }
      if ((req.method || 'GET') === 'GET') {
        const asset = assetBody(url.pathname)
        if (asset) {
          res.writeHead(200, {
            'content-type': assetType(url.pathname),
            'content-length': String(asset.length),
            'cache-control': 'public, max-age=86400',
            'x-content-type-options': 'nosniff',
            'access-control-allow-origin': '*'
          })
          res.end(asset)
          return
        }
      }
      if ((req.method || 'GET') === 'GET' && url.pathname === '/health') {
        res.writeHead(200, {
          'content-type': 'text/plain; charset=utf-8',
          'cache-control': 'no-store',
          'x-content-type-options': 'nosniff'
        })
        res.end('ok')
        return
      }
      if ((req.method || 'GET') !== 'GET') {
        sendHtml(res, 405, missing(), config)
        return
      }
      // Games only run framed. A browser opening the URL top-level gets a stub, so the
      // usercontent origin cannot be used as a redirect or phishing page. Non-browser clients
      // send no Sec-Fetch-Dest and still receive the document (nothing executes for them).
      const dest = req.headers['sec-fetch-dest']
      if (dest && dest !== 'iframe' && dest !== 'frame') {
        sendHtml(res, 403, '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Playground</title></head><body>Open this game on Playground.</body></html>', config)
        return
      }
      const gameMatch = url.pathname.match(/^\/g\/([a-z0-9-]+)$/)
      if (gameMatch) {
        const game = await getGameRow(db, gameMatch[1])
        if (!game || game.status !== 'published' || game.tier !== 'freeform' || !game.freeformHtml) {
          sendHtml(res, 404, missing(), config)
          return
        }
        sendHtml(res, 200, withPrelude(game.freeformHtml), config)
        return
      }
      const previewMatch = url.pathname.match(/^\/preview\/([A-Za-z0-9_-]{20,80})$/)
      if (previewMatch) {
        const html = await takePreview(db, previewMatch[1])
        if (!html) {
          sendHtml(res, 404, missing(), config)
          return
        }
        sendHtml(res, 200, withPrelude(html), config)
        return
      }
      sendHtml(res, 404, missing(), config)
    } catch {
      sendHtml(res, 500, missing(), config)
    }
  }
}
