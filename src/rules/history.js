// History, tidied (views/HistoryView.vue): the saved scans' summaries (GET /api/history/all) arranged so a medicine or bill
// is found without scrolling. Our own rules, never AI.
// Medicines: one group per medicine, its scans inside (newest first), so monthly refills don't pile up; the ones still
// taken come first. Bills: one row per visit, under the month of the visit (or the day it was saved, when the bill has no
// date), and what was paid at each clinic in a year. Search matches the name or clinic, ignoring case and extra spaces;
// a medicine is also found by what it is for ("diabetes", "sugar", "darah tinggi", "高血压": medicineMatches).
import { todayInSingapore } from './schedule.js'

// Lower-cases and collapses spaces so the same medicine written two ways matches.
const norm = (text) => (text ?? '').toLowerCase().replace(/\s+/g, ' ').trim()
// Sort order for saved scans: newest at the top.
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
      return {
        ...g,
        scans,
        title: scans[0].title,
        purpose: scans.find((s) => s.purpose)?.purpose ?? null,
        last: scans[0].createdAt,
        taking: takingKeys.has(g.key),
      }
    })
    .sort(
      (a, b) => Number(b.taking) - Number(a.taking) || String(b.last).localeCompare(String(a.last)),
    )
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
    .map(([month, bills]) => ({
      month,
      bills: bills.sort((a, b) => b.date.localeCompare(a.date) || newestFirst(a, b)),
    }))
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

// Everyday words for what a medicine is for, in the app's four languages, by the purpose its scan gave (one of the fixed
// keys in server/services/normalizeScan.js). Searched beside the purpose's own wording on the page (i18n purpose.<key>).
export const PURPOSE_WORDS = {
  pain: 'pain painkiller ache headache backache toothache fever arthritis joint swelling inflammation 止痛 疼痛 头痛 发烧 关节 肿 sakit demam bengkak sendi வலி காய்ச்சல் வீக்கம்',
  blood_pressure:
    'blood pressure high blood pressure hypertension bp 高血压 血压 darah tinggi tekanan darah இரத்த அழுத்தம் ரத்த அழுத்தம்',
  diabetes:
    'diabetes diabetic sugar blood sugar glucose insulin 糖尿病 血糖 kencing manis gula நீரிழிவு சர்க்கரை',
  cholesterol: 'cholesterol lipid fat statin 胆固醇 血脂 kolesterol lemak கொலஸ்ட்ரால் கொழுப்பு',
  heart: 'heart cardiac angina chest heartbeat 心脏 jantung இதயம்',
  infection:
    'infection antibiotic antibiotics bacteria 感染 抗生素 发炎 jangkitan antibiotik தொற்று',
  stomach:
    'stomach gastric gastritis acid reflux heartburn ulcer indigestion 胃 胃酸 gastrik perut asid வயிறு அமிலம்',
  allergy: 'allergy allergic hay fever sneezing antihistamine 过敏 敏感 alahan ஒவ்வாமை',
  cough_cold:
    'cough cold flu phlegm runny nose sore throat 咳嗽 感冒 流鼻涕 喉咙痛 batuk selsema selesema இருமல் சளி',
  breathing:
    'breathing asthma inhaler wheeze breathless copd 哮喘 呼吸 asma lelah sesak nafas ஆஸ்துமா சுவாசம்',
  mood_sleep:
    'mood sleep insomnia depression anxiety stress nerves 失眠 睡眠 情绪 抑郁 tidur murung கவலை தூக்கம்',
  skin: 'skin eczema rash itch itchy cream 皮肤 湿疹 皮疹 痒 kulit ekzema ruam gatal தோல் அரிப்பு',
  vitamins:
    'vitamin vitamins supplement supplements calcium iron multivitamin 维他命 维生素 钙 补充 suplemen kalsium zat besi வைட்டமின்',
}

// A medicine group (medicineGroups) found by its name, or by what it is for: every word typed is in one or the other.
// purposeText: the purpose in the words on the page ("diabetes (blood sugar)"), or ''.
export function medicineMatches(group, query, purposeText = '') {
  const words = norm(query).split(' ').filter(Boolean)
  if (!words.length) return true
  const about = norm([group.title, purposeText, PURPOSE_WORDS[group.purpose] ?? ''].join(' '))
  return matches(group.title, query) || words.every((w) => about.includes(w))
}
