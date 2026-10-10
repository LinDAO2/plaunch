import { api, ensureCsrf } from '/client-api.js'

const $ = (id) => document.getElementById(id)
const CATALOG = ['action', 'arcade', 'casual', 'dodge', 'guess', 'puzzle', 'reaction', 'runner', 'sandbox', 'tap']
const typeNames = { tap: 'Tap', reaction: 'Reaction', guess: 'Guess', dodge: 'Dodge', arcade: 'Arcade' }
let view = 'new'
let tag = ''

function paintTags() {
  const row = $('tag-row')
  row.replaceChildren()
  for (const name of ['', ...CATALOG]) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'tag' + (tag === name ? ' on' : '')
    button.textContent = name || 'All'
    button.addEventListener('click', () => {
      tag = name
      paintTags()
      load().catch(showError)
    })
    row.append(button)
  }
}

function showError(error) {
  $('gallery').textContent = error.message || 'Could not load games.'
}

function render(games) {
  const gallery = $('gallery')
  gallery.replaceChildren()
  if (!games.length) {
    const q = $('search').value.trim()
    gallery.textContent = q ? 'No games match your search.' : view === 'featured' ? 'No featured games yet.' : 'No published games yet.'
    return
  }
  for (const game of games) {
    const card = document.createElement('article')
    card.className = 'card'
    card.style.borderTop = `3px solid ${game.accent || '#a88bff'}`
    const kind = document.createElement('div')
    kind.className = 'mini'
    kind.textContent = typeNames[game.type] || game.type
    const title = document.createElement('h3')
    title.textContent = game.name
    const desc = document.createElement('p')
    desc.textContent = game.description
    const tags = document.createElement('div')
    tags.className = 'tag-list'
    tags.textContent = (game.tags || []).join(' · ')
    const bottom = document.createElement('div')
    bottom.className = 'card-bottom'
    const small = document.createElement('small')
    small.textContent = view === 'trending' ? `${game.trending || 0} players today` : `${game.plays || 0} plays`
    const play = document.createElement('a')
    play.href = `/play/${game.id}`
    play.textContent = 'Play →'
    bottom.append(small, play)
    card.append(kind, title, desc, tags, bottom)
    gallery.append(card)
  }
}

async function load() {
  const params = new URLSearchParams({ view })
  const q = $('search').value.trim()
  if (q) params.set('q', q)
  if (tag) params.set('tag', tag)
  const out = await api(`/discover?${params}`)
  render(out.games || [])
}

for (const name of ['trending', 'new', 'featured']) {
  $(`view-${name}`).addEventListener('click', () => {
    view = name
    for (const item of ['trending', 'new', 'featured']) {
      $(`view-${item}`).classList.toggle('on', item === view)
    }
    load().catch(showError)
  })
}

$('search').addEventListener('input', () => { load().catch(showError) })

paintTags()
ensureCsrf().then(load).catch(showError)
