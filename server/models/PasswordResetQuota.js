import mongoose from 'mongoose'

const schema = new mongoose.Schema(
  {
    emailHash: { type: String, required: true, match: /^[a-f0-9]{64}$/ },
    window: { type: Date, required: true }, // the start of the hour
    count: { type: Number, required: true, min: 1 },
    expiresAt: { type: Date, required: true },
  },
  { bufferCommands: false, strict: 'throw' },
)
schema.index({ emailHash: 1, window: 1 }, { unique: true })
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })
export const PasswordResetQuota =
  mongoose.models.PasswordResetQuota ?? mongoose.model('PasswordResetQuota', schema)
