// Owner: Sheen Hern (built by Claude, declared in README.txt). An account. Never holds scans, photos or NRIC numbers.
// Citizenship uses the subsidy questionnaire's values (src/components/bill/SubsidyQuestionnaire.vue), so the Bill page can use it as-is.
import mongoose from 'mongoose'

export const CITIZENSHIP = ['birth', 'became', 'pr', 'other'] // citizen by birth, became a citizen (citizenSince = year), PR, other

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
    passwordHash: { type: String, required: true },
    dob: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ }, // 'YYYY-MM-DD', as <input type="date"> gives it
    citizenship: { type: String, required: true, enum: CITIZENSHIP },
    citizenSince: { type: Number, default: null }, // only when citizenship is 'became'
  },
  { timestamps: true },
)

// What the client may see: never the password hash.
userSchema.methods.toPublic = function () {
  return { name: this.name, email: this.email, dob: this.dob, citizenship: this.citizenship, citizenSince: this.citizenSince }
}

export const User = mongoose.models.User ?? mongoose.model('User', userSchema)
