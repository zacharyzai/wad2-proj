// Owner: Sheen Hern (built by Claude, declared in README.txt). An account. Never holds scans, photos or NRIC numbers.
// Citizenship and income use the subsidy rules' values (src/rules/subsidies.js), so the Bill page can use them as-is.
import mongoose from 'mongoose'

export const CITIZENSHIP = ['birth', 'became', 'pr', 'other'] // citizen by birth, became a citizen (citizenSince = year), PR, other
// Household monthly income per person, in the CHAS card bands (chas.sg). Citizens only; it sets the CHAS card colour.
export const INCOME = ['upTo1500', '1501to2300', 'above2300', 'unsure']

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
    passwordHash: { type: String, required: true },
    dob: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ }, // 'YYYY-MM-DD', as <input type="date"> gives it
    citizenship: { type: String, required: true, enum: CITIZENSHIP },
    citizenSince: { type: Number, default: null }, // only when citizenship is 'became'
    income: { type: String, enum: [...INCOME, null], default: null }, // only for citizens
  },
  { timestamps: true, bufferCommands: false },
)

// What the client may see: never the password hash.
userSchema.methods.toPublic = function () {
  return { name: this.name ?? '', email: this.email, dob: this.dob ?? '', citizenship: this.citizenship ?? '', citizenSince: this.citizenSince ?? null, income: this.income ?? null }
}

export const User = mongoose.models.User ?? mongoose.model('User', userSchema)

// Default export retained for local tooling and the database integration tests.
export default User
