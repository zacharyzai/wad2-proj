// Keeps a copy of the senior's timetable on their account (PUT /api/schedule), so a linked caregiver can see today's doses.
// The medicines themselves stay in this browser (stores/medicines.js); only the ScheduleEntries go up, as Google sync sends them.
// Kept out of medicines.js because the node tests import that file, and this one needs the logged-in user.
import { watch } from 'vue'
import { saveSchedule } from '../api/client'
import { buildSchedule, syncEntries, todayInSingapore } from '../rules/schedule.js'
import { authStore } from './auth'
import { medicines } from './medicines'

const entries = () => syncEntries(medicines.map((m) => buildSchedule(m, m.schedule ?? {})), todayInSingapore())
const canSave = () => authStore.user && authStore.user.role !== 'caregiver'

let timer
function push() {
  clearTimeout(timer)
  timer = setTimeout(() => canSave() && saveSchedule(entries()), 1500) // not critical: a failed save is retried on the next change
}

// Every change, including removing the last medicine. On log-in or page load only when this browser has medicines,
// so opening the app on a second, empty device never wipes the copy the caregiver sees.
watch(medicines, push, { deep: true })
watch(() => authStore.user?.email, (email) => email && medicines.length && push(), { immediate: true })
