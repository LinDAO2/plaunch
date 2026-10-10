import { authorFromLicense, detectLicense } from './license.js'

const ALLOWED = new Set(['html', 'htm', 'css', 'js', 'mjs', 'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'txt', 'json'])

export function parseGithubUrl(input) {
  let url
  try {
    url = new URL(String(input || '').trim())
  } catch {
    throw new Error('GitHub URL is not valid')
  }
  if (url.protocol !== 'https:' || url.hostname !== 'github.com') {
    throw new Error('Only https://github.com repositories can be imported')
  }
  const parts = url.pathname.split('/').filter(Boolean)
  if (parts.length < 2) throw new Error('GitHub URL must include an owner and a repository')
  const owner = parts[0]
  const repo = parts[1].replace(/\.git$/, '')
  if (!/^[\w.-]+$/.test(owner) || !/^[\w.-]+$/.test(repo)) {
    throw new Error('GitHub owner or repository is not valid')
  }
  let ref = ''
  let subpath = ''
  if ((parts[2] === 'tree' || parts[2] === 'blob') && parts[3]) {
    ref = decodeURIComponent(parts[3])
    subpath = parts.slice(4).map((part) => decodeURIComponent(part)).join('/')
  }
  return { owner, repo, ref, subpath }
}

async function gh(fetchImpl, path, token) {
  const headers = {
    accept: 'application/vnd.github+json',
    'user-agent': 'playground-import'
  }
  if (token) headers.authorization = `Bearer ${token}`
  const res = await fetchImpl(`https://api.github.com${path}`, { headers })
  const text = await res.text()
  let data = null
  try { data = text ? JSON.parse(text) : null } catch { data = null }
  return { status: res.status, data }
}

function ext(name) {
  const match = String(name).toLowerCase().match(/\.([a-z0-9]+)$/)
  return match ? match[1] : ''
}

function decodeContent(data) {
  if (!data || data.encoding !== 'base64' || typeof data.content !== 'string') {
    throw new Error(`GitHub did not return file contents for ${data?.path || 'a file'}`)
  }
  return Buffer.from(data.content.replace(/\n/g, ''), 'base64')
}

export async function fetchGithubRepo({ url, ref = '', subpath = '', token = '', fetchImpl } = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('GitHub fetch is not configured')
  const parsed = parseGithubUrl(url)
  const wantedRef = ref || parsed.ref || 'HEAD'
  const wantedPath = (subpath || parsed.subpath || '').replace(/^\/+|\/+$/g, '')
  const commit = await gh(fetchImpl, `/repos/${parsed.owner}/${parsed.repo}/commits/${encodeURIComponent(wantedRef)}`, token)
  const sha = commit.data?.sha || ''
  if (commit.status !== 200 || !/^[a-f0-9]{40}$/.test(sha)) {
    throw new Error(`GitHub did not return a commit for that ref (${commit.status})`)
  }
  const licenseRes = await gh(fetchImpl, `/repos/${parsed.owner}/${parsed.repo}/license`, token)
  let licenseText = ''
  let spdx = ''
  if (licenseRes.status === 200) {
    spdx = licenseRes.data?.license?.spdx_id || ''
    try { licenseText = decodeContent(licenseRes.data).toString('utf8') } catch { licenseText = '' }
  }
  const treeRes = await gh(fetchImpl, `/repos/${parsed.owner}/${parsed.repo}/git/trees/${sha}?recursive=1`, token)
  if (treeRes.status !== 200 || !Array.isArray(treeRes.data?.tree)) {
    throw new Error(`GitHub did not return a file tree (${treeRes.status})`)
  }
  if (treeRes.data.truncated) throw new Error('Repository tree is too large to import')
  const exact = wantedPath
    ? treeRes.data.tree.find((item) => item.type === 'blob' && item.path === wantedPath)
    : null
  const prefix = !exact && wantedPath ? `${wantedPath}/` : ''
  const blobs = exact ? [exact] : treeRes.data.tree.filter((item) => {
    if (item.type !== 'blob') return false
    const path = String(item.path || '')
    if (prefix && !path.startsWith(prefix)) return false
    if (path.split('/').includes('node_modules') || path.split('/').includes('.git')) return false
    if (!ALLOWED.has(ext(path))) return false
    return true
  })
  if (blobs.length > 40) throw new Error('That folder has more than 40 files')
  const files = {}
  let total = 0
  for (const item of blobs) {
    const file = await gh(fetchImpl, `/repos/${parsed.owner}/${parsed.repo}/contents/${item.path.split('/').map(encodeURIComponent).join('/')}?ref=${sha}`, token)
    if (file.status !== 200) throw new Error(`GitHub did not return ${item.path} (${file.status})`)
    const body = decodeContent(file.data)
    total += body.length
    if (total > 2 * 1024 * 1024) throw new Error('Repository files unpack to more than 2MB')
    const rel = exact
      ? item.path.split('/').pop()
      : (prefix && item.path.startsWith(prefix) ? item.path.slice(prefix.length) : item.path)
    files[rel] = body
  }
  if (!Object.keys(files).length) throw new Error('No HTML, script, or image files were found at that path')
  if (!licenseText) {
    const licenseName = Object.keys(files).find((name) => /(^|\/)(license|licence|copying)(\.[a-z0-9]+)?$/i.test(name))
    if (licenseName) licenseText = files[licenseName].toString('utf8')
  }
  const license = detectLicense({ spdx, text: licenseText })
  const author = authorFromLicense(licenseText, parsed.owner)
  const source = `https://github.com/${parsed.owner}/${parsed.repo}/tree/${sha}${wantedPath ? `/${wantedPath}` : ''}`
  return { files, sha, license, author, source, licenseText, owner: parsed.owner, repo: parsed.repo }
}
