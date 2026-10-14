// Owner: Zachary. Sends one photo to Gemini (Groq as last fallback) and returns a contract-shaped Scan.
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
// OpenAI-compatible. Different company from Google, so it isn't hit by the same overloads.
const GROQ_API = 'https://api.groq.com/openai/v1/chat/completions'
// One deadline for the whole scan, shared by the main model and its fallbacks.
const TIMEOUT_MS = 25_000
// A slow main model gives up early enough for a fallback to still answer in time.
const FIRST_TRY_MS = 15_000
// Another model may succeed after these: overloaded/server error, per-model quota, retired model.
// 400/403 mean our request or key is wrong, which no other model fixes.
const TRY_NEXT = new Set([404, 429, 500, 503])

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

const list = (value) => (value ?? '').split(',').map((m) => m.trim()).filter(Boolean)

// Each attempt knows how to send the photo to one model and where that provider puts the reply text.
function geminiAttempt(model, type, imageDataUrl) {
  const [, mimeType, data] = imageDataUrl.match(/^data:(image\/[a-z]+);base64,(.+)$/)
  return {
    name: model,
    send: (signal) =>
      fetch(`${API}/${model}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
        body: JSON.stringify({
          contents: [{ parts: [{ inline_data: { mime_type: mimeType, data } }, { text: PROMPTS[type] }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: SCHEMAS[type],
            temperature: 0,
            // Copying text off a label needs no reasoning; low thinking is much faster.
            thinkingConfig: { thinkingLevel: 'low' },
          },
        }),
        signal,
      }),
    text: (json) => json.candidates?.[0]?.content?.parts?.[0]?.text,
  }
}

function groqAttempt(model, type, imageDataUrl) {
  return {
    name: `groq:${model}`,
    send: (signal) =>
      fetch(GROQ_API, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.GROQ_API_KEY}` },
        body: JSON.stringify({
          model,
          temperature: 0,
          // JSON mode only; the schema goes in the prompt. normalizeScan still checks every field.
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: `${PROMPTS[type]}\nReply with JSON only, matching this schema:\n${JSON.stringify(SCHEMAS[type])}` },
                { type: 'image_url', image_url: { url: imageDataUrl } },
              ],
            },
          ],
        }),
        signal,
      }),
    text: (json) => json.choices?.[0]?.message?.content,
  }
}

// GEMINI_MODEL, then GEMINI_FALLBACK_MODELS, then GROQ_MODELS; only providers with a key are used.
function attempts(type, imageDataUrl) {
  const gemini = process.env.GEMINI_API_KEY
    ? [...new Set([process.env.GEMINI_MODEL || 'gemini-3.8-flash', ...list(process.env.GEMINI_FALLBACK_MODELS)])]
    : []
  const groq = process.env.GROQ_API_KEY ? list(process.env.GROQ_MODELS ?? 'qwen/qwen3.8-27b') : []
  return [...gemini.map((m) => geminiAttempt(m, type, imageDataUrl)), ...groq.map((m) => groqAttempt(m, type, imageDataUrl))]
}

export async function extractScan(type, imageDataUrl) {
  const tries = attempts(type, imageDataUrl)
  if (!tries.length) throw new ScanError(503, 'AI_UNAVAILABLE', 'No AI key is set (GEMINI_API_KEY or GROQ_API_KEY)')

  const deadline = Date.now() + TIMEOUT_MS
  const statuses = []
  let res = null
  let used = null
  for (const [i, attempt] of tries.entries()) {
    const left = deadline - Date.now()
    if (left <= 0) break
    const isLast = i === tries.length - 1
    try {
      res = await attempt.send(AbortSignal.timeout(isLast ? left : Math.min(left, FIRST_TRY_MS)))
    } catch (err) {
      console.error(`AI ${attempt.name} request failed:`, err.name)
      res = null
      continue
    }
    if (res.ok) {
      used = attempt
      if (i > 0) console.log(`AI answered with fallback ${attempt.name}`)
      break
    }
    // Log the provider's error text (never the image) to debug prompt/schema/key/model problems.
    console.error(`AI ${attempt.name} error`, res.status, (await res.text()).slice(0, 500))
    statuses.push(res.status)
    res = null
    if (!TRY_NEXT.has(statuses.at(-1))) break
  }

  if (!res) {
    if (statuses.length && statuses.every((s) => s === 429)) throw new ScanError(429, 'RATE_LIMITED', 'AI quota reached, please try again later')
    throw new ScanError(503, 'AI_UNAVAILABLE', statuses.length ? 'The AI service returned an error' : 'Could not reach the AI service')
  }

  const text = used.text(await res.json())
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
