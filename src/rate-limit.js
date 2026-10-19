function hit(map, key, max, now, windowMs) {
  const recent = (map.get(key) || []).filter((ts) => ts > now - windowMs)
  if (recent.length >= max) {
    map.set(key, recent)
    return false
  }
  recent.push(now)
  map.set(key, recent)
  if (map.size > 5000) map.clear()
  return true
}

function blocked(code, error) {
  return { ok: false, code, error }
}

export function createRateLimiter(config) {
  const globalHits = new Map()
  const authHits = new Map()
  const aiHits = new Map()
  const publishHits = new Map()
  return {
    allow(req, pathname, now = Date.now()) {
      if (req.method === 'GET' && pathname === '/api/health') return { ok: true }
      const ip = req.socket?.remoteAddress || 'unknown'
      // Reads, textures, and other static files are shared by every viewer on an IP.
      // The global cap stays on writes and on generation, which have their own buckets below.
      const write = req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH' || req.method === 'DELETE'
      if (write && !hit(globalHits, ip, config.rateLimitMax, now, config.rateWindowMs)) {
        return blocked('rate_limited', 'Too many requests')
      }
      if (req.method === 'POST' && pathname.startsWith('/api/auth/')) {
        if (!hit(authHits, ip, config.authRateLimitMax, now, config.rateWindowMs)) {
          return blocked('rate_limited', 'Too many requests')
        }
      }
      if (req.method === 'POST' && (pathname === '/api/ai/generate' || pathname === '/api/generate' || pathname === '/api/ai/restyle' || pathname === '/api/freeform/preview')) {
        if (!hit(aiHits, ip, config.aiRateLimitMax, now, config.rateWindowMs)) {
          return blocked('rate_limited', 'Too many requests')
        }
      }
      if (req.method === 'POST' && (pathname === '/api/games' || pathname === '/api/import' || /^\/api\/games\/[a-z0-9-]+\/remix$/.test(pathname))) {
        const max = config.publishRateLimitMax || 12
        if (!hit(publishHits, ip, max, now, config.rateWindowMs)) {
          return blocked('publish_rate_limited', 'Too many games published from this network. Try again in a minute.')
        }
      }
      return { ok: true }
    }
  }
}
