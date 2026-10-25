// A real MongoDB process with persistent local files; no Atlas account or global install required.
import { MongoMemoryServer } from 'mongodb-memory-server'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const directory = fileURLToPath(new URL('../../.local/', import.meta.url))
await mkdir(`${directory}mongodb`, { recursive: true })
const secretPath = `${directory}jwt-secret`
try {
  process.env.JWT_SECRET = (await readFile(secretPath, 'utf8')).trim()
} catch (error) {
  if (error.code !== 'ENOENT') throw error
  process.env.JWT_SECRET = randomBytes(48).toString('hex')
  await writeFile(secretPath, process.env.JWT_SECRET, { mode: 0o600, flag: 'wx' })
}
const mongo = await MongoMemoryServer.create({
  instance: { ip: '127.0.0.1', port: 27017, dbPath: `${directory}mongodb`, storageEngine: 'wiredTiger' },
})
process.env.MONGODB_URI = mongo.getUri('wad2_local')
console.log('Local MongoDB ready; accounts are saved in .local/mongodb')
const { connectDatabase } = await import('../db.js')
await connectDatabase()
await import('../index.js')

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, async () => {
    const { default: mongoose } = await import('mongoose')
    await mongoose.disconnect()
    await mongo.stop({ doCleanup: false })
    process.exit(0)
  })
}
