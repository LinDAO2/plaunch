import { api, ensureCsrf, setCsrf } from '/client-api.js'
import { controlHint, createRuntime, typeNames } from '/mechanics.js'

const $ = (id) => document.getElementById(id)
let me = null
let current = null
let roundToken = null
let board = { scores: [], unverified: [] }
let boardTab = 'checked'
let opened = null
let games = []
let lastSpec = null
let lastGeneration = 'manual'
let authMode = 'login'

const runtime = createRuntime({
  root: $('game'),
  label: $('game-label'),
  display: $('display'),
  field: $('field'),
  play: $('play'),
  score: $('score'),
  timer: $('timer'),
  guess: $('guess-input')
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
    tokenInterest: $('token').checked
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
  const spec = syncSpec(lastSpec, game)
  const body = { ...game, generation: lastGeneration || 'manual' }
  if (spec) body.spec = spec
  return body
}

function preview() {
  const game = editor()
  runtime.setGame({ ...game, spec: lastSpec })
  current = null
  $('preview-name').textContent = game.name || 'Untitled Game'
  $('preview-description').textContent = game.description
  $('mechanic').textContent = typeNames[game.type] || game.type
  $('controls-hint').textContent = controlHint({ ...game, spec: lastSpec })
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
  $('token').checked = !!game.tokenInterest
  lastSpec = game.spec || lastSpec
  preview()
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
  $('studio').scrollIntoView({ behavior: 'smooth', block: 'start' })
  refreshOwnerButtons()
  await loadScores()
  api(`/games/${game.id}/events`, 'POST', { type: 'game_viewed', eventId: crypto.randomUUID() }).catch(() => {})
}

function render() {
  const q = $('search').value.trim().toLowerCase()
  const sort = $('sort').value
  const list = games.filter((game) => (game.name + ' ' + game.description).toLowerCase().includes(q))
    .sort((a, b) => sort === 'popular' ? b.plays - a.plays : b.createdAt.localeCompare(a.createdAt))
  $('gallery').replaceChildren()
  if (!list.length) {
    $('gallery').textContent = games.length ? 'No games match your search.' : 'No published games yet.'
    return
  }
  for (const game of list) {
    const card = document.createElement('article')
    card.className = 'card'
    card.style.borderTop = `3px solid ${game.accent}`
    const tag = document.createElement('div')
    tag.className = 'mini'
    tag.textContent = (typeNames[game.type] || game.type) + (game.tokenInterest ? ' · TOKEN INTEREST' : '')
    const title = document.createElement('h3')
    title.textContent = game.name
    const desc = document.createElement('p')
    desc.textContent = game.description
    const bottom = document.createElement('div')
    bottom.className = 'card-bottom'
    const small = document.createElement('small')
    small.textContent = `${game.plays || 0} plays`
    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = 'Play →'
    button.addEventListener('click', () => { showGame(game).catch((error) => toast(error.message)) })
    const share = document.createElement('button')
    share.type = 'button'
    share.textContent = '↗'
    share.title = 'Copy link'
    share.addEventListener('click', async () => {
      const url = `${location.origin}/g/${game.id}`
      try {
        await navigator.clipboard.writeText(url)
        toast('Game link copied')
      } catch {
        window.prompt('Copy link', url)
      }
    })
    bottom.append(small, button, share)
    card.append(tag, title, desc, bottom)
    $('gallery').append(card)
  }
}

async function loadGames() {
  const out = await api('/games')
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
  await loadMine()
  refreshOwnerButtons()
}

async function refreshMode() {
  const status = await api('/ai/status')
  $('gen-mode').textContent = status.notice
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
    toast(authMode === 'register' ? 'Account created' : 'Signed in')
  } catch (error) {
    $('auth-error').textContent = error.message
  } finally {
    $('auth-submit').disabled = false
  }
})

for (const id of ['name', 'description', 'type', 'duration', 'accent', 'token']) {
  $(id).addEventListener('input', preview)
  $(id).addEventListener('change', preview)
}

$('generate').addEventListener('click', async () => {
  try {
    $('generate').disabled = true
    const result = await api('/ai/generate', 'POST', { prompt: $('prompt').value })
    lastSpec = result.spec || null
    lastGeneration = result.game?.generation || 'manual'
    opened = null
    fill({ ...result.game, spec: result.spec, tokenInterest: false })
    $('gen-mode').textContent = result.notice
    toast(result.notice)
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
    setStatus(`Published: ${location.origin}/g/${game.id}`)
    toast('Game published. Share the page URL.')
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
  lastGeneration = 'manual'
  history.pushState({}, '', '/')
  preview()
  refreshOwnerButtons()
  setStatus('')
})

$('submit-score').addEventListener('click', async () => {
  const points = runtime.getLastScore()
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

$('search').addEventListener('input', render)
$('sort').addEventListener('change', render)
window.addEventListener('popstate', () => location.reload())

async function boot() {
  $('gallery').textContent = 'Loading games…'
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
