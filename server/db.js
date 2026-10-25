import mongoose from 'mongoose'
import { sendError } from './errors.js'
import { User } from './models/User.js'

let pending
export async function connectDb() {
  if (pending) return pending
  if (mongoose.connection.readyState === 1) return
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required')
  pending = (async () => {
    try {
      await mongoose.connect(process.env.MONGODB_URI, {
        serverSelectionTimeoutMS: 5000, connectTimeoutMS: 5000, maxPoolSize: 10,
      })
      // Ensure concurrent signups cannot create duplicate emails.
      await User.init()
    } catch (error) {
      await mongoose.disconnect()
      throw error
    }
  })()
  try { await pending } finally { pending = null }
}

// A database outage is our problem, not the user's: say so plainly instead of a 500 stack.
export async function withDb(res, work) {
  try {
    await connectDb()
  } catch {
    console.error('MongoDB connection unavailable') // not err.message: it can contain the database address
    return sendError(res, 503, 'SERVER_ERROR', 'Accounts are not available right now')
  }
  return work()
}

// Existing local MongoDB launcher and diagnostics use this name.
export const connectDatabase = connectDb
