// Calls Gemini (Groq as last fallback) with model fallback; extractScan turns the photo (or the pages of one
// bill or label, each its own image) into a contract-shaped Scan. The images only live in memory for this request; they are
// never written anywhere.
import {
  normalizeMedication,
  normalizeBill,
  addsUp,
  DOSE_UNITS,
  TIMINGS,
  WITH_FOOD,
  FREQUENCY_TYPES,
  BILL_CATEGORIES,
  PURPOSES,
  SUBSIDY_SCHEMES,
  BILL_PLACES,
} from './normalizeScan.js'
import { billGap, sectionsOff } from '../../src/rules/billCheck.js'

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
// One deadline for the whole scan, shared by the main model and its fallbacks. With covering on the phone and the upload,
// a scan then stays inside the app's 30 s limit (SCAN_LIMIT_MS in ScanView.vue).
const TIMEOUT_MS = 16_000
// Every page after the first gets this much longer: the model reads each one (ScanView gives the whole scan as much more).
const PAGE_MS = 4_000
// A slow model gives up early enough for a fallback to still answer in time.
const FIRST_TRY_MS = 9_000
// Always kept for the last model (Groq, a different company): when every Gemini model is overloaded and slow to say so,
// the backup still gets its turn instead of the deadline running out first.
const LAST_TRY_RESERVE_MS = 5_000
// A model that was just overloaded, out of quota or too slow is tried last for 2 minutes, so the next scans go straight
// to one that is working instead of waiting for it to fail again. Per server instance; it forgets on a cold start.
const REST_MS = 2 * 60_000
const restingUntil = new Map()
// True while a model that just failed is being skipped.
const resting = (attempt) => (restingUntil.get(attempt.name) ?? 0) > Date.now()
// Clears the skip list (used by tests).
export const forgetResting = () => restingUntil.clear() // tests
// Another model may succeed after these: overloaded/server error, per-model quota, retired model.
// 400/403 mean our request or key is wrong, which no other model fixes.
const TRY_NEXT = new Set([404, 429, 500, 503])

// Gemini responseSchema (OpenAPI subset). Nullable everywhere so the model can say "unreadable" instead of guessing.
const S = { type: 'STRING', nullable: true }
const N = { type: 'NUMBER', nullable: true }
// Schema helper: a nullable string limited to the given values, so the AI can only answer with contract enums or null.
const E = (values) => ({ type: 'STRING', enum: values, nullable: true })
// Schema helper: an object whose every field must be present (null when unclear).
const obj = (properties) => ({ type: 'OBJECT', properties, required: Object.keys(properties) })

const SCHEMAS = {
  medication: obj({
    readable: { type: 'BOOLEAN' },
    otherDocument: { type: 'BOOLEAN' },
    looksLike: E(['medication', 'bill', 'other']),
    name: S,
    strength: S,
    doseAmount: N,
    doseUnit: E(DOSE_UNITS),
    quantity: N,
    timesPerDay: { type: 'INTEGER', nullable: true },
    timing: { type: 'ARRAY', items: { type: 'STRING', enum: TIMINGS }, nullable: true },
    withFood: E(WITH_FOOD),
    frequencyType: E(FREQUENCY_TYPES),
    rawInstruction: S,
    purpose: E(PURPOSES),
    warnings: { type: 'ARRAY', items: { type: 'STRING' } },
  }),
  bill: obj({
    readable: { type: 'BOOLEAN' },
    otherDocument: { type: 'BOOLEAN' },
    looksLike: E(['medication', 'bill', 'other']),
    clinic: S,
    place: E(BILL_PLACES),
    visitDate: S,
    items: {
      type: 'ARRAY',
      items: obj({ description: S, category: E(BILL_CATEGORIES), amount: N, section: S }),
    },
    subtotals: { type: 'ARRAY', items: obj({ section: S, amount: N }) },
    subsidies: {
      type: 'ARRAY',
      items: obj({ scheme: E(SUBSIDY_SCHEMES), amount: N, includedInItems: { type: 'BOOLEAN' } }),
    },
    medisave: N,
    totalPayable: N,
    gstAbsorbed: { type: 'BOOLEAN' },
  }),
}

const RULES = `Rules:
- Copy only what is printed. If a value is blurry, cut off or missing, use null. Never guess.
- Set "readable" to false only if the photo is too unclear to read at all (blurry, dark, cut off).
- Set "otherDocument" to true if the photo is readable but is not the requested kind of document (for example not a
  medical bill at all, or a bill when a medicine label was asked for). Then set "looksLike" to what it is: "bill" for any
  medical bill, invoice or receipt, "medication" for a medicine label, otherwise "other"; and leave every other field
  empty or null.
- Never extract patient names, NRIC/FIN numbers, addresses or phone numbers.
- Numbers must be numbers (e.g. 2, not "two").`

const PROMPTS = {
  medication: `You read Singapore pharmacy medication labels for elderly patients.
Extract the medicine on this label.
- doseAmount: amount per dose (e.g. "Take 2 tablets" -> 2). doseUnit: tablet, capsule, ml, puff, drop or other.
- quantity: how much was given, in the same unit as the dose ("Qty: 60 tablets" -> 60, "100 ml" -> 100). null if the
  label doesn't say, or gives it in another unit (e.g. "2 boxes").
- timesPerDay: doses per day for a fixed daily schedule ("twice a day" -> 2, "every morning" -> 1).
- timing: only the times of day the label explicitly states ("morning and night" -> ["morning","bedtime"]); otherwise null.
- withFood: "before" / "after" / "with" food, "any" if the label says with or without food, null if not stated.
- frequencyType: "daily" for a fixed daily pattern; "as_needed" for "when necessary"/PRN; "weekly"; "tapering" if the dose changes over days; otherwise "other".
- purpose: what this medicine is usually used for, ONLY if you are sure of it from the medicine's name: one of pain, blood_pressure,
  diabetes, cholesterol, heart, infection, stomach, allergy, cough_cold, breathing, mood_sleep, skin, vitamins. If it could be
  for several of these, or you are not sure, use null. Never guess: a wrong purpose is worse than none.
- rawInstruction: the dosing instruction exactly as printed. warnings: each caution line as printed (e.g. "May cause drowsiness").
${RULES}`,
  bill: `You read medical bills, invoices and receipts in Singapore, from any medical place: polyclinic, GP clinic, dental clinic,
specialist clinic, hospital (inpatient or outpatient), TCM, physiotherapy, laboratory or pharmacy.
Extract the bill.
- place: polyclinic, gp, dental, specialist, hospital, tcm, pharmacy, lab, or other (e.g. physiotherapy).
- items: each charge line with its description as printed, a category, and the amount in SGD dollars (e.g. 14.50).
  category: consultation (doctor or dentist fees), medication, investigation (lab tests, X-rays, scans), procedure
  (treatment, surgery, therapy, nursing, consumables), ward (ward, bed or room charges), tax (GST), otherwise other.
  Copy every amount digit by digit, exactly as printed (14.50 is not 14.00).
  Thousands are printed with a comma: "2,038.20" is 2038.20, never 20.38 or 20.88. Never drop digits from a large amount.
  One printed item is one line in items, even when its description wraps onto a second row (e.g. "PARACETAMOL" then
  "TABLET (42MG)" underneath): join the rows into one description. An amount is only a value in the amount/fee/price
  column, never a strength (42mg, 5ml), a quantity or a pack size.
  section: the heading the line is printed under (e.g. "Consultation Fees", "Medications List"), or null if none.
  Do not list subtotals or totals as items. Never list a deduction as an item: a line with a minus sign or in brackets
  (e.g. "MediShield Life -6,120.00", "Integrated Plan Payout (24,074.86)", "MediSave -1,500.00") lowers what is paid and
  goes in subsidies or medisave instead. If the bill gives each line a gross and a net (after subsidy) amount, use the
  NET amount for every item, and mark the subsidy already taken off those lines with "includedInItems": true.
  GST that the government absorbs ("GST absorbed by Govt", shown as a minus that cancels the GST) is not an item and
  not a subsidy: leave both out, the net lines already exclude it.
- gstAbsorbed: true if the bill prints a line saying the government absorbs the GST (e.g. "GST absorbed by Govt"),
  otherwise false.
  GST is its own "tax" item, unless the bill says GST is already included in the charges (e.g. "GST at 7% is included
  in this bill"): then do not list it at all.
- subtotals: each subtotal printed under one group of charge lines, with that group's heading as section, exactly as
  the lines' section (e.g. {"section": "Medications List", "amount": 83.76}). Not the overall totals.
- subsidies: each subsidy, deduction or claim that lowers what the patient pays (not MediSave). scheme: "government" for
  government/polyclinic/ward subsidy, "chas" for CHAS, "pioneer" for Pioneer Generation (PG), "merdeka" for Merdeka
  Generation (MG), "insurance" for MediShield Life, Integrated Shield, private or employer insurance, "paid" for money
  already paid earlier (a deposit, or a payment shown in a payer or payment table), otherwise "other".
  amount as a positive number, even when printed with a minus sign. includedInItems: true only for a subsidy already taken off the item amounts you listed
  (net lines); otherwise false.
- medisave: amount paid by MediSave in dollars, as a positive number, 0 if there is no MediSave line.
- totalPayable: the final amount the patient pays in cash, card or NETS for this bill, in dollars (after deposits and
  payments made before this bill; on an interim bill, the amount due shown). On a receipt that shows the payment for
  this bill ("Amount Paid $35.53" next to "Total Payable $35.53"), totalPayable is that amount, never 0.
  A payment made for this same bill ("Net Payment made -217.18", an e-payment) stays totalPayable 0 when the final amount
  payable is 0.00, but list that payment as a subsidy with scheme "paid" and includedInItems false, so the charges
  minus what was paid adds up to the total.
- visitDate as YYYY-MM-DD (the visit date, or the discharge date for a hospital stay). Singapore dates are written
  day first: 07/10/2026 is 7 October 2026, so "2026-10-07". clinic: the clinic or hospital name.
${RULES}`,
}

// Splits a comma-separated env value into a clean list.
export const list = (value) =>
  (value ?? '')
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean)

// One attempt per model: how to send the request and where that provider puts the reply text.
// `body` is everything except the model name, so scan and chat share the same senders.
// The main key, then any add-on keys (GEMINI_EXTRA_KEYS / GROQ_EXTRA_KEYS, comma separated) from other accounts for their own quota.
export const geminiKeys = () =>
  [process.env.GEMINI_API_KEY, ...list(process.env.GEMINI_EXTRA_KEYS)].filter(Boolean)
// Every configured Groq key; more keys means more free-tier quota.
const groqKeys = () =>
  [process.env.GROQ_API_KEY, ...list(process.env.GROQ_EXTRA_KEYS)].filter(Boolean)
// Same model on a different key is a different attempt, so one key running out doesn't rest the others.
export const keyed = (model, i) => (i ? `${model}#${i + 1}` : model)

// One try at a scan with Gemini (a model + key pair), in the shape firstReply() runs.
function geminiAttempt(model, body, key = process.env.GEMINI_API_KEY, i = 0) {
  return {
    name: keyed(model, i),
    send: (signal) =>
      fetch(`${API}/${model}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify(body),
        signal,
      }),
    text: (json) => json.candidates?.[0]?.content?.parts?.[0]?.text,
  }
}

// One try at a scan with Groq, in the same shape as geminiAttempt.
function groqAttempt(model, body, key, i) {
  return {
    name: `groq:${keyed(model, i)}`,
    send: (signal) =>
      fetch(GROQ_API, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
        body: JSON.stringify({ model, ...body }),
        signal,
      }),
    text: (json) => json.choices?.[0]?.message?.content,
  }
}

// Gemini models first, then Groq; a provider is skipped when it has no key. Every model on the main key comes before add-on keys.
export function attempts({ gemini, groq, geminiBody, groqBody }) {
  return [
    ...geminiKeys().flatMap((key, i) =>
      [...new Set(gemini)].map((m) => geminiAttempt(m, geminiBody, key, i)),
    ),
    ...groqKeys().flatMap((key, i) =>
      [...new Set(groq)].map((m) => groqAttempt(m, groqBody, key, i)),
    ),
  ]
}

// Tries each model in turn within one deadline. Resolves to the reply text, or null when the model sent none
// (usually a refusal or safety block). Throws ScanError when no model answered at all.
export async function firstReply(tries, timeoutMs = TIMEOUT_MS) {
  if (!tries.length)
    throw new ScanError(503, 'AI_UNAVAILABLE', 'No AI key is set (GEMINI_API_KEY or GROQ_API_KEY)')

  const deadline = Date.now() + timeoutMs
  const statuses = []
  // Models that failed recently go to the back, in their usual order.
  const order = [...tries.filter((a) => !resting(a)), ...tries.filter(resting)]
  for (const [i, attempt] of order.entries()) {
    const left = deadline - Date.now()
    if (left <= 0) break
    const isLast = i === order.length - 1
    const budget = isLast ? left : Math.min(FIRST_TRY_MS, left - LAST_TRY_RESERVE_MS)
    if (budget < 1_500) continue // not worth starting: leave the time to the last model
    let res
    try {
      res = await attempt.send(AbortSignal.timeout(budget))
    } catch (err) {
      console.error(`AI ${attempt.name} request failed:`, err.name)
      restingUntil.set(attempt.name, Date.now() + REST_MS)
      continue
    }
    if (res.ok) {
      restingUntil.delete(attempt.name)
      if (attempt !== tries[0]) console.log(`AI answered with fallback ${attempt.name}`)
      return attempt.text(await res.json()) || null
    }
    // Log the provider's error text (never the image or question) to debug prompt/schema/key/model problems.
    console.error(`AI ${attempt.name} error`, res.status, (await res.text()).slice(0, 500))
    statuses.push(res.status)
    if (!TRY_NEXT.has(res.status)) break
    restingUntil.set(attempt.name, Date.now() + REST_MS)
  }

  if (statuses.length && statuses.every((s) => s === 429))
    throw new ScanError(429, 'RATE_LIMITED', 'AI quota reached, please try again later')
  throw new ScanError(
    503,
    'AI_UNAVAILABLE',
    statuses.length ? 'The AI service returned an error' : 'Could not reach the AI service',
  )
}

// Parses the model's JSON reply; a reply that isn't JSON counts as an outage, not as data.
export function parseJson(text) {
  try {
    return JSON.parse(text)
  } catch {
    throw new ScanError(503, 'AI_UNAVAILABLE', 'The AI returned an invalid response')
  }
}

// A bill whose lines don't add up is read once more, if at least this much of the scan's time is left.
const RECHECK_MIN_MS = 6_000

// GEMINI_MODEL, then GEMINI_FALLBACK_MODELS, then GROQ_MODELS.
// canRecheck: asked before the extra reading of a bill that doesn't add up (the route counts it against the daily cap).
// images: one data URL, or the pages of one document in order (a long bill, a label photographed from two sides).
export async function extractScan(type, images, { canRecheck = () => true } = {}) {
  const pages = [images].flat()
  const started = Date.now()
  const timeout = TIMEOUT_MS + PAGE_MS * (pages.length - 1)
  const first = await readOnce(type, pages, PROMPTS[type], timeout)
  if (type !== 'bill' || first.unclear.length || addsUp(first)) return first
  const left = timeout - (Date.now() - started)
  if (left < RECHECK_MIN_MS || !canRecheck()) return first
  // The second reading is used only if it adds up and agrees on the total: never a total changed to make the sums work.
  const second = await readOnce(
    type,
    pages,
    `${PROMPTS.bill}\n${recheckNote(first.bill)}`,
    left,
  ).catch(() => null)
  return second && addsUp(second) && second.bill.totalPayableCents === first.bill.totalPayableCents
    ? second
    : first
}

// What didn't add up in the first reading, so the second one looks there. It names the printed numbers, never an answer.
function recheckNote(bill) {
  const $ = (cents) => `$${(cents / 100).toFixed(2)}`
  const off = sectionsOff(bill).map(
    (s) =>
      `the lines under "${s.section}" add up to ${$(s.linesCents)}, but its subtotal is printed as ${$(s.printedCents)}`,
  )
  const why = off.length
    ? off.join('; ')
    : `the charges minus deductions come to ${$(billGap(bill) + bill.totalPayableCents)}, but the total payable is printed as ${$(bill.totalPayableCents)}`
  return `A first reading of this bill did not add up: ${why}. Read every amount again, digit by digit (a digit or a thousands comma may have been dropped from a large amount: the lines are $${(Math.abs(billGap(bill)) / 100).toFixed(2)} ${billGap(bill) < 0 ? 'too low' : 'too high'}), and return the whole bill.
Copy only what is printed: never change an amount just to make the numbers add up.`
}

// Several pages: each is named before its image, and the prompt says they are one document, so a charge seen twice where
// photos overlap, or a header repeated on every page, is not listed twice.
const pagesNote = (type, n) => {
  if (n < 2) return ''
  const doc = type === 'bill' ? 'bill' : 'medicine label'
  return `
The ${n} images above are pages (or overlapping photos) of ONE ${doc}, in order. Read every page and return one ${doc} for
all of them. A line that appears on two images (where photos overlap, or a header or summary repeated on each page) is
listed once. Totals are usually on the last page.`
}

// One reading: the models in turn, the reply checked and normalized. Throws ScanError for an unreadable or wrong document.
async function readOnce(type, pages, basePrompt, timeoutMs) {
  const prompt = basePrompt + pagesNote(type, pages.length)
  const images = pages.map((url) => {
    const [, mimeType, data] = url.match(/^data:(image\/[a-z]+);base64,(.+)$/)
    return { inline_data: { mime_type: mimeType, data } }
  })
  // Labels each page of a multi-page bill for the AI so it keeps the pages in order.
  const label = (i) => (pages.length > 1 ? [{ text: `Page ${i + 1} of ${pages.length}:` }] : [])
  const text = await firstReply(
    attempts({
      gemini: [
        process.env.GEMINI_MODEL || 'gemini-3.8-flash',
        ...list(process.env.GEMINI_FALLBACK_MODELS),
      ],
      groq: list(process.env.GROQ_MODELS ?? 'qwen/qwen3.8-27b'),
      geminiBody: {
        contents: [
          { parts: [...images.flatMap((image, i) => [...label(i), image]), { text: prompt }] },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: SCHEMAS[type],
          temperature: 0,
          // Copying text off a label needs no reasoning; low thinking is much faster. (Medium thinking and high media
          // resolution for bills were tried on 28 Oct 2026 but couldn't be timed: Gemini was overloaded. A bill that
          // doesn't add up is read once more instead, see extractScan.)
          thinkingConfig: { thinkingLevel: 'low' },
          // Bills have small print in two money columns: more image detail per page means fewer misread digits.
          ...(type === 'bill' && { mediaResolution: 'MEDIA_RESOLUTION_HIGH' }),
        },
      },
      groqBody: {
        temperature: 0,
        // JSON mode only; the schema goes in the prompt. normalizeScan still checks every field.
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `${prompt}\nReply with JSON only, matching this schema:\n${JSON.stringify(SCHEMAS[type])}`,
              },
              ...pages.map((url) => ({ type: 'image_url', image_url: { url } })),
            ],
          },
        ],
      },
    }),
    timeoutMs,
  )
  // No text usually means the model refused or was blocked (e.g. safety filter).
  if (!text) throw new ScanError(422, 'UNREADABLE_IMAGE', 'The photo could not be read')

  const raw = parseJson(text)
  // A clear photo of the wrong kind of document must not be told to "retake it in good light". A bill sent as a label (or
  // the other way round) gets its own code, so the app can ask "was this meant to be a bill?" and read it as one.
  if (raw.otherDocument === true) {
    if (type === 'medication' && raw.looksLike === 'bill')
      throw new ScanError(
        422,
        'LOOKS_LIKE_BILL',
        'This looks like a medical bill, not a medication label',
      )
    if (type === 'bill' && raw.looksLike === 'medication')
      throw new ScanError(
        422,
        'LOOKS_LIKE_LABEL',
        'This looks like a medication label, not a medical bill',
      )
    throw new ScanError(
      422,
      'WRONG_DOCUMENT',
      `This is not a ${type === 'bill' ? 'medical bill' : 'medication label'}`,
    )
  }
  if (raw.readable === false)
    throw new ScanError(422, 'UNREADABLE_IMAGE', 'The photo could not be read')

  return type === 'medication' ? normalizeMedication(raw) : normalizeBill(raw)
}
