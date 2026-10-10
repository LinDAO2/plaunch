import http from 'node:http'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { aiStatus } from './src/ai/generate.js'
import { createApp } from './src/app.js'
import { loadConfig } from './src/config.js'
import { databaseKind, openDatabase } from './src/db.js'
import { log } from './src/log.js'
import { migrate } from './src/migrate.js'
import { seedIfEmpty } from './src/seed.js'

export async function start() {
  const config = loadConfig()
  for (const warning of config.warnings) log('warn', warning)
  const db = await openDatabase(config.databaseUrl)
  const applied = await migrate(db)
  const seeded = config.seedOnEmpty ? await seedIfEmpty(db) : 0
  const app = createApp({ db, config })
  const server = http.createServer(app)
  await new Promise((resolve) => server.listen(config.port, '0.0.0.0', resolve))
  log('info', 'listening', {
    port: config.port,
    database: databaseKind(config.databaseUrl),
    migrated: applied,
    seeded,
    ai: aiStatus(config.env).mode
  })
  const shutdown = () => {
    server.close(() => {
      db.close().finally(() => process.exit(0))
    })
  }
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
  return server
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
if (isMain) {
  start().catch((err) => {
    log('error', 'server failed to start', { message: err.message })
    process.exit(1)
  })
}
