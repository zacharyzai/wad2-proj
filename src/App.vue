<!-- Owner: Isaac (app shell). From the Claude Design screens: phone header + bottom tabs, desktop sidebar (≥992px). One set of elements, re-laid out by CSS. -->
<script setup>
import { nextTick, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { setLocale } from './i18n'
import { theme, toggleTheme } from './theme'
import AppIcon from './components/layout/AppIcon.vue'
import GuideDialog from './components/guide/GuideDialog.vue'
import { maybeShowGuide, openGuide } from './stores/guide'

const { t, locale } = useI18n()
const route = useRoute()

// Each language button is written in its own script.
const LANG_BUTTONS = { en: 'EN', zh: '中文', ms: 'BM', ta: 'தமிழ்' }
// `phone: false` items stay off the phone tab bar (5 tabs fit at 375px, Tamil included); on phones the logo goes Home.
const NAV = [
  { to: '/', key: 'nav.home', icon: 'home', phone: false },
  { to: '/scan', key: 'nav.scan', icon: 'scan' },
  { to: '/schedule', key: 'nav.schedule', icon: 'calendar' },
  { to: '/bill', key: 'nav.bill', icon: 'receipt' },
  { to: '/ask', key: 'nav.ask', icon: 'chat' },
  { to: '/history', key: 'nav.history', icon: 'history' },
]
// Prefix match so /scan/confirm and /scan/explain keep Scan highlighted; Home only on '/'.
const isOn = (to) => (to === '/' ? route.path === '/' : route.path.startsWith(to))

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
router.afterEach(async (to, from) => {
  if (!from.name || to.path === from.path) return // first load or only ?type= changed
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
          v-for="item in NAV"
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

      <div class="lang-box">
        <span class="section-label desk-only">{{ t('nav.language') }}</span>
        <div class="segmented langs" role="group" :aria-label="t('nav.language')">
          <button v-for="(label, code) in LANG_BUTTONS" :key="code" type="button" :lang="code" :aria-pressed="locale === code" @click="setLocale(code)">
            {{ label }}
          </button>
        </div>
      </div>

      <!-- Icon only in the phone header; a labelled row with a switch in the desktop sidebar. -->
      <button type="button" class="night" :aria-pressed="theme === 'dark'" :aria-label="t('nav.night')" :title="t('nav.night')" @click="toggleTheme">
        <AppIcon :name="theme === 'dark' ? 'sun' : 'moon'" :size="22" class="night-phone" />
        <AppIcon name="moon" :size="22" class="night-desk" />
        <span class="night-label" aria-hidden="true">{{ t('nav.night') }}</span>
        <span class="switch night-desk" aria-hidden="true"></span>
      </button>

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
  <GuideDialog />
</template>

<style scoped src="./styles/App.css"></style>