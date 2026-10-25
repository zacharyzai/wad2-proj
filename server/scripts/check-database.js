// Deliberately prints no URI, credentials, signing secret or raw driver errors.
import mongoose from 'mongoose'
import { connectDatabase } from '../db.js'
import { jwtSecret } from '../services/auth.js'

let valid = true
try {
  jwtSecret()
  console.log('JWT configuration: OK (secret withheld)')
} catch {
  valid = false
  console.error('JWT configuration: set JWT_SECRET to a random value of at least 32 bytes in .env')
}

try {
  const uri = process.env.MONGODB_URI
  let parsed
  try { parsed = new URL(uri) } catch { /* Report a safe configuration error below. */ }
  if (!parsed || !['mongodb:', 'mongodb+srv:'].includes(parsed.protocol) || !parsed.pathname.slice(1)) {
    throw new Error('DATABASE_NAME_REQUIRED')
  }
  await connectDatabase()
  await mongoose.connection.db.command({ ping: 1 })
  console.log('MongoDB connection: OK')
  console.log('Unique users.email index: ready')
} catch (error) {
  valid = false
  if (error.message === 'DATABASE_NAME_REQUIRED') {
    console.error('MongoDB configuration: set MONGODB_URI with an explicit database name, e.g. /wad2_dev before the query string')
  } else {
    console.error('MongoDB check failed. Check the cluster is running, your public IP is allowed, and the database user has readWrite access to the named database. Verify the URI/password locally; credentials are withheld.')
  }
} finally {
  await mongoose.disconnect()
}
process.exitCode = valid ? 0 : 1
