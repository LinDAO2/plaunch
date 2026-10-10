import { HttpError } from './errors.js'

export const MECHANICS = new Set(['tap', 'reaction', 'guess', 'dodge', 'arcade'])

export function cleanText(value, max) {
  if (typeof value !== 'string') return ''
  return value.replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, max)
}

export function slugify(value) {
  const slug = cleanText(value, 80)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
  return slug || 'new-game'
}

export function validateGameInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new HttpError(400, 'Expected a JSON object', 'validation_error')
  }
  const name = cleanText(input.name, 45)
  const description = cleanText(input.description, 180)
  const type = input.type
  const duration = Number(input.duration)
  const accent = input.accent
  if (name.length < 2) throw new HttpError(400, 'Name must be at least 2 characters', 'validation_error')
  if (!MECHANICS.has(type)) throw new HttpError(400, 'Invalid game type', 'validation_error')
  if (!Number.isInteger(duration) || duration < 5 || duration > 60) {
    throw new HttpError(400, 'Duration must be 5–60 seconds', 'validation_error')
  }
  return {
    name,
    description,
    type,
    duration,
    accent: typeof accent === 'string' && /^#[0-9a-fA-F]{6}$/.test(accent) ? accent.toLowerCase() : '#a88bff',
    tokenInterest: input.tokenInterest === true
  }
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validateEmail(value) {
  const email = cleanText(value, 254).toLowerCase()
  if (!EMAIL.test(email)) throw new HttpError(400, 'Enter a valid email address', 'validation_error')
  return email
}

export function validatePassword(value) {
  if (typeof value !== 'string' || value.length < 8 || value.length > 200) {
    throw new HttpError(400, 'Password must be 8–200 characters', 'validation_error')
  }
  return value
}

export function validateDisplayName(value, email) {
  const name = cleanText(value, 40)
  if (name) return name
  return cleanText(email.split('@')[0], 40) || 'Creator'
}

const EVENT_TYPES = new Set(['game_viewed', 'play_started', 'play_completed'])

export function validateEvent(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new HttpError(400, 'Expected a JSON object', 'validation_error')
  }
  if (!EVENT_TYPES.has(input.type)) throw new HttpError(400, 'Invalid event type', 'validation_error')
  let eventId = null
  if (input.eventId !== undefined && input.eventId !== null && input.eventId !== '') {
    eventId = cleanText(input.eventId, 80)
    if (!/^[A-Za-z0-9_-]{8,80}$/.test(eventId)) throw new HttpError(400, 'Invalid event id', 'validation_error')
  }
  return { type: input.type, eventId }
}

const REPORT_REASONS = new Set(['spam', 'harassment', 'illegal', 'other'])

export function validateReport(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new HttpError(400, 'Expected a JSON object', 'validation_error')
  }
  const gameId = cleanText(input.gameId, 48)
  if (!/^[a-z0-9-]{1,48}$/.test(gameId)) throw new HttpError(400, 'Invalid game id', 'validation_error')
  if (!REPORT_REASONS.has(input.reason)) throw new HttpError(400, 'Invalid report reason', 'validation_error')
  return { gameId, reason: input.reason, details: cleanText(input.details, 500) }
}

export function validateScoreInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new HttpError(400, 'Expected a JSON object', 'validation_error')
  }
  const name = cleanText(input.name, 22) || 'Anonymous'
  const points = Number(input.points)
  if (!Number.isInteger(points)) throw new HttpError(400, 'Invalid score', 'validation_error')
  const mechanic = input.mechanic === undefined ? null : input.mechanic
  let roundToken = null
  if (input.roundToken !== undefined && input.roundToken !== null && input.roundToken !== '') {
    if (typeof input.roundToken !== 'string') throw new HttpError(400, 'Invalid round token', 'validation_error')
    roundToken = input.roundToken.trim()
    if (!/^[A-Za-z0-9_-]{20,80}$/.test(roundToken)) throw new HttpError(400, 'Invalid round token', 'validation_error')
  }
  return { name, points, mechanic, roundToken }
}

export function assertMechanicScore(mechanic, points, duration) {
  if (mechanic === 'reaction') {
    if (points < 1 || points > 15000) throw new HttpError(400, 'Reaction time must be 1–15000 ms', 'validation_error')
    return { ranking: 'lower', unit: 'ms' }
  }
  if (mechanic === 'guess') {
    if (points < 0 || points > 100) throw new HttpError(400, 'Guess score must be 0–100', 'validation_error')
    return { ranking: 'higher', unit: 'pts' }
  }
  if (mechanic === 'tap') {
    const max = Math.max(1, duration) * 30
    if (points < 0 || points > max) throw new HttpError(400, 'Tap score is outside the allowed range', 'validation_error')
    return { ranking: 'higher', unit: 'taps' }
  }
  if (mechanic === 'arcade') {
    const max = Math.max(1, duration) * 200
    if (points < 0 || points > max) throw new HttpError(400, 'Arcade score is outside the allowed range', 'validation_error')
    return { ranking: 'higher', unit: 'pts' }
  }
  const max = Math.max(1, duration) * 50
  if (points < 0 || points > max) throw new HttpError(400, 'Dodge score is outside the allowed range', 'validation_error')
  return { ranking: 'higher', unit: 'pts' }
}
