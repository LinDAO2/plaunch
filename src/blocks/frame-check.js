const STEP = 4
const ROW_DEV = 14

function terrainHue(r, g, b) {
  if (g > r + 6 && g >= b) return true
  if (r > g + 8 && r > b + 12) return true
  if (Math.max(r, g, b) < 48) return true
  return false
}

export function frameCoverage(rgba, width, height, step = STEP) {
  if (!width || !height || !rgba?.length) {
    return { ratio: 0, unique: 0, uniform: true, total: 0, lumaStd: 0 }
  }
  const cols = Math.max(1, Math.floor(width / step))
  const rows = Math.max(1, Math.floor(height / step))
  let nonSky = 0
  let total = 0
  let sumL = 0
  let sumL2 = 0
  const quant = new Set()
  for (let y = 0; y < rows; y++) {
    const sy = Math.min(height - 1, y * step + (step >> 1))
    let sr = 0
    let sg = 0
    let sb = 0
    const row = new Uint8Array(cols * 3)
    for (let x = 0; x < cols; x++) {
      const sx = Math.min(width - 1, x * step + (step >> 1))
      const i = (sy * width + sx) * 4
      const r = rgba[i] || 0
      const g = rgba[i + 1] || 0
      const b = rgba[i + 2] || 0
      const o = x * 3
      row[o] = r
      row[o + 1] = g
      row[o + 2] = b
      sr += r
      sg += g
      sb += b
    }
    const mr = sr / cols
    const mg = sg / cols
    const mb = sb / cols
    for (let x = 0; x < cols; x++) {
      const o = x * 3
      const r = row[o]
      const g = row[o + 1]
      const b = row[o + 2]
      const dev = Math.hypot(r - mr, g - mg, b - mb)
      if (dev > ROW_DEV || terrainHue(r, g, b)) nonSky += 1
      quant.add(`${r >> 3},${g >> 3},${b >> 3}`)
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b
      sumL += luma
      sumL2 += luma * luma
      total += 1
    }
  }
  const mean = total ? sumL / total : 0
  const lumaStd = Math.sqrt(Math.max(0, (total ? sumL2 / total : 0) - mean * mean))
  const unique = quant.size
  const ratio = total ? nonSky / total : 0
  const uniform = unique <= 4 || lumaStd < 3.5
  return { ratio, unique, uniform, total, lumaStd }
}

export function frameProblem(stats) {
  if (!stats?.total) return 'no pixels'
  if (stats.uniform) return 'uniform frame'
  if (stats.ratio < 0.4) return `non-sky ${(stats.ratio * 100).toFixed(1)}%`
  return ''
}
