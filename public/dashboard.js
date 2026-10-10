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

function cell(text, label) {
  const td = document.createElement('td')
  td.dataset.label = label
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
    name.dataset.label = 'Game'
    const link = document.createElement('a')
    link.href = game.status === 'published' ? `/play/${game.id}` : `/g/${game.id}`
    link.textContent = game.name
    name.append(link)
    tr.append(
      name,
      cell(game.status, 'State'),
      cell(String(game.views), 'Views'),
      cell(String(game.plays), 'Plays'),
      cell(String(game.completions), 'Completions'),
      cell(String(game.shares), 'Shares'),
      cell(scoreText(game), 'Top score')
    )
    rows.append(tr)
  }
}

async function boot() {
  try {
    await ensureCsrf()
    const me = await api('/auth/me')
    const note = document.getElementById('dash-cookie')
    if (note) note.hidden = !(me.user && me.user.guest)
    const { games } = await api('/me/dashboard')
    render(games)
  } catch (err) {
    status.hidden = true
    wrap.hidden = true
    empty.hidden = true
    error.hidden = false
    error.textContent = 'Could not load the dashboard. Refresh to try again.'
  }
}

boot()
