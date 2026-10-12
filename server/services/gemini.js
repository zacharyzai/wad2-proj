// Owner: Zachary. Sends one photo to Gemini and returns a contract-shaped Scan.
// The image only lives in memory for this request; it is never written anywhere.
import {
  normalizeMedication,
  normalizeBill,
  DOSE_UNITS,
  TIMINGS,
  WITH_FOOD,
  FREQUENCY_TYPES,
  BILL_CATEGORIES,
  SUBSIDY_SCHEMES,
} from './normalizeScan.js'

export class ScanError extends Error {
  constructor(status, code, message) {
    super(message)
    this.status = status
    this.code = code
  }
}

const API = 'https://generativelanguage.googleapis.com/v1beta/models'
const TIMEOUT_MS = 25_000

// Gemini responseSchema (OpenAPI subset). Nullable everywhere so the model can say "unreadable" instead of guessing.
const S = { type: 'STRING', nullable: true }
const N = { type: 'NUMBER', nullable: true }
const E = (values) => ({ type: 'STRING', enum: values, nullable: true })
const obj = (properties) => ({ type: 'OBJECT', properties, required: Object.keys(properties) })

const SCHEMAS = {
  medication: obj({
    readable: { type: 'BOOLEAN' },
    name: S,
    strength: S,
    doseAmount: N,
    doseUnit: E(DOSE_UNITS),
    timesPerDay: { type: 'INTEGER', nullable: true },
    timing: { type: 'ARRAY', items: { type: 'STRING', enum: TIMINGS }, nullable: true },
    withFood: E(WITH_FOOD),
    frequencyType: E(FREQUENCY_TYPES),
    rawInstruction: S,
    warnings: { type: 'ARRAY', items: { type: 'STRING' } },
  }),
  bill: obj({
    readable: { type: 'BOOLEAN' },
    clinic: S,
    visitDate: S,
    items: { type: 'ARRAY', items: obj({ description: S, category: E(BILL_CATEGORIES), amount: N }) },
    subsidies: { type: 'ARRAY', items: obj({ scheme: E(SUBSIDY_SCHEMES), amount: N }) },
    medisave: N,
    totalPayable: N,
  }),
}

const RULES = `Rules:
- Copy only what is printed. If a value is blurry, cut off or missing, use null. Never guess.
- Set "readable" to false if the photo is not the requested document or is too unclear to read at all.
- Never extract patient names, NRIC/FIN numbers, addresses or phone numbers.
- Numbers must be numbers (e.g. 2, not "two").`

const PROMPTS = {
  medication: `You read Singapore pharmacy medication labels for elderly patients.
Extract the medicine on this label.
- doseAmount: amount per dose (e.g. "Take 2 tablets" -> 2). doseUnit: tablet, capsule, ml, puff, drop or other.
- timesPerDay: doses per day for a fixed daily schedule ("twice a day" -> 2, "every morning" -> 1).
- timing: only the times of day the label explicitly states ("morning and night" -> ["morning","bedtime"]); otherwise null.
- withFood: "before" / "after" / "with" food, "any" if the label says with or without food, null if not stated.
- frequencyType: "daily" for a fixed daily pattern; "as_needed" for "when necessary"/PRN; "weekly"; "tapering" if the dose changes over days; otherwise "other".
- rawInstruction: the dosing instruction exactly as printed. warnings: each caution line as printed (e.g. "May cause drowsiness").
${RULES}`,
  bill: `You read SingHealth Polyclinics bills / tax invoices in Singapore.
Extract the bill.
- items: each charge line with its description as printed, a category, and the gross amount in SGD dollars (e.g. 14.50).
- subsidies: each subsidy/deduction line. scheme: "government" for government/polyclinic subsidy, "chas" for CHAS,
  "pioneer" for Pioneer Generation (PG), "merdeka" for Merdeka Generation (MG), otherwise "other". amount as a positive number.
- medisave: amount paid by MediSave in dollars, 0 if there is no MediSave line.
- totalPayable: the final amount the patient pays in dollars.
- visitDate as YYYY-MM-DD. clinic: the polyclinic name.
${RULES}`,
}

export async function extractScan(type, imageDataUrl) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new ScanError(503, 'AI_UNAVAILABLE', 'GEMINI_API_KEY is not set')
  const model = process.env.GEMINI_MODEL || 'gemini-3.8-flash'

  const [, mimeType, data] = imageDataUrl.match(/^data:(image\/[a-z]+);base64,(.+)$/)

  let res
  try {
    res = await fetch(`${API}/${model}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ inline_data: { mime_type: mimeType, data } }, { text: PROMPTS[type] }] }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMAS[type], temperature: 0 },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (err) {
    console.error('Gemini request failed:', err.name)
    throw new ScanError(503, 'AI_UNAVAILABLE', 'Could not reach the AI service')
  }

  if (res.status === 429) throw new ScanError(429, 'RATE_LIMITED', 'AI quota reached, please try again later')
  if (!res.ok) {
    // Log Gemini's error text (never the image) to debug prompt/schema/key problems.
    console.error('Gemini error', res.status, (await res.text()).slice(0, 500))
    throw new ScanError(503, 'AI_UNAVAILABLE', 'The AI service returned an error')
  }

  const text = (await res.json()).candidates?.[0]?.content?.parts?.[0]?.text
  // No text usually means the model refused or was blocked (e.g. safety filter).
  if (!text) throw new ScanError(422, 'UNREADABLE_IMAGE', 'The photo could not be read')

  let raw
  try {
    raw = JSON.parse(text)
  } catch {
    throw new ScanError(503, 'AI_UNAVAILABLE', 'The AI returned an invalid response')
  }
  if (raw.readable === false) throw new ScanError(422, 'UNREADABLE_IMAGE', 'The photo could not be read')

  return type === 'medication' ? normalizeMedication(raw) : normalizeBill(raw)
}
