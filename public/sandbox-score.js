export function readSandboxScore(event, frame) {
  if (!frame || event.source !== frame.contentWindow) return null
  if (event.origin !== 'null') return null
  const data = event.data
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null
  const keys = Object.keys(data)
  if (keys.length !== 2 || !keys.includes('type') || !keys.includes('points')) return null
  if (data.type !== 'playground-score') return null
  if (!Number.isInteger(data.points) || data.points < 0 || data.points > 100000) return null
  return data.points
}
