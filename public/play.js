import { api, ensureCsrf } from '/client-api.js'
import { controlHint, createRuntime, typeNames } from '/mechanics.js'

const $ = (id) => document.getElementById(id)
const slug = (location.pathname.match(/^\/play\/([a-z0-9-]+)$/) || [])[1]
let current = null

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
  guess: $('guess-input')
}, {
  onToast: toast,
  onPlayStarted() {
    if (!current) return
    api(`/games/${current.id}/events`, 'POST', { type: 'play_started', eventId: crypto.randomUUID() }).catch(() => {})
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

async function loadScores() {
  const { scores, mechanic } = await api(`/games/${current.id}/scores`)
  $('leaderboard-scope').textContent = mechanic === 'reaction' ? 'Fastest reaction · unverified' : 'Top scores · unverified'
  $('leaders').replaceChildren()
  if (!scores.length) {
    $('leaders').textContent = 'No scores yet. Be the first!'
    return
  }
  for (const score of scores) {
    const row = document.createElement('div')
    row.className = 'leader-row'
    const name = document.createElement('span')
    const value = document.createElement('b')
    const flag = document.createElement('span')
    name.textContent = `#${score.rank} ${score.name}`
    value.textContent = score.mechanic === 'reaction' ? `${score.points} ms` : String(score.points)
    flag.className = 'unverified'
    flag.textContent = 'unverified'
    row.append(name, value, flag)
    $('leaders').append(row)
  }
}

$('submit-score').addEventListener('click', async () => {
  const points = runtime.getLastScore()
  if (!current || points === null) return
  try {
    await api(`/games/${current.id}/scores`, 'POST', {
      name: $('player').value || 'Anonymous',
      points,
      mechanic: current.type
    })
    $('submit-score').disabled = true
    toast('Score submitted. It is stored as unverified.')
    await loadScores()
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
    $('mechanic').textContent = typeNames[game.type] || game.type
    $('controls-hint').textContent = controlHint(game)
    $('studio-link').href = `/g/${game.id}`
    runtime.setGame(game)
    await loadScores()
    api(`/games/${game.id}/events`, 'POST', { type: 'game_viewed', eventId: crypto.randomUUID() }).catch(() => {})
  } catch (error) {
    showError(error.message || 'This game is not available.')
  }
}

boot()
