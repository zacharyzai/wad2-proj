// Beginner's guide ("How to use the app"): shown once, reopened any time. From the Claude Design walkthrough, extended to
// walk people through the real app: a welcome card, then it points at real buttons (nav ones must be tapped), then a finish card.
// When it shows: the first time a logged-in person opens Home or Scan on this device. If they arrived mid-task
// (a sample link or any other deep link), it waits and shows the next time Home opens. Never on public pages.
// shortcut: "seen" is per device (localStorage), not per account; a second device shows it once more.
import { reactive } from 'vue'

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
  { id: 'scanTake', kind: 'look', target: 'scan-take' },
  { id: 'bill', kind: 'tap', target: '/bill' },
  { id: 'billSample', kind: 'look', target: 'bill-samples' },
  { id: 'ask', kind: 'tap', target: '/ask' },
  { id: 'askBox', kind: 'look', target: 'ask-box' },
  { id: 'account', kind: 'tap', target: '/account' },
  { id: 'finish', kind: 'card' },
]
// step: 1-based index into STEPS. ended: 'skip' | 'esc' | 'sample' | 'start' (picks the closing message).
export const guide = reactive({ open: false, step: 1, ended: null })
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
export function maybeShowGuide(route, first) {
  const state = read()
  if (state === 'seen' || guide.open) return
  const startPage = ['home', 'scan'].includes(route.name) && !route.query.sample
  if (first && !startPage) return write('deferred') // arrived mid-task: wait for Home
  if (state === 'deferred' ? route.name === 'home' : startPage) openGuide()
}
