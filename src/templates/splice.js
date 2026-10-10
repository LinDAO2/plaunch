import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { TRADEMARK } from './catalog.js'
import { inspectFreeform } from '../ai/freeform-check.js'

const BLOCKS = new Set(['CONFIG', 'THEME', 'RULES'])

function block(html, name) {
  const start = `/* PLAYGROUND ${name} */`
  const end = `/* PLAYGROUND END ${name} */`
  const from = html.indexOf(start)
  const to = html.indexOf(end)
  if (from < 0 || to < from) return null
  return { from, to, start, end, inner: html.slice(from + start.length, to) }
}

function matchingObject(source) {
  const open = source.indexOf('{')
  if (open < 0) return null
  let depth = 0
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth += 1
    else if (source[i] === '}') {
      depth -= 1
      if (depth === 0) return source.slice(open, i + 1)
    }
  }
  return null
}

function leaves(value, prefix, out) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    out.push([prefix, value])
    return
  }
  const keys = Object.keys(value)
  if (!keys.length && prefix) out.push([prefix, value])
  for (const key of keys) leaves(value[key], prefix ? `${prefix}.${key}` : key, out)
}

function setPath(target, path, value) {
  const parts = path.split('.')
  let cursor = target
  for (let i = 0; i < parts.length - 1; i++) {
    if (!cursor[parts[i]] || typeof cursor[parts[i]] !== 'object') return false
    cursor = cursor[parts[i]]
  }
  cursor[parts[parts.length - 1]] = value
  return true
}

function checkValue(kind, rule, value) {
  if (kind === 'color') return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value)
  if (kind === 'text') {
    return typeof value === 'string' && value.length > 0 && value.length <= 40 && !/[<>`]/.test(value) && !TRADEMARK.test(value)
  }
  if (kind === 'grid') {
    return Array.isArray(value) && value.length > 0 && value.length <= 16 && value.every((row) => typeof row === 'string' && row.length > 0 && row.length <= 16 && /^[a-zA-Z. ]+$/.test(row))
  }
  if (rule && typeof rule === 'object') {
    return Number.isInteger(value) && value >= rule.min && value <= rule.max
  }
  return false
}

function safeFunction(name, source) {
  const text = String(source || '').trim()
  if (text.length > 800) return false
  if (!new RegExp(`^function\\s+${name}\\s*\\(`).test(text)) return false
  if (!text.endsWith('}')) return false
  if (TRADEMARK.test(text)) return false
  if (/\bfetch\s*\(|XMLHttpRequest|\bWebSocket\s*\(|\beval\s*\(|\bnew\s+Function\b|\bFunction\s*\(|https?:|wss?:|localStorage|sessionStorage|document\s*\.\s*cookie|\bimport\s*\(|\bnew\s+Worker\b/.test(text)) return false
  let depth = 0
  for (const ch of text) {
    if (ch === '{') depth += 1
    else if (ch === '}') depth -= 1
    if (depth < 0) return false
  }
  return depth === 0
}

export function syntaxCheck(html) {
  const scripts = [...String(html || '').matchAll(/<script>([\s\S]*?)<\/script>/gi)].map((match) => match[1])
  if (!scripts.length) return { ok: false, error: 'No inline script' }
  const dir = mkdtempSync(join(tmpdir(), 'pg-tpl-'))
  const file = join(dir, 'game.js')
  try {
    writeFileSync(file, scripts.join('\n'))
    const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' })
    return { ok: result.status === 0, error: (result.stderr || '').slice(0, 400) }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

export function spliceTemplate(html, edits, spec) {
  if (!edits || typeof edits !== 'object' || Array.isArray(edits)) {
    return { ok: false, error: 'Edits must be an object' }
  }
  for (const key of Object.keys(edits)) {
    if (!BLOCKS.has(key)) return { ok: false, error: `Edits outside CONFIG, THEME, and RULES are not allowed (${key})` }
  }
  let next = String(html || '')
  if (edits.CONFIG) {
    const found = []
    leaves(edits.CONFIG, '', found)
    for (const [path, value] of found) {
      const rule = spec.fields.CONFIG[path]
      if (!rule) return { ok: false, error: `CONFIG.${path} is not editable` }
      if (!checkValue('number', rule, value)) return { ok: false, error: `CONFIG.${path} is not an allowed number` }
    }
    const region = block(next, 'CONFIG')
    if (!region) return { ok: false, error: 'CONFIG block is missing' }
    const raw = matchingObject(region.inner)
    let config
    try { config = JSON.parse(raw) } catch { return { ok: false, error: 'CONFIG block is not JSON' } }
    for (const [path, value] of found) setPath(config, path, value)
    const inner = `\nconst CONFIG = ${JSON.stringify(config)};\n`
    next = next.slice(0, region.from + region.start.length) + inner + next.slice(region.to)
  }
  if (edits.THEME) {
    const found = []
    leaves(edits.THEME, '', found)
    for (const [path, value] of found) {
      const kind = spec.fields.THEME[path]
      if (!kind) return { ok: false, error: `THEME.${path} is not editable` }
      if (!checkValue(kind, null, value)) return { ok: false, error: `THEME.${path} is not an allowed value` }
    }
    const region = block(next, 'THEME')
    if (!region) return { ok: false, error: 'THEME block is missing' }
    let theme
    try { theme = JSON.parse(matchingObject(region.inner)) } catch { return { ok: false, error: 'THEME block is not JSON' } }
    for (const [path, value] of found) {
      if (!setPath(theme, path, value)) return { ok: false, error: `THEME.${path} cannot be set` }
    }
    const inner = `\nconst THEME = ${JSON.stringify(theme)};\n`
    next = next.slice(0, region.from + region.start.length) + inner + next.slice(region.to)
  }
  if (edits.RULES) {
    if (typeof edits.RULES !== 'object' || Array.isArray(edits.RULES)) return { ok: false, error: 'RULES must be an object' }
    const region = block(next, 'RULES')
    if (!region) return { ok: false, error: 'RULES block is missing' }
    let inner = region.inner
    for (const [name, source] of Object.entries(edits.RULES)) {
      if (spec.fields.RULES[name] !== 'function') return { ok: false, error: `RULES.${name} is not editable` }
      if (!safeFunction(name, source)) return { ok: false, error: `RULES.${name} is not an allowed function` }
      const mark = `/* PLAYGROUND RULE ${name} */`
      const done = `/* PLAYGROUND END RULE ${name} */`
      const from = inner.indexOf(mark)
      const to = inner.indexOf(done)
      if (from < 0 || to < from) return { ok: false, error: `RULES.${name} block is missing` }
      inner = inner.slice(0, from + mark.length) + `\n${String(source).trim()}\n` + inner.slice(to)
    }
    next = next.slice(0, region.from + region.start.length) + inner + next.slice(region.to)
  }
  const errors = inspectFreeform(next)
  if (errors.length) return { ok: false, error: errors.join('; ') }
  const syntax = syntaxCheck(next)
  if (!syntax.ok) return { ok: false, error: syntax.error || 'Edited script did not parse' }
  return { ok: true, html: next }
}
