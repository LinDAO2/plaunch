export const FREEFORM_MAX_BYTES = 150 * 1024

const RULES = [
  [/<(?:script|link|iframe|object|embed)\b[^>]*\b(?:src|href)\s*=\s*['"]?\s*(?:https?:|\/\/)/i, 'External scripts and stylesheets are not allowed'],
  [/<script\b[^>]*\bsrc\s*=/i, 'External scripts are not allowed'],
  [/<iframe\b/i, 'Nested frames are not allowed'],
  [/<base\b/i, 'A base URL is not allowed'],
  [/https?:\/\//i, 'External URLs are not allowed'],
  [/wss?:\/\//i, 'WebSocket URLs are not allowed'],
  [/['"]\/\//, 'Protocol-relative URLs are not allowed'],
  [/\bfetch\s*\(/i, 'fetch is not allowed'],
  [/XMLHttpRequest/i, 'XMLHttpRequest is not allowed'],
  [/\bWebSocket\s*\(/, 'WebSocket is not allowed'],
  [/\beval\s*\(/i, 'eval is not allowed'],
  [/\bnew\s+Function\b/, 'Function constructor is not allowed'],
  [/\bFunction\s*\(/, 'Function constructor is not allowed'],
  [/document\s*\.\s*cookie/i, 'document.cookie is not allowed'],
  [/\blocalStorage\b/, 'localStorage is not allowed'],
  [/\bsessionStorage\b/, 'sessionStorage is not allowed'],
  [/\bimport\s*\(/, 'Dynamic import is not allowed'],
  [/\bnew\s+Worker\b/, 'Workers are not allowed']
]

export function inspectFreeform(html) {
  const errors = []
  if (typeof html !== 'string' || !html.trim()) {
    errors.push('Document is empty')
    return errors
  }
  if (Buffer.byteLength(html) > FREEFORM_MAX_BYTES) errors.push('Document is larger than 150KB')
  if (!/<canvas\b/i.test(html)) errors.push('Document must include a canvas')
  if (!/<html[\s>]/i.test(html)) errors.push('Document must be one self-contained HTML page')
  if (!/playground-score/.test(html)) errors.push('Score must be sent with postMessage type playground-score')
  for (const [pattern, message] of RULES) {
    if (pattern.test(html) && !errors.includes(message)) errors.push(message)
  }
  return errors
}

export function assertFreeform(html) {
  const errors = inspectFreeform(html)
  return { ok: errors.length === 0, errors, html: errors.length ? '' : html }
}
