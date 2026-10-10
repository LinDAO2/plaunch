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

function cell(text, label) {
  const td = document.createElement('td')
  td.dataset.label = label
  if (typeof text === 'string') td.textContent = text
  else td.append(text)
  return td
}

function fill(host, rows) {
  host.replaceChildren(...rows)
}

async function act(path, body) {
  await api(path, 'POST', body || {})
  await load()
}

function paint(queue) {
  if (!queue.games.length) {
    const tr = document.createElement('tr')
    tr.append(cell('Nothing is waiting.', 'Game'))
    fill($('admin-games'), [tr])
  } else {
    fill($('admin-games'), queue.games.map((game) => {
      const reason = game.flagReason ? ` · ${game.flagReason}` : ''
      const actions = document.createElement('div')
      actions.className = 'mod-actions'
      if (game.status === 'pending' || game.status === 'hidden') {
        actions.append(button('Unhide', () => act(`/admin/games/${game.id}/unhide`).catch((error) => note(error.message))))
      }
      if (game.status !== 'hidden') {
        actions.append(button('Hide', () => act(`/admin/games/${game.id}/hide`).catch((error) => note(error.message))))
      }
      actions.append(button('Archive', () => act(`/admin/games/${game.id}/archive`).catch((error) => note(error.message))))
      if (game.status === 'published') {
        actions.append(button('Feature', () => act(`/admin/games/${game.id}/feature`, { featured: true }).catch((error) => note(error.message))))
      }
      const tr = document.createElement('tr')
      tr.append(cell(game.name, 'Game'), cell(`${game.status}${reason}`, 'Detail'), cell(actions, 'Actions'))
      return tr
    }))
  }

  if (!queue.reports.length) {
    const tr = document.createElement('tr')
    tr.append(cell('No open reports.', 'Game'))
    fill($('admin-reports'), [tr])
  } else {
    fill($('admin-reports'), queue.reports.map((report) => {
      const actions = document.createElement('div')
      actions.className = 'mod-actions'
      actions.append(
        button('Reviewed', () => act(`/admin/reports/${report.id}`, { status: 'reviewed' }).catch((error) => note(error.message))),
        button('Dismiss', () => act(`/admin/reports/${report.id}`, { status: 'dismissed' }).catch((error) => note(error.message)))
      )
      const tr = document.createElement('tr')
      tr.append(
        cell(report.gameName || 'Game', 'Game'),
        cell(`${report.reason}${report.details ? ` — ${report.details}` : ''}`, 'Detail'),
        cell(actions, 'Actions')
      )
      return tr
    }))
  }

  if (!queue.audit.length) {
    const tr = document.createElement('tr')
    tr.append(cell('No audit entries yet.', 'Action'))
    fill($('admin-audit'), [tr])
  } else {
    fill($('admin-audit'), queue.audit.map((entry) => {
      const tr = document.createElement('tr')
      tr.append(
        cell(entry.action, 'Action'),
        cell(`${entry.targetType} ${entry.targetId}`, 'Target'),
        cell(new Date(entry.createdAt).toLocaleString(), 'When')
      )
      return tr
    }))
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
