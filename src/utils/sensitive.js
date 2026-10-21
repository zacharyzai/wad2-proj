// Decides what of an OCR'd photo (lines of words with boxes) may leave the phone. Pure logic, no browser APIs, so it is
// unit-tested in sensitive.test.js. Used by redact.js.
// Keep-list first: only lines that look like medicine or bill details are shown; everything else (including text the
// reader could not read, and unlabelled names like "TAN AH KOW") stays black. findSensitive then covers labelled
// personal details that sit on a kept line ("Date of Birth: 15/03/1948").
// shortcut: a drug name printed alone on its line, with no strength or form ("PANADOL"), is covered too; the AI then
// marks the name unclear and the user types it on Confirm. Add a drug-name list if that happens often.

const clean = (s) => s.replace(/^[^\p{L}\p{N}*•]+|[^\p{L}\p{N}*•]+$/gu, '')

// OCR often reads digits as look-alike letters; only fixed inside the 7-digit middle of an NRIC.
const DIGITS = { O: '0', o: '0', D: '0', Q: '0', I: '1', l: '1', '|': '1', i: '1', Z: '2', S: '5', s: '5', B: '8', G: '6' }
function isNric(raw) {
  const s = clean(raw)
  if (s.length !== 9) return false
  const middle = [...s.slice(1, 8)].map((c) => DIGITS[c] ?? c).join('')
  const full = (s[0] + middle + s[8]).toUpperCase()
  // Full number (S1234567D), or the masked form printed on many documents (SXXXX567D, ****567D).
  return /^[STFGM]\d{7}[A-Z]$/.test(full) || /^[STFGM*X•][X*•]{3,4}\d{3,4}[A-Z]$/.test(full)
}

// Singapore numbers: 8 digits starting 3/6/8/9, with or without +65.
const isPhone = (raw) => /^(\+?65)?[3689]\d{7}$/.test(raw.replace(/[\s()-]/g, ''))

// Whatever follows these labels is covered. "patient" alone needs a colon, so bill lines like "Patient payable $4.20" survive.
const LABEL = /^(patient'?s?\s*name|name|nric(\/fin)?|fin|ic\s*no\.?|id\s*no\.?|d\.?o\.?b\.?|date\s*of\s*birth|birth\s*date|(home\s*)?address|addr\.?|tel\.?|phone|mobile|hp|contact(\s*no\.?)?)$/i
const COLON_LABEL = /^(patient|pt\.?)$/i
// Whole line is an address: "Blk 123 ...", "#04-56", "Singapore 520123", "S(520123)".
const ADDRESS_LINE = /^(blk|block)\b|#\d{1,3}-\d{1,4}|singapore\s*\d{6}|\bS\(?\d{6}\)?(?!\S)/i

/**
 * @param lines [{ words: [{ text, bbox: { x0, y0, x1, y1 } }] }] as returned by Tesseract (blocks output)
 * @returns [{ text, reason, bbox }] — one entry per word to black out
 */
export function findSensitive(lines) {
  const hits = []
  const seen = new Set()
  const hit = (word, reason) => {
    if (seen.has(word)) return
    seen.add(word)
    hits.push({ text: word.text, reason, bbox: word.bbox })
  }
  let coverNextLine = null // a label with its value on the next line ("Name:" ⏎ "TAN AH KOW")

  for (const line of lines) {
    const words = line.words.filter((w) => w.text.trim())
    if (!words.length) continue
    if (coverNextLine) {
      words.forEach((w) => hit(w, coverNextLine))
      coverNextLine = null
      continue
    }
    const text = words.map((w) => w.text).join(' ')
    if (ADDRESS_LINE.test(text)) {
      words.forEach((w) => hit(w, 'address'))
      continue
    }

    for (let i = 0; i < words.length; i++) {
      const w = words[i]
      const next = words[i + 1]
      if (isNric(w.text)) hit(w, 'NRIC/FIN')
      // Split by OCR: "S1234567 D", "S 1234567D"; phones written "9123 4567".
      if (next && isNric(w.text + next.text)) hit(w, 'NRIC/FIN'), hit(next, 'NRIC/FIN')
      if (isPhone(w.text)) hit(w, 'phone')
      if (next && /^\d{4}$/.test(next.text) && isPhone(w.text + next.text)) hit(w, 'phone'), hit(next, 'phone')

      // Labels can be 1–3 words ("Date of Birth:"); the colon may be on the label or glued to the value ("Name:TAN").
      for (let n = 1; n <= 3 && i + n <= words.length; n++) {
        const group = words.slice(i, i + n).map((x) => x.text).join(' ')
        const [label, ...glued] = group.split(':')
        const hasColon = glued.length > 0
        const base = clean(label)
        const isLabel = LABEL.test(base) || (hasColon && COLON_LABEL.test(base))
        // Without a colon, only accept a label that starts the line, so "Name" in the middle of a sentence is left alone.
        if (!isLabel || (!hasColon && i > 0)) continue
        const reason = base.toLowerCase()
        if (glued.join(':').trim()) hit(words[i + n - 1], reason) // value glued on: "Name:TAN"
        // Cover the value: up to the next "Something:" field on the same line, or the next line if nothing follows.
        let j = i + n
        for (; j < words.length && !/:$/.test(words[j].text); j++) hit(words[j], reason)
        if (j === i + n && !glued.join(':').trim()) coverNextLine = reason
        i = j - 1
        break
      }
    }
  }
  return hits
}

// A line is worth sending if it has one of these. Bill and label wording, in English (the reader only reads English).
// "mo(rn|m)ing": the reader often reads "rn" as "m".
const KEEP = [
  /\d+(\.\d+)?\s*(mg|mcg|µg|g|ml|%|iu|units?)\b/i, // strength or volume: 500 MG, 5ml
  /\$?\d+\.\d{2}\b/, // money: 14.50, $8.70
  /\b(take|tab(let)?s?|cap(sule)?s?|syrup|cream|ointment|gel|drops?|puffs?|inhaler|spray|solution|suspension|lozenges?|patch(es)?|sachets?|(tea)?spoons?(ful)?|apply|inhale|swallow|chew|dissolve|insert|use)\b/i,
  /\b(once|twice|thrice|times?|daily|day|days|weekly|weeks?|hours?|hourly|every|mo(rn|m)ing|afternoon|evening|night|bedtime|before|after|food|meals?|breakfast|lunch|dinner|needed|required|pain|fever)\b/i,
  /\b(do not|don'?t|avoid|may cause|drows\w*|alcohol|finish|complete|course|external|refrigerat\w*|store|shake|warning|caution)\b/i,
  // What it is for. Condition words, not "for ...", so a line like "For Mdm Tan" is never kept.
  /\b(allerg\w*|nose|itch\w*|rash|cough|cold|flu|sneez\w*|phlegm|sore throat|headache|aches?|gastric|gastritis|acid|reflux|constipation|diarrh?o?ea|vomit\w*|nausea|infection|inflammation|swelling|blood pressure|hypertension|cholesterol|diabetes|sugar|asthma|breathless\w*|wheez\w*|sleep|anxiety|gout|eczema)\b/i,
  /\b(qty|quantity|exp(iry)?|date|dispensed|pharmacy|polyclinic|clinic|hospital|pharmacist|rx)\b/i,
  /\b(consult\w*|subsid\w*|medisave|chas|payable|total|gst|invoice|bill|receipt|amount|paid|payment|balance|pioneer|merdeka|generation|medications?|investigations?|procedures?|charges?|fees?|cash|nets|less)\b/i,
]

// Row geometry from the reader: a baseline (tilted on a tilted photo) plus how far letters reach above and below it.
// Per-word boxes are not used for this: on photos they are often as tall as the whole line, or wildly off.
function geometry(line, words) {
  if (line.baseline && line.rowAttributes) {
    const { baseline: b, rowAttributes: r } = line
    const slope = b.x1 > b.x0 ? (b.y1 - b.y0) / (b.x1 - b.x0) : 0
    return { x0: line.bbox.x0, x1: line.bbox.x1, bx: b.x0, by: b.y0, slope, above: r.rowHeight - r.descenders, below: r.descenders }
  }
  // Fallback (tests, or a reader without row data): flat baseline under the words.
  const heights = words.map((w) => w.bbox.y1 - w.bbox.y0).sort((a, b) => a - b)
  const by = Math.max(...words.map((w) => w.bbox.y1))
  return { x0: Math.min(...words.map((w) => w.bbox.x0)), x1: Math.max(...words.map((w) => w.bbox.x1)), bx: 0, by, slope: 0, above: heights[heights.length >> 1], below: 0 }
}
export const baselineAt = (g, x) => g.by + g.slope * (x - g.bx)

/**
 * The reader often splits one printed line into several "lines" (around a pen circle, a fold, glare), so lines whose
 * baselines line up are first joined into printed rows. A row is shown if its text is useful (KEEP), as one tilted strip.
 * @param lines Tesseract lines: { words, bbox, baseline, rowAttributes } (tests may pass { words } only)
 * @returns {
 *   keep: [{ text, band: { x0, x1, bx, by, slope, above, below } }] strips that may be shown,
 *   hits: findSensitive's words, blacked out again inside the strips,
 * }
 */
export function planRedaction(lines) {
  const rows = []
  for (const line of lines) {
    const words = line.words.filter((w) => w.text.trim())
    if (!words.length) continue
    const g = geometry(line, words)
    const mid = (g.x0 + g.x1) / 2
    // Same printed row: its baseline runs along this row's baseline (within a third of a letter height).
    const row = rows.find((r) => Math.abs(baselineAt(r.band, mid) - baselineAt(g, mid)) < 0.35 * Math.max(r.band.above, g.above))
    if (row) {
      row.parts.push(words)
      row.band.x0 = Math.min(row.band.x0, g.x0)
      row.band.x1 = Math.max(row.band.x1, g.x1)
    } else rows.push({ band: g, parts: [words] })
  }
  const keep = []
  for (const { band, parts } of rows) {
    const text = parts.flat().sort((a, b) => a.bbox.x0 - b.bbox.x0).map((w) => w.text).join(' ')
    if (KEEP.some((re) => re.test(text))) keep.push({ text, band })
  }
  return { keep, hits: findSensitive(lines) }
}
