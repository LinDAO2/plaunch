import { gameCard } from '/cards.js'
import { api, ensureCsrf } from '/client-api.js'

const $ = (id) => document.getElementById(id)
const CATALOG = ['action', 'arcade', 'casual', 'dodge', 'guess', 'puzzle', 'reaction', 'runner', 'sandbox', 'tap']
const typeNames = { tap: 'Tap', reaction: 'Reaction', guess: 'Guess', dodge: 'Dodge', arcade: 'Arcade', world: 'Blocks' }
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
    const { card, bottom, share } = gameCard(game, {
      label: typeNames[game.type] || game.type,
      playHref: `/play/${game.id}`
    })
    const small = document.createElement('small')
    small.textContent = view === 'trending' ? `${game.trending || 0} players today` : `${game.plays || 0} plays`
    share.addEventListener('click', async () => {
      const url = `${location.origin}/r/${game.id}`
      try {
        await navigator.clipboard.writeText(url)
        share.setAttribute('aria-label', 'Link copied')
      } catch {
        window.prompt('Share link', url)
      }
    })
    bottom.append(small)
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
