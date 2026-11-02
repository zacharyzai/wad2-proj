// History, tidied (views/HistoryView.vue): the saved scans' summaries (GET /api/history/all) arranged so a medicine or bill
// is found without scrolling. Our own rules, never AI.
// Medicines: one group per medicine, its scans inside (newest first), so monthly refills don't pile up; the ones still
// taken come first. Bills: one row per visit, under the month of the visit (or the day it was saved, when the bill has no
// date), and what was paid at each clinic in a year. Search matches the name or clinic, ignoring case and extra spaces.
import { todayInSingapore } from './schedule.js'

const norm = (text) => (text ?? '').toLowerCase().replace(/\s+/g, ' ').trim()
const newestFirst = (a, b) => String(b.createdAt).localeCompare(String(a.createdAt))

// The key a medicine is known by, here and on the person's list: "metformin 500 mg".
export const medicineKey = (title) => norm(title)

// takingKeys: medicineKey of each medicine still on the person's list and not finished (stores/medicines.js).
// Each group: { key, title, purpose, scans (newest first), last (newest createdAt), taking }.
// Order: taking first, then the most recently scanned.
export function medicineGroups(items, takingKeys = new Set()) {
  const groups = new Map()
  for (const item of items) {
    if (item.type !== 'medication') continue
    const key = medicineKey(item.title) || item.id
    if (!groups.has(key)) groups.set(key, { key, title: item.title, scans: [] })
    groups.get(key).scans.push(item)
  }
  return [...groups.values()]
    .map((g) => {
      const scans = [...g.scans].sort(newestFirst)
      return { ...g, scans, title: scans[0].title, purpose: scans.find((s) => s.purpose)?.purpose ?? null, last: scans[0].createdAt, taking: takingKeys.has(g.key) }
    })
    .sort((a, b) => Number(b.taking) - Number(a.taking) || String(b.last).localeCompare(String(a.last)))
}

// The day a bill belongs to: its visit date, or (none printed) the Singapore day it was saved. 'YYYY-MM-DD'.
export const billDate = (item) => item.visitDate ?? todayInSingapore(new Date(item.createdAt))

// [{ month: 'YYYY-MM', bills: [{ ...item, date }] }], newest month first, newest visit first inside.
export function billMonths(items) {
  const months = new Map()
  for (const item of items) {
    if (item.type !== 'bill') continue
    const date = billDate(item)
    const month = date.slice(0, 7)
    if (!months.has(month)) months.set(month, [])
    months.get(month).push({ ...item, date })
  }
  return [...months]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([month, bills]) => ({ month, bills: bills.sort((a, b) => b.date.localeCompare(a.date) || newestFirst(a, b)) }))
}

// What was paid at each clinic in `year` ('YYYY'): [{ clinic (null: not printed), cents, count }], most paid first.
// A bill without a total counts as a visit but adds nothing.
export function clinicTotals(items, year) {
  const clinics = new Map()
  for (const item of items) {
    if (item.type !== 'bill' || !billDate(item).startsWith(year)) continue
    const key = norm(item.title)
    const c = clinics.get(key) ?? { clinic: item.title ?? null, cents: 0, count: 0 }
    c.cents += item.totalPayableCents ?? 0
    c.count += 1
    clinics.set(key, c)
  }
  return [...clinics.values()].sort((a, b) => b.cents - a.cents || b.count - a.count)
}

// Does this name or clinic match what was typed? Nothing typed matches everything.
export const matches = (title, query) => !norm(query) || norm(title).includes(norm(query))
