// Keeps a copy of the senior's timetable on their account (PUT /api/schedule), so a linked caregiver can see today's doses.
// The medicines themselves stay in this browser (stores/medicines.js); only the ScheduleEntries go up, as Google sync sends them.
// Kept out of medicines.js because the node tests import that file, and this one needs the logged-in user.
import { watch } from 'vue'
import { saveSchedule } from '../api/client'
import { buildSchedule, syncEntries, todayInSingapore } from '../rules/schedule.js'
import { authStore } from './auth'
import { medicines } from './medicines'

// The browser's medicine list outlives logging out, so it remembers whose it is: on a shared tablet, senior B logging in
// after senior A must never send A's medicines to B's account (and so to B's caregiver).
const OWNER_KEY = 'medicinesOwner'
function ownsList(email) {
  try {
    const owner = localStorage.getItem(OWNER_KEY)
    if (owner === null) localStorage.setItem(OWNER_KEY, email) // first account to save this browser's list claims it
    return (owner ?? email) === email
  } catch {
    return false // storage blocked: can't tell whose list it is, so don't send it
  }
}

const entries = () => syncEntries(medicines.map((m) => buildSchedule(m, m.schedule ?? {})), todayInSingapore())

let timer
function push() {
  clearTimeout(timer)
  timer = setTimeout(() => {
    const user = authStore.user
    if (user && user.role !== 'caregiver' && ownsList(user.email)) saveSchedule(entries()) // not critical: retried on the next change
  }, 1500)
}

// Every change, including removing the last medicine. On log-in or page load only when this browser has medicines,
// so opening the app on a second, empty device never wipes the copy the caregiver sees.
watch(medicines, push, { deep: true })
watch(() => authStore.user?.email, (email) => email && medicines.length && push(), { immediate: true })
