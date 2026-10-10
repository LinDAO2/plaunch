import net from 'node:net'
import psl from 'psl'
import { httpError } from './errors.js'
import { VERSION } from './version.js'

const WEEK_SECONDS = 60 * 60 * 24 * 7

function intEnv(value, fallback) {
  if (value === undefined || value === '') return fallback
  const n = Number(value)
  if (!Number.isInteger(n) || n < 1) return fallback
  return n
}

export function loadConfig(env = process.env) {
  const nodeEnv = env.NODE_ENV || 'development'
  const sessionFromEnv = typeof env.SESSION_SECRET === 'string' ? env.SESSION_SECRET : ''
  const databaseFromEnv = typeof env.DATABASE_URL === 'string' ? env.DATABASE_URL : ''
  const warnings = []

  const usercontentOrigin = cleanOrigin(env.USERCONTENT_ORIGIN)
  const publicBaseUrl = cleanOrigin(env.PUBLIC_BASE_URL)
  if (nodeEnv === 'production') {
    if (!sessionFromEnv) throw new Error('SESSION_SECRET is required in production')
    if (!databaseFromEnv) throw new Error('DATABASE_URL is required in production')
    if (databaseFromEnv.startsWith('pglite')) {
      throw new Error('Production DATABASE_URL must be a postgres:// or postgresql:// connection string')
    }
    if (!usercontentOrigin) throw new Error('USERCONTENT_ORIGIN is required in production')
    if (!publicBaseUrl) throw new Error('PUBLIC_BASE_URL is required in production')
    if (env.ALLOW_SAME_SITE_USERCONTENT !== 'true') assertSeparateSandbox(publicBaseUrl, usercontentOrigin)
  }

  let databaseUrl = databaseFromEnv
  if (!databaseUrl) {
    databaseUrl = nodeEnv === 'test' ? 'pglite:memory' : 'pglite://./data/pglite'
    if (nodeEnv === 'development') {
      warnings.push('DATABASE_URL is not set. Using file-backed PGlite at ./data/pglite. Point DATABASE_URL at Postgres for production.')
    }
  }

  let sessionSecret = sessionFromEnv
  if (!sessionSecret) {
    sessionSecret = 'dev-only-session-secret-change-me'
    if (nodeEnv !== 'test') {
      warnings.push('SESSION_SECRET is not set. Using a development-only secret.')
    }
  }

  const sandboxOrigin = usercontentOrigin || `http://127.0.0.1:${intEnv(env.USERCONTENT_PORT, 43921)}`
  if (!usercontentOrigin && nodeEnv === 'development') {
    warnings.push(`USERCONTENT_ORIGIN is not set. Freeform games are served at ${sandboxOrigin}.`)
  }

  const seedDefault = nodeEnv === 'development'
  const seedOnEmpty = env.SEED_ON_EMPTY === undefined || env.SEED_ON_EMPTY === ''
    ? seedDefault
    : env.SEED_ON_EMPTY === 'true'

  return {
    version: VERSION,
    nodeEnv,
    port: intEnv(env.PORT, 3000),
    databaseUrl,
    sessionSecret,
    cookieSecure: env.COOKIE_SECURE === 'true' || nodeEnv === 'production',
    sessionTtlSeconds: WEEK_SECONDS,
    seedOnEmpty,
    rateLimitMax: intEnv(env.RATE_LIMIT_MAX, 90),
    authRateLimitMax: intEnv(env.AUTH_RATE_LIMIT_MAX, 10),
    aiRateLimitMax: intEnv(env.AI_RATE_LIMIT_MAX, 20),
    aiDailyUser: intEnv(env.AI_DAILY_LIMIT_PER_USER, 20),
    aiDailyGuest: intEnv(env.AI_DAILY_LIMIT_PER_GUEST, 10),
    aiDailyGlobal: intEnv(env.AI_DAILY_LIMIT_GLOBAL, 200),
    publishRateLimitMax: intEnv(env.PUBLISH_RATE_LIMIT_MAX, 12),
    rateWindowMs: 60_000,
    passwordScryptN: intEnv(env.PASSWORD_SCRYPT_N, 16384),
    publicBaseUrl,
    xSiteHandle: cleanHandle(env.X_SITE_HANDLE),
    usercontentOrigin: sandboxOrigin,
    usercontentPort: intEnv(env.USERCONTENT_PORT, portOf(sandboxOrigin, 43921)),
    serverRole: serverRole(env.SERVER_ROLE),
    worldGuestCap: intEnv(env.WORLD_GUEST_CAP, 8),
    adminEmails: adminEmails(env.ADMIN_EMAILS),
    mainOrigins: [],
    warnings,
    env
  }
}

function hostOf(origin) {
  return new URL(origin).hostname.replace(/\.$/, '').toLowerCase()
}

// eTLD+1. IP addresses are not names; psl parses 127.0.0.1 as "0.1".
export function registrableDomain(host) {
  const name = String(host || '').replace(/\.$/, '').toLowerCase()
  if (!name || net.isIP(name)) return ''
  const domain = psl.get(name)
  return typeof domain === 'string' ? domain.toLowerCase() : ''
}

function assertSeparateSandbox(appOrigin, sandboxOrigin) {
  const appHost = hostOf(appOrigin)
  const sandboxHost = hostOf(sandboxOrigin)
  const remedy = 'Use a separate registrable domain for the sandbox, for example https://playgroundusercontent.com. Set ALLOW_SAME_SITE_USERCONTENT=true to boot with this weaker same-site layout.'
  if (appHost === sandboxHost) {
    throw new Error(`USERCONTENT_ORIGIN host "${sandboxHost}" is the same host as PUBLIC_BASE_URL. ${remedy}`)
  }
  const shared = registrableDomain(appHost)
  if (shared && shared === registrableDomain(sandboxHost)) {
    throw new Error(`USERCONTENT_ORIGIN host "${sandboxHost}" shares the registrable domain "${shared}" with PUBLIC_BASE_URL host "${appHost}". ${remedy}`)
  }
}

function adminEmails(value) {
  return String(value || '').split(',').map((item) => item.trim().toLowerCase()).filter(Boolean)
}

function serverRole(value) {
  const role = String(value || 'all').toLowerCase()
  if (role === 'all' || role === 'app' || role === 'usercontent') return role
  throw new Error('SERVER_ROLE must be all, app, or usercontent')
}

function portOf(origin, fallback) {
  try {
    const port = new URL(origin).port
    return port ? Number(port) : fallback
  } catch {
    return fallback
  }
}

function cleanOrigin(value) {
  if (!value) return ''
  try {
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return ''
    return url.origin
  } catch {
    return ''
  }
}

function cleanHandle(value) {
  if (!value) return ''
  const handle = String(value).trim().replace(/^@/, '')
  if (!/^[A-Za-z0-9_]{1,15}$/.test(handle)) return ''
  return `@${handle}`
}

export function assertConfig(config) {
  if (!config.sessionSecret) throw httpError(500, 'Server is missing SESSION_SECRET')
  return config
}
