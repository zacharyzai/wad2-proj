// Beginner's guide ("How to use the app"): shown once, reopened any time. From the Claude Design walkthrough, extended to
// walk people through the real app: a welcome card, then it points at real buttons (nav ones must be tapped), then a finish card.
// When it shows: the first time a logged-in person opens Home or Scan on this device. If they arrived mid-task
// (a sample link or any other deep link), it waits and shows the next time Home opens. Never on public pages.
// Before it, an account that hasn't chosen day, night or "same as my device" is asked that first (ThemePrompt).
// shortcut: "seen" is per device (localStorage), not per account; a second device shows it once more.
import { reactive } from 'vue'
import { authStore } from './auth'

const KEY = 'amag.tour' // 'seen' | 'deferred'
const read = () => {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return 'seen' // storage blocked (private mode): never nag on every page
  }
}
const write = (value) => {
  try {
    localStorage.setItem(KEY, value)
  } catch {
    // Not critical; the guide may show again next time.
  }
}

// card: a centred card (GuideDialog). tap: a glowing nav button the person must tap (or "Take me there"); it opens that page.
// look: points at one key button on the page just opened; Next moves on. target = the element's data-guide value.
export const STEPS = [
  { id: 'intro', kind: 'card' },
  { id: 'scan', kind: 'tap', target: '/scan' },
  // Labels and bills both start on Scan: point at the two cards.
  { id: 'scanChoose', kind: 'look', target: 'scan-choice' },
  { id: 'ask', kind: 'tap', target: '/ask' },
  { id: 'askBox', kind: 'look', target: 'ask-box' },
  { id: 'account', kind: 'tap', target: '/account' },
  { id: 'finish', kind: 'card' },
]
// step: 1-based index into STEPS. ended: 'skip' | 'esc' | 'sample' | 'start' (picks the closing message).
// askTheme: the day/night question is showing (components/guide/ThemePrompt.vue).
export const guide = reactive({ open: false, step: 1, ended: null, askTheme: false })
export const currentStep = () => STEPS[guide.step - 1]
export function nextStep() {
  if (guide.step < STEPS.length) guide.step++
}

export function openGuide() {
  Object.assign(guide, { open: true, step: 1, ended: null })
}

export function endGuide(kind) {
  write('seen')
  Object.assign(guide, { open: false, ended: kind })
}

// App.vue calls this after every navigation to an app (non-public) page. `first` = the first such page this visit.
// ThemePrompt calls it again once they've chosen, so the guide follows straight after.
export function maybeShowGuide(route, first) {
  if (guide.open || guide.askTheme) return
  const startPage = ['home', 'scan'].includes(route.name) && !route.query.sample
  if (startPage && authStore.user && !authStore.user.theme) return void (guide.askTheme = true)
  const state = read()
  if (state === 'seen') return
  if (first && !startPage) return write('deferred') // arrived mid-task: wait for Home
  if (state === 'deferred' ? route.name === 'home' : startPage) openGuide()
}
