import { randomBytes, timingSafeEqual } from 'node:crypto'
import { HttpError } from './errors.js'

const BASE_CSP = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; object-src 'none'; form-action 'self'"

// /play and /r stay frameable by this site and by X. The embed=1 player drops 'self'.
const EMBED_ANCESTORS = "frame-ancestors 'self' https://x.com https://*.x.com https://twitter.com https://*.twitter.com"
const PLAYER_ANCESTORS = "frame-ancestors https://x.com https://*.x.com https://twitter.com https://*.twitter.com"

export function contentSecurityPolicy(kind) {
  if (kind === 'player') return `${BASE_CSP}; ${PLAYER_ANCESTORS}`
  if (kind === 'embed') return `${BASE_CSP}; ${EMBED_ANCESTORS}`
  return `${BASE_CSP}; frame-ancestors 'none'`
}

export function documentHeaders(kind) {
  const headers = {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'permissions-policy': 'camera=(), microphone=(), geolocation=()',
    'content-security-policy': contentSecurityPolicy(kind)
  }
  if (kind !== 'embed' && kind !== 'player') {
    headers['x-frame-options'] = 'DENY'
    headers['cross-origin-opener-policy'] = 'same-origin'
  }
  return headers
}

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[ch]))
}

export function readCookies(req) {
  const header = req.headers.cookie || ''
  const out = {}
  for (const part of header.split(';')) {
    const trimmed = part.trim()
    if (!trimmed) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq)
    const value = trimmed.slice(eq + 1)
    try {
      out[key] = decodeURIComponent(value)
    } catch {
      out[key] = value
    }
  }
  return out
}

export function serializeCookie(name, value, { httpOnly = false, maxAge = 0, secure = false } = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'SameSite=Lax', `Max-Age=${maxAge}`]
  if (httpOnly) parts.push('HttpOnly')
  if (secure) parts.push('Secure')
  return parts.join('; ')
}

export function tokensMatch(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length === 0 || a.length !== b.length) return false
  return timingSafeEqual(Buffer.from(a), Buffer.from(b))
}

const CSRF_PATTERN = /^[A-Za-z0-9_-]{20,128}$/

export function rememberCookie(ctx, cookie) {
  const name = cookie.slice(0, cookie.indexOf('='))
  ctx.cookies = (ctx.cookies || []).filter((item) => !item.startsWith(`${name}=`))
  ctx.cookies.push(cookie)
}

export function ensureCsrf(req, ctx) {
  const cookies = readCookies(req)
  if (!ctx.csrfToken && CSRF_PATTERN.test(cookies.pg_csrf || '')) return cookies.pg_csrf
  if (ctx.csrfToken && CSRF_PATTERN.test(ctx.csrfToken)) return ctx.csrfToken
  const token = randomBytes(32).toString('base64url')
  rememberCookie(ctx, serializeCookie('pg_csrf', token, {
    maxAge: ctx.config.sessionTtlSeconds,
    secure: ctx.config.cookieSecure
  }))
  ctx.csrfToken = token
  return token
}

export function assertCsrf(req) {
  const cookies = readCookies(req)
  const header = req.headers['x-csrf-token']
  if (!tokensMatch(cookies.pg_csrf || '', typeof header === 'string' ? header : '')) {
    throw new HttpError(403, 'Invalid CSRF token', 'csrf')
  }
}

export async function readJson(req) {
  const type = String(req.headers['content-type'] || '')
  if (type && !type.includes('application/json')) {
    throw new HttpError(415, 'Content-Type must be application/json')
  }
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > 16_000) throw new HttpError(413, 'Request too large')
    chunks.push(chunk)
  }
  if (!size) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new HttpError(400, 'Invalid JSON')
  }
}

export function send(res, status, body, ctx, headers = {}) {
  const final = { ...headers }
  if (ctx?.cookies?.length) final['set-cookie'] = ctx.cookies
  if (ctx?.requestId) final['x-request-id'] = ctx.requestId
  res.writeHead(status, final)
  res.end(body)
}

export function sendJson(res, status, data, ctx, extra = {}) {
  send(res, status, JSON.stringify(data), ctx, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'strict-origin-when-cross-origin',
    ...extra
  })
  return status
}

export function sendHtml(res, status, html, ctx, kind) {
  send(res, status, html, ctx, documentHeaders(kind))
  return status
}
