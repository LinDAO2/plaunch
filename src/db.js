import { mkdir } from 'node:fs/promises'
import { log } from './log.js'

export function databaseKind(url) {
  if (!url || url === 'pglite:memory' || url === 'pglite://memory' || url.startsWith('pglite://') || url.startsWith('pglite:')) {
    return 'pglite'
  }
  if (url.startsWith('postgres://') || url.startsWith('postgresql://')) return 'postgres'
  throw new Error('DATABASE_URL must start with postgres://, postgresql://, or pglite://')
}

export function pgliteDataDir(url) {
  if (!url || url === 'pglite:memory' || url === 'pglite://memory') return undefined
  return url.replace(/^pglite:\/\//, '').replace(/^pglite:/, '')
}

function normalizeDbError(err) {
  if (!err || err.name === 'HttpError') return err
  const wrapped = new Error(err.message)
  wrapped.name = 'DatabaseError'
  wrapped.code = err.code
  wrapped.constraint = err.constraint
  return wrapped
}

async function openPglite(url) {
  let PGlite
  try {
    ;({ PGlite } = await import('@electric-sql/pglite'))
  } catch {
    throw new Error('PGlite is not installed. Set DATABASE_URL to a postgres:// connection string.')
  }
  const dataDir = pgliteDataDir(url)
  if (dataDir) await mkdir(dataDir, { recursive: true })
  const client = new PGlite(dataDir)
  const api = {
    kind: 'pglite',
    async query(text, params = []) {
      try {
        const result = await client.query(text, params)
        return { rows: result.rows, rowCount: result.affectedRows ?? result.rows?.length ?? 0 }
      } catch (err) {
        throw normalizeDbError(err)
      }
    },
    async exec(text) {
      try {
        await client.exec(text)
      } catch (err) {
        throw normalizeDbError(err)
      }
    },
    async close() {
      await client.close()
    },
    async transaction(fn) {
      await client.exec('BEGIN')
      try {
        const result = await fn(api)
        await client.exec('COMMIT')
        return result
      } catch (err) {
        try { await client.exec('ROLLBACK') } catch { /* already aborted */ }
        throw err
      }
    }
  }
  return api
}

async function openPostgres(url) {
  const pg = (await import('pg')).default
  const pool = new pg.Pool({ connectionString: url, max: 10 })
  const api = {
    kind: 'postgres',
    pool,
    async query(text, params = []) {
      try {
        const result = await pool.query(text, params)
        return { rows: result.rows, rowCount: result.rowCount }
      } catch (err) {
        throw normalizeDbError(err)
      }
    },
    async exec(text) {
      const client = await pool.connect()
      try {
        await client.query(text)
      } catch (err) {
        throw normalizeDbError(err)
      } finally {
        client.release()
      }
    },
    async close() {
      await pool.end()
    },
    async transaction(fn) {
      const client = await pool.connect()
      const tx = {
        async query(text, params = []) {
          try {
            const result = await client.query(text, params)
            return { rows: result.rows, rowCount: result.rowCount }
          } catch (err) {
            throw normalizeDbError(err)
          }
        }
      }
      try {
        await client.query('BEGIN')
        const result = await fn(tx)
        await client.query('COMMIT')
        return result
      } catch (err) {
        try { await client.query('ROLLBACK') } catch { /* already aborted */ }
        throw err
      } finally {
        client.release()
      }
    }
  }
  return api
}

export async function openDatabase(url) {
  const kind = databaseKind(url)
  if (kind === 'pglite') return openPglite(url)
  log('info', 'connecting to postgres', { database: 'postgres' })
  return openPostgres(url)
}
