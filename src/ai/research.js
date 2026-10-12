import { readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { BIOMES } from '../blocks/blocks.js'
import { CURATED } from '../imports/catalog.js'
import { bundleFiles, inspectImport } from '../imports/bundle.js'
import { fetchGithubRepo } from '../imports/github.js'
import { COPYLEFT, PERMISSIVE, gateLicense, normalizeSpdx } from '../imports/license.js'
import { wantsKeyboard, wrapDocument } from '../imports/wrapper.js'
import { ARENA_TEMPLATES } from '../arena/templates.js'
import { TRADEMARK, TEMPLATES } from '../templates/catalog.js'
import { pickTemplate } from '../templates/pick.js'
import { aiStatus, requestModelText } from './generate.js'
import { heuristicTier } from './classify.js'
import { resolveProvider } from './providers.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(HERE, '..', '..')
const OPEN_GAMES = JSON.parse(readFileSync(path.join(HERE, 'open-games.json'), 'utf8'))

const STOP = new Set('a an the and or of to for with in on at by from please game games make build create want my me i you your it is be this that into over under just some very really like about can could should would will play playing player one'.split(' '))
const GENERIC = new Set('arcade puzzle action runner racer racing shooter platform platformer maze snake breakout pong chess cards board space dodge tap click jump blocks tile tiles match drift'.split(' '))

const cache = new Map()
const CACHE_MAX = 200

const BRIEF_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['coreLoop', 'controls', 'juice', 'fun'],
  properties: {
    coreLoop: { type: 'string' },
    controls: { type: 'string' },
    juice: { type: 'string' },
    fun: { type: 'string' }
  }
}

const BRIEF_PROMPT = `You write a short design brief for one original browser game. Return JSON with coreLoop, controls, juice, and fun. Each value is one sentence. Describe the loop, the controls, the juice, and what makes the best-known games in that genre fun. Never copy trademarked names or art. Do not name commercial products.`

export function researchEnabled(env) {
  const flag = String(env?.AI_RESEARCH ?? 'on').trim().toLowerCase()
  return flag !== 'off' && flag !== '0' && flag !== 'false'
}

export function normalizePrompt(prompt) {
  return String(prompt || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

export function clearResearchCache() {
  cache.clear()
}

export function acceptGithubLicense(spdx) {
  const id = normalizeSpdx(spdx)
  if (!id || COPYLEFT.has(id) || !PERMISSIVE.has(id)) return false
  return true
}

export function strategyLabel(strategy, builtOn) {
  if (strategy === 'remix') return `Remixing ${builtOn?.name || 'a template'}`
  if (strategy === 'adapt') return `Adapting ${builtOn?.name || 'an open-source game'}`
  if (strategy === 'spec') return 'Writing an arcade game from the references'
  if (strategy === 'freeform') return 'Writing from references'
  if (strategy === 'world') return 'Using the Blocks runtime'
  return 'Researching similar games'
}

export function briefNote(brief) {
  if (!brief?.coreLoop) return ''
  return `Design notes, original work only. Do not copy trademarked names or art.\nLoop: ${brief.coreLoop}\nControls: ${brief.controls}\nJuice: ${brief.juice}\nFun: ${brief.fun}`
}

function tokens(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9+#]+/g, ' ').split(/\s+/).filter((token) => token.length > 1 && !STOP.has(token))
}

function asList(value) {
  if (Array.isArray(value)) return value.filter((item) => typeof item === 'string')
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      if (Array.isArray(parsed)) return parsed.filter((item) => typeof item === 'string')
    } catch {
      return []
    }
  }
  return []
}

function asCredit(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    if (typeof value === 'string') {
      try { return asCredit(JSON.parse(value)) } catch { return {} }
    }
    return {}
  }
  return value
}

function prepare(entry) {
  const nameTokens = tokens(entry.name)
  const doc = tokens([
    entry.name,
    entry.description,
    ...(entry.tags || []),
    ...(entry.mechanics || []),
    ...(entry.controls || []),
    ...(entry.keywords || [])
  ].join(' '))
  return { ...entry, _nameTokens: nameTokens, _tokens: doc }
}

function templateEntry(spec, kind) {
  return prepare({
    id: `${kind}-${spec.id}`,
    name: spec.name,
    author: 'Playground',
    license: 'MIT',
    repo: '',
    source: '',
    tags: spec.tags || [],
    mechanics: spec.keywords || [],
    controls: [],
    description: spec.description || '',
    keywords: [...(spec.keywords || []), ...(spec.match?.high || []), ...(spec.match?.medium || [])],
    kind,
    adaptable: false
  })
}

function baseCatalog() {
  const rows = [
    ...TEMPLATES.map((spec) => templateEntry(spec, 'template')),
    ...ARENA_TEMPLATES.map((spec) => templateEntry(spec, 'arena')),
    ...CURATED.map((spec) => prepare({
      id: `curated-${spec.id}`,
      name: spec.name,
      author: spec.credit?.author || '',
      license: spec.credit?.license || '',
      repo: spec.credit?.source || '',
      source: spec.credit?.source || '',
      sha: spec.credit?.sha || '',
      tags: spec.tags || [],
      mechanics: [],
      controls: [],
      description: spec.description || '',
      keywords: [spec.name, spec.description],
      kind: 'curated',
      adaptable: spec.id === 'lane-racer',
      localId: spec.id === 'lane-racer' ? spec.id : ''
    })),
    ...BIOMES.map((biome) => prepare({
      id: `blocks-${biome}`,
      name: `${biome.charAt(0).toUpperCase()}${biome.slice(1)} Blocks`,
      author: 'Playground',
      license: 'MIT',
      repo: '',
      source: '',
      tags: ['blocks', 'sandbox'],
      mechanics: ['place', 'explore'],
      controls: ['arrow keys', 'mouse'],
      description: `Place and break blocks in a ${biome} world. Raise the landmark and gather sparks.`,
      keywords: [biome, 'blocks', 'voxel', 'landmark'],
      kind: 'blocks',
      adaptable: false
    })),
    ...OPEN_GAMES.map((spec) => prepare({ ...spec, kind: 'index' }))
  ]
  return rows
}

function publishedEntries(rows) {
  return (rows || []).slice(0, 200).map((row, index) => {
    const credit = asCredit(row.credit)
    const name = String(row.name || '').replace(/\s+/g, ' ').trim().slice(0, 80)
    if (!name) return null
    return prepare({
      id: `published-${index}`,
      name,
      author: typeof credit.author === 'string' ? credit.author : '',
      license: typeof credit.license === 'string' ? credit.license : '',
      repo: '',
      source: typeof credit.source === 'string' ? credit.source : '',
      tags: asList(row.tags),
      mechanics: [],
      controls: [],
      description: String(row.description || '').slice(0, 180),
      kind: 'published',
      adaptable: false
    })
  }).filter(Boolean)
}

function overlap(promptTokens, docTokens) {
  if (!promptTokens.length || !docTokens.length) return 0
  const doc = new Set(docTokens)
  let hit = 0
  for (const token of promptTokens) if (doc.has(token)) hit += 1
  return hit / promptTokens.length
}

function scoreEntry(promptTokens, entry) {
  let score = overlap(promptTokens, entry._tokens)
  if (entry._nameTokens.length && entry._nameTokens.every((token) => promptTokens.includes(token))) {
    score = Math.min(1, score + 0.2)
  }
  return score
}

function canAdapt(entry, promptTokens, score) {
  if (!entry.adaptable || score < 0.55) return false
  const nameTokens = entry._nameTokens.filter((token) => token.length >= 3)
  if (!nameTokens.length || !nameTokens.every((token) => promptTokens.includes(token))) return false
  const specific = nameTokens.filter((token) => !GENERIC.has(token))
  if (!specific.length) return false
  if (nameTokens.length === 1 && specific[0].length < 6) return false
  return true
}

function safeText(value) {
  return String(value || '').replace(TRADEMARK, 'a classic').replace(/\s+/g, ' ').trim()
}

function topRefs(matches, skipName) {
  const skip = String(skipName || '').toLowerCase()
  const out = []
  for (const match of matches) {
    if (match.score < 0.34) continue
    const name = safeText(match.entry.name).slice(0, 80)
    if (!name || name.toLowerCase() === skip) continue
    if (out.some((item) => item.name === name)) continue
    const source = typeof match.entry.source === 'string' && /^https:\/\/\S+$/.test(match.entry.source) ? match.entry.source : ''
    out.push({
      name,
      author: String(match.entry.author || '').slice(0, 80),
      license: String(match.entry.license || '').slice(0, 40),
      source
    })
    if (out.length === 4) break
  }
  return out
}

function heuristicBrief(prompt, matches) {
  const names = matches.slice(0, 3).map((match) => safeText(match.entry.name)).filter(Boolean)
  const controls = (matches[0]?.entry.controls || []).slice(0, 3).join(', ') || 'keyboard and tap'
  return {
    coreLoop: `A short original round about ${safeText(prompt).slice(0, 140)}.`,
    controls,
    juice: 'Snappy hits, a readable score, and a round that finishes quickly.',
    fun: names.length
      ? `Borrow the feel of ${names.join(', ')} without copying their names or art.`
      : 'Keep the goal obvious and the first point easy to earn.',
    source: 'heuristic'
  }
}

function parseBrief(raw) {
  let data
  try { data = JSON.parse(String(raw || '').trim()) } catch { return null }
  if (!data || typeof data !== 'object') return null
  const take = (key) => {
    const value = safeText(data[key])
    if (value.length < 8 || value.length > 320) return ''
    return value
  }
  const brief = {
    coreLoop: take('coreLoop'),
    controls: take('controls'),
    juice: take('juice'),
    fun: take('fun'),
    source: 'model'
  }
  if (!brief.coreLoop || !brief.controls || !brief.juice || !brief.fun) return null
  return brief
}

function referenceLines(matches) {
  return matches.slice(0, 5).map((match) => {
    const item = match.entry
    return `- ${safeText(item.name)} (${item.license || 'permissive'}): ${safeText(item.description)}`
  }).join('\n')
}

function withTimeout(promise, ms) {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('research timed out')), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

function escapeText(value) {
  return String(value || '').replace(/[&<>]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch]))
}

function attachLicense(html, licenseText) {
  const text = String(licenseText || '').trim()
  if (!text || /https?:\/\//i.test(text) || String(html).includes('id="pg-license"')) return html
  const block = `<pre id="pg-license" hidden>${escapeText(text)}</pre>`
  if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, `${block}</body>`)
  return `${html}${block}`
}

async function adaptLocal(entry) {
  const dir = path.join(ROOT, 'imports', entry.localId)
  const html = attachLicense(await readFile(path.join(dir, 'game.html'), 'utf8'), await readLicense(dir))
  const errors = inspectImport(html)
  if (errors.length) throw new Error(errors.join('; '))
  const licenseText = await readLicense(dir)
  return {
    html,
    license: entry.license,
    author: entry.author,
    source: entry.source,
    sha: entry.sha || '',
    licenseText
  }
}

async function readLicense(dir) {
  for (const name of ['LICENSE', 'LICENSE.txt', 'LICENSE.md']) {
    try { return await readFile(path.join(dir, name), 'utf8') } catch { /* try the next filename */ }
  }
  return ''
}

async function adaptRemote(entry, env, fetchImpl, timeoutMs) {
  const fetched = await withTimeout(fetchGithubRepo({
    url: entry.repo,
    token: env.GITHUB_TOKEN || '',
    fetchImpl
  }), timeoutMs)
  const gate = gateLicense({ spdx: fetched.license })
  if (!gate.ok || !PERMISSIVE.has(gate.license)) throw new Error('license blocked')
  const bundled = bundleFiles(fetched.files)
  if (!bundled.ok) throw new Error(bundled.errors.join('; '))
  let html = wrapDocument(bundled.html, {
    keyboard: wantsKeyboard(bundled.html),
    author: fetched.author || entry.author,
    license: gate.license
  })
  html = attachLicense(html, fetched.licenseText)
  const errors = inspectImport(html)
  if (errors.length) throw new Error(errors.join('; '))
  return {
    html,
    license: gate.license,
    author: fetched.author || entry.author,
    source: fetched.source,
    sha: fetched.sha,
    licenseText: fetched.licenseText || ''
  }
}

async function searchGithub({ prompt, token, fetchImpl, timeoutMs }) {
  const words = tokens(prompt).slice(0, 4)
  if (!words.length || !token || typeof fetchImpl !== 'function') return []
  const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(`${words.join(' ')} game`)}&per_page=8&sort=stars`
  try {
    const res = await withTimeout(fetchImpl(url, {
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${token}`,
        'user-agent': 'playground-research'
      }
    }), timeoutMs)
    const data = await res.json()
    const items = Array.isArray(data?.items) ? data.items : []
    const out = []
    for (const item of items) {
      if (!acceptGithubLicense(item?.license?.spdx_id || '')) continue
      const name = safeText(item.name || item.full_name || '').slice(0, 80)
      if (!name) continue
      out.push(prepare({
        id: `gh-${String(item.full_name || name)}`,
        name,
        author: String(item.owner?.login || ''),
        license: normalizeSpdx(item.license.spdx_id),
        repo: typeof item.html_url === 'string' ? item.html_url : '',
        source: typeof item.html_url === 'string' ? item.html_url : '',
        tags: ['opensource'],
        mechanics: [],
        controls: [],
        description: safeText(item.description || name).slice(0, 180),
        kind: 'github',
        adaptable: false
      }))
    }
    return out
  } catch {
    return []
  }
}

function creditFor({ strategy, builtOn, inspiredBy, adapted }) {
  return {
    author: adapted?.author || '',
    license: adapted?.license || '',
    source: adapted?.source || '',
    sha: adapted?.sha || '',
    origin: strategy === 'adapt' ? 'research' : '',
    copyleftConfirmed: false,
    permissionConfirmed: false,
    licenseText: adapted?.licenseText ? String(adapted.licenseText).slice(0, 8000) : '',
    builtOn: builtOn?.name ? {
      name: builtOn.name,
      author: builtOn.author || '',
      license: builtOn.license || '',
      source: builtOn.source || ''
    } : null,
    inspiredBy: inspiredBy || []
  }
}

function remember(key, value) {
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value)
  cache.set(key, value)
}

export async function researchPrompt({
  prompt,
  env = {},
  fetchImpl,
  onProgress,
  published = [],
  allowModel = true,
  allowNetwork = true,
  allowAdapt = true,
  budgetMs = 10_000
} = {}) {
  if (!researchEnabled(env)) return null
  const started = Date.now()
  const left = () => budgetMs - (Date.now() - started)
  const ai = aiStatus(env).mode === 'ai'
  const key = `${normalizePrompt(prompt)}|${ai ? 'ai' : 'off'}|${env.GITHUB_TOKEN ? 'gh' : 'local'}|${allowModel ? 'm' : 'x'}|${allowNetwork ? 'n' : 'o'}|${allowAdapt ? 'a' : 's'}`
  onProgress?.({ phase: 'research', outputTokens: 0, label: 'Researching similar games…' })
  if (cache.has(key)) {
    const hit = cache.get(key)
    onProgress?.({ phase: 'research', outputTokens: 0, label: `${hit.label}…` })
    return { ...hit, cached: true, ms: 0 }
  }
  const promptTokens = tokens(prompt)
  const catalog = baseCatalog().concat(publishedEntries(published))
  let matches = catalog.map((entry) => ({ entry, score: scoreEntry(promptTokens, entry) }))
  if (allowNetwork && env.GITHUB_TOKEN && left() > 1200) {
    const live = await searchGithub({
      prompt,
      token: env.GITHUB_TOKEN,
      fetchImpl,
      timeoutMs: Math.min(4000, Math.max(200, left() - 200))
    })
    for (const entry of live) matches.push({ entry, score: scoreEntry(promptTokens, entry) })
  }
  matches = matches.filter((match) => match.score > 0).sort((a, b) => b.score - a.score).slice(0, 8)
  const picked = pickTemplate(prompt)
  let strategy = 'open'
  let builtOn = null
  let adapted = null
  if (picked) {
    strategy = 'remix'
    builtOn = { name: picked.template.name, author: 'Playground', license: 'MIT', source: '' }
  } else if (allowAdapt && left() > 400) {
    const hit = matches.find((match) => canAdapt(match.entry, promptTokens, match.score))
    if (hit?.entry.localId) {
      try {
        adapted = await adaptLocal(hit.entry)
        strategy = 'adapt'
        builtOn = { name: hit.entry.name, author: hit.entry.author, license: hit.entry.license, source: hit.entry.source }
      } catch {
        adapted = null
      }
    } else if (hit?.entry.repo && allowNetwork && env.GITHUB_TOKEN && left() > 800) {
      try {
        adapted = await adaptRemote(hit.entry, env, fetchImpl, Math.min(6000, Math.max(200, left() - 150)))
        strategy = 'adapt'
        builtOn = { name: hit.entry.name, author: adapted.author, license: adapted.license, source: adapted.source }
      } catch {
        adapted = null
      }
    }
  }
  if (strategy === 'open') {
    const tier = heuristicTier(prompt)
    strategy = tier === 'freeform' || tier === 'spec' || tier === 'world' ? tier : 'open'
    if (strategy === 'world') builtOn = { name: 'Blocks', author: 'Playground', license: 'MIT', source: '' }
  }
  let brief = null
  if (allowModel && ai && left() > 500 && fetchImpl) {
    try {
      const provider = resolveProvider(env)
      if (provider) {
        const raw = await requestModelText(provider, [
          { role: 'system', content: BRIEF_PROMPT },
          { role: 'user', content: `Idea:\n${String(prompt).slice(0, 600)}\n\nReferences:\n${referenceLines(matches) || 'none'}` }
        ], fetchImpl, {
          schema: BRIEF_SCHEMA,
          schemaName: 'design_brief',
          maxOutputTokens: 400,
          noRetry: true,
          timeoutMs: Math.min(5000, Math.max(200, left() - 100))
        })
        brief = parseBrief(raw)
      }
    } catch {
      brief = null
    }
  }
  if (!brief) brief = heuristicBrief(prompt, matches)
  const inspiredBy = topRefs(matches, builtOn?.name)
  const label = strategyLabel(strategy, builtOn)
  const result = {
    strategy,
    label,
    brief,
    inspiredBy,
    builtOn,
    html: adapted?.html || null,
    credit: creditFor({ strategy, builtOn, inspiredBy, adapted }),
    ms: Date.now() - started,
    cached: false
  }
  remember(key, result)
  onProgress?.({ phase: 'research', outputTokens: 0, label: `${label}…` })
  return result
}
