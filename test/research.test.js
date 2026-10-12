import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { creditMarkup } from '../src/html.js'
import { generateIdea } from '../src/ai/idea.js'
import { COPYLEFT, PERMISSIVE } from '../src/imports/license.js'
import { inspectImport } from '../src/imports/bundle.js'
import { acceptGithubLicense, clearResearchCache, researchPrompt } from '../src/ai/research.js'
import { TRADEMARK } from '../src/templates/catalog.js'
import { createClient, startServer, validSpec } from '../testing/helpers.js'

const OPEN_GAMES = JSON.parse(readFileSync(new URL('../src/ai/open-games.json', import.meta.url), 'utf8'))

function gemini(text) {
  return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status: 200 })
}

test('the vendored index is a large permissive catalog', () => {
  assert.equal(OPEN_GAMES.length >= 150, true)
  const licenses = new Set()
  for (const game of OPEN_GAMES) {
    assert.equal(PERMISSIVE.has(game.license), true, game.id)
    assert.equal(COPYLEFT.has(game.license), false, game.id)
    assert.match(game.repo, /^https:\/\/\S+$/)
    assert.match(game.source, /^https:\/\/\S+$/)
    assert.equal(game.description.length >= 12, true, game.id)
    assert.equal(game.tags.length > 0, true, game.id)
    assert.equal(game.mechanics.length > 0, true, game.id)
    assert.equal(game.controls.length > 0, true, game.id)
    assert.equal(TRADEMARK.test(game.name), false, game.name)
    assert.equal(TRADEMARK.test(game.description), false, game.description)
    licenses.add(game.license)
  }
  assert.equal(licenses.has('MIT'), true)
  assert.equal(licenses.has('CC0-1.0'), true)
  assert.equal(acceptGithubLicense('GPL-3.0'), false)
  assert.equal(acceptGithubLicense('AGPL-3.0-only'), false)
  assert.equal(acceptGithubLicense(''), false)
  assert.equal(acceptGithubLicense('NOASSERTION'), false)
  assert.equal(acceptGithubLicense('MIT'), true)
  assert.equal(acceptGithubLicense('Apache-2.0'), true)
  assert.equal(acceptGithubLicense('Zlib'), true)
})

test('research remixes a template, keeps meteor dodge on the spec, and writes chess freeform', async () => {
  clearResearchCache()
  const word = await generateIdea({ prompt: 'wordle', tier: 'auto', env: {} })
  assert.equal(word.templateId, 'word-guess')
  assert.equal(word.research.strategy, 'remix')
  assert.equal(word.credit.builtOn.name, 'Word Guess')
  const meteors = await generateIdea({
    prompt: 'A space game where you dodge falling meteors.',
    tier: 'auto',
    env: {},
    fetchImpl: async () => { throw new Error('offline') }
  })
  assert.equal(meteors.research.strategy, 'spec')
  assert.equal(meteors.templateId ?? null, null)
  assert.equal(meteors.tier, 'spec')
  const chess = await generateIdea({ prompt: 'a chess match on a board', tier: 'auto', env: {} })
  assert.equal(chess.tier, 'freeform')
  assert.equal(chess.research.strategy, 'freeform')
  assert.equal(chess.templateId ?? null, null)
})

test('lane racer adapts the vendored MIT game without a network', async () => {
  clearResearchCache()
  const result = await generateIdea({ prompt: 'lane racer', tier: 'auto', env: {} })
  assert.equal(result.research.strategy, 'adapt')
  assert.equal(result.game.generation, 'import')
  assert.equal(result.credit.author, 'Jake Gordon')
  assert.equal(result.credit.license, 'MIT')
  assert.match(result.html, /Jake Gordon/)
  assert.match(result.html, /id="pg-license"/)
  assert.deepEqual(inspectImport(result.html), [])
})

test('research is cached, skipped when off, and ignores a down GitHub search', async () => {
  clearResearchCache()
  let calls = 0
  const fetchImpl = async () => {
    calls += 1
    return gemini(JSON.stringify(validSpec))
  }
  const env = { AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'research-key', AI_FALLBACKS: '' }
  const first = await generateIdea({ prompt: 'a space dodge game please', tier: 'auto', env, fetchImpl })
  assert.equal(first.tier, 'spec')
  assert.equal(first.spec.runtime, 'dodge')
  assert.equal(calls, 2)
  const second = await generateIdea({ prompt: 'a space dodge game please', tier: 'auto', env, fetchImpl })
  assert.equal(second.research.cached, true)
  assert.equal(calls, 3)
  clearResearchCache()
  const off = await generateIdea({ prompt: 'a quiet garden tap please', tier: 'auto', env: { ...env, AI_RESEARCH: 'off' }, fetchImpl })
  assert.equal(off.research, null)
  assert.equal(calls, 4)
  clearResearchCache()
  const offline = await generateIdea({
    prompt: 'dodge the quiet sparks please',
    tier: 'auto',
    env: { ...env, GITHUB_TOKEN: 'token' },
    fetchImpl: async (url) => {
      if (String(url).includes('api.github.com')) throw new Error('offline')
      return gemini(JSON.stringify(validSpec))
    }
  })
  assert.equal(offline.tier, 'spec')
  assert.equal(offline.research.strategy, 'spec')
})

test('a live GitHub search keeps permissive repos and drops GPL, AGPL, and unlicensed code', async () => {
  clearResearchCache()
  const result = await researchPrompt({
    prompt: 'dodge the drifting sparks',
    env: { AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'research-key', AI_FALLBACKS: '', GITHUB_TOKEN: 'token' },
    fetchImpl: async (url) => {
      if (String(url).includes('api.github.com/search')) {
        return new Response(JSON.stringify({
          items: [
            { name: 'Allowed Drift', full_name: 'acme/allowed-drift', license: { spdx_id: 'MIT' }, html_url: 'https://github.com/acme/allowed-drift', description: 'dodge drifting sparks', owner: { login: 'acme' } },
            { name: 'Forbidden Drift', full_name: 'acme/forbidden', license: { spdx_id: 'GPL-3.0' }, html_url: 'https://github.com/acme/forbidden', description: 'dodge drifting sparks', owner: { login: 'acme' } },
            { name: 'Affero Drift', full_name: 'acme/affero', license: { spdx_id: 'AGPL-3.0' }, html_url: 'https://github.com/acme/affero', description: 'dodge drifting sparks', owner: { login: 'acme' } },
            { name: 'No License Drift', full_name: 'acme/none', license: null, html_url: 'https://github.com/acme/none', description: 'dodge drifting sparks', owner: { login: 'acme' } }
          ]
        }), { status: 200 })
      }
      return gemini(JSON.stringify({
        coreLoop: 'Dodge the sparks and keep moving.',
        controls: 'Arrow keys or a tap.',
        juice: 'A flash each time a spark misses.',
        fun: 'The best dodge games reward a late swerve.'
      }))
    }
  })
  const names = result.inspiredBy.map((item) => item.name)
  assert.equal(names.includes('Allowed Drift'), true)
  assert.equal(names.includes('Forbidden Drift'), false)
  assert.equal(names.includes('Affero Drift'), false)
  assert.equal(names.includes('No License Drift'), false)
  assert.equal(result.brief.source, 'model')
})

test('a hung brief still finishes inside the research budget', async () => {
  clearResearchCache()
  const started = Date.now()
  const result = await researchPrompt({
    prompt: 'dodge the hanging sparks',
    env: { AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'research-key', AI_FALLBACKS: '' },
    budgetMs: 700,
    fetchImpl: (_url, init) => new Promise((_resolve, reject) => {
      const fail = () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
      const signal = init?.signal
      if (signal?.aborted) fail()
      else if (signal) signal.addEventListener('abort', fail, { once: true })
      setTimeout(fail, 2500)
    })
  })
  assert.equal(Date.now() - started < 5000, true)
  assert.equal(result.brief.source, 'heuristic')
  assert.equal(result.strategy, 'spec')
})

test('play and share pages show built on and inspired by', () => {
  const markup = creditMarkup({
    author: 'Ada',
    license: 'MIT',
    source: 'https://github.com/example/game',
    builtOn: { name: 'Word Guess', license: 'MIT' },
    inspiredBy: [{ name: 'Pong', license: 'MIT', source: 'https://github.com/kaplayjs/kaplay' }]
  })
  assert.match(markup, /Original by Ada \(MIT\) - <a href="https:\/\/github.com\/example\/game"/)
  assert.match(markup, /Built on Word Guess \(MIT\)/)
  assert.match(markup, /Inspired by <a href="https:\/\/github.com\/kaplayjs\/kaplay"/)
})

test('a published game keeps inspired-by credits on the play page', async () => {
  const server = await startServer({ seed: false })
  try {
    const client = createClient(server.base)
    await client.prime()
    await client.request('POST', '/api/auth/register', { email: 'research@example.com', password: 'test-password-123', displayName: 'Ada' })
    const created = await client.request('POST', '/api/games', {
      name: 'Picnic Tap',
      description: 'Tap the blanket.',
      type: 'tap',
      duration: 10,
      accent: '#112233',
      credit: {
        builtOn: { name: 'Word Guess', license: 'MIT' },
        inspiredBy: [{ name: 'Pong', author: 'KAPLAY Team', license: 'MIT', source: 'https://github.com/kaplayjs/kaplay' }]
      }
    })
    assert.equal(created.status, 201)
    const play = await client.request('GET', `/play/${created.data.game.id}`)
    assert.match(play.text, /Built on Word Guess/)
    assert.match(play.text, /Inspired by/)
    assert.match(play.text, /Pong/)
    const share = await client.request('GET', `/r/${created.data.game.id}`)
    assert.match(share.text, /Built on Word Guess/)
    assert.match(share.text, /Inspired by/)
  } finally {
    await server.close()
  }
})
