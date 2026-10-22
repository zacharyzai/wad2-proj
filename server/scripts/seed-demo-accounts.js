// Demo accounts, one per subsidy result, for testing and the graded README.txt dummy logins. Fake people, fake details.
// Run: node --env-file=.env server/scripts/seed-demo-accounts.js   (safe to run again: it updates the same 5 accounts)
import mongoose from 'mongoose'
import { User } from '../models/User.js'
import { hashPassword } from '../services/auth.js'

const DEMO_PASSWORD = 'Demo1234!'
const DEMO_ACCOUNTS = [
  // Born by 1949, citizen by 1986: Pioneer Generation.
  { email: 'pioneer.demo@example.com', name: 'Tan Ah Kow', dob: '1945-08-12', citizenship: 'birth', income: 'upTo1500' },
  // Born 1950–1959, citizen by 1996: Merdeka Generation.
  { email: 'merdeka.demo@example.com', name: 'Siti Aminah binte Rahman', dob: '1955-03-21', citizenship: 'birth', income: '1501to2300' },
  // Born by 1949 but citizen only in 1990: missed Pioneer, so Merdeka instead.
  { email: 'late.citizen.demo@example.com', name: 'Lim Mei Ling', dob: '1946-11-02', citizenship: 'became', citizenSince: 1990, income: 'above2300' },
  // Citizen born 1975: no Pioneer or Merdeka; CHAS only, with a Blue card (household income $1,500 or less per person).
  { email: 'chas.demo@example.com', name: 'Rajesh s/o Kumar', dob: '1975-06-15', citizenship: 'birth', income: 'upTo1500' },
  // Permanent resident: polyclinic PR rates only, no Pioneer, Merdeka or CHAS.
  { email: 'pr.demo@example.com', name: 'Maria Santos', dob: '1958-01-30', citizenship: 'pr' },
]

await mongoose.connect(process.env.MONGODB_URI)
const passwordHash = await hashPassword(DEMO_PASSWORD)
for (const account of DEMO_ACCOUNTS) {
  await User.updateOne({ email: account.email }, { ...account, citizenSince: account.citizenSince ?? null, income: account.income ?? null, passwordHash }, { upsert: true, runValidators: true })
  console.log(`ready: ${account.email}`)
}
await mongoose.disconnect()
