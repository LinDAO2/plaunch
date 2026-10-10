import { api, ensureCsrf } from '/client-api.js'

const $ = (id) => document.getElementById(id)

function note(message) {
  $('admin-status').hidden = false
  $('admin-status').textContent = message
}

function button(label, onClick) {
  const el = document.createElement('button')
  el.type = 'button'
  el.className = 'outline'
  el.textContent = label
  el.addEventListener('click', onClick)
  return el
}

function row(title, detail, actions) {
  const item = document.createElement('article')
  item.className = 'mod-row'
  const text = document.createElement('div')
  const heading = document.createElement('h3')
  heading.textContent = title
  const body = document.createElement('p')
  body.textContent = detail
  text.append(heading, body)
  const bar = document.createElement('div')
  bar.className = 'mod-actions'
  for (const action of actions) bar.append(action)
  item.append(text, bar)
  return item
}

async function act(path, body) {
  await api(path, 'POST', body || {})
  await load()
}

function paint(queue) {
  const games = $('admin-games')
  games.replaceChildren()
  if (!queue.games.length) games.textContent = 'Nothing is waiting.'
  for (const game of queue.games) {
    const reason = game.flagReason ? ` · ${game.flagReason}` : ''
    const actions = []
    if (game.status === 'pending' || game.status === 'hidden') {
      actions.push(button('Unhide', () => act(`/admin/games/${game.id}/unhide`).catch((error) => note(error.message))))
    }
    if (game.status !== 'hidden') {
      actions.push(button('Hide', () => act(`/admin/games/${game.id}/hide`).catch((error) => note(error.message))))
    }
    actions.push(button('Archive', () => act(`/admin/games/${game.id}/archive`).catch((error) => note(error.message))))
    if (game.status === 'published') {
      actions.push(button('Feature', () => act(`/admin/games/${game.id}/feature`, { featured: true }).catch((error) => note(error.message))))
    }
    games.append(row(game.name, `${game.status}${reason}`, actions))
  }

  const reports = $('admin-reports')
  reports.replaceChildren()
  if (!queue.reports.length) reports.textContent = 'No open reports.'
  for (const report of queue.reports) {
    reports.append(row(
      report.gameName || 'Game',
      `${report.reason}${report.details ? ` — ${report.details}` : ''}`,
      [
        button('Reviewed', () => act(`/admin/reports/${report.id}`, { status: 'reviewed' }).catch((error) => note(error.message))),
        button('Dismiss', () => act(`/admin/reports/${report.id}`, { status: 'dismissed' }).catch((error) => note(error.message)))
      ]
    ))
  }

  const audit = $('admin-audit')
  audit.replaceChildren()
  if (!queue.audit.length) audit.textContent = 'No audit entries yet.'
  for (const entry of queue.audit) {
    const when = new Date(entry.createdAt).toLocaleString()
    audit.append(row(entry.action, `${entry.targetType} ${entry.targetId} · ${when}`, []))
  }
  $('admin-queue').hidden = false
  $('admin-status').hidden = true
}

async function load() {
  paint(await api('/admin/queue'))
}

async function boot() {
  try {
    await ensureCsrf()
    const { user } = await api('/auth/me')
    if (!user) {
      note('Sign in from the studio with a moderator account.')
      return
    }
    if (!user.admin) {
      note('This account is not a moderator.')
      return
    }
    await load()
  } catch (error) {
    note(error.message || 'Could not load the queue.')
  }
}

boot()
