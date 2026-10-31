<!-- Owner: Isaac (app shell). From the Claude Design screens: phone header + bottom tabs, desktop sidebar (≥992px). One set of elements, re-laid out by CSS. -->
<script setup>
import { computed, nextTick, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import AppIcon from './components/layout/AppIcon.vue'
import GuideDialog from './components/guide/GuideDialog.vue'
import ThemePrompt from './components/guide/ThemePrompt.vue'
import ThemeToggle from './components/layout/ThemeToggle.vue'
import { maybeShowGuide, openGuide } from './stores/guide'
import { authStore } from './stores/auth'
import './stores/scheduleSync'

const { t, locale } = useI18n()
const route = useRoute()

// Each language button is written in its own script.
// `phone: false` items stay off the phone tab bar (5 tabs fit at 375px, Tamil included); on phones the logo goes Home.
const NAV = [
  { to: '/', key: 'nav.home', icon: 'home', phone: false },
  { to: '/scan', key: 'nav.scan', icon: 'scan' },
  { to: '/schedule', key: 'nav.schedule', icon: 'calendar' },
  { to: '/ask', key: 'nav.ask', icon: 'chat' },
  { to: '/history', key: 'nav.history', icon: 'history' },
  { to: '/care', key: 'nav.care', icon: 'users', caregiverOnly: true },
]
const navItems = computed(() => NAV.filter((item) => !item.caregiverOnly || authStore.user?.role === 'caregiver'))
// Prefix match so /scan/confirm and /scan/explain keep Scan highlighted; Home only on '/'.
// The bill breakdown is part of the Scan flow (no tab of its own), so Scan stays lit on it.
const isOn = (to) => (to === '/' ? route.path === '/' : route.path.startsWith(to) || (to === '/scan' && route.path.startsWith('/bill')))

// Tab title names the page, in the chosen language (route 'not-found' → key pages.notFound).
watch(
  [() => route.name, locale],
  ([name]) => (document.title = name && name !== 'home' ? `${t(`pages.${name.replace(/-(\w)/g, (_, c) => c.toUpperCase())}`)} · ${t('app.name')}` : t('app.name')),
  { immediate: true },
)

// Beginner's guide: maybe show it once the page has changed (stores/guide.js decides). Never on public pages.
let firstAppPage = true
// Watches the name too: the router's starting placeholder is also '/', so a first visit to Home changes only the name.
watch(
  () => [route.name, route.fullPath],
  () => {
    if (!route.name || route.meta.public) return
    maybeShowGuide(route, firstAppPage)
    firstAppPage = false
  },
  { immediate: true },
)

// After moving to another page, screen readers start at its heading instead of the top of the nav.
const router = useRouter()
router.afterEach(async (to, from, failure) => {
  // First load, only ?type= changed, or the move was stopped (e.g. Confirm asked "Throw away your changes?"): stay put.
  if (failure || !from.name || to.path === from.path) return
  await nextTick()
  const h1 = document.querySelector('main h1')
  h1?.setAttribute('tabindex', '-1')
  h1?.focus({ preventScroll: true })
})
</script>

<template>
  <!-- Routes with meta.bare (the welcome page) draw their own full-width page: no sidebar, tabs or footer. -->
  <main v-if="route.meta.bare" id="main" tabindex="-1"><RouterView /></main>
  <div v-else class="shell" :class="`lang-${locale}`">
    <a href="#main" class="skip">{{ t('nav.skip') }}</a>
    <aside class="side">
      <RouterLink to="/" class="brand">
        <img src="/logo-192.png" alt="" class="logo-tile logo" />
        <span class="brand-name">Ah Ma Ah Gong <span class="brand-can">Can</span></span>
      </RouterLink>

      <nav class="nav" :aria-label="t('nav.main')">
        <RouterLink
          v-for="item in navItems"
          :key="item.to"
          :to="item.to"
          :data-guide="item.to"
          class="navi"
          :class="{ on: isOn(item.to), 'desk-only': item.phone === false }"
          :aria-current="isOn(item.to) ? 'page' : null"
        >
          <span class="navi-icon"><AppIcon :name="item.icon" :size="item.phone === false ? 22 : 24" :stroke="isOn(item.to) ? 2.25 : 2" /></span>
          <span class="navi-label">{{ t(item.key) }}</span>
        </RouterLink>
      </nav>

      <!-- Reopens the Beginner's guide (desktop; on phones it is on the Account page). -->
      <button type="button" class="navi desk-only guide-link" data-testid="open-guide" @click="openGuide">
        <span class="navi-icon"><AppIcon name="compass" :size="22" /></span>
        <span class="navi-label">{{ t('guide.open') }}</span>
      </button>

      <!-- Day / night, one tap from every page: above Account in the sidebar, beside Account in the phone header. Language lives on the Account page. -->
      <div class="theme-box"><ThemeToggle /></div>

      <!-- Everyone has an account, so this is always Account (logged-out visitors are sent to Log in by the router). -->
      <RouterLink to="/account" class="acct" data-guide="/account" :aria-label="t('nav.account')" :aria-current="isOn('/account') ? 'page' : null">
        <span class="acct-icon"><AppIcon name="user" :size="22" /></span>
        <span class="acct-label" aria-hidden="true">{{ t('nav.account') }}</span>
        <AppIcon name="right" :size="20" class="acct-chev" />
      </RouterLink>
    </aside>

    <div class="col-main">
      <main id="main" class="main" tabindex="-1"><div class="wrap"><RouterView /></div></main>
      <footer class="ft">
        <AppIcon name="shield" :size="22" class="ft-icon" />
        <p>{{ t('app.disclaimer') }}</p>
      </footer>
    </div>
  </div>
  <ThemePrompt />
  <GuideDialog />
</template>

<style scoped src="./styles/App.css"></style>