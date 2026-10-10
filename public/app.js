import { api, ensureCsrf, setCsrf } from '/client-api.js'
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
let previewUrl = ''
let freeformFrame = null
let freeformPoints = null
let freeformBest = 0
let lastGeneration = 'manual'
let authMode = 'login'
let activeTag = ''
let baseSpawnRate = null
const CATALOG = ['action', 'arcade', 'casual', 'dodge', 'guess', 'puzzle', 'reaction', 'runner', 'sandbox', 'tap']

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
    return {
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
  }
  const spec = syncSpec(lastSpec, game)
  const body = { ...game, generation: lastGeneration || 'manual', tier: 'spec', prompt }
  if (spec) body.spec = spec
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
    frame.setAttribute('sandbox', 'allow-scripts')
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
  const key = lastSpec ? `${lastSpec.biome}|${lastSpec.terrainSeed}|${lastSpec.worldSize}|${lastSpec.structure}` : ''
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

function showEditor() {
  $('ask').hidden = true
  $('discover').hidden = true
  $('editor').hidden = false
}

function showAsk() {
  $('editor').hidden = true
  $('ask').hidden = false
  $('discover').hidden = false
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
  previewUrl = game.sandboxUrl || ''
  freeformPoints = null
  lastSpec = game.spec || null
  lastGeneration = game.generation || 'manual'
  fill(game)
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
    button.textContent = tag || 'All'
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

async function refreshAccount() {
  const { user } = await api('/auth/me')
  me = user
  $('account').textContent = user ? (user.displayName || user.email) : 'Sign in'
  const adminLink = $('admin-link')
  if (adminLink) adminLink.hidden = !(user && user.admin)
  await loadMine()
  refreshOwnerButtons()
}

async function refreshMode() {
  const status = await api('/ai/status')
  const names = { gemini: 'Gemini', openai: 'OpenAI', xai: 'xAI' }
  $('gen-mode').textContent = names[status.provider] || 'Template'
}

function openAuth(mode) {
  authMode = mode
  $('auth-title').textContent = mode === 'register' ? 'Create account' : 'Sign in'
  $('auth-name-label').hidden = mode !== 'register'
  $('auth-switch').textContent = mode === 'register' ? 'Have an account? Sign in' : 'Need an account? Register'
  $('auth-password').autocomplete = mode === 'register' ? 'new-password' : 'current-password'
  $('auth-error').textContent = ''
  $('auth-dialog').hidden = false
  $('auth-email').focus()
}

$('account').addEventListener('click', async () => {
  if (!me) {
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

$('generate').addEventListener('click', async () => {
  try {
    $('generate').disabled = true
    const result = await api('/ai/generate', 'POST', { prompt: $('prompt').value, tier: $('tier').value })
    lastTier = result.tier === 'freeform' ? 'freeform' : 'spec'
    lastHtml = result.html || null
    lastSpec = result.spec || null
    previewUrl = ''
    freeformPoints = null
    let previewNote = ''
    if (lastTier === 'freeform') {
      result.game.type = 'arcade'
      try {
        const previewed = await api('/freeform/preview', 'POST', { html: result.html })
        previewUrl = previewed.url
      } catch (error) {
        if (error.status !== 401) throw error
        previewNote = 'Sign in to preview this sandbox game.'
        openAuth('login')
      }
    }
    const tags = result.tags || []
    $('tag-line').textContent = tags.join(' · ')
    if (result.safety?.flagged) setStatus('Held for review.')
    lastGeneration = result.game?.generation || 'manual'
    opened = null
    fill({ ...result.game, spec: result.spec })
    showEditor()
    toast(previewNote || 'Ready to play.')
    refreshOwnerButtons()
  } catch (error) {
    if (error.status === 401) openAuth('login')
    setStatus(error.message, true)
    toast(error.message)
  } finally {
    $('generate').disabled = false
  }
})

$('publish').addEventListener('click', async () => {
  if (!me) {
    toast('Sign in to publish')
    openAuth('register')
    return
  }
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
  } catch (error) {
    toast(error.message)
    $('gallery').textContent = 'Could not load games. Refresh to try again.'
    preview()
  }
}

boot()
