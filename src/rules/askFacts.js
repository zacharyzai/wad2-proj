// Which of the user's medicines go to the AI with a question, and how much of each. Our own rules, so the AI only ever sees
// what the question needs: the medicine it is about, or a compact version of what the person takes now.
//   - A question that names a medicine (or a follow-up to one: "and at night?") sends only that medicine, in full.
//   - Otherwise every medicine still being taken goes, but compact: no pack size or strength, two short warnings, and the printed
//     instruction only when the dose, frequency and times don't already say it.
//   - A finished or stopped course is history: left out, unless the question names it.
// list: the page's entries, [{ source, medication }]. Returns the same shape, ready to send.
const clip = (text, max) =>
  typeof text === 'string' && text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text

// The entries a piece of text mentions (by the first word of the name: "Metformin" in "Metformin 500 mg").
export function namedIn(list, text = '') {
  const low = String(text).toLowerCase()
  return list.filter((entry) => {
    const word = entry.medication.name?.toLowerCase().split(/\s+/)[0]
    return word && word.length > 2 && low.includes(word)
  })
}

// The structured fields already say how to take it: then the printed sentence adds nothing.
const knownHow = (m) =>
  m.doseAmount != null &&
  m.frequencyType != null &&
  (m.frequencyType !== 'daily' || m.timesPerDay != null)
// Only trims what is there: a field the medicine never had is not invented.
const compact = ({ medication }) => {
  const { quantity, strength, rawInstruction, warnings, ...rest } = medication // neither the pack size nor the strength helps answer "what / when / how"
  return {
    ...rest,
    ...(rawInstruction != null && !knownHow(rest) && { rawInstruction: clip(rawInstruction, 120) }),
    ...(warnings?.length && { warnings: warnings.slice(0, 2).map((w) => clip(w, 80)) }),
  }
}

// Picks the medicines a question is about (or the previous question's, for a follow-up) and returns only their label facts for the AI.
export function factsFor(list, question, { previousQuestion = '', finished = () => false } = {}) {
  const asked = namedIn(list, question)
  const about = asked.length ? asked : namedIn(list, previousQuestion) // a follow-up is about what was just discussed
  if (about.length) return about.map(({ source, medication }) => ({ source, medication }))
  return list
    .filter((entry) => !finished(entry))
    .map((entry) => ({ source: entry.source, medication: compact(entry) }))
}
