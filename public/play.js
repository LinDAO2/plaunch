import { attachArenaBridge } from '/arena-bridge.js'
import { api, ensureCsrf } from '/client-api.js'
import { mountWorld } from '/blocks-view.js'
import { createRuntime, renderHint, typeNames } from '/mechanics.js'
import { fitSandboxFrame, readSandboxScore, readSandboxSize } from '/sandbox-score.js'

const $ = (id) => document.getElementById(id)
const slug = (location.pathname.match(/^\/play\/([a-z0-9-]+)$/) || [])[1]
const embed = new URLSearchParams(location.search).get('embed') === '1'
let current = null
let roundToken = null
let freeformFrame = null
let arenaBridge = null
let freeformPoints = null
let freeformBest = 0
let board = { scores: [], unverified: [] }
let boardTab = 'checked'
let worldBoardTimer = null

function formatPlayed(ms) {
  const seconds = Math.max(0, Math.round(Number(ms) / 1000))
  if (seconds < 60) return `${seconds}s`
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
}

function renderWorldBoard(data) {
  $('leaderboard-scope').textContent = `${data.online || 0} online · unverified`
  if ($('tab-checked')) $('tab-checked').hidden = true
  if ($('tab-unverified')) $('tab-unverified').hidden = true
  const note = $('board-note')
  if (note) note.textContent = 'Blocks placed and time played are unverified. The server counts them.'
  const leaders = $('leaders')
  leaders.replaceChildren()
  if (!data.stats?.length) {
    leaders.textContent = 'No blocks placed yet. Time in the world still counts.'
    return
  }
  for (const row of data.stats) {
    const line = document.createElement('p')
    line.textContent = `${row.name} · ${row.blocksPlaced} blocks placed · ${formatPlayed(row.timePlayedMs)} played · unverified`
    leaders.append(line)
  }
}

async function loadWorldBoard() {
  const data = await api(`/games/${slug}/world`)
  renderWorldBoard(data)
}

function toast(msg) {
  const el = $('toast')
  el.textContent = msg
  el.hidden = false
  clearTimeout(toast.t)
  toast.t = setTimeout(() => { el.hidden = true }, 4000)
}

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
    api(`/games/${current.id}/events`, 'POST', { type: 'play_started', eventId: crypto.randomUUID() })
      .then((result) => { roundToken = result.roundToken || null })
      .catch(() => {})
  },
  onFinish({ points }) {
    $('submit-score').disabled = points === null
    if (!current || points === null) return
    api(`/games/${current.id}/events`, 'POST', { type: 'play_completed', eventId: crypto.randomUUID() }).catch(() => {})
  }
})

function showError(message) {
  $('play-error').hidden = false
  $('play-error').textContent = message
}

function paintBoard() {
  const rows = boardTab === 'unverified' ? board.unverified : board.scores
  $('tab-checked').classList.toggle('on', boardTab === 'checked')
  $('tab-unverified').classList.toggle('on', boardTab === 'unverified')
  $('leaders').replaceChildren()
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
  const listed = await api(`/games/${current.id}/scores`)
  board = { scores: listed.scores || [], unverified: listed.unverified || [] }
  if (prefer) boardTab = prefer
  $('leaderboard-scope').textContent = listed.mechanic === 'reaction' ? 'Fastest reaction · top 20' : 'Top 20 scores'
  paintBoard()
}

$('tab-checked').addEventListener('click', () => { boardTab = 'checked'; paintBoard() })
$('tab-unverified').addEventListener('click', () => { boardTab = 'unverified'; paintBoard() })

function beginRound() {
  if (!current) return
  roundToken = null
  api(`/games/${current.id}/events`, 'POST', { type: 'play_started', eventId: crypto.randomUUID() })
    .then((result) => { roundToken = result.roundToken || null })
    .catch(() => {})
}

function mountFreeform(src) {
  const field = $('field')
  field.classList.add('freeform-on')
  field.replaceChildren()
  const frame = document.createElement('iframe')
  frame.className = 'freeform-frame'
  frame.setAttribute('sandbox', 'allow-scripts allow-pointer-lock')
  frame.referrerPolicy = 'no-referrer'
  frame.title = current?.name || 'Game'
  frame.dataset.src = src
  freeformFrame = frame
  arenaBridge = attachArenaBridge({ frame: () => freeformFrame, slug })
  field.append(frame)
  $('game').classList.add('freeform-on')
  $('display').hidden = true
  $('game-label').hidden = true
  $('goal-banner').hidden = true
  $('timer').hidden = true
  $('score').textContent = 'Score: 0'
}

$('play').addEventListener('click', (event) => {
  if (current?.tier !== 'freeform' || !freeformFrame?.dataset.src) return
  event.preventDefault()
  event.stopImmediatePropagation()
  if (!freeformFrame.getAttribute('src')) {
    freeformFrame.addEventListener('load', () => freeformFrame.focus(), { once: true })
    freeformFrame.src = freeformFrame.dataset.src
  }
  freeformFrame.focus()
  $('play').hidden = true
  $('display').hidden = true
  $('game-label').hidden = true
  $('goal-banner').hidden = true
  if (freeformPoints === null) freeformPoints = 0
  $('score').textContent = `Score: ${freeformBest}`
  $('submit-score').disabled = false
  beginRound()
}, true)

window.addEventListener('message', (event) => {
  const size = readSandboxSize(event, freeformFrame)
  if (size) {
    fitSandboxFrame(freeformFrame, size)
    return
  }
  if (arenaBridge && freeformFrame && event.source === freeformFrame.contentWindow && event.origin === 'null' && arenaBridge.onMessage(event.data)) return
  const points = readSandboxScore(event, freeformFrame)
  if (points === null) return
  freeformBest = Math.max(freeformBest, points)
  freeformPoints = freeformBest
  $('score').textContent = `Score: ${freeformBest}`
  $('submit-score').disabled = false
})

$('submit-score').addEventListener('click', async () => {
  const points = current?.tier === 'freeform' ? freeformPoints : runtime.getLastScore()
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
  if (!current) return
  try {
    await api('/abuse-reports', 'POST', {
      gameId: current.id,
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

$('embed-play').addEventListener('click', () => {
  $('embed-gate').hidden = true
  $('play').click()
})

async function boot() {
  if (!slug) {
    showError('This play link is not valid.')
    return
  }
  try {
    await ensureCsrf()
    const { game } = await api(`/games/${slug}`)
    current = game
    $('preview-name').textContent = game.name
    $('preview-description').textContent = game.description || ''
    if (game.accent) $('game').style.borderColor = game.accent
    $('mechanic').textContent = typeNames[game.type] || game.type
    renderHint($('controls-hint'), game)
    $('studio-link').href = `/g/${game.id}`
    if (game.remix) {
      $('studio-link').textContent = 'Remix'
      $('studio-link').addEventListener('click', async (event) => {
        event.preventDefault()
        try {
          const result = await api(`/games/${game.id}/remix`, 'POST', {})
          location.href = `/g/${result.game.id}`
        } catch (error) {
          toast(error.message || 'Could not remix this game.')
        }
      })
    }
    if (game.type === 'world') {
      document.body.classList.add('world-play')
      const fresh = $('play').cloneNode(true)
      fresh.hidden = true
      $('play').replaceWith(fresh)
      $('display').hidden = true
      $('game-label').hidden = true
      $('timer').hidden = true
      $('score').hidden = true
      $('sound-toggle').hidden = true
      if ($('goal-banner')) $('goal-banner').hidden = true
      mountWorld({ spec: game.spec, slug: game.id, field: $('field') })
      await loadWorldBoard()
      worldBoardTimer = setInterval(() => { loadWorldBoard().catch(() => {}) }, 4000)
      await api(`/games/${game.id}/events`, 'POST', { type: 'game_viewed', eventId: crypto.randomUUID() }).catch(() => {})
      return
    }
    runtime.setGame(game)
    if (game.tier === 'freeform' && game.sandboxUrl) mountFreeform(game.sandboxUrl)
    await loadScores()
    api(`/games/${game.id}/events`, 'POST', { type: 'game_viewed', eventId: crypto.randomUUID() }).catch(() => {})
  } catch (error) {
    showError(error.message || 'This game is not available.')
  }
}

boot()
