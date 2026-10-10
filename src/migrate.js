import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { log } from './log.js'

const MIGRATIONS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations')

export function splitSql(sql) {
  const withoutComments = sql.replace(/--.*$/gm, '')
  const parts = []
  let current = ''
  let inSingle = false
  for (let i = 0; i < withoutComments.length; i++) {
    const ch = withoutComments[i]
    if (ch === "'" && withoutComments[i - 1] !== '\\') inSingle = !inSingle
    if (ch === ';' && !inSingle) {
      if (current.trim()) parts.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  if (current.trim()) parts.push(current.trim())
  return parts
}

async function ensureMigrationTable(db) {
  await db.exec(`create table if not exists schema_migrations (
    id text primary key,
    applied_at timestamptz not null default now()
  )`)
}

export async function migrate(db) {
  let uuidReady = true
  try {
    await db.query('select gen_random_uuid() as id')
  } catch {
    uuidReady = false
  }
  if (!uuidReady) {
    try {
      await db.exec('create extension if not exists pgcrypto')
    } catch (err) {
      log('warn', 'pgcrypto extension was not created', { message: err.message })
    }
  }
  await ensureMigrationTable(db)
  const files = (await readdir(MIGRATIONS)).filter((name) => name.endsWith('.sql')).sort()
  const applied = []
  for (const file of files) {
    const existing = await db.query('select id from schema_migrations where id = $1', [file])
    if (existing.rows.length) continue
    const sql = await readFile(path.join(MIGRATIONS, file), 'utf8')
    const statements = splitSql(sql)
    await db.transaction(async (tx) => {
      for (const statement of statements) {
        await tx.query(statement)
      }
      await tx.query('insert into schema_migrations (id) values ($1)', [file])
    })
    applied.push(file)
  }
  return applied
}
