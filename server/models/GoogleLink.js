// Owner: Zachary, in Sheen Hern's models folder (built by Claude, declared in README.txt). One per user who connected Google Calendar.
// The refresh token is encrypted (server/services/google.js) and never leaves the server. Contract: docs/google-contract.md
import mongoose from 'mongoose'

const linkSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    refreshToken: { type: String, required: true }, // AES-256-GCM: iv.tag.ciphertext
    // doseId → the Google event we made for it, and a fingerprint of what we sent, so a sync only touches doses that changed.
    events: { type: Map, of: new mongoose.Schema({ eventId: String, hash: String }, { _id: false }), default: () => new Map() },
  },
  { timestamps: true },
)

export const GoogleLink = mongoose.models.GoogleLink ?? mongoose.model('GoogleLink', linkSchema)
