// Owner: Lokesh, in Sheen Hern's models folder. One per dose the user ticked as taken on the Schedule page. Contract: docs/doses-contract.md
// Holds only the dose id (medicine + slot, from src/rules/schedule.js) and the day: never the medicine's name or instructions.
import mongoose from 'mongoose'

const doseSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    doseId: { type: String, required: true, maxlength: 80 },
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ }, // the day in Singapore, 'YYYY-MM-DD'
    takenAt: { type: Date, required: true },
  },
  { bufferCommands: false },
)

// One tick per dose per day, so double-tapping (or two devices) can never create duplicates. Also serves GET by day.
doseSchema.index({ userId: 1, date: 1, doseId: 1 }, { unique: true })

export const Dose = mongoose.models.Dose ?? mongoose.model('Dose', doseSchema)
