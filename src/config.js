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
  if (nodeEnv === 'production') {
    if (!sessionFromEnv) throw new Error('SESSION_SECRET is required in production')
    if (!databaseFromEnv) throw new Error('DATABASE_URL is required in production')
    if (databaseFromEnv.startsWith('pglite')) {
      throw new Error('Production DATABASE_URL must be a postgres:// or postgresql:// connection string')
    }
    if (!usercontentOrigin) throw new Error('USERCONTENT_ORIGIN is required in production')
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
    aiDailyGlobal: intEnv(env.AI_DAILY_LIMIT_GLOBAL, 200),
    rateWindowMs: 60_000,
    passwordScryptN: intEnv(env.PASSWORD_SCRYPT_N, 16384),
    publicBaseUrl: cleanOrigin(env.PUBLIC_BASE_URL),
    xSiteHandle: cleanHandle(env.X_SITE_HANDLE),
    usercontentOrigin: sandboxOrigin,
    usercontentPort: intEnv(env.USERCONTENT_PORT, portOf(sandboxOrigin, 43921)),
    mainOrigins: [],
    warnings,
    env
  }
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
