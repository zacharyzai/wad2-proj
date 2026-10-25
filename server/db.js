// One MongoDB connection, opened on first use and reused (serverless functions keep it between requests while warm).
import mongoose from 'mongoose'
import { sendError } from './errors.js'

let connecting = null

export function connectDb() {
  if (!process.env.MONGODB_URI) return Promise.reject(new Error('MONGODB_URI is not set'))
  connecting ??= mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 }).catch((err) => {
    connecting = null // let the next request try again
    throw err
  })
  return connecting
}

// A database outage is our problem, not the user's: say so plainly instead of a 500 stack.
export async function withDb(res, work) {
  try {
    await connectDb()
  } catch (err) {
    console.error('MongoDB:', err.message)
    return sendError(res, 503, 'SERVER_ERROR', 'Accounts are not available right now')
  }
  return work()
}
