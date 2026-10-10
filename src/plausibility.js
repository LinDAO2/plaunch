export function plausibilityFor(game) {
  const spec = game.spec || {}
  if (game.type === 'reaction') {
    return { minMs: 300, maxMs: maxRoundMs(game), minPoints: 50, maxPoints: 15000, perSec: null, lower: true }
  }
  if (game.type === 'guess') {
    return { minMs: 250, maxMs: maxRoundMs(game), minPoints: 0, maxPoints: 100, perSec: null, lower: false }
  }
  if (game.type === 'tap') return { minMs: 800, maxMs: maxRoundMs(game), perSec: 12, lower: false }
  if (game.type === 'dodge') return { minMs: 800, maxMs: maxRoundMs(game), perSec: 25, lower: false }
  const rate = Number(spec.spawn?.rate) > 0 ? Number(spec.spawn.rate) : 1
  const points = Number(spec.scoreRules?.pointsPerEntity) > 0 ? Number(spec.scoreRules.pointsPerEntity) : 10
  const combo = Number(spec.scoreRules?.comboMultiplier) > 0 ? Number(spec.scoreRules.comboMultiplier) : 1
  const batch = spec.spawn?.pattern === 'burst' || spec.spawn?.pattern === 'waves' ? 4 : 1
  const perSec = Math.max(15, Math.ceil(rate * batch * points * combo * 2))
  return { minMs: 400, maxMs: maxRoundMs(game), perSec, lower: false }
}

function maxRoundMs(game) {
  return (Number(game.duration) || 10) * 1000 + 20_000
}

export function checkPlausible(policy, points, elapsedMs) {
  if (!Number.isFinite(elapsedMs) || elapsedMs < policy.minMs) {
    return { ok: false, message: 'Score arrived before the minimum round time' }
  }
  if (elapsedMs > policy.maxMs) return { ok: false, message: 'Round token expired' }
  if (policy.lower) {
    if (points < policy.minPoints || points > policy.maxPoints) {
      return { ok: false, message: 'Reaction time is outside the plausible range' }
    }
    return { ok: true }
  }
  if (policy.maxPoints != null && policy.perSec == null) {
    if (points < policy.minPoints || points > policy.maxPoints) {
      return { ok: false, message: 'Score is outside the plausible range' }
    }
    return { ok: true }
  }
  const cap = Math.ceil(policy.perSec * Math.max(elapsedMs / 1000, policy.minMs / 1000))
  if (points < 0 || points > cap) return { ok: false, message: 'Score is faster than this game allows' }
  return { ok: true }
}
