// Finds personal details in OCR'd text (lines of words with boxes), so they can be blacked out before a photo leaves the phone.
// Pure logic, no browser APIs, so it is unit-tested in sensitive.test.js. Used by redact.js.
// shortcut: catches labelled fields, NRIC/FIN, phone numbers and address lines only; an unlabelled name (e.g. "TAN AH KOW"
// on its own line) is NOT found. The user's preview and the frame guide are the safety net. Upgrade if testing shows misses.

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
