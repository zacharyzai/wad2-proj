// Adds up bill lines' amountCents; a missing amount counts as 0. The one copy: the Bill page, Explain and the subsidy rules use it too.
export const sumCents = (lines) => lines.reduce((total, line) => total + (line.amountCents ?? 0), 0)
// Case- and space-insensitive text comparison.
const same = (a, b) => (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase()

// Charges − subsidies not already in the lines − MediSave, in cents. null while the total itself can't be read.
export function linesTotal(bill) {
  if (bill.totalPayableCents == null) return null
  return (
    sumCents(bill.items) -
    sumCents(bill.subsidies.filter((s) => !s.includedInItems)) -
    (bill.medisaveCents ?? 0)
  )
}

// How far the lines are from the printed total: positive when they add up to more. 0 when it adds up; null when unknown.
export function billGap(bill) {
  const lines = linesTotal(bill)
  return lines === null ? null : lines - bill.totalPayableCents
}

// Printed subtotals whose own lines don't add up to them: where a misread amount most likely is.
// [{ section, printedCents, linesCents }]. Sections without lines of their own (or without a heading) are skipped.
export function sectionsOff(bill) {
  return (bill.subtotals ?? []).flatMap(({ section, amountCents }) => {
    const lines = section ? bill.items.filter((item) => same(item.section, section)) : []
    if (!lines.length || amountCents == null || sumCents(lines) === amountCents) return []
    return [{ section, printedCents: amountCents, linesCents: sumCents(lines) }]
  })
}
