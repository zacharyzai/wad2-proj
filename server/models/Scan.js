// Owner: Sheen Hern. Confirmed contract data only; never an uploaded photo or account profile.
import mongoose from 'mongoose'
import { BILL_CATEGORIES, BILL_PLACES, DOSE_UNITS, FREQUENCY_TYPES, SUBSIDY_SCHEMES, TIMINGS, WITH_FOOD } from '../services/normalizeScan.js'

const nested = { _id: false, strict: 'throw' }
const text = { type: String, default: null, maxlength: 2000 }
const cents = { type: Number, required: true, min: 0, max: 1e12, validate: Number.isSafeInteger }
const medication = new mongoose.Schema({
  name: { ...text, required: true }, strength: text,
  doseAmount: { type: Number, required: true, min: Number.MIN_VALUE, max: 100 },
  doseUnit: { type: String, enum: [...DOSE_UNITS, null], default: null },
  timesPerDay: { type: Number, default: null, min: 1, max: 6, validate: (v) => v === null || Number.isInteger(v) },
  timing: { type: [{ type: String, enum: TIMINGS }], default: null },
  withFood: { type: String, enum: [...WITH_FOOD, null], default: null },
  frequencyType: { type: String, required: true, enum: FREQUENCY_TYPES },
  rawInstruction: text, warnings: [{ type: String, maxlength: 2000 }],
}, nested)
const bill = new mongoose.Schema({
  clinic: text, place: { type: String, enum: [...BILL_PLACES, null], default: null },
  visitDate: { type: String, default: null },
  items: [new mongoose.Schema({ description: { ...text, required: true }, category: { type: String, required: true, enum: BILL_CATEGORIES }, amountCents: cents }, nested)],
  subsidies: [new mongoose.Schema({ scheme: { type: String, required: true, enum: SUBSIDY_SCHEMES }, amountCents: cents, includedInItems: { type: Boolean, default: false } }, nested)],
  medisaveCents: cents, totalPayableCents: cents,
}, nested)
const scanSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  type: { type: String, required: true, enum: ['medication', 'bill'] },
  source: { type: String, required: true, enum: ['sample', 'mock', 'ai'] },
  medication: { type: medication, default: undefined }, bill: { type: bill, default: undefined },
}, { timestamps: true, bufferCommands: false, strict: 'throw' })
// _id breaks ties when multiple scans are saved in the same millisecond.
scanSchema.index({ userId: 1, createdAt: -1, _id: -1 })
export const Scan = mongoose.models.Scan ?? mongoose.model('Scan', scanSchema)
