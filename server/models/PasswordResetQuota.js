// Per-email limit on "Forgot your password?" emails (routes/auth.js), shared by all serverless instances, so nobody can
// flood someone's inbox. Keyed by a SHA-256 of the email, not the address: people type addresses with no account, and we
// don't keep a list of those. Counted the same whether or not the account exists. Rows delete themselves after 2 hours.
import mongoose from 'mongoose'

const schema = new mongoose.Schema({
  emailHash: { type: String, required: true, match: /^[a-f0-9]{64}$/ },
  window: { type: Date, required: true }, // the start of the hour
  count: { type: Number, required: true, min: 1 },
  expiresAt: { type: Date, required: true },
}, { bufferCommands: false, strict: 'throw' })
schema.index({ emailHash: 1, window: 1 }, { unique: true })
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })
export const PasswordResetQuota = mongoose.models.PasswordResetQuota ?? mongoose.model('PasswordResetQuota', schema)
