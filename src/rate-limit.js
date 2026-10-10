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

export function createRateLimiter(config) {
  const globalHits = new Map()
  const authHits = new Map()
  const aiHits = new Map()
  return {
    allow(req, pathname, now = Date.now()) {
      if (req.method === 'GET' && pathname === '/api/health') return true
      const ip = req.socket?.remoteAddress || 'unknown'
      if (!hit(globalHits, ip, config.rateLimitMax, now, config.rateWindowMs)) return false
      if (req.method === 'POST' && pathname.startsWith('/api/auth/')) {
        if (!hit(authHits, ip, config.authRateLimitMax, now, config.rateWindowMs)) return false
      }
      if (req.method === 'POST' && (pathname === '/api/ai/generate' || pathname === '/api/generate')) {
        if (!hit(aiHits, ip, config.aiRateLimitMax, now, config.rateWindowMs)) return false
      }
      return true
    }
  }
}
