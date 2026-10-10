import http from 'node:http'
import { once } from 'node:events'
import { createApp } from '../src/app.js'
import { loadConfig } from '../src/config.js'
import { openDatabase } from '../src/db.js'
import { migrate } from '../src/migrate.js'
import { seedIfEmpty } from '../src/seed.js'
import { createUsercontentApp } from '../src/usercontent.js'

export function testConfig(overrides = {}) {
  return loadConfig({
    NODE_ENV: 'test',
    SESSION_SECRET: 'test-session-secret-0123456789',
    DATABASE_URL: 'pglite:memory',
    RATE_LIMIT_MAX: '10000',
    AUTH_RATE_LIMIT_MAX: '10000',
    AI_RATE_LIMIT_MAX: '10000',
    PASSWORD_SCRYPT_N: '4096',
    SEED_ON_EMPTY: 'false',
    COOKIE_SECURE: 'false',
    ...overrides
  })
}

export async function startServer({ env = {}, fetchImpl, seed = true } = {}) {
  const config = testConfig(env)
  const db = await openDatabase('pglite:memory')
  await migrate(db)
  if (seed) await seedIfEmpty(db)
  const app = createApp({ db, config, fetchImpl })
  const server = http.createServer(app)
  const usercontent = http.createServer(createUsercontentApp({ db, config }))
  const serverListening = once(server, 'listening')
  const userListening = once(usercontent, 'listening')
  server.listen(0, '127.0.0.1')
  usercontent.listen(0, '127.0.0.1')
  await serverListening
  await userListening
  const { port } = server.address()
  const ucPort = usercontent.address().port
  const base = `http://127.0.0.1:${port}`
  config.usercontentOrigin = `http://127.0.0.1:${ucPort}`
  config.mainOrigins = [base, config.publicBaseUrl].filter(Boolean)
  return {
    db,
    config,
    base,
    usercontentBase: config.usercontentOrigin,
    async close() {
      await new Promise((resolve, reject) => usercontent.close((err) => err ? reject(err) : resolve()))
      await new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve()))
      await db.close()
    }
  }
}

export function createClient(base) {
  const jar = new Map()
  let csrf = ''
  async function request(method, path, body, { csrf: useCsrf = method !== 'GET' && method !== 'HEAD' } = {}) {
    const headers = {}
    if (body !== undefined) headers['content-type'] = 'application/json'
    if (jar.size) headers.cookie = [...jar.entries()].map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join('; ')
    if (useCsrf) headers['x-csrf-token'] = csrf
    const res = await fetch(base + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    })
    const cookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : []
    for (const line of cookies) {
      const pair = line.split(';')[0]
      const eq = pair.indexOf('=')
      const key = pair.slice(0, eq).trim()
      const value = decodeURIComponent(pair.slice(eq + 1))
      if (!value) jar.delete(key)
      else jar.set(key, value)
      if (key === 'pg_csrf' && value) csrf = value
    }
    const text = await res.text()
    let data = text
    try { data = text ? JSON.parse(text) : null } catch { /* html */ }
    if (data && typeof data === 'object' && data.csrfToken) csrf = data.csrfToken
    return { status: res.status, data, text, headers: res.headers }
  }
  return {
    request,
    async prime() {
      return request('GET', '/api/auth/csrf')
    }
  }
}

export const validSpec = {
  version: '1',
  name: 'Cosmic Rush',
  description: 'Dodge falling meteors in a tiny arena.',
  theme: 'space',
  runtime: 'dodge',
  duration: 30,
  accent: '#ff779e',
  scoring: { direction: 'higher', label: 'Score', unit: 'pts' },
  difficulty: 'normal',
  controls: { keyboard: 'Arrow keys or A and D', touch: 'On-screen left and right buttons' },
  entities: [{ kind: 'player', label: 'Ship' }, { kind: 'obstacle', label: 'Meteor' }],
  spawn: { rate: 1 },
  safety: { audience: 'general', notes: 'Cartoon obstacles only' }
}
