import assert from 'node:assert/strict'
import test from 'node:test'
import { frameCoverage, frameProblem } from '../src/blocks/frame-check.js'
import { VISTA_PITCH } from '../src/blocks/goals.js'

function fill(width, height, paint) {
  const data = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = paint(x, y, width, height)
      const i = (y * width + x) * 4
      data[i] = r
      data[i + 1] = g
      data[i + 2] = b
      data[i + 3] = 255
    }
  }
  return data
}

test('vista pitch looks between 10 and 15 degrees down', () => {
  const degrees = -VISTA_PITCH * 180 / Math.PI
  assert.ok(degrees >= 10 && degrees <= 15, degrees)
})

test('a vertical sky gradient fails the render check', () => {
  const sky = fill(80, 60, (_x, y, _w, h) => {
    const t = y / (h - 1)
    return [Math.round(90 + t * 130), Math.round(120 + t * 90), Math.round(170 + t * 40)]
  })
  const stats = frameCoverage(sky, 80, 60, 2)
  assert.match(frameProblem(stats), /non-sky|uniform/, JSON.stringify(stats))
  assert.ok(stats.ratio < 0.4, JSON.stringify(stats))
})

test('a solid sky frame is uniform', () => {
  const solid = fill(40, 40, () => [173, 188, 204])
  const stats = frameCoverage(solid, 40, 40, 2)
  assert.equal(stats.uniform, true)
  assert.match(frameProblem(stats), /uniform/)
})

test('terrain covering most of the frame passes', () => {
  const frame = fill(80, 60, (x, y) => {
    if (y < 18) {
      const t = y / 18
      return [Math.round(90 + t * 80), Math.round(130 + t * 40), Math.round(190 - t * 10)]
    }
    const n = ((x * 17 + y * 13) % 11) - 5
    return [70 + n, 140 + n, 55]
  })
  const stats = frameCoverage(frame, 80, 60, 2)
  assert.equal(frameProblem(stats), '', JSON.stringify(stats))
  assert.ok(stats.ratio >= 0.4)
})
