export function rankScores(scores, mechanic) {
  const ranking = mechanic === 'reaction' ? 'lower' : 'higher'
  return scores.slice().sort((a, b) => {
    const diff = ranking === 'lower' ? a.points - b.points : b.points - a.points
    if (diff) return diff
    return String(a.createdAt).localeCompare(String(b.createdAt))
  }).slice(0, 15).map((score, index) => ({
    rank: index + 1,
    name: score.name,
    points: score.points,
    createdAt: score.createdAt,
    mechanic,
    ranking,
    unit: score.unit,
    verified: false
  }))
}
