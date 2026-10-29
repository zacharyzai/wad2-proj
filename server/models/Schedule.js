// Owner: Sheen Hern's models folder (built by Claude, declared in README.txt). A senior's medicine timetable, copied to their
// account so a linked caregiver can see today's doses (server/routes/care.js). The same ScheduleEntry list Google Calendar sync
// gets (docs/google-contract.md), checked by checkEntries before saving: labels, doses and dates only, never a photo.
import mongoose from 'mongoose'

const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, immutable: true },
  entries: { type: [mongoose.Schema.Types.Mixed], default: [] },
}, { timestamps: true, bufferCommands: false })

export const Schedule = mongoose.models.Schedule ?? mongoose.model('Schedule', schema)
