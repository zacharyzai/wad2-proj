// Owner: Sheen Hern's models folder (built by Claude, declared in README.txt). A user's medicine list, kept on the account so
// every device shows the same Schedule (src/stores/scheduleSync.js), and the timetable worked out from it on the server with
// src/rules/schedule.js, which a linked caregiver reads (server/routes/care.js). Extracted label text only, never a photo.
import mongoose from 'mongoose'

const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, immutable: true },
  medicines: { type: [mongoose.Schema.Types.Mixed], default: undefined }, // checked by server/validation/medicines.js
  entries: { type: [mongoose.Schema.Types.Mixed], default: [] }, // ScheduleEntry list (docs/google-contract.md)
}, { timestamps: true, bufferCommands: false })

export const Schedule = mongoose.models.Schedule ?? mongoose.model('Schedule', schema)
