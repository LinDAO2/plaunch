import { loadConfig } from '../src/config.js'
import { databaseKind, openDatabase } from '../src/db.js'
import { migrate } from '../src/migrate.js'

const config = loadConfig()
const db = await openDatabase(config.databaseUrl)
const applied = await migrate(db)
console.log(JSON.stringify({ ok: true, database: databaseKind(config.databaseUrl), applied }))
await db.close()
