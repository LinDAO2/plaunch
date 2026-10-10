import { getGameRow } from './repo.js'
import { takePreview } from './repo.js'

export function sandboxCsp(config) {
  const ancestors = []
  for (const origin of [...(config.mainOrigins || []), config.publicBaseUrl]) {
    if (origin && !ancestors.includes(origin)) ancestors.push(origin)
  }
  for (const origin of ['https://x.com', 'https://*.x.com', 'https://twitter.com', 'https://*.twitter.com']) {
    ancestors.push(origin)
  }
  return `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'none'; frame-ancestors ${ancestors.join(' ')}`
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
      if ((req.method || 'GET') !== 'GET') {
        sendHtml(res, 405, missing(), config)
        return
      }
      const gameMatch = url.pathname.match(/^\/g\/([a-z0-9-]+)$/)
      if (gameMatch) {
        const game = await getGameRow(db, gameMatch[1])
        if (!game || game.status !== 'published' || game.tier !== 'freeform' || !game.freeformHtml) {
          sendHtml(res, 404, missing(), config)
          return
        }
        sendHtml(res, 200, game.freeformHtml, config)
        return
      }
      const previewMatch = url.pathname.match(/^\/preview\/([A-Za-z0-9_-]{20,80})$/)
      if (previewMatch) {
        const html = await takePreview(db, previewMatch[1])
        if (!html) {
          sendHtml(res, 404, missing(), config)
          return
        }
        sendHtml(res, 200, html, config)
        return
      }
      sendHtml(res, 404, missing(), config)
    } catch {
      sendHtml(res, 500, missing(), config)
    }
  }
}
