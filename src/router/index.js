// Every route is registered here up front so teammates only edit their own view files.
import { nextTick } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import { authStore, restore } from '../stores/auth'
import { readToken } from '../api/client'
import { guide } from '../stores/guide'
import { screenFading } from '../screenFade'

const routes = [
  { path: '/', name: 'home', component: () => import('../views/HomeView.vue') },
  // Zachary: welcome page, shown once to first-time visitors (guard below)
  { path: '/welcome', name: 'welcome', component: () => import('../views/LandingPage.vue'), meta: { bare: true, public: true } },
  // Asher: scan → confirm → explain flow
  // Scan is for medication labels; bills are scanned from the Bill page (same view, scanType from meta). Old ?type=bill links still land there.
  { path: '/scan', name: 'scan', component: () => import('../views/ScanView.vue'), beforeEnter: (to) => (to.query.type === 'bill' ? { name: 'bill-scan', query: { sample: to.query.sample } } : undefined) },
  { path: '/scan/confirm', name: 'confirm', component: () => import('../views/ConfirmView.vue') },
  { path: '/scan/explain', name: 'explain', component: () => import('../views/ExplainView.vue') },
  // Zachary: Ask about my medicine (feature 6)
  { path: '/ask', name: 'ask', component: () => import('../views/AskView.vue') },
  // Lokesh
  { path: '/schedule', name: 'schedule', component: () => import('../views/ScheduleView.vue') },
  { path: '/bill', name: 'bill', component: () => import('../views/BillView.vue') },
  { path: '/bill/scan', name: 'bill-scan', component: () => import('../views/ScanView.vue'), meta: { scanType: 'bill' } },
  // Isaac (+ auth API). Everything needs an account except pages marked public: welcome, start, login, signup, share links, 404.
  // Start: the first page for anyone not logged in, with "Join for free" (Create account) and "Log in".
  { path: '/start', name: 'start', component: () => import('../views/StartView.vue'), meta: { public: true, guestOnly: true, bare: true } },
  { path: '/login', name: 'login', component: () => import('../views/LoginView.vue'), meta: { public: true, guestOnly: true, bare: true } },
  { path: '/signup', name: 'signup', component: () => import('../views/SignupView.vue'), meta: { public: true, guestOnly: true, bare: true } },
  // Forgot your password? Ask for a link (logged out only), then choose a new password from the emailed link (works
  // logged in too: the email may be opened on a device that is still logged in).
  { path: '/forgot', name: 'forgot', component: () => import('../views/ForgotView.vue'), meta: { public: true, guestOnly: true, bare: true } },
  { path: '/reset', name: 'reset', component: () => import('../views/ResetView.vue'), meta: { public: true, bare: true } },
  { path: '/history', name: 'history', component: () => import('../views/HistoryView.vue') },
  { path: '/account', name: 'account', component: () => import('../views/AccountView.vue') },
  // Share links stay open: they are for family on WhatsApp, who have no account.
  // Caregiver tracking: caregivers only (the guard below sends everyone else Home).
  { path: '/care', name: 'care', component: () => import('../views/CareView.vue'), meta: { caregiverOnly: true } },
  { path: '/care/:seniorId', name: 'care-senior', component: () => import('../views/CareSeniorView.vue'), meta: { caregiverOnly: true } },
  // A senior's invite link, opened by the caregiver. Open to everyone; accepting needs a caregiver login.
  { path: '/shared/:token', name: 'shared', component: () => import('../views/SharedView.vue'), meta: { public: true } },
  // One medicine label or bill shared read-only (History > Share).
  { path: '/shared/scan/:token', name: 'shared-scan', component: () => import('../views/ScanShareView.vue'), meta: { public: true } },
  // Zachary: dev-only test bench for photo redaction; not in production builds.
  ...(import.meta.env.DEV ? [{ path: '/dev/redact', name: 'redact-lab', component: () => import('../views/dev/RedactLab.vue') }] : []),
  ...(import.meta.env.DEV ? [{ path: '/dev/badges', name: 'badge-demo', component: () => import('../views/dev/BadgeDemo.vue') }] : []),
  { path: '/:pathMatch(.*)*', name: 'not-found', component: () => import('../views/NotFoundView.vue'), meta: { public: true } },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  // Each page opens at the top; browser Back/Forward returns to where the user was. The scroll happens here, before the
  // page change animation captures the new page (finishTransition), so it fades in already at the right place instead
  // of fading in scrolled and then jumping.
  scrollBehavior: (to, from, saved) => {
    const position = saved ?? (to.path === from.path ? false : { top: 0 })
    if (position) window.scrollTo({ left: position.left ?? 0, top: position.top ?? 0, behavior: 'instant' })
    finishTransitionNow()
    return false // already scrolled
  },
})

// First visit on this device: "/" shows the welcome page once. The flag is set by LandingPage, and by any login or signup
// below, so someone with an account who logs out lands on Login. Anyone with a login token skips it.
export const WELCOME_KEY = 'seenWelcome'
router.beforeEach((to) => {
  if (to.name !== 'home') return true
  try {
    if (!localStorage.getItem(WELCOME_KEY) && !readToken()) return { name: 'welcome' }
  } catch {
    // Storage blocked (private mode): skip the welcome page rather than show it every time.
  }
  return true
})

// Every page needs an account. Logged-out visitors go to Login, then back to the page they wanted;
// logged-in people who open Login or Signup go Home instead.
router.beforeEach(async (to) => {
  if (authStore.user) {
    // Signed in before: open straight away with the saved copy; the server check runs in the background,
    // and only a login the server refuses (expired, account removed) moves them to Login.
    restore().then(() => {
      // H1: say why they are here ("You were logged out"), instead of silently showing Login.
      if (!authStore.user && !router.currentRoute.value.meta.public) router.replace({ name: 'login', query: { expired: '1' } })
    })
  } else {
    await restore()
  }
  if (authStore.user) {
    // Has an account on this device: from now on, logged out means Login, not the welcome page.
    try {
      localStorage.setItem(WELCOME_KEY, '1')
    } catch {
      // Storage blocked: they may see the welcome page again, which is harmless.
    }
    if (to.meta.caregiverOnly && (authStore.user.role ?? 'senior') !== 'caregiver') return { name: 'home' }
    return to.meta.guestOnly ? { name: 'home' } : true
  }
  if (to.meta.public) return true
  // Opening the app: Start (Join for free or Log in). A link to a page inside it: straight to Log in, then that page.
  return to.fullPath === '/' ? { name: 'start' } : { name: 'login', query: { next: to.fullPath } }
})

// Page changes slide and fade (and the scanned photo moves into place on Confirm) where the browser supports it.
// beforeResolve runs once the next page's code has loaded, so the transition only waits for the DOM swap. Styles: motion.css.
let finishTransition = null
router.beforeResolve((to, from) => {
  // Skipped while the Beginner's guide is open: the guide moves its own glow and bubble between pages.
  // Start, Log in and Create account are pages of their own: the top bar stays put and the teal band reshapes (motion.css).
  // Also skipped inside a whole-screen fade (arriving after logging in, leaving after logging out): that fade covers it.
  if (!from.name || to.path === from.path || guide.open || screenFading() || !document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) return
  return new Promise((resolve) => {
    const transition = document.startViewTransition(() => new Promise((done) => ((finishTransition = done), resolve())))
    // Skipped transitions (window resized, tab hidden) still swap the page; they only reject these promises.
    transition.ready.catch(() => {})
    transition.finished.catch(() => {})
  })
})
function finishTransitionNow() {
  finishTransition?.()
  finishTransition = null
}
// Normally scrollBehavior finishes it (after scrolling). This is the fallback if it doesn't run.
router.afterEach(() => nextTick(() => setTimeout(finishTransitionNow, 50)))

export default router
