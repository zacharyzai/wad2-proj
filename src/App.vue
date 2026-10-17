<!-- Owner: Isaac (app shell). Revamp from wireframes 1a (phone: header + bottom tabs) and 2a (desktop: sidebar); Isaac to refine. -->
<script setup>
import { nextTick, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { setLocale } from './i18n'
import { theme, toggleTheme } from './theme'

const { t, locale } = useI18n()
const route = useRoute()

// Each language button is written in its own script.
const LANG_BUTTONS = { en: 'EN', zh: '中文', ms: 'BM', ta: 'தமிழ்' }
// `phone: false` items stay off the phone tab bar so 4 tabs fit at 375px in Tamil; on phones the logo goes Home and Account sits in the header.
const NAV = [
  { to: '/', key: 'nav.home', icon: 'M3 11l9-7 9 7 M5 10v10h14V10 M10 20v-6h4v6', phone: false },
  { to: '/scan', key: 'nav.scan', icon: 'M3 8h4l2-3h6l2 3h4v12H3z M12 17a4 4 0 1 0 0-8a4 4 0 0 0 0 8z' },
  { to: '/schedule', key: 'nav.schedule', icon: 'M4 6h16v14H4z M4 10h16 M8 3v5 M16 3v5' },
  { to: '/ask', key: 'nav.ask', icon: 'M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5 M12 16v.5' },
  { to: '/history', key: 'nav.history', icon: 'M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18z M12 7v5l3 2' },
  { to: '/login', key: 'nav.account', icon: 'M12 12a4 4 0 1 0 0-8a4 4 0 0 0 0 8z M4 21c0-4 4-6 8-6s8 2 8 6', phone: false },
]
// Prefix match so /scan/confirm and /scan/explain keep Scan highlighted; Home only on '/'.
const isOn = (to) => (to === '/' ? route.path === '/' : route.path.startsWith(to))

// Tab title names the page, in the chosen language (route 'not-found' → key pages.notFound).
watch(
  [() => route.name, locale],
  ([name]) => (document.title = name && name !== 'home' ? `${t(`pages.${name.replace(/-(\w)/g, (_, c) => c.toUpperCase())}`)} · ${t('app.name')}` : t('app.name')),
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
  <div class="shell" :class="`lang-${locale}`">
    <a href="#main" class="skip">{{ t('nav.skip') }}</a>
    <aside class="side">
      <div class="top">
        <RouterLink to="/" class="brand"><img src="/logo.svg" alt="" class="logo" />{{ t('app.name') }}</RouterLink>
        <RouterLink to="/login" class="acct">{{ t('nav.login') }}</RouterLink>
      </div>

      <RouterLink :to="{ name: 'scan' }" class="btn-main scan-btn">{{ t('nav.scanDoc') }}</RouterLink>

      <nav class="nav" :aria-label="t('nav.main')">
        <RouterLink
          v-for="item in NAV"
          :key="item.to"
          :to="item.to"
          class="navi"
          :class="{ on: isOn(item.to), 'desk-only': item.phone === false }"
          :aria-current="isOn(item.to) ? 'page' : null"
        >
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path :d="item.icon" /></svg>
          <span>{{ t(item.key) }}</span>
        </RouterLink>
      </nav>

      <div class="lang-box">
        <span class="eyebrow desk-only">{{ t('nav.language') }}</span>
        <div class="langs" role="group" :aria-label="t('nav.language')">
          <button v-for="(label, code) in LANG_BUTTONS" :key="code" type="button" class="lng" :lang="code" :aria-pressed="locale === code" @click="setLocale(code)">
            {{ label }}
          </button>
        </div>
        <!-- Icon only on phones/tablets (no room); labelled in the desktop sidebar. -->
        <button type="button" class="night" :aria-pressed="theme === 'dark'" :aria-label="t('nav.night')" :title="t('nav.night')" @click="toggleTheme">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path v-if="theme === 'dark'" d="M12 4V2 M12 22v-2 M4 12H2 M22 12h-2 M5.6 5.6 4.2 4.2 M19.8 19.8l-1.4-1.4 M5.6 18.4l-1.4 1.4 M19.8 4.2l-1.4 1.4 M12 16a4 4 0 1 0 0-8a4 4 0 0 0 0 8z" />
            <path v-else d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />
          </svg>
          <span class="night-label" aria-hidden="true">{{ t('nav.night') }}</span>
          <span class="night-label switch" aria-hidden="true"></span>
        </button>
      </div>
    </aside>

    <div class="col-main">
      <main id="main" class="main" tabindex="-1"><div class="wrap"><RouterView /></div></main>
      <footer class="ft">{{ t('app.disclaimer') }}</footer>
    </div>
  </div>
</template>

<style scoped src="./styles/App.css"></style>
