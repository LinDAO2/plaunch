import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scryptAsync = promisify(scrypt)

function assertParams(N) {
  if (!Number.isInteger(N) || N < 1024 || N > 262144 || (N & (N - 1)) !== 0) {
    throw new Error('Invalid scrypt cost')
  }
}

export async function hashPassword(password, { N = 16384 } = {}) {
  assertParams(N)
  const salt = randomBytes(16)
  const hash = await scryptAsync(password, salt, 32, { N, r: 8, p: 1, maxmem: 128 * 1024 * 1024 })
  return `scrypt$${N}$8$1$${salt.toString('base64url')}$${Buffer.from(hash).toString('base64url')}`
}

export async function verifyPassword(password, stored) {
  const parts = typeof stored === 'string' ? stored.split('$') : []
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false
  const N = Number(parts[1])
  const r = Number(parts[2])
  const p = Number(parts[3])
  if (![N, r, p].every(Number.isInteger)) return false
  let salt
  let expected
  try {
    salt = Buffer.from(parts[4], 'base64url')
    expected = Buffer.from(parts[5], 'base64url')
  } catch {
    return false
  }
  const actual = Buffer.from(await scryptAsync(password, salt, expected.length, { N, r, p, maxmem: 128 * 1024 * 1024 }))
  if (actual.length !== expected.length) return false
  return timingSafeEqual(actual, expected)
}
