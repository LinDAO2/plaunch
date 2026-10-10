let csrfToken = ''

export function setCsrf(token) {
  csrfToken = token || ''
}

export async function ensureCsrf() {
  if (csrfToken) return csrfToken
  const res = await fetch('/api/auth/csrf', { credentials: 'same-origin' })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.csrfToken) throw new Error(data.error || 'Could not start a safe session')
  csrfToken = data.csrfToken
  return csrfToken
}

export async function api(path, method = 'GET', payload) {
  const headers = { 'content-type': 'application/json' }
  if (method !== 'GET' && method !== 'HEAD') headers['x-csrf-token'] = await ensureCsrf()
  const res = await fetch('/api' + path, {
    method,
    headers,
    credentials: 'same-origin',
    body: payload === undefined ? undefined : JSON.stringify(payload)
  })
  const data = await res.json().catch(() => ({}))
  if (data && data.csrfToken) csrfToken = data.csrfToken
  if (!res.ok) {
    const error = new Error(data.error || 'Request failed')
    error.status = res.status
    error.code = data.code
    throw error
  }
  return data
}
