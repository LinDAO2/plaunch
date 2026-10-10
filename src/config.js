import { httpError } from './errors.js'

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

  if (nodeEnv === 'production') {
    if (!sessionFromEnv) throw new Error('SESSION_SECRET is required in production')
    if (!databaseFromEnv) throw new Error('DATABASE_URL is required in production')
    if (databaseFromEnv.startsWith('pglite')) {
      throw new Error('Production DATABASE_URL must be a postgres:// or postgresql:// connection string')
    }
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

  const seedDefault = nodeEnv === 'development'
  const seedOnEmpty = env.SEED_ON_EMPTY === undefined || env.SEED_ON_EMPTY === ''
    ? seedDefault
    : env.SEED_ON_EMPTY === 'true'

  return {
    version: '0.3.0',
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
    rateWindowMs: 60_000,
    passwordScryptN: intEnv(env.PASSWORD_SCRYPT_N, 16384),
    warnings,
    env
  }
}

export function assertConfig(config) {
  if (!config.sessionSecret) throw httpError(500, 'Server is missing SESSION_SECRET')
  return config
}
