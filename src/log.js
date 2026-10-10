const SECRET_KEYS = new Set([
  'password',
  'passwordHash',
  'password_hash',
  'token',
  'authorization',
  'apiKey',
  'api_key',
  'cookie',
  'csrfToken',
  'sessionSecret',
  'secret'
])

export function redact(fields = {}) {
  const out = {}
  for (const [key, value] of Object.entries(fields)) {
    out[key] = SECRET_KEYS.has(key) ? '[redacted]' : value
  }
  return out
}

export function log(level, msg, fields = {}) {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    msg,
    ...redact(fields)
  })
  if (level === 'error') console.error(line)
  else console.log(line)
}
