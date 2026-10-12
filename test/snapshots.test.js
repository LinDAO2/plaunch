import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

test('every discover game has a mid-action poster snapshot', () => {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
  const run = spawnSync(process.execPath, ['scripts/poster-sheet.mjs'], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, POSTER_SHEET_DIR: path.join(tmpdir(), 'playground-poster-sheet') }
  })
  assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`)
  assert.match(run.stdout, /word-guess/)
  assert.match(run.stdout, /meteor-dodge/)
  assert.match(run.stdout, /blocks-grassland/)
  assert.match(run.stdout, /contact/)
})
