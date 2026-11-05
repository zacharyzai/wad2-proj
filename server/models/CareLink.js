import mongoose from 'mongoose'

const schema = new mongoose.Schema(
  {
    seniorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      immutable: true,
    },
    caregiverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    tokenHash: { type: String, match: /^[a-f0-9]{64}$/, select: false },
    inviteExpiresAt: Date,
    linkedAt: Date,
  },
  { timestamps: true, bufferCommands: false, strict: 'throw' },
)

// Many-to-many: one pending invite per senior (null counts as a value) and one link per senior-caregiver pair.
schema.index({ seniorId: 1, caregiverId: 1 }, { unique: true })
schema.index({ caregiverId: 1 })
schema.index({ tokenHash: 1 }, { unique: true, sparse: true })
export const CareLink = mongoose.models.CareLink ?? mongoose.model('CareLink', schema)
