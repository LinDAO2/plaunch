import { POOL, isSolid } from './blocks.js'

// Face shade is directional. Vertex darkening is a cheap ambient-occlusion stand-in.
export function aoFactor(side1, side2, corner) {
  if (side1 && side2) return 0.45
  const n = (side1 ? 1 : 0) + (side2 ? 1 : 0) + (corner ? 1 : 0)
  return 1 - n * 0.18
}

const FACES = [
  {
    n: [0, 1, 0], shade: 1,
    v: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]],
    a: [
      [[-1, 1, 0], [0, 1, 1], [-1, 1, 1]],
      [[1, 1, 0], [0, 1, 1], [1, 1, 1]],
      [[1, 1, 0], [0, 1, -1], [1, 1, -1]],
      [[-1, 1, 0], [0, 1, -1], [-1, 1, -1]]
    ]
  },
  {
    n: [0, -1, 0], shade: 0.5,
    v: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]],
    a: [
      [[-1, -1, 0], [0, -1, -1], [-1, -1, -1]],
      [[1, -1, 0], [0, -1, -1], [1, -1, -1]],
      [[1, -1, 0], [0, -1, 1], [1, -1, 1]],
      [[-1, -1, 0], [0, -1, 1], [-1, -1, 1]]
    ]
  },
  {
    n: [1, 0, 0], shade: 0.78,
    v: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]],
    a: [
      [[1, -1, 0], [1, 0, 1], [1, -1, 1]],
      [[1, -1, 0], [1, 0, -1], [1, -1, -1]],
      [[1, 1, 0], [1, 0, -1], [1, 1, -1]],
      [[1, 1, 0], [1, 0, 1], [1, 1, 1]]
    ]
  },
  {
    n: [-1, 0, 0], shade: 0.62,
    v: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]],
    a: [
      [[-1, -1, 0], [-1, 0, -1], [-1, -1, -1]],
      [[-1, -1, 0], [-1, 0, 1], [-1, -1, 1]],
      [[-1, 1, 0], [-1, 0, 1], [-1, 1, 1]],
      [[-1, 1, 0], [-1, 0, -1], [-1, 1, -1]]
    ]
  },
  {
    n: [0, 0, 1], shade: 0.86,
    v: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]],
    a: [
      [[-1, 0, 1], [0, -1, 1], [-1, -1, 1]],
      [[1, 0, 1], [0, -1, 1], [1, -1, 1]],
      [[1, 0, 1], [0, 1, 1], [1, 1, 1]],
      [[-1, 0, 1], [0, 1, 1], [-1, 1, 1]]
    ]
  },
  {
    n: [0, 0, -1], shade: 0.7,
    v: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]],
    a: [
      [[1, 0, -1], [0, -1, -1], [1, -1, -1]],
      [[-1, 0, -1], [0, -1, -1], [-1, -1, -1]],
      [[-1, 0, -1], [0, 1, -1], [-1, 1, -1]],
      [[1, 0, -1], [0, 1, -1], [1, 1, -1]]
    ]
  }
]

const UV = [[0, 1], [1, 1], [1, 0], [0, 0]]
const ORDER = [0, 1, 2, 0, 2, 3]

function showFace(id, neighbor) {
  if (!id) return false
  if (id === POOL) return !neighbor
  return isSolid(id) && !isSolid(neighbor)
}

export function meshRegion(sample, x0, y0, z0, x1, y1, z1) {
  const positions = []
  const colors = []
  const uvs = []
  const tiles = []
  let count = 0
  for (let y = y0; y < y1; y++) {
    for (let z = z0; z < z1; z++) {
      for (let x = x0; x < x1; x++) {
        const id = sample(x, y, z) | 0
        if (!id) continue
        for (const face of FACES) {
          const nx = x + face.n[0]
          const ny = y + face.n[1]
          const nz = z + face.n[2]
          if (!showFace(id, sample(nx, ny, nz) | 0)) continue
          const shades = face.a.map((triple) => aoFactor(
            isSolid(sample(x + triple[0][0], y + triple[0][1], z + triple[0][2])),
            isSolid(sample(x + triple[1][0], y + triple[1][1], z + triple[1][2])),
            isSolid(sample(x + triple[2][0], y + triple[2][1], z + triple[2][2]))
          ))
          for (const index of ORDER) {
            const corner = face.v[index]
            const shade = face.shade * shades[index]
            positions.push(x + corner[0], y + corner[1], z + corner[2])
            colors.push(shade, shade, shade)
            uvs.push(UV[index][0], UV[index][1])
            tiles.push(id)
          }
          count += 2
        }
      }
    }
  }
  return {
    count,
    positions: Float32Array.from(positions),
    colors: Float32Array.from(colors),
    uvs: Float32Array.from(uvs),
    tiles: Float32Array.from(tiles)
  }
}
