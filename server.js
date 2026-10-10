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
import { createUsercontentApp } from './src/usercontent.js'

function unique(values) {
  return values.filter((value, index) => value && values.indexOf(value) === index)
}

function listen(server, port) {
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '0.0.0.0', resolve)
  })
}

export async function start() {
  const config = loadConfig()
  for (const warning of config.warnings) log('warn', warning)
  const db = await openDatabase(config.databaseUrl)
  const applied = await migrate(db)
  const seeded = config.seedOnEmpty ? await seedIfEmpty(db) : 0
  const servers = []
  if (config.serverRole === 'usercontent') {
    config.mainOrigins = unique([config.publicBaseUrl])
    const usercontent = http.createServer(createUsercontentApp({ db, config }))
    await listen(usercontent, config.port)
    servers.push(usercontent)
  } else {
    const app = createApp({ db, config })
    const server = http.createServer(app)
    await listen(server, config.port)
    servers.push(server)
    config.mainOrigins = unique([
      config.publicBaseUrl,
      `http://127.0.0.1:${config.port}`,
      `http://localhost:${config.port}`
    ])
    if (config.serverRole === 'all') {
      const usercontent = http.createServer(createUsercontentApp({ db, config }))
      await listen(usercontent, config.usercontentPort)
      servers.push(usercontent)
    }
  }
  log('info', 'listening', {
    port: config.port,
    role: config.serverRole,
    usercontent: config.usercontentOrigin,
    database: databaseKind(config.databaseUrl),
    migrated: applied,
    seeded,
    ai: aiStatus(config.env).mode
  })
  const shutdown = () => {
    let pending = servers.length
    if (!pending) {
      db.close().finally(() => process.exit(0))
      return
    }
    for (const server of servers) {
      server.close(() => {
        pending -= 1
        if (pending === 0) db.close().finally(() => process.exit(0))
      })
    }
  }
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
  return servers[0]
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
if (isMain) {
  start().catch((err) => {
    log('error', 'server failed to start', { message: err.message })
    process.exit(1)
  })
}
