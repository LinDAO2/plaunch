export const PERMISSIVE = new Set([
  'MIT',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'Apache-2.0',
  'ISC',
  'Zlib',
  'Unlicense',
  'CC0-1.0',
  'WTFPL'
])

export const COPYLEFT = new Set([
  'GPL-2.0',
  'GPL-2.0-only',
  'GPL-2.0-or-later',
  'GPL-3.0',
  'GPL-3.0-only',
  'GPL-3.0-or-later',
  'AGPL-3.0',
  'AGPL-3.0-only',
  'AGPL-3.0-or-later',
  'LGPL-2.1',
  'LGPL-2.1-only',
  'LGPL-2.1-or-later',
  'LGPL-3.0',
  'LGPL-3.0-only',
  'LGPL-3.0-or-later',
  'MPL-2.0'
])

const NO_LICENSE = new Set(['', 'NOASSERTION', 'OTHER', 'NONE'])

export function normalizeSpdx(value) {
  const id = String(value || '').trim()
  if (NO_LICENSE.has(id.toUpperCase())) return ''
  return id
}

export function detectLicense({ spdx = '', text = '' } = {}) {
  const fromSpdx = normalizeSpdx(spdx)
  if (fromSpdx && (PERMISSIVE.has(fromSpdx) || COPYLEFT.has(fromSpdx))) return fromSpdx
  const body = String(text || '')
  if (/CC0|creative commons zero/i.test(body)) return 'CC0-1.0'
  if (/do what the fuck you want|WTFPL/i.test(body)) return 'WTFPL'
  if (/this is free and unencumbered|the unlicense/i.test(body)) return 'Unlicense'
  if (/apache license/i.test(body)) return 'Apache-2.0'
  if (/isc license/i.test(body)) return 'ISC'
  if (/zlib license/i.test(body)) return 'Zlib'
  if (/gnu affero/i.test(body)) return 'AGPL-3.0-only'
  if (/gnu lesser/i.test(body)) return 'LGPL-3.0-only'
  if (/mozilla public license/i.test(body)) return 'MPL-2.0'
  if (/gnu general public license/i.test(body)) {
    return /version 2/i.test(body) && !/version 3/i.test(body) ? 'GPL-2.0-only' : 'GPL-3.0-only'
  }
  if (/bsd[- ]2-clause|simplified bsd/i.test(body)) return 'BSD-2-Clause'
  if (/bsd[- ]3-clause|neither the name/i.test(body)) return 'BSD-3-Clause'
  if (/permission is hereby granted,?\s+free of charge/i.test(body) || /\bmit license\b/i.test(body)) return 'MIT'
  return fromSpdx
}

export function authorFromLicense(text, fallback = '') {
  const match = String(text || '').match(/copyright\s*(?:\(c\))?\s*(?:\d{4}(?:\s*[-–]\s*\d{4})?)?\s*,?\s*([^\n]{2,80})/i)
  if (!match) return String(fallback || '').trim()
  return match[1].replace(/\s+all rights reserved\.?$/i, '').replace(/\.$/, '').trim()
}

export function gateLicense({ spdx = '', confirmUnmodified = false, confirmPermission = false } = {}) {
  const license = normalizeSpdx(spdx)
  if (PERMISSIVE.has(license)) {
    return { ok: true, license, copyleftConfirmed: false, permissionConfirmed: false }
  }
  if (COPYLEFT.has(license)) {
    if (confirmUnmodified !== true) {
      return {
        ok: false,
        license,
        error: `${license} can be hosted only if you confirm the game is unmodified and the source link stays visible`
      }
    }
    return { ok: true, license, copyleftConfirmed: true, permissionConfirmed: false }
  }
  if (!license) {
    if (confirmPermission !== true) {
      return {
        ok: false,
        license: '',
        error: 'No license was found. Check “I am the author / I have permission” to continue'
      }
    }
    return { ok: true, license: '', copyleftConfirmed: false, permissionConfirmed: true }
  }
  return { ok: false, license, error: `License ${license} is not one this site can host` }
}

export function licenseLabel(license, { permissionConfirmed = false } = {}) {
  if (license) return license
  if (permissionConfirmed) return 'author permission'
  return 'unspecified'
}
