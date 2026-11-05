// Keeps the medicine list on this device and in the account in step.
import { watch } from 'vue'
import { loadMedicines, saveMedicines } from '../api/client'
import { useAuthStore } from './auth'
import { useMedicinesStore } from './medicines'

const OWNER_KEY = 'medicinesOwner' // whose list the browser's cache is
// The account the locally saved medicines belong to.
function owner() {
  try {
    return localStorage.getItem(OWNER_KEY)
  } catch {
    return null
  }
}
// Records which account the locally saved medicines belong to.
function setOwner(email) {
  try {
    email ? localStorage.setItem(OWNER_KEY, email) : localStorage.removeItem(OWNER_KEY)
  } catch {
    /* cache only */
  }
}
// Keeps the medicine list on this device and in the account in step: loads on login, saves a moment after each change.
export function syncMedicinesWithAccount() {
  const authStore = useAuthStore()
  const { medicines } = useMedicinesStore()
  // Swaps the whole list in place, so everything watching it updates.
  const replaceAll = (list) => medicines.splice(0, medicines.length, ...list)
  // The list as text, to tell whether it changed.
  const snapshot = () => JSON.stringify(medicines)

  let ready = false // the account's list has arrived; nothing is saved before, so an old cached copy never overwrites it
  let sent = '' // the list as the account has it, so loading it (or an unchanged list) is not sent straight back
  let timer
  let loading = false

  // email: the logged-in account, '' once we know nobody is logged in, undefined while that is still being checked.
  async function load(email) {
    ready = false
    clearTimeout(timer)
    if (email === undefined) return
    if (!email) return void (replaceAll([]), setOwner(null)) // logged out: this browser keeps nobody's medicines
    const cachedFor = owner()
    if (cachedFor && cachedFor !== email) replaceAll([]) // another account's cache: never shown, never saved here
    setOwner(email)
    loading = true
    const res = await loadMedicines().finally(() => (loading = false))
    if (authStore.user?.email !== email) return // switched account while this was on its way
    // shortcut: offline, the cached list is shown but not saved (it may be older than the account's); changes made then are
    // replaced by the account's list on the next successful load. Fine for an app that needs the network to tick doses anyway.
    if (!res.ok) return
    if (res.data.medicines) {
      replaceAll(res.data.medicines)
      sent = snapshot()
      // Never saved: this browser's list (from before lists were kept on accounts) goes up once. An empty one has nothing to
      // bring over, and saving it would turn "not shared yet" into "no doses" for a linked caregiver.
    } else sent = medicines.length ? '' : snapshot()
    ready = true
    push()
  }

  let saving = null // the save on its way, so a reload waits for it
  // Sends the list to the account unless it is unchanged.
  async function save() {
    timer = null
    const now = snapshot()
    if (now === sent) return
    sent = now
    saving = saveMedicines(JSON.parse(now))
    const res = await saving
    saving = null
    if (!res.ok) sent = '' // retried with the next change or page load
  }
  // Schedules a save shortly after a change, so quick edits go as one request.
  function push() {
    if (!ready) return void (authStore.user && !loading && load(authStore.user.email)) // the last load failed: try again
    clearTimeout(timer)
    timer = setTimeout(save, 1500)
  }

  // Leaving the app (closing it, switching away): save now, not in 1.5 s, or the change is lost. Coming back: load the
  // account's list again, since another device may have changed it meanwhile (each save sends the whole list).
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'hidden') {
      if (!timer) return // nothing waiting to be saved
      clearTimeout(timer)
      save()
    } else if (authStore.user) {
      await saving
      load(authStore.user.email)
    }
  })

  watch(medicines, push, { deep: true })
  watch(() => authStore.user?.email ?? (authStore.checked ? '' : undefined), load, {
    immediate: true,
  })
}
