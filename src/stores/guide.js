// Beginner's guide ("How to use the app"), a Pinia store: shown once, reopened any time. From the Claude Design walkthrough, extended to
// walk people through the real app: a welcome card, then it points at real buttons (nav ones must be tapped), then a finish card.
// When it shows: the first time a logged-in person opens Home or Scan on this device. If they arrived mid-task
// (a sample link or any other deep link), it waits and shows the next time Home opens. Never on public pages.
// Before it, an account that hasn't chosen day, night or "same as my device" is asked that first (ThemePrompt).
// shortcut: "seen" is per device (localStorage), not per account; a second device shows it once more.
import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { useAuthStore } from './auth'

const KEY = 'amag.tour' // 'seen' | 'deferred'
// Reads the saved "guide seen" flag; storage may be blocked.
const read = () => {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return 'seen' // storage blocked (private mode): never nag on every page
  }
}
// Saves the "guide seen" flag; ignored if storage is blocked.
const write = (value) => {
  try {
    localStorage.setItem(KEY, value)
  } catch {
    // Not critical; the guide may show again next time.
  }
}

// card: a centred card (GuideDialog). tap: a glowing nav button the person must tap (or "Take me there"); it opens that page.
// look: points at one key button on the page just opened; Next moves on. target = the element's data-guide value.
// page: where a look step's button lives, so Back can return there.
export const STEPS = [
  { id: 'intro', kind: 'card' },
  { id: 'scan', kind: 'tap', target: '/scan' },
  // Labels and bills both start on Scan: point at the two cards.
  { id: 'scanChoose', kind: 'look', target: 'scan-choice', page: '/scan' },
  { id: 'ask', kind: 'tap', target: '/ask' },
  { id: 'askBox', kind: 'look', target: 'ask-box', page: '/ask' },
  { id: 'account', kind: 'tap', target: '/account' },
  { id: 'finish', kind: 'card' },
]
export const useGuideStore = defineStore('guide', () => {
  // state. step: 1-based index into STEPS. ended: 'skip' | 'esc' | 'sample' | 'start' (picks the closing message).
  // askTheme: the day/night question is showing (components/guide/ThemePrompt.vue).
  const open = ref(false)
  const step = ref(1)
  const ended = ref(null)
  const askTheme = ref(false)
  // The step object the guide is currently showing
  const currentStep = computed(() => STEPS[step.value - 1])

  // Moves the guide between steps
  function nextStep() {
    if (step.value < STEPS.length) step.value++
  }
  // Goes back one step (not past the first).
  function prevStep() {
    if (step.value > 1) step.value--
  }
  // Starts the guide again from step 1.
  function openGuide() {
    open.value = true
    step.value = 1
    ended.value = null
  }
  // Closes the guide and remembers it was seen. `kind` records how it ended.
  function endGuide(kind) {
    write('seen')
    open.value = false
    ended.value = kind
  }
  // App.vue calls this after every navigation to an app (non-public) page. `first` = the first such page this visit.
  // ThemePrompt calls it again once they've chosen, so the guide follows straight after.
  function maybeShowGuide(route, first) {
    if (open.value || askTheme.value) return
    const startPage = ['home', 'scan'].includes(route.name) && !route.query.sample
    const user = useAuthStore().user
    if (startPage && user && !user.theme) return void (askTheme.value = true)
    const state = read()
    if (state === 'seen') return
    if (first && !startPage) return write('deferred') // arrived mid-task: wait for Home
    if (state === 'deferred' ? route.name === 'home' : startPage) openGuide()
  }

  return {
    open,
    step,
    ended,
    askTheme,
    currentStep,
    nextStep,
    prevStep,
    openGuide,
    endGuide,
    maybeShowGuide,
  }
})
