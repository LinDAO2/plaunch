const MAX_BYTES = 2 * 1024 * 1024

const MIME = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  ico: 'image/x-icon'
}

export function stripComments(html) {
  const text = String(html || '')
  let out = ''
  let i = 0
  while (i < text.length) {
    const lower = text.slice(i, i + 16).toLowerCase()
    if (text.startsWith('<!--', i)) {
      const end = text.indexOf('-->', i + 4)
      i = end === -1 ? text.length : end + 3
      continue
    }
    if (lower.startsWith('<script')) {
      const open = text.indexOf('>', i)
      if (open === -1) break
      const close = text.toLowerCase().indexOf('</script>', open)
      if (close === -1) {
        out += text.slice(i)
        break
      }
      out += text.slice(i, open + 1)
      out += stripJs(text.slice(open + 1, close))
      out += text.slice(close, close + 9)
      i = close + 9
      continue
    }
    if (lower.startsWith('<style')) {
      const open = text.indexOf('>', i)
      if (open === -1) break
      const close = text.toLowerCase().indexOf('</style>', open)
      if (close === -1) {
        out += text.slice(i)
        break
      }
      out += text.slice(i, open + 1)
      out += stripCss(text.slice(open + 1, close))
      out += text.slice(close, close + 8)
      i = close + 8
      continue
    }
    out += text[i]
    i += 1
  }
  return out
}

function stripJs(code) {
  let out = ''
  let i = 0
  let quote = ''
  while (i < code.length) {
    const ch = code[i]
    if (quote) {
      out += ch
      if (ch === '\\') {
        out += code[i + 1] || ''
        i += 2
        continue
      }
      if (ch === quote) quote = ''
      i += 1
      continue
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch
      out += ch
      i += 1
      continue
    }
    if (ch === '/' && code[i + 1] === '/') {
      while (i < code.length && code[i] !== '\n') i += 1
      continue
    }
    if (ch === '/' && code[i + 1] === '*') {
      i += 2
      while (i < code.length && !(code[i] === '*' && code[i + 1] === '/')) i += 1
      i += 2
      out += ' '
      continue
    }
    out += ch
    i += 1
  }
  return out
}

function stripCss(code) {
  return String(code).replace(/\/\*[\s\S]*?\*\//g, ' ')
}

function extname(file) {
  const match = String(file).toLowerCase().match(/\.([a-z0-9]+)$/)
  return match ? match[1] : ''
}

function resolvePath(from, rel) {
  if (!rel || /^(?:[a-z]+:|\/\/)/i.test(rel) || rel.startsWith('data:')) return null
  const clean = rel.split('?')[0].split('#')[0]
  const base = String(from || '').split('/').slice(0, -1)
  for (const part of clean.split('/')) {
    if (part === '..') base.pop()
    else if (part && part !== '.') base.push(part)
  }
  return base.join('/')
}

function lookup(files, path) {
  if (Object.prototype.hasOwnProperty.call(files, path)) return path
  const found = Object.keys(files).find((key) => key.toLowerCase() === path.toLowerCase())
  return found || ''
}

function dataUri(path, body) {
  const type = MIME[extname(path)]
  if (!type) return ''
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(body)
  return `data:${type};base64,${buf.toString('base64')}`
}

function inlineCss(css, from, files, errors) {
  let text = stripCss(css).replace(/@font-face\s*\{[^}]*\}/gi, '')
  text = text.replace(/@import\s+url\(\s*['"]?([^'")]+)['"]?\s*\)\s*;?/gi, (all, href) => {
    if (/^https?:/i.test(href)) {
      errors.push(`External stylesheet is not allowed: ${href.slice(0, 120)}`)
      return ''
    }
    const path = resolvePath(from, href)
    const key = path && lookup(files, path)
    if (!key) {
      errors.push(`Missing stylesheet: ${href}`)
      return ''
    }
    const body = Buffer.isBuffer(files[key]) ? files[key].toString('utf8') : String(files[key])
    return inlineCss(body, key, files, errors)
  })
  text = text.replace(/url\(\s*['"]?([^'")]+)['"]?\s*\)/gi, (all, href) => {
    if (href.startsWith('data:')) return all
    if (/^https?:/i.test(href)) {
      errors.push(`External URL is not allowed: ${href.slice(0, 120)}`)
      return 'none'
    }
    const path = resolvePath(from, href)
    const key = path && lookup(files, path)
    if (!key) return all
    const uri = dataUri(key, files[key])
    return uri ? `url("${uri}")` : all
  })
  return text
}

function findEntry(files, entry) {
  if (entry && lookup(files, entry)) return lookup(files, entry)
  const names = Object.keys(files)
  const preferred = ['index.html', 'index.htm']
  for (const name of preferred) {
    const key = lookup(files, name)
    if (key) return key
  }
  const html = names.filter((name) => /\.html?$/i.test(name) && !name.includes('/'))
  if (html.length === 1) return html[0]
  const any = names.filter((name) => /\.html?$/i.test(name))
  if (any.length === 1) return any[0]
  return ''
}

export function bundleFiles(files, { entry = '' } = {}) {
  const errors = []
  const map = {}
  for (const [name, body] of Object.entries(files || {})) {
    const clean = String(name).replace(/\\/g, '/').replace(/^\.\//, '')
    if (!clean || clean.split('/').includes('..')) {
      errors.push(`Path is not allowed: ${name}`)
      continue
    }
    map[clean] = body
  }
  const start = findEntry(map, entry)
  if (!start) {
    return { ok: false, errors: ['No index.html was found'], html: '' }
  }
  let html = Buffer.isBuffer(map[start]) ? map[start].toString('utf8') : String(map[start])
  html = html.replace(/<link\b[^>]*rel=["'](?:shortcut icon|apple-touch-icon|icon)["'][^>]*>/gi, '')
  html = html.replace(/<link\b([^>]*?)href\s*=\s*['"]([^'"]+)['"]([^>]*)>/gi, (all, before, href, after) => {
    const rel = `${before} ${after}`
    if (!/stylesheet/i.test(rel) && !/\.css(\?|$)/i.test(href)) return all
    if (/^https?:/i.test(href)) {
      errors.push(`External stylesheet is not allowed: ${href.slice(0, 120)}`)
      return ''
    }
    const path = resolvePath(start, href)
    const key = path && lookup(map, path)
    if (!key) {
      errors.push(`Missing stylesheet: ${href}`)
      return ''
    }
    const css = Buffer.isBuffer(map[key]) ? map[key].toString('utf8') : String(map[key])
    return `<style>${inlineCss(css, key, map, errors)}</style>`
  })
  html = html.replace(/<script\b([^>]*)\bsrc\s*=\s*['"]([^'"]+)['"]([^>]*)>\s*<\/script>/gi, (all, before, src) => {
    if (/^https?:/i.test(src) || src.startsWith('//')) {
      errors.push(`External script is not allowed: ${src.slice(0, 120)}`)
      return ''
    }
    const path = resolvePath(start, src)
    const key = path && lookup(map, path)
    if (!key) {
      errors.push(`Missing script: ${src}`)
      return ''
    }
    const body = Buffer.isBuffer(map[key]) ? map[key].toString('utf8') : String(map[key])
    return `<script>${body.replace(/<\/script/gi, '<\\/script')}</script>`
  })
  html = html.replace(/<(img|source)\b([^>]*?)\bsrc\s*=\s*['"]([^'"]+)['"]([^>]*)>/gi, (all, tag, before, src, after) => {
    if (src.startsWith('data:') || src.startsWith('blob:')) return all
    if (/^https?:/i.test(src) || src.startsWith('//')) {
      errors.push(`External image is not allowed: ${src.slice(0, 120)}`)
      return `<${tag}${before}src=""${after}>`
    }
    const path = resolvePath(start, src)
    const key = path && lookup(map, path)
    if (!key) return all
    const uri = dataUri(key, map[key])
    return uri ? `<${tag}${before}src="${uri}"${after}>` : all
  })
  html = stripComments(html)
  if (errors.length) return { ok: false, errors, html: '' }
  const inspected = inspectImport(html)
  if (inspected.length) return { ok: false, errors: inspected, html: '' }
  return { ok: true, errors: [], html }
}

export function inspectImport(html) {
  const errors = []
  const text = String(html || '')
  if (!text.trim()) errors.push('Document is empty')
  if (Buffer.byteLength(text) > MAX_BYTES) errors.push('Document is larger than 2MB')
  if (/<script\b[^>]*\bsrc\s*=/i.test(text)) errors.push('Scripts must be inlined')
  const rules = [
    [/https?:\/\/[^\s"'<>)]+/i, (match) => `External URL is not allowed: ${match[0].slice(0, 120)}`],
    [/wss?:\/\/[^\s"'<>)]+/i, (match) => `WebSocket URL is not allowed: ${match[0].slice(0, 120)}`],
    [/\bfetch\s*\(/i, () => 'fetch is not allowed'],
    [/XMLHttpRequest/, () => 'XMLHttpRequest is not allowed'],
    [/\bWebSocket\s*\(/, () => 'WebSocket is not allowed'],
    [/\beval\s*\(/i, () => 'eval is not allowed'],
    [/\bnew\s+Function\b/, () => 'Function constructor is not allowed'],
    [/\bFunction\s*\(/, () => 'Function constructor is not allowed'],
    [/document\s*\.\s*cookie/i, () => 'document.cookie is not allowed'],
    [/serviceWorker/i, () => 'Service workers are not allowed'],
    [/\bnew\s+Worker\b/, () => 'Workers are not allowed'],
    [/\bimport\s*\(/, () => 'Dynamic import is not allowed']
  ]
  for (const [pattern, message] of rules) {
    const match = text.match(pattern)
    if (match) errors.push(message(match))
  }
  return errors
}
