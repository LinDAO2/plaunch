import { TRADEMARK } from '../templates/catalog.js'
import { TAGS, tagsFor } from '../ai/tags.js'
import { classifySafety } from '../safety.js'
import { HttpError } from '../errors.js'
import { validateGameInput } from '../validate.js'
import { createGame } from '../repo.js'
import { bundleFiles, inspectImport } from './bundle.js'
import { fetchGithubRepo } from './github.js'
import { gateLicense, licenseLabel } from './license.js'
import { unzip } from './zip.js'
import { wantsKeyboard, wrapDocument } from './wrapper.js'

function titleOf(html) {
  const match = String(html || '').match(/<title[^>]*>([^<]{1,80})<\/title>/i)
  return match ? match[1].replace(/\s+/g, ' ').trim() : ''
}

function filesFromUpload(filename, dataBase64) {
  let buf
  try {
    buf = Buffer.from(String(dataBase64 || ''), 'base64')
  } catch {
    throw new HttpError(400, 'Upload is not valid base64', 'import_rejected')
  }
  if (!buf.length) throw new HttpError(400, 'Upload is empty', 'import_rejected')
  if (buf.length > 2 * 1024 * 1024) throw new HttpError(400, 'Upload is larger than 2MB', 'import_rejected')
  const name = String(filename || 'index.html')
  if (name.toLowerCase().endsWith('.zip') || (buf.length > 4 && buf.readUInt32LE(0) === 0x04034b50)) {
    try {
      return unzip(buf)
    } catch (error) {
      throw new HttpError(400, error.message, 'import_rejected')
    }
  }
  return { [name.split(/[/\\]/).pop() || 'index.html']: buf }
}

export async function prepareImport(input, { token = '', fetchImpl } = {}) {
  const body = input && typeof input === 'object' ? input : {}
  let files
  let detected = { license: '', author: '', source: '', sha: '' }
  if (body.dataBase64) {
    files = filesFromUpload(body.filename, body.dataBase64)
  } else if (typeof body.html === 'string' && body.html.trim()) {
    files = { 'index.html': body.html }
  } else if (typeof body.url === 'string' && body.url.trim()) {
    try {
      const fetched = await fetchGithubRepo({
        url: body.url,
        ref: body.ref || '',
        subpath: body.subpath || '',
        token,
        fetchImpl
      })
      files = fetched.files
      detected = fetched
    } catch (error) {
      throw new HttpError(400, error.message || 'GitHub import failed', 'import_rejected')
    }
  } else {
    throw new HttpError(400, 'Add a GitHub URL, paste HTML, or upload a file', 'import_rejected')
  }
  const gate = gateLicense({
    spdx: detected.license,
    confirmUnmodified: body.confirmUnmodified === true,
    confirmPermission: body.confirmPermission === true
  })
  if (!gate.ok) throw new HttpError(400, gate.error, 'import_rejected')
  const bundled = bundleFiles(files)
  if (!bundled.ok) throw new HttpError(400, bundled.errors.join('; '), 'import_rejected')
  const author = String(body.author || detected.author || 'Submitter').replace(/\s+/g, ' ').trim().slice(0, 80)
  const license = licenseLabel(gate.license, gate)
  const html = wrapDocument(bundled.html, {
    keyboard: wantsKeyboard(bundled.html),
    author,
    license,
    scoreSelector: ''
  })
  const errors = inspectImport(html)
  if (errors.length) throw new HttpError(400, errors.join('; '), 'import_rejected')
  const credit = {
    author,
    license: gate.license || 'author permission',
    source: detected.source || '',
    sha: detected.sha || '',
    origin: 'community',
    copyleftConfirmed: gate.copyleftConfirmed === true,
    permissionConfirmed: gate.permissionConfirmed === true
  }
  return { html, credit, title: titleOf(bundled.html) }
}

export function listingTags({ name, description, credit }) {
  const found = new Set(tagsFor({ name, description, mechanic: 'arcade', tier: 'freeform' }))
  found.add('community')
  if (credit?.license && credit.license !== 'author permission') found.add('opensource')
  return TAGS.filter((tag) => found.has(tag))
}

export async function importBroughtGame(db, user, input, { token = '', fetchImpl, env, safetyModel } = {}) {
  const prepared = await prepareImport(input, { token, fetchImpl })
  const name = String(input?.name || prepared.title || 'Imported game').replace(/\s+/g, ' ').trim()
  const description = String(input?.description || `Brought to Playground by ${prepared.credit.author}.`).trim()
  if (TRADEMARK.test(name) || TRADEMARK.test(description)) {
    throw new HttpError(400, 'That name is a trademark. Choose a different title.', 'import_rejected')
  }
  const fields = validateGameInput({
    name,
    description,
    type: 'arcade',
    duration: 60,
    accent: '#e6ff3a'
  })
  fields.generation = 'import'
  fields.tier = 'freeform'
  fields.freeformHtml = prepared.html
  fields.credit = prepared.credit
  fields.tags = listingTags({ name: fields.name, description: fields.description, credit: prepared.credit })
  const verdict = await classifySafety({
    text: [fields.name, fields.description, prepared.html].join('\n'),
    env,
    fetchImpl,
    model: safetyModel
  })
  fields.status = verdict.flagged ? 'pending' : 'published'
  fields.flagReason = verdict.flagged ? verdict.reason : ''
  const { game, version } = await createGame(db, fields, null, user.id)
  return { game, version, verdict }
}
