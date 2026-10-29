// Per-account creation limit shared by all serverless instances. Independent of link deletion/revocation.
import mongoose from 'mongoose'

const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true },
  window: { type: Date, required: true },
  count: { type: Number, required: true, min: 1, max: 5 },
  expiresAt: { type: Date, required: true },
}, { bufferCommands: false, strict: 'throw' })
schema.index({ userId: 1, window: 1 }, { unique: true })
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })
export const CareInviteQuota = mongoose.models.CareInviteQuota ?? mongoose.model('CareInviteQuota', schema)
