import { api, ensureCsrf } from '/client-api.js'

const status = document.getElementById('dash-status')
const empty = document.getElementById('dash-empty')
const error = document.getElementById('dash-error')
const wrap = document.getElementById('dash-wrap')
const rows = document.getElementById('dash-rows')

function scoreText(game) {
  if (!game.topScore) return '—'
  return game.topScore.ranking === 'lower' ? `${game.topScore.points} ms` : String(game.topScore.points)
}

function cell(text) {
  const td = document.createElement('td')
  td.textContent = text
  return td
}

function render(games) {
  status.hidden = true
  error.hidden = true
  if (!games.length) {
    wrap.hidden = true
    empty.hidden = false
    return
  }
  empty.hidden = true
  wrap.hidden = false
  rows.replaceChildren()
  for (const game of games) {
    const tr = document.createElement('tr')
    const name = document.createElement('td')
    const link = document.createElement('a')
    link.href = game.status === 'published' ? `/play/${game.id}` : `/g/${game.id}`
    link.textContent = game.name
    name.append(link)
    tr.append(
      name,
      cell(game.status),
      cell(String(game.views)),
      cell(String(game.plays)),
      cell(String(game.completions)),
      cell(String(game.shares)),
      cell(scoreText(game))
    )
    rows.append(tr)
  }
}

async function boot() {
  try {
    await ensureCsrf()
    const me = await api('/auth/me')
    if (!me.user) {
      status.hidden = true
      error.hidden = false
      error.textContent = 'Sign in from the studio to see your games.'
      const link = document.createElement('a')
      link.href = '/#studio'
      link.textContent = ' Go to the studio'
      error.append(link)
      return
    }
    const { games } = await api('/me/dashboard')
    render(games)
  } catch (err) {
    status.hidden = true
    wrap.hidden = true
    empty.hidden = true
    error.hidden = false
    error.textContent = err.status === 401
      ? 'Sign in from the studio to see your games.'
      : 'Could not load the dashboard. Refresh to try again.'
  }
}

boot()
