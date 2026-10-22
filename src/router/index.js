// Every route is registered here up front so teammates only edit their own view files.
import { nextTick } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import { authStore, restore } from '../stores/auth'
import { readToken } from '../api/client'

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
  // Isaac (+ auth API). Everything needs an account except pages marked public: welcome, login, signup, share links, 404.
  { path: '/login', name: 'login', component: () => import('../views/LoginView.vue'), meta: { public: true, guestOnly: true, bare: true } },
  { path: '/signup', name: 'signup', component: () => import('../views/SignupView.vue'), meta: { public: true, guestOnly: true, bare: true } },
  { path: '/history', name: 'history', component: () => import('../views/HistoryView.vue') },
  { path: '/account', name: 'account', component: () => import('../views/AccountView.vue') },
  // Share links stay open: they are for family on WhatsApp, who have no account.
  { path: '/shared/:token', name: 'shared', component: () => import('../views/SharedView.vue'), meta: { public: true } },
  // Zachary: dev-only test bench for photo redaction; not in production builds.
  ...(import.meta.env.DEV ? [{ path: '/dev/redact', name: 'redact-lab', component: () => import('../views/dev/RedactLab.vue') }] : []),
  ...(import.meta.env.DEV ? [{ path: '/dev/badges', name: 'badge-demo', component: () => import('../views/dev/BadgeDemo.vue') }] : []),
  { path: '/:pathMatch(.*)*', name: 'not-found', component: () => import('../views/NotFoundView.vue'), meta: { public: true } },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  // Each page opens at the top; browser Back/Forward returns to where the user was.
  scrollBehavior: (to, from, saved) => saved ?? (to.path === from.path ? false : { top: 0 }),
})

// First visit on this device: "/" shows the welcome page once (LandingPage sets the flag). Anyone with a login token skips it.
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
  await restore()
  if (authStore.user) return to.meta.guestOnly ? { name: 'home' } : true
  if (to.meta.public) return true
  return { name: 'login', query: to.fullPath === '/' ? {} : { next: to.fullPath } }
})

// Page changes slide and fade (and the scanned photo moves into place on Confirm) where the browser supports it.
// beforeResolve runs once the next page's code has loaded, so the transition only waits for the DOM swap. Styles: motion.css.
let finishTransition = null
router.beforeResolve((to, from) => {
  if (!from.name || to.path === from.path || !document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) return
  return new Promise((resolve) => {
    const transition = document.startViewTransition(() => new Promise((done) => ((finishTransition = done), resolve())))
    // Skipped transitions (window resized, tab hidden) still swap the page; they only reject these promises.
    transition.ready.catch(() => {})
    transition.finished.catch(() => {})
  })
})
router.afterEach(() => nextTick(() => (finishTransition?.(), (finishTransition = null))))

export default router
