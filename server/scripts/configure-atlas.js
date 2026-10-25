// Run locally after creating your database user in Atlas. The password is never echoed.
import { createInterface } from 'node:readline/promises'
import { Writable } from 'node:stream'
import { stdin, stdout } from 'node:process'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { parseEnv } from 'node:util'

const username = process.argv[2] || 'wad2-shared'
if (!/^[A-Za-z0-9_-]+$/.test(username)) throw new Error('Use a database username containing letters, digits, underscores or hyphens')

const muted = new Writable({ write(chunk, encoding, callback) { callback() } })
const prompt = createInterface({ input: stdin, output: muted, terminal: !!stdin.isTTY })
let password
try {
  stdout.write(`Atlas password for ${username} (hidden): `)
  password = await prompt.question('')
} finally {
  prompt.close()
  stdout.write('\n')
}
if (!password) throw new Error('Password is required; .env was not changed')

let existing
try { existing = await readFile('.env', 'utf8') } catch (error) {
  if (error.code !== 'ENOENT') throw error
  existing = await readFile('.env.example', 'utf8')
}
await mkdir('.local', { recursive: true })
try {
  await writeFile('.local/env-before-atlas', existing, { mode: 0o600, flag: 'wx' })
} catch (error) {
  if (error.code !== 'EEXIST') throw error
}
const uri = `mongodb+srv://${encodeURIComponent(username)}:${encodeURIComponent(password)}@cluster0.jotoksx.mongodb.net/wad2_dev?retryWrites=true&w=majority&authSource=admin`
const parsed = parseEnv(existing)
const settings = { MONGODB_URI: uri }
if (Buffer.byteLength(parsed.JWT_SECRET || '') < 32) settings.JWT_SECRET = randomBytes(48).toString('hex')
let updated = existing
for (const [key, value] of Object.entries(settings)) {
  const line = `${key}=${JSON.stringify(value)}`
  const match = new RegExp(`^${key}=.*$`, 'm')
  updated = match.test(updated) ? updated.replace(match, () => line) : updated + `\n${line}\n`
}
// Write with restricted permissions before replacing the original file.
const { rename } = await import('node:fs/promises')
await writeFile('.local/env-atlas-next', updated, { mode: 0o600 })
await rename('.local/env-atlas-next', '.env')
console.log('Saved Atlas configuration for wad2_dev in ignored .env (credentials withheld).')
console.log('Run pnpm db:check, then restart the API with pnpm server.')
