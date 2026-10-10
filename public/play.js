import { api, ensureCsrf } from '/client-api.js'
import { controlHint, createRuntime, typeNames } from '/mechanics.js'

const $ = (id) => document.getElementById(id)
const slug = (location.pathname.match(/^\/play\/([a-z0-9-]+)$/) || [])[1]
const embed = new URLSearchParams(location.search).get('embed') === '1'
let current = null
let roundToken = null

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

async function loadScores() {
  const { scores, mechanic } = await api(`/games/${current.id}/scores`)
  $('leaderboard-scope').textContent = mechanic === 'reaction' ? 'Fastest reaction · top 20' : 'Top 20 scores'
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
    const assurance = score.assurance === 'checked' ? 'checked' : 'unverified'
    flag.className = assurance
    flag.textContent = assurance
    row.append(name, value, flag)
    $('leaders').append(row)
  }
}

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
