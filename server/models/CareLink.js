// One slot per senior: either a pending invitation or one active caregiver. Never store the raw invite token.
import mongoose from 'mongoose'

const schema = new mongoose.Schema({
  seniorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  caregiverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  tokenHash: { type: String, match: /^[a-f0-9]{64}$/, select: false },
  inviteExpiresAt: Date,
  linkedAt: Date,
}, { timestamps: true, bufferCommands: false, strict: 'throw' })

// A caregiver is intentionally NOT unique: they may look after multiple seniors.
schema.index({ seniorId: 1 }, { unique: true })
schema.index({ caregiverId: 1 })
schema.index({ tokenHash: 1 }, { unique: true, sparse: true })
export const CareLink = mongoose.models.CareLink ?? mongoose.model('CareLink', schema)
