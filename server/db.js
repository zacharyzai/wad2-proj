import mongoose from 'mongoose'
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

// Existing local MongoDB launcher and diagnostics use this name.
export const connectDatabase = connectDb
