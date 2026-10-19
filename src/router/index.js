// Every route is registered here up front so teammates only edit their own view files.
import { createRouter, createWebHistory } from 'vue-router'
import { authStore, restore } from '../stores/auth'

const routes = [
  { path: '/', name: 'home', component: () => import('../views/HomeView.vue') },
  // Asher: scan → confirm → explain flow
  { path: '/scan', name: 'scan', component: () => import('../views/ScanView.vue') },
  { path: '/scan/confirm', name: 'confirm', component: () => import('../views/ConfirmView.vue') },
  { path: '/scan/explain', name: 'explain', component: () => import('../views/ExplainView.vue') },
  // Zachary: Ask about my medicine (feature 6)
  { path: '/ask', name: 'ask', component: () => import('../views/AskView.vue') },
  // Lokesh
  { path: '/schedule', name: 'schedule', component: () => import('../views/ScheduleView.vue') },
  { path: '/bill', name: 'bill', component: () => import('../views/BillView.vue') },
  // Isaac (+ Sheen Hern's auth API). TODO: guard /history once auth exists; /shared stays public.
  { path: '/login', name: 'login', component: () => import('../views/LoginView.vue') },
  { path: '/signup', name: 'signup', component: () => import('../views/SignupView.vue') },
  { path: '/history', name: 'history', component: () => import('../views/HistoryView.vue'), meta: { requiresAuth: true } },
  { path: '/shared/:token', name: 'shared', component: () => import('../views/SharedView.vue') },
  { path: '/:pathMatch(.*)*', name: 'not-found', component: () => import('../views/NotFoundView.vue') },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  // Each page opens at the top; browser Back/Forward returns to where the user was.
  scrollBehavior: (to, from, saved) => saved ?? (to.path === from.path ? false : { top: 0 }),
})

// Runs before every navigation. Public pages pass straight through; protected ones need a logged-in user.
router.beforeEach(async (to) => {
  if (!to.meta.requiresAuth) return true
  await restore()
  if (authStore.user) return true
  return { name: 'login', query: { next: to.fullPath } } // Login sends them back here afterwards
})

export default router
