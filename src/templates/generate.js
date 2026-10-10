import { HttpError } from '../errors.js'
import { cleanText } from '../validate.js'
import { aiStatus, requestModelText } from '../ai/generate.js'
import { resolveProvider } from '../ai/providers.js'
import { TEMPLATES, templateById } from './catalog.js'
import { EDIT_SCHEMA, KAPLAY_CHEATSHEET, PICK_SCHEMA } from './cheatsheet.js'
import { hashText, pickTemplate } from './pick.js'
import { renderAll } from './render.js'
import { spliceTemplate } from './splice.js'

const HTML = renderAll()
const PALETTES = [
  { bg: '#000000', ink: '#e7e9ea', accent: '#E6FF3A', mute: '#2F3336' },
  { bg: '#10140c', ink: '#f4ffe1', accent: '#b6ff3a', mute: '#243018' },
  { bg: '#140c10', ink: '#ffe7ea', accent: '#ff5a7a', mute: '#301820' },
  { bg: '#0c1014', ink: '#e7f4ff', accent: '#7ad7ff', mute: '#182430' },
  { bg: '#14110c', ink: '#fff4e7', accent: '#ffb020', mute: '#302418' }
]

function blockText(html, name) {
  const start = html.indexOf(`/* PLAYGROUND ${name} */`)
  const end = html.indexOf(`/* PLAYGROUND END ${name} */`)
  if (start < 0 || end < start) return ''
  return html.slice(start, end + `/* PLAYGROUND END ${name} */`.length)
}

export function templateHtml(id) {
  return HTML[id] || ''
}

export function templateCatalog() {
  return TEMPLATES.map((spec) => ({
    id: spec.id,
    name: spec.name,
    tags: spec.tags,
    keywords: spec.keywords,
    description: spec.description,
    editable: spec.fields
  }))
}

function themed(spec, prompt, salt = 0, html = HTML[spec.id]) {
  const palette = PALETTES[(hashText(`${prompt}:${salt}`) + salt) % PALETTES.length]
  const spliced = spliceTemplate(html, { THEME: { palette } }, spec)
  return spliced.ok ? spliced.html : html
}

function pack(spec, html, env, provider, prompt, fallback) {
  const status = aiStatus(env)
  const mode = status.mode === 'ai' ? 'ai' : 'template'
  const description = cleanText(prompt, 180)
  const notice = fallback
    ? `Built on ${spec.name}. The model did not return a usable edit, so this is the template with a keyword theme.`
    : mode === 'ai'
      ? `Built on ${spec.name}. Editable blocks were filled by ${provider?.id || 'the model'}.`
      : `Built on ${spec.name}. Template mode assembled a playable game without a provider key.`
  return {
    mode,
    tier: 'freeform',
    provider: mode === 'ai' ? provider?.id || null : null,
    model: mode === 'ai' ? provider?.model || null : null,
    templateId: spec.id,
    templateName: spec.name,
    fallback: Boolean(fallback),
    tags: spec.tags,
    game: {
      name: spec.name,
      description,
      type: 'arcade',
      duration: 60,
      accent: spec.theme.palette.accent,
      tokenInterest: false,
      generation: mode === 'ai' ? `ai:${provider?.id || 'gemini'}` : 'rule-based-template',
      notice
    },
    spec: null,
    html,
    notice,
    tierReason: `Built on the ${spec.name} template.`
  }
}

function parseModelJson(raw) {
  const text = String(raw || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim()
  return JSON.parse(text)
}

function pickerMessages(prompt) {
  const list = TEMPLATES.map((spec) => `${spec.id}: ${spec.description} Keywords: ${spec.match.high.concat(spec.match.medium).join(', ')}`).join('\n')
  return [
    { role: 'system', content: 'Choose one template id for the player idea. Return JSON only: {"templateId":"...","confidence":0.8,"changes":["short change"]}. confidence is 0 to 1. changes is a short list of theme or tuning notes. Never use trademarked titles in the changes.' },
    { role: 'user', content: `Idea:\n${prompt}\n\nTemplates:\n${list}` }
  ]
}

function editMessages(spec, prompt, changes) {
  const html = HTML[spec.id]
  const blocks = ['CONFIG', 'THEME', 'RULES'].map((name) => blockText(html, name)).join('\n')
  return [
    { role: 'system', content: `You edit one Kaplay template. Return JSON only. Keys are optional: CONFIG, THEME, RULES. Include only fields you change. CONFIG values are integers inside the allowed ranges. THEME palette values are #rrggbb colors. THEME names are short original titles, never trademarked game names. RULES values are full function source starting with "function <name>". Do not return HTML. ${KAPLAY_CHEATSHEET}` },
    { role: 'user', content: `Template: ${spec.name} (${spec.id})\n${spec.description}\nIdea: ${prompt}\nChanges: ${changes.join('; ') || 'match the idea with colors, names, and a few numbers'}\nEditable fields: ${JSON.stringify(spec.fields)}\n${blocks}` }
  ]
}

export async function generateTemplateGame({ prompt, env, fetchImpl = globalThis.fetch }) {
  const idea = cleanText(prompt, 600)
  const picked = pickTemplate(idea)
  if (!picked) return null
  const status = aiStatus(env)
  let spec = picked.template
  let changes = []
  if (status.mode !== 'ai') return pack(spec, themed(spec, idea, 0), env, null, idea, false)
  const provider = resolveProvider(env)
  if (!provider) return pack(spec, themed(spec, idea, 0), env, null, idea, false)
  if (picked.confidence < 0.84) {
    try {
      const raw = await requestModelText(provider, pickerMessages(idea), fetchImpl, { schema: PICK_SCHEMA, maxOutputTokens: 300, noRetry: true })
      const choice = parseModelJson(raw)
      const chosen = templateById(choice.templateId)
      if (chosen && Number(choice.confidence) >= 0.5) {
        spec = chosen
        changes = Array.isArray(choice.changes) ? choice.changes.map((item) => cleanText(item, 80)).filter(Boolean).slice(0, 6) : []
      }
    } catch {
      return pack(spec, themed(spec, idea, 0), env, provider, idea, true)
    }
  }
  try {
    const raw = await requestModelText(provider, editMessages(spec, idea, changes), fetchImpl, { schema: EDIT_SCHEMA, maxOutputTokens: 2048, noRetry: true })
    const edits = parseModelJson(raw)
    const allowed = {}
    if (edits && typeof edits === 'object') {
      if (edits.CONFIG) allowed.CONFIG = edits.CONFIG
      if (edits.THEME) allowed.THEME = edits.THEME
      if (edits.RULES) allowed.RULES = edits.RULES
    }
    const spliced = spliceTemplate(HTML[spec.id], allowed, spec)
    if (!spliced.ok) throw new Error(spliced.error || 'splice failed')
    return pack(spec, spliced.html, env, provider, idea, false)
  } catch {
    return pack(spec, themed(spec, idea, 0), env, provider, idea, true)
  }
}

export async function restyleTemplate({ templateId, html, prompt, turn = 1, env, fetchImpl = globalThis.fetch }) {
  const fromHtml = String(html || '').match(/playground-template:\s*([a-z0-9-]+)/)
  const spec = templateById(templateId) || templateById(fromHtml?.[1] || '')
  if (!spec) throw new HttpError(400, 'Unknown template', 'validation_error')
  const base = html && html.includes(`playground-template: ${spec.id}`) ? html : HTML[spec.id]
  const status = aiStatus(env)
  if (status.mode === 'ai') {
    const provider = resolveProvider(env)
    if (provider) {
      try {
        const raw = await requestModelText(provider, [
          { role: 'system', content: `Return JSON only: {"THEME":{...}}. Change colors and names. Do not change CONFIG or RULES. No trademarked titles. ${KAPLAY_CHEATSHEET}` },
          { role: 'user', content: `Restyle ${spec.name}. Idea: ${cleanText(prompt, 200)}. Style pass ${turn}.\n${blockText(base, 'THEME')}` }
        ], fetchImpl, { schema: EDIT_SCHEMA, maxOutputTokens: 800, noRetry: true })
        const edits = parseModelJson(raw)
        if (edits?.THEME) {
          const spliced = spliceTemplate(base, { THEME: edits.THEME }, spec)
          if (spliced.ok) {
            return { html: spliced.html, templateId: spec.id, templateName: spec.name, mode: 'ai', provider: provider.id, model: provider.model }
          }
        }
      } catch {
        // A busy model still gets a local theme pass.
      }
    }
  }
  return {
    html: themed(spec, `${prompt || spec.name}:${turn}`, turn, base),
    templateId: spec.id,
    templateName: spec.name,
    mode: status.mode === 'ai' ? 'ai' : 'template',
    provider: null,
    model: null
  }
}
