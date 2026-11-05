import mongoose from 'mongoose'

const schema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      immutable: true,
    },
    medicines: { type: [mongoose.Schema.Types.Mixed], default: undefined }, // checked by server/validation/medicines.js
    entries: { type: [mongoose.Schema.Types.Mixed], default: [] }, // ScheduleEntry list (docs/google-contract.md)
  },
  { timestamps: true, bufferCommands: false },
)

export const Schedule = mongoose.models.Schedule ?? mongoose.model('Schedule', schema)
