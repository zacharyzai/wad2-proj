// One MongoDB connection, opened on first use and reused (serverless functions keep it between requests while warm).
import mongoose from 'mongoose'

let connecting = null

export function connectDb() {
  if (!process.env.MONGODB_URI) return Promise.reject(new Error('MONGODB_URI is not set'))
  connecting ??= mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 }).catch((err) => {
    connecting = null // let the next request try again
    throw err
  })
  return connecting
}
