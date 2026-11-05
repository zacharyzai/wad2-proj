import mongoose from 'mongoose'
import { User } from '../models/User.js'
import { CareLink } from '../models/CareLink.js'
import { Dose } from '../models/Dose.js'
import { Scan } from '../models/Scan.js'
import { Schedule } from '../models/Schedule.js'
import { hashPassword } from '../services/auth.js'
import {
  addDays,
  buildSchedule,
  dosesOn,
  supplyDays,
  syncEntries,
  timeInSingapore,
  todayInSingapore,
} from '../../src/rules/schedule.js'
import { DEMO_DATA, scanFor } from './demo-data.js'

const DEMO_PASSWORD = 'Demo1234!'
const DEMO_ACCOUNTS = [
  // Born by 1949, citizen by 1986: Pioneer Generation.
  {
    email: 'pioneer.demo@example.com',
    name: 'Tan Ah Kow',
    dob: '1945-08-12',
    citizenship: 'birth',
    income: 'upTo1500',
  },
  // Born 1950–1959, citizen by 1996: Merdeka Generation.
  {
    email: 'merdeka.demo@example.com',
    name: 'Siti Aminah binte Rahman',
    dob: '1955-03-21',
    citizenship: 'birth',
    income: '1501to2300',
  },
  // Born by 1949 but citizen only in 1990: missed Pioneer, so Merdeka instead.
  {
    email: 'late.citizen.demo@example.com',
    name: 'Lim Mei Ling',
    dob: '1946-11-02',
    citizenship: 'became',
    citizenSince: 1990,
    income: 'above2300',
  },
  // Citizen born 1975: no Pioneer or Merdeka; CHAS only, with a Blue card (household income $1,500 or less per person).
  {
    email: 'chas.demo@example.com',
    name: 'Rajesh s/o Kumar',
    dob: '1975-06-15',
    citizenship: 'birth',
    income: 'upTo1500',
  },
  // Permanent resident: polyclinic PR rates only, no Pioneer, Merdeka or CHAS.
  { email: 'pr.demo@example.com', name: 'Maria Santos', dob: '1958-01-30', citizenship: 'pr' },
  // Citizen born 1968: CHAS Orange only (household income $1,501 to $2,300 per person).
  {
    email: 'chas.orange.demo@example.com',
    name: 'Nur Aisyah binte Ismail',
    dob: '1968-09-04',
    citizenship: 'birth',
    income: '1501to2300',
  },
  // Citizen born 1972: CHAS Green only (more than $2,300 per person).
  {
    email: 'chas.green.demo@example.com',
    name: 'David Lee Wei Ming',
    dob: '1972-04-18',
    citizenship: 'birth',
    income: 'above2300',
  },
  // Merdeka Generation, but unsure of household income: CHAS applies, card colour not known.
  {
    email: 'unsure.demo@example.com',
    name: 'Gopal s/o Ramasamy',
    dob: '1952-12-01',
    citizenship: 'birth',
    income: 'unsure',
  },
  // Neither citizen nor PR: no subsidy estimates, only the schemes listed with their official links.
  {
    email: 'foreigner.demo@example.com',
    name: 'Kenji Watanabe',
    dob: '1960-07-07',
    citizenship: 'other',
  },
]
// A caregiver, already linked to the Pioneer and Merdeka demo seniors (one caregiver may look after several seniors).
const CAREGIVER = {
  email: 'caregiver.demo@example.com',
  name: 'Tan Wei Jie',
  dob: '1978-05-10',
  citizenship: 'birth',
  income: 'above2300',
  role: 'caregiver',
}
const LINKED_SENIORS = ['pioneer.demo@example.com', 'merdeka.demo@example.com']

await mongoose.connect(process.env.MONGODB_URI)
const passwordHash = await hashPassword(DEMO_PASSWORD)
// role is immutable, so it is set only when the account is first made (an old demo account without one already counts as a senior).
for (const { role = 'senior', ...account } of [...DEMO_ACCOUNTS, CAREGIVER]) {
  await User.updateOne(
    { email: account.email },
    {
      $set: {
        ...account,
        citizenSince: account.citizenSince ?? null,
        income: account.income ?? null,
        passwordHash,
      },
      $setOnInsert: { role },
    },
    { upsert: true, runValidators: true },
  )
  console.log(`ready: ${account.email} (${role})`)
}
// Each senior has one caregiver slot: this replaces any invite or caregiver a tester left on these demo seniors.
const caregiver = await User.findOne({ email: CAREGIVER.email }).select('role').lean()
if (caregiver.role !== 'caregiver')
  throw new Error(
    `${CAREGIVER.email} exists as a ${caregiver.role}; delete it in Atlas and run again`,
  )
for (const email of LINKED_SENIORS) {
  const senior = await User.findOne({ email }).select('_id').lean()
  await CareLink.updateOne(
    { seniorId: senior._id, caregiverId: caregiver._id },
    { $set: { linkedAt: new Date() } },
    { upsert: true },
  )
  console.log(`linked: ${CAREGIVER.email} → ${email}`)
}

// Fake medicines, saved scans and dose ticks for each demo senior (the data is in demo-data.js). Safe to re-run: it replaces what
// these accounts had, so anything a tester saved on a demo account is reset. Run it again to refresh the ticks to "today".
const today = todayInSingapore()
const now = timeInSingapore()
for (const [email, data] of Object.entries(DEMO_DATA)) {
  const user = await User.findOne({ email }).select('_id').lean()
  const userId = user._id
  // The Schedule, built exactly as PUT /api/schedule builds it, so Schedule and the caregiver's view agree.
  const medicines = data.medicines.map(({ from, ...medicine }) => ({
    ...medicine,
    schedule: {
      startDate: addDays(today, -from),
      days: supplyDays(medicine.medication) ?? 30,
      times: {},
    },
  }))
  const entries = syncEntries(
    medicines.map((m) => buildSchedule(m, m.schedule)),
    today,
  )
  await Schedule.updateOne({ userId }, { $set: { medicines, entries } }, { upsert: true })

  // History: saved scans, newest first.
  await Scan.deleteMany({ userId })
  for (const { fixture, daysAgo } of data.scans) {
    const createdAt = new Date(Date.now() - daysAgo * 86_400_000)
    await Scan.create({ userId, ...scanFor(fixture, addDays(today, -daysAgo)), createdAt })
  }

  // Ticks: every dose on earlier days, and today's whose time has come. With `missOne`, today's earliest passed dose stays
  // unticked so "Not ticked yet" shows. (Early in the day there may be nothing to miss yet.)
  await Dose.deleteMany({ userId })
  const ticks = []
  for (let back = 6; back >= 0; back--) {
    const date = addDays(today, -back)
    const doses = dosesOn(entries, date)
    const past = back > 0 ? doses : doses.filter((d) => d.time <= now)
    const skip = data.missOne && back === 0 ? past.find((d) => d.time <= '12:00')?.id : null
    for (const d of past) {
      if (d.id === skip) continue
      ticks.push({ userId, doseId: d.id, date, takenAt: new Date(`${date}T${d.time}:00+08:00`) })
    }
  }
  if (ticks.length) await Dose.insertMany(ticks)
  console.log(
    `data: ${email} - ${medicines.length} medicines, ${data.scans.length} saved scans, ${ticks.length} ticks`,
  )
}
await mongoose.disconnect()
