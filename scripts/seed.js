import { loadConfig } from '../src/config.js'
import { databaseKind, openDatabase } from '../src/db.js'
import { migrate } from '../src/migrate.js'
import { seed } from '../src/seed.js'

const config = loadConfig()
const db = await openDatabase(config.databaseUrl)
await migrate(db)
const inserted = await seed(db)
console.log(JSON.stringify({ ok: true, database: databaseKind(config.databaseUrl), inserted }))
await db.close()
