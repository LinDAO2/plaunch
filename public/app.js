import { api, ensureCsrf, setCsrf, xSignIn } from '/client-api.js'
import { gameCard } from '/cards.js'
import { mountWorld } from '/blocks-view.js'
import { ensureWorldSpec } from '/blocks/spec.js'
import { createRuntime, renderHint, typeNames } from '/mechanics.js'
import { fitSandboxFrame, readSandboxScore, readSandboxSize } from '/sandbox-score.js'

const $ = (id) => document.getElementById(id)
let me = null
let current = null
let roundToken = null
let board = { scores: [], unverified: [] }
let boardTab = 'checked'
let opened = null
let games = []
let lastSpec = null
let worldView = null
let worldKey = ''
let lastTier = 'spec'
let lastHtml = null
let lastTemplate = null
let styleTurn = 0
let previewUrl = ''
let freeformFrame = null
let freeformPoints = null
let freeformBest = 0
let lastGeneration = 'manual'
let lastCredit = null
let authMode = 'login'
let activeTag = ''
let baseSpawnRate = null
const CATALOG = ['action', 'arcade', 'casual', 'dodge', 'guess', 'puzzle', 'reaction', 'runner', 'sandbox', 'tap', 'opensource', 'community']
const TAG_LABELS = { opensource: 'Open source', community: 'Community' }

const runtime = createRuntime({
  root: $('game'),
  label: $('game-label'),
  display: $('display'),
  field: $('field'),
  play: $('play'),
  score: $('score'),
  timer: $('timer'),
  guess: $('guess-input'),
  goal: $('goal-banner'),
  round: $('round-over'),
  roundScore: $('round-score'),
  again: $('play-again'),
  sound: $('sound-toggle')
}, {
  onToast: toast,
  onPlayStarted() {
    if (!current) return
    roundToken = null
    api(`/games/${current.id}/events`, 'POST', { type: 'play_started', eventId: crypto.randomUUID() }).then((result) => {
      roundToken = result?.roundToken || null
      const found = games.find((game) => game.id === current.id)
      if (found) found.plays += 1
      render()
    }).catch(() => {})
  },
  onFinish({ points }) {
    $('submit-score').disabled = points === null || !current
    if (!current || points === null) return
    api(`/games/${current.id}/events`, 'POST', { type: 'play_completed', eventId: crypto.randomUUID() }).catch(() => {})
  }
})

function toast(msg) {
  $('toast').textContent = msg
  $('toast').hidden = false
  clearTimeout(toast.t)
  toast.t = setTimeout(() => { $('toast').hidden = true }, 4000)
}

function setStatus(message, isError = false) {
  $('status').textContent = message
  if (message) $('status').dataset.state = isError ? 'error' : 'ok'
  else delete $('status').dataset.state
}

function editor() {
  return {
    name: $('name').value.trim(),
    description: $('description').value.trim(),
    type: $('type').value,
    duration: Number($('duration').value),
    accent: $('accent').value,
    tokenInterest: false
  }
}

function ensureDuration(value) {
  const select = $('duration')
  const v = String(value)
  if (![...select.options].some((option) => option.value === v)) {
    const option = document.createElement('option')
    option.value = v
    option.textContent = `${v} seconds`
    select.append(option)
  }
  select.value = v
}

function syncSpec(spec, game) {
  if (!spec) return undefined
  return {
    ...spec,
    name: game.name,
    description: game.description,
    runtime: game.type,
    duration: game.duration,
    accent: game.accent,
    scoring: { ...(spec.scoring || {}), direction: game.type === 'reaction' ? 'lower' : 'higher' }
  }
}

function payload() {
  const game = editor()
  const prompt = $('prompt').value
  if (lastTier === 'freeform' && lastHtml) {
    const body = {
      name: game.name,
      description: game.description,
      type: 'arcade',
      duration: game.duration,
      accent: game.accent,
      tokenInterest: game.tokenInterest,
      generation: lastGeneration || 'rule-based-template',
      tier: 'freeform',
      html: lastHtml,
      prompt
    }
    if (lastCredit) body.credit = lastCredit
    return body
  }
  const spec = syncSpec(lastSpec, game)
  const body = { ...game, generation: lastGeneration || 'manual', tier: 'spec', prompt }
  if (spec) body.spec = spec
  if (lastCredit) body.credit = lastCredit
  return body
}

function showSandbox(url) {
  const field = $('field')
  field.classList.add('freeform-on')
  let frame = field.querySelector('iframe.freeform-frame')
  if (!frame) {
    field.replaceChildren()
    frame = document.createElement('iframe')
    frame.className = 'freeform-frame'
    frame.setAttribute('sandbox', 'allow-scripts allow-pointer-lock')
    frame.referrerPolicy = 'no-referrer'
    frame.title = 'Freeform game'
    field.append(frame)
  }
  if (frame.getAttribute('src') !== url) frame.src = url
  freeformFrame = frame
  $('game').classList.add('freeform-on')
  $('display').hidden = true
  $('game-label').hidden = true
  $('timer').hidden = true
  $('play').hidden = true
  $('score').textContent = `Score: ${freeformBest}`
  $('mechanic').textContent = 'FREEFORM'
  renderHint($('controls-hint'), { tier: 'freeform' })
}

function showWorldPreview(game) {
  try { lastSpec = ensureWorldSpec(game, lastSpec) } catch { /* keep the last valid world spec */ }
  const key = lastSpec ? `${lastSpec.biome}|${lastSpec.terrainSeed}|${lastSpec.worldSize}|${lastSpec.structure}|${lastSpec.terrain?.islands ? 1 : 0}|${lastSpec.terrain?.caves ? 1 : 0}|${lastSpec.cycle || ''}` : ''
  $('field').classList.remove('freeform-on')
  $('game').classList.remove('freeform-on')
  $('display').hidden = true
  $('game-label').hidden = true
  $('timer').hidden = true
  $('play').hidden = true
  $('play').disabled = true
  document.body.classList.add('world-play')
  if (!worldView || worldKey !== key) {
    worldView?.destroy()
    worldView = null
    worldKey = key
    worldView = mountWorld({ spec: lastSpec, field: $('field'), offline: true })
  }
  current = null
  $('preview-name').textContent = game.name || 'Block World'
  $('preview-description').textContent = game.description
  $('mechanic').textContent = typeNames.world
  renderHint($('controls-hint'), { ...game, type: 'world', spec: lastSpec })
  $('leaders').textContent = 'Blocks placed and time played show on the play page. They stay unverified.'
  $('leaderboard-scope').textContent = 'Unverified'
  const share = $('share-x')
  if (share) share.hidden = true
}

function preview() {
  const game = editor()
  if (lastTier === 'freeform') {
    clearWorld()
    current = null
    $('preview-name').textContent = game.name || 'Untitled Game'
    $('preview-description').textContent = game.description
    $('mechanic').textContent = 'FREEFORM'
    renderHint($('controls-hint'), { tier: 'freeform' })
    board = { scores: [], unverified: [] }
    boardTab = 'checked'
    $('leaders').textContent = 'Publish or open a game to see scores.'
    $('leaderboard-scope').textContent = 'Preview mode'
    $('tab-checked')?.classList.add('on')
    $('tab-unverified')?.classList.remove('on')
    $('submit-score').disabled = true
    const share = $('share-x')
    if (share) share.hidden = true
    if (previewUrl) {
      showSandbox(previewUrl)
      return
    }
    $('game').classList.add('freeform-on')
    $('field').classList.add('freeform-on')
    $('field').replaceChildren()
    $('display').hidden = true
    $('game-label').hidden = true
    $('timer').hidden = true
    $('play').hidden = true
    $('score').textContent = `Score: ${freeformBest}`
    freeformFrame = null
    return
  }
  if (game.type === 'world') {
    showWorldPreview(game)
    return
  }
  if (lastSpec?.runtime === 'world') lastSpec = null
  clearWorld()
  $('field').classList.remove('freeform-on')
  $('game').classList.remove('freeform-on')
  $('display').hidden = false
  $('game-label').hidden = false
  $('timer').hidden = false
  freeformFrame = null
  freeformBest = 0
  runtime.setGame({ ...game, spec: lastSpec })
  current = null
  $('preview-name').textContent = game.name || 'Untitled Game'
  $('preview-description').textContent = game.description
  $('mechanic').textContent = typeNames[game.type] || game.type
  renderHint($('controls-hint'), { ...game, spec: lastSpec })
  board = { scores: [], unverified: [] }
  boardTab = 'checked'
  $('leaders').textContent = 'Publish or open a game to see scores.'
  $('leaderboard-scope').textContent = 'Preview mode'
  $('tab-checked')?.classList.add('on')
  $('tab-unverified')?.classList.remove('on')
  $('submit-score').disabled = true
  const share = $('share-x')
  if (share) share.hidden = true
}

function fill(game) {
  $('name').value = game.name
  $('description').value = game.description || ''
  $('type').value = game.type
  ensureDuration(game.duration)
  $('accent').value = game.accent
  if (game.spec !== undefined) {
    lastSpec = game.spec
    baseSpawnRate = game.spec?.spawn?.rate ?? null
  }
  const level = game.spec?.difficulty
  $('difficulty').value = level === 'easy' || level === 'hard' ? level : 'normal'
  preview()
}

function readTemplate(html) {
  const match = String(html || '').match(/playground-template:\s*([a-z0-9-]+)\s*\|\s*([^<]+?)\s*-->/)
  if (!match) return null
  return { id: match[1], name: match[2].trim() }
}

function paintBuiltOn() {
  const node = $('built-on')
  if (!node) return
  if (!lastTemplate) {
    node.hidden = true
    return
  }
  node.hidden = false
  $('built-on-name').textContent = lastTemplate.name
}

function paintResearch(research, credit) {
  const strategy = $('research-strategy')
  const inspired = $('inspired-by')
  const label = research?.label || ''
  if (strategy) {
    strategy.hidden = !label
    strategy.textContent = label
  }
  const list = credit?.inspiredBy?.length ? credit.inspiredBy : (research?.inspiredBy || [])
  if (inspired) {
    inspired.hidden = !list.length
    inspired.textContent = list.length
      ? `Inspired by: ${list.map((item) => item.license ? `${item.name} (${item.license})` : item.name).join(', ')}`
      : ''
  }
}

function showEditor() {
  $('ask').hidden = true
  $('discover').hidden = true
  $('editor').hidden = false
  paintBuiltOn()
}

function showAsk() {
  $('editor').hidden = true
  $('ask').hidden = false
  $('discover').hidden = false
  lastTemplate = null
  lastCredit = null
  styleTurn = 0
  paintBuiltOn()
  paintResearch(null, null)
}

function clearWorld() {
  worldView?.destroy()
  worldView = null
  worldKey = ''
  document.body.classList.remove('world-play')
  $('field')?.classList.remove('world-on')
  const play = $('play')
  if (play) play.disabled = false
}

function applyDifficulty() {
  if (!lastSpec) return
  const level = $('difficulty').value
  const next = { ...lastSpec, difficulty: level }
  if (lastSpec.runtime === 'world') {
    next.worldSize = level === 'easy' ? 'small' : level === 'hard' ? 'large' : 'medium'
  }
  if (lastSpec.spawn && baseSpawnRate) {
    const factor = level === 'easy' ? 0.7 : level === 'hard' ? 1.4 : 1
    next.spawn = { ...lastSpec.spawn, rate: Math.max(0.2, Math.round(baseSpawnRate * factor * 100) / 100) }
  }
  lastSpec = next
}

function refreshOwnerButtons() {
  const isOwner = !!(me && opened && opened.ownerId && opened.ownerId === me.id)
  $('update').hidden = !isOwner
  $('archive').hidden = !isOwner || opened.status === 'archived'
  $('report-toggle').hidden = !opened
}

function paintBoard() {
  const rows = boardTab === 'unverified' ? board.unverified : board.scores
  $('tab-checked').classList.toggle('on', boardTab === 'checked')
  $('tab-unverified').classList.toggle('on', boardTab === 'unverified')
  $('leaders').replaceChildren()
  if (!current) {
    $('leaders').textContent = 'Publish or open a game to see scores.'
    return
  }
  if (!rows?.length) {
    $('leaders').textContent = boardTab === 'checked' ? 'No checked scores yet.' : 'No unverified scores.'
    return
  }
  for (const score of rows) {
    const row = document.createElement('div')
    row.className = 'leader-row'
    const name = document.createElement('span')
    const value = document.createElement('b')
    const flag = document.createElement('span')
    name.textContent = `#${score.rank} ${score.name}`
    value.textContent = score.mechanic === 'reaction' ? `${score.points} ms` : String(score.points)
    const assurance = score.assurance === 'checked' ? 'checked' : 'unverified'
    flag.className = assurance
    flag.textContent = assurance
    row.append(name, value, flag)
    $('leaders').append(row)
  }
}

async function loadScores(prefer) {
  if (!current) return
  const listed = await api(`/games/${current.id}/scores`)
  board = { scores: listed.scores || [], unverified: listed.unverified || [] }
  if (prefer) boardTab = prefer
  paintBoard()
}

$('tab-checked').addEventListener('click', () => { boardTab = 'checked'; paintBoard() })
$('tab-unverified').addEventListener('click', () => { boardTab = 'unverified'; paintBoard() })

async function showGame(summary) {
  const { game } = await api(`/games/${summary.id}`)
  opened = game
  lastTier = game.tier === 'freeform' ? 'freeform' : 'spec'
  lastHtml = game.html || null
  lastTemplate = readTemplate(game.html)
  const remixRow = $('remix-row')
  if (remixRow) remixRow.hidden = !(game.remix && !game.canEdit)
  styleTurn = 0
  previewUrl = game.sandboxUrl || ''
  freeformPoints = null
  lastSpec = game.spec || null
  lastGeneration = game.generation || 'manual'
  lastCredit = game.credit || null
  fill(game)
  paintResearch(null, game.credit)
  current = game
  history.pushState({}, '', `/g/${game.id}`)
  $('leaderboard-scope').textContent = game.type === 'reaction' ? 'Fastest reaction · top 20' : 'Top 20 scores'
  const share = $('share-x')
  if (share) {
    if (game.status === 'published') {
      const intent = new URL('https://x.com/intent/post')
      const blurb = game.description ? `Play ${game.name} — ${game.description}` : `Play ${game.name} on Playground`
      intent.searchParams.set('text', blurb.slice(0, 240))
      intent.searchParams.set('url', `${location.origin}/r/${game.id}`)
      share.href = intent.toString()
      share.hidden = false
    } else {
      share.hidden = true
    }
  }
  showEditor()
  $('editor').scrollIntoView({ behavior: 'smooth', block: 'start' })
  refreshOwnerButtons()
  await loadScores()
  api(`/games/${game.id}/events`, 'POST', { type: 'game_viewed', eventId: crypto.randomUUID() }).catch(() => {})
}

function render() {
  const list = games
  $('gallery').replaceChildren()
  if (!list.length) {
    const q = $('search').value.trim()
    const sort = $('sort').value
    $('gallery').textContent = q ? 'No games match your search.' : sort === 'featured' ? 'No featured games yet.' : 'No published games yet.'
    return
  }
  for (const game of list) {
    const { card, bottom, share } = gameCard(game, {
      label: typeNames[game.type] || game.type,
      playHref: `/play/${game.id}`
    })
    const small = document.createElement('small')
    small.textContent = `${game.plays || 0} plays`
    share.addEventListener('click', async () => {
      const url = `${location.origin}/r/${game.id}`
      try {
        await navigator.clipboard.writeText(url)
        toast('Link copied')
      } catch {
        window.prompt('Share link', url)
      }
    })
    bottom.append(small)
    $('gallery').append(card)
  }
}

function paintTags() {
  const row = $('tag-row')
  if (!row) return
  row.replaceChildren()
  for (const tag of ['', ...CATALOG]) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'tag' + (activeTag === tag ? ' on' : '')
    button.textContent = TAG_LABELS[tag] || tag || 'All'
    button.addEventListener('click', () => {
      activeTag = tag
      paintTags()
      loadGames().catch((error) => { $('gallery').textContent = error.message })
    })
    row.append(button)
  }
}

async function loadGames() {
  const params = new URLSearchParams({ view: $('sort').value || 'new' })
  const q = $('search').value.trim()
  if (q) params.set('q', q)
  if (activeTag) params.set('tag', activeTag)
  const out = await api(`/discover?${params}`)
  games = out.games
  render()
}

async function loadMine() {
  if (!me) {
    $('mine').hidden = true
    return
  }
  const { games: mine } = await api('/me/games')
  $('mine').hidden = false
  $('mine-list').replaceChildren()
  if (!mine.length) {
    $('mine-list').textContent = 'You have not published a game yet.'
    return
  }
  for (const game of mine) {
    const row = document.createElement('button')
    row.type = 'button'
    row.className = 'mine-row'
    row.textContent = `${game.name} · ${game.status}`
    row.addEventListener('click', () => { showGame(game).catch((error) => toast(error.message)) })
    $('mine-list').append(row)
  }
}

function accountLabel(user) {
  if (user && !user.guest) return user.displayName || user.email
  return 'Save your games'
}

async function refreshAccount() {
  const { user } = await api('/auth/me')
  me = user
  $('account').textContent = accountLabel(user)
  const adminLink = $('admin-link')
  if (adminLink) adminLink.hidden = !(user && user.admin)
  await loadMine()
  refreshOwnerButtons()
}

async function refreshMode() {
  const status = await api('/ai/status')
  const names = { gemini: 'Gemini', openai: 'OpenAI', xai: 'xAI', anthropic: 'Anthropic' }
  $('gen-mode').textContent = names[status.provider] || 'Template'
  const off = $('ai-off')
  if (off) off.hidden = status.mode === 'ai'
}

function openAuth(mode) {
  authMode = mode
  $('auth-title').textContent = mode === 'register' ? 'Create account' : 'Save your games'
  $('auth-name-label').hidden = mode !== 'register'
  $('auth-switch').textContent = mode === 'register' ? 'Have an account? Use email' : 'Need an account? Register'
  const xButton = $('auth-x')
  if (xButton) xButton.hidden = !xSignIn
  $('auth-password').autocomplete = mode === 'register' ? 'new-password' : 'current-password'
  $('auth-error').textContent = ''
  $('auth-dialog').hidden = false
  $('auth-email').focus()
}

$('account').addEventListener('click', async () => {
  if (!me || me.guest) {
    openAuth('login')
    return
  }
  try {
    await api('/auth/logout', 'POST', {})
    setCsrf('')
    await ensureCsrf()
    me = null
    opened = null
    current = null
    await refreshAccount()
    refreshOwnerButtons()
    toast('Signed out')
  } catch (error) {
    toast(error.message)
  }
})

$('auth-switch').addEventListener('click', () => openAuth(authMode === 'register' ? 'login' : 'register'))
$('auth-x').addEventListener('click', () => { location.href = '/api/auth/x/start' })
$('auth-cancel').addEventListener('click', () => { $('auth-dialog').hidden = true })
$('auth-form').addEventListener('submit', async (event) => {
  event.preventDefault()
  $('auth-error').textContent = ''
  const path = authMode === 'register' ? '/auth/register' : '/auth/login'
  const body = { email: $('auth-email').value.trim(), password: $('auth-password').value }
  if (authMode === 'register') body.displayName = $('auth-name').value
  try {
    $('auth-submit').disabled = true
    await api(path, 'POST', body)
    $('auth-dialog').hidden = true
    $('auth-password').value = ''
    await refreshAccount()
    if (lastTier === 'freeform' && lastHtml && !previewUrl) {
      const previewed = await api('/freeform/preview', 'POST', { html: lastHtml })
      previewUrl = previewed.url
      preview()
    }
    toast(authMode === 'register' ? 'Account created' : 'Signed in')
  } catch (error) {
    $('auth-error').textContent = error.message
  } finally {
    $('auth-submit').disabled = false
  }
})

for (const id of ['name', 'description', 'type', 'duration', 'accent']) {
  $(id).addEventListener('input', preview)
  $(id).addEventListener('change', preview)
}
$('difficulty').addEventListener('change', () => {
  applyDifficulty()
  preview()
})
for (const chip of document.querySelectorAll('.idea')) {
  chip.addEventListener('click', () => {
    $('prompt').value = chip.dataset.prompt || ''
    $('prompt').focus()
  })
}
for (const sky of document.querySelectorAll('.sky')) {
  sky.addEventListener('click', () => {
    const prompt = $('prompt')
    const note = `${sky.dataset.sky} sky`
    if (!prompt.value.toLowerCase().includes(note)) prompt.value = `${prompt.value} ${note}`.trim()
    prompt.focus()
  })
}
const promptExamples = ['a forest lake with a cabin to build', 'snowy mountain peaks', 'a desert canyon', 'a beach cove', 'a shared watchtower', 'a clear lake']
let promptExample = 0
setInterval(() => {
  const prompt = $('prompt')
  if (!prompt || document.activeElement === prompt || prompt.value) return
  promptExample = (promptExample + 1) % promptExamples.length
  prompt.placeholder = promptExamples[promptExample]
}, 2800)

$('remix')?.addEventListener('click', async () => {
  if (!opened?.id) return
  try {
    $('remix').disabled = true
    const result = await api(`/games/${opened.id}/remix`, 'POST', {})
    location.href = `/g/${result.game.id}`
  } catch (error) {
    toast(error.message || 'Could not remix this game.')
    $('remix').disabled = false
  }
})

$('restyle')?.addEventListener('click', async () => {
  if (!lastTemplate || !lastHtml) return
  try {
    $('restyle').disabled = true
    styleTurn += 1
    const result = await api('/ai/restyle', 'POST', {
      templateId: lastTemplate.id,
      html: lastHtml,
      prompt: $('prompt').value,
      turn: styleTurn
    })
    lastHtml = result.html
    lastTemplate = { id: result.templateId, name: result.templateName }
    paintBuiltOn()
    const previewed = await api('/freeform/preview', 'POST', { html: lastHtml })
    previewUrl = previewed.url
    showSandbox(previewUrl)
    toast('New style ready.')
  } catch (error) {
    setStatus(error.message, true)
  } finally {
    $('restyle').disabled = false
  }
})

function showProgress(label, tokens = 0) {
  const box = $('gen-progress')
  if (!box) return
  box.hidden = false
  const text = $('gen-progress-label')
  if (text) text.textContent = label || 'Writing the game…'
  const bar = $('gen-progress-bar')
  if (bar) bar.style.width = `${Math.min(100, (Number(tokens) || 0) / 8000 * 100)}%`
}

function hideProgress() {
  const box = $('gen-progress')
  if (box) box.hidden = true
}

async function readGenerateStream(res) {
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  let result = null
  let failed = null
  const take = (block) => {
    let event = 'message'
    const dataLines = []
    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim()
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim())
    }
    if (!dataLines.length) return
    let data = {}
    try { data = JSON.parse(dataLines.join('\n')) } catch { data = {} }
    if (event === 'progress') {
      showProgress(data.label || 'Writing the game…', Number(data.outputTokens) || 0)
    } else if (event === 'result') {
      result = data
    } else if (event === 'error') {
      failed = new Error(data.error || 'Request failed')
      failed.status = 502
      failed.code = data.code
      failed.upstream = data.upstream || null
    }
  }
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    let split = buf.indexOf('\n\n')
    while (split >= 0) {
      take(buf.slice(0, split))
      buf = buf.slice(split + 2)
      split = buf.indexOf('\n\n')
    }
  }
  if (buf.trim()) take(buf)
  if (failed) throw failed
  if (!result) throw new Error('The generator stream ended early')
  return result
}

$('generate').addEventListener('click', async () => {
  try {
    $('generate').disabled = true
    showProgress('Matching block worlds…', 0)
    const headers = { 'content-type': 'application/json', accept: 'text/event-stream', 'x-csrf-token': await ensureCsrf() }
    const res = await fetch('/api/ai/generate', {
      method: 'POST',
      headers,
      credentials: 'same-origin',
      body: JSON.stringify({ prompt: $('prompt').value, tier: 'auto', kind: 'world' })
    })
    const type = res.headers.get('content-type') || ''
    let result
    if (type.includes('text/event-stream') && res.body) {
      result = await readGenerateStream(res)
    } else {
      const data = await res.json().catch(() => ({}))
      if (data && data.csrfToken) setCsrf(data.csrfToken)
      if (!res.ok) {
        const error = new Error(data.error || 'Request failed')
        error.status = res.status
        error.code = data.code
        error.upstream = data.upstream || null
        throw error
      }
      result = data
    }
    if (result.mode === 'template' && $('ai-off')) $('ai-off').hidden = false
    lastTier = result.tier === 'freeform' ? 'freeform' : 'spec'
    lastHtml = result.html || null
    lastTemplate = result.templateId ? { id: result.templateId, name: result.templateName || result.templateId } : readTemplate(result.html)
    styleTurn = 0
    lastSpec = result.spec || null
    previewUrl = ''
    freeformPoints = null
    if (lastTier === 'freeform') {
      result.game.type = 'arcade'
      const previewed = await api('/freeform/preview', 'POST', { html: result.html, generation: result.game?.generation })
      previewUrl = previewed.url
    }
    const tags = result.tags || []
    $('tag-line').textContent = tags.join(' · ')
    if (result.safety?.flagged) setStatus('Held for review.')
    lastGeneration = result.game?.generation || 'manual'
    lastCredit = result.credit || null
    opened = null
    fill({ ...result.game, spec: result.spec })
    showEditor()
    paintResearch(result.research, result.credit)
    toast('Ready to play.')
    refreshOwnerButtons()
  } catch (error) {
    const up = error.upstream
    const where = up ? ` [${up.provider || 'ai'} ${up.model || ''} · HTTP ${up.status}${up.code ? ' ' + up.code : ''}]` : ''
    setStatus(error.message + (where && !error.message.includes('HTTP ') ? where : ''), true)
    toast(error.message)
  } finally {
    hideProgress()
    $('generate').disabled = false
  }
})

$('publish').addEventListener('click', async () => {
  try {
    $('publish').disabled = true
    const { game } = await api('/games', 'POST', payload())
    if (game.status === 'pending') {
      setStatus('Held for review. It stays off Discover until a moderator approves it.')
      toast('Held for review.')
    } else {
      setStatus(`Published: ${location.origin}/g/${game.id}`)
      toast('Game published. Share the page URL.')
    }
    await loadGames()
    await loadMine()
    await showGame(game)
  } catch (error) {
    setStatus(error.message, true)
    toast(error.message)
  } finally {
    $('publish').disabled = false
  }
})

$('update').addEventListener('click', async () => {
  if (!opened) return
  try {
    $('update').disabled = true
    const { game } = await api(`/games/${opened.id}`, 'PATCH', payload())
    setStatus(`Saved ${game.name}`)
    toast('Game updated')
    await loadGames()
    await loadMine()
    await showGame(game)
  } catch (error) {
    setStatus(error.message, true)
    toast(error.message)
  } finally {
    $('update').disabled = false
  }
})

$('archive').addEventListener('click', async () => {
  if (!opened) return
  try {
    $('archive').disabled = true
    await api(`/games/${opened.id}/archive`, 'POST', {})
    toast('Game archived')
    opened = null
    current = null
    setStatus('Archived. It is hidden from Discover.')
    await loadGames()
    await loadMine()
    refreshOwnerButtons()
    preview()
  } catch (error) {
    toast(error.message)
  } finally {
    $('archive').disabled = false
  }
})

$('new-game').addEventListener('click', () => {
  opened = null
  current = null
  lastSpec = null
  lastTier = 'spec'
  lastHtml = null
  previewUrl = ''
  freeformFrame = null
  freeformPoints = null
  lastGeneration = 'manual'
  history.pushState({}, '', '/')
  showAsk()
  preview()
  refreshOwnerButtons()
  setStatus('')
})

$('play').addEventListener('click', (event) => {
  if (lastTier !== 'freeform') return
  event.preventDefault()
  event.stopImmediatePropagation()
}, true)

window.addEventListener('message', (event) => {
  const size = readSandboxSize(event, freeformFrame)
  if (size) {
    fitSandboxFrame(freeformFrame, size)
    return
  }
  const points = readSandboxScore(event, freeformFrame)
  if (points === null) return
  freeformBest = Math.max(freeformBest, points)
  freeformPoints = freeformBest
  $('score').textContent = `Score: ${freeformBest}`
  $('submit-score').disabled = !current
})

$('tier').addEventListener('change', () => {
  const choice = $('tier').value
  $('tier-note').textContent = choice === 'freeform'
    ? 'The next idea becomes a sandbox game.'
    : choice === 'spec'
      ? 'The next idea becomes a built-in game.'
      : 'Auto picks a built-in game when the idea fits, and a sandbox game otherwise.'
})

$('submit-score').addEventListener('click', async () => {
  const points = lastTier === 'freeform' ? freeformPoints : runtime.getLastScore()
  if (!current || points === null) return
  try {
    const body = {
      name: $('player').value || 'Anonymous',
      points,
      mechanic: current.type
    }
    if (roundToken) body.roundToken = roundToken
    const saved = await api(`/games/${current.id}/scores`, 'POST', body)
    roundToken = null
    $('submit-score').disabled = true
    toast(saved.assurance === 'checked' ? 'Score checked and posted.' : 'Score submitted. It is stored as unverified.')
    await loadScores(saved.assurance === 'checked' ? 'checked' : 'unverified')
  } catch (error) {
    toast(error.message)
  }
})

$('report-toggle').addEventListener('click', () => { $('report-box').hidden = !$('report-box').hidden })
$('report-send').addEventListener('click', async () => {
  if (!opened) return
  try {
    await api('/abuse-reports', 'POST', {
      gameId: opened.id,
      reason: $('report-reason').value,
      details: $('report-details').value
    })
    $('report-details').value = ''
    $('report-box').hidden = true
    toast('Report sent. Thank you.')
  } catch (error) {
    toast(error.message)
  }
})

$('share-x').addEventListener('click', () => {
  if (!$('share-x').href || $('share-x').hidden || !opened) return
  api(`/games/${opened.id}/share`, 'POST', {}).catch(() => {})
})

$('search').addEventListener('input', () => { loadGames().catch((error) => toast(error.message)) })
$('sort').addEventListener('change', () => { loadGames().catch((error) => toast(error.message)) })
window.addEventListener('popstate', () => location.reload())

async function boot() {
  $('gallery').textContent = 'Loading games…'
  paintTags()
  try {
    await ensureCsrf()
    await refreshMode()
    await refreshAccount()
    await loadGames()
    const match = location.pathname.match(/^\/g\/([a-z0-9-]+)$/)
    if (match) await showGame({ id: match[1] })
    else preview()
    if (new URLSearchParams(location.search).get('save') === '1' && (!me || me.guest)) openAuth('login')
  } catch (error) {
    toast(error.message)
    $('gallery').textContent = 'Could not load games. Refresh to try again.'
    preview()
  }
}

function bindImport() {
  const open = $('bring-open')
  const dialog = $('bring-dialog')
  const form = $('bring-form')
  if (!open || !dialog || !form) return
  open.addEventListener('click', () => dialog.showModal())
  $('bring-cancel').addEventListener('click', () => dialog.close())
  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    const status = $('bring-status')
    status.textContent = 'Importing…'
    try {
      const payload = {
        name: $('bring-name').value,
        author: $('bring-author').value,
        url: $('bring-url').value,
        ref: $('bring-ref').value,
        subpath: $('bring-subpath').value,
        html: $('bring-html').value,
        confirmUnmodified: $('bring-unmodified').checked,
        confirmPermission: $('bring-permission').checked
      }
      const file = $('bring-file').files && $('bring-file').files[0]
      if (file) {
        if (file.size > 2 * 1024 * 1024) throw new Error('File is larger than 2MB')
        const bytes = new Uint8Array(await file.arrayBuffer())
        let binary = ''
        for (let i = 0; i < bytes.length; i += 0x8000) {
          binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
        }
        payload.filename = file.name
        payload.dataBase64 = btoa(binary)
      }
      const data = await api('/import', 'POST', payload)
      dialog.close()
      location.href = `/g/${data.game.id}`
    } catch (error) {
      status.textContent = error.message || 'Import failed'
    }
  })
}

bindImport()
boot()
