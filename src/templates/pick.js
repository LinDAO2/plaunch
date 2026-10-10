import { TEMPLATES } from './catalog.js'

function hit(text, phrase) {
  const sample = String(text || '').toLowerCase()
  const hint = String(phrase || '').toLowerCase()
  if (!hint) return false
  if (hint.includes(' ')) return sample.includes(hint)
  return new RegExp(`\\b${hint.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(sample)
}

export function pickTemplate(prompt) {
  const text = String(prompt || '').toLowerCase()
  let best = null
  for (const template of TEMPLATES) {
    let confidence = 0
    for (const phrase of template.match.high) if (hit(text, phrase)) confidence = Math.max(confidence, 0.92)
    for (const phrase of template.match.medium) if (hit(text, phrase)) confidence = Math.max(confidence, 0.58)
    if (!best || confidence > best.confidence) best = { id: template.id, confidence, template }
  }
  if (!best || best.confidence < 0.5) return null
  return best
}

export function hashText(value) {
  let hash = 0
  for (const char of String(value || '')) hash = (hash * 33 + char.charCodeAt(0)) >>> 0
  return hash
}
