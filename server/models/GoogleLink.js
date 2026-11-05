import mongoose from 'mongoose'

const linkSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    refreshToken: { type: String, required: true }, // AES-256-GCM: iv.tag.ciphertext
    // doseId → the Google event we made for it, and a fingerprint of what we sent, so a sync only touches doses that changed.
    // `${doseId}:late` → the "Not ticked yet" alert for that dose, which also keeps the dose `time` so a tick can find its day.
    events: {
      type: Map,
      of: new mongoose.Schema({ eventId: String, hash: String, time: String }, { _id: false }),
      default: () => new Map(),
    },
  },
  { timestamps: true },
)

export const GoogleLink = mongoose.models.GoogleLink ?? mongoose.model('GoogleLink', linkSchema)
