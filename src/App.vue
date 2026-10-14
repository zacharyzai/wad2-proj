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
// `phone: false` items live in the header on phones, so the bottom bar keeps 4 big tabs.
const NAV = [
  { to: '/', key: 'nav.home', icon: 'M3 11l9-7 9 7 M5 10v10h14V10 M10 20v-6h4v6' },
  { to: '/scan', key: 'nav.scan', icon: 'M3 8h4l2-3h6l2 3h4v12H3z M12 17a4 4 0 1 0 0-8a4 4 0 0 0 0 8z' },
  { to: '/schedule', key: 'nav.schedule', icon: 'M4 6h16v14H4z M4 10h16 M8 3v5 M16 3v5' },
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

<style scoped>
/* Phones and tablets (<992): header, language row, fixed bottom tabs. Desktop (≥992): one white sidebar (2a). Content max 1100px. */
.shell { min-height: 100vh; min-height: 100dvh; display: flex; flex-direction: column; padding-bottom: calc(84px + env(safe-area-inset-bottom)); }
.side { display: flex; flex-direction: column; gap: 12px; padding: 12px 16px; background: var(--surface); border-bottom: 1.5px solid var(--ink); }
.top { display: flex; align-items: center; gap: 12px; }
.brand { flex: 1 1 0; min-width: 0; display: flex; align-items: center; gap: 10px; font-size: 21px; font-weight: 800; line-height: 1.15; color: var(--ink); text-decoration: none; }
.logo { width: 44px; height: 44px; flex: none; }
.acct { display: flex; align-items: center; min-height: 48px; padding: 0 16px; border: 2px solid var(--ink); border-radius: 999px; color: var(--ink); font-weight: 700; text-decoration: none; }
.scan-btn { display: none; }
.desk-only, .navi.desk-only { display: none; }

.lang-box { display: flex; gap: 8px; }
.langs { flex: 1 1 auto; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
.night { flex: none; display: flex; align-items: center; justify-content: center; gap: 12px; width: 48px; min-height: 48px; padding: 0; border: 2px solid var(--line-strong); border-radius: 14px; background: var(--surface); color: var(--ink); font-weight: 700; font-size: 18px; }
.night[aria-pressed='true'] { border-color: var(--teal); color: var(--teal-dark); }
.night-label { display: none; }
/* On/off pill so the state is visible without relying on the icon alone. */
.switch { position: relative; width: 44px; height: 26px; margin-left: auto; border-radius: 999px; background: var(--line-strong); }
.switch::after { content: ''; position: absolute; top: 3px; left: 3px; width: 20px; height: 20px; border-radius: 50%; background: var(--surface); transition: transform 0.15s; }
.night[aria-pressed='true'] .switch { background: var(--teal); }
.night[aria-pressed='true'] .switch::after { transform: translateX(18px); }
@media (prefers-reduced-motion: reduce) { .switch::after { transition: none; } }
.lng { min-height: 48px; padding: 0 8px; border: 2px solid var(--line-strong); border-radius: 14px; background: var(--surface); color: var(--ink); font-weight: 700; font-size: 18px; }
.lng[aria-pressed='true'] { background: var(--teal); border-color: var(--teal); color: #fff; }

/* Bottom tabs (1a): active tab is teal with a dot under the label. */
.nav { position: fixed; left: 0; right: 0; bottom: 0; z-index: 10; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 4px; padding: 6px 6px calc(10px + env(safe-area-inset-bottom)); border-top: 1.5px solid var(--ink); background: var(--surface); }
.navi:hover { color: var(--teal-dark); }
.main:focus { outline: none; }
.navi { position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; min-height: 64px; padding: 6px 2px 10px; border-radius: 14px; color: var(--muted); text-decoration: none; font-weight: 700; font-size: 16px; line-height: 1.2; text-align: center; }
.navi.on { color: var(--teal-dark); }
.navi.on::after { content: ''; position: absolute; bottom: 2px; width: 6px; height: 6px; border-radius: 50%; background: var(--teal); }
.lang-ta .navi { font-size: 14px; }

.col-main { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; background: var(--soft); }
.main { flex: 1 1 auto; padding: 24px 16px 32px; }
.wrap { max-width: 1100px; margin: 0 auto; }
.ft { padding: 12px 16px 20px; color: var(--muted); font-size: 16px; line-height: 1.4; text-align: center; }

@media (min-width: 768px) {
  .side { flex-direction: row; flex-wrap: wrap; align-items: center; padding: 12px 24px; }
  .top { flex: 1 1 auto; }
  .lang-box { margin-left: auto; }
  .langs { display: flex; }
  .main { padding: 32px 32px 40px; }
}

@media (min-width: 992px) {
  .shell { flex-direction: row; padding-bottom: 0; }
  .side { position: sticky; top: 0; align-self: flex-start; flex: 0 0 260px; flex-direction: column; flex-wrap: nowrap; align-items: stretch; gap: 16px; height: 100vh; height: 100dvh; padding: 24px 16px; border-bottom: 0; border-right: 1.5px solid var(--ink); overflow-y: auto; }
  .top { flex: none; }
  .top .acct { display: none; }
  .scan-btn { display: flex; min-height: 60px; padding: 10px 16px; font-size: 20px; }
  .desk-only, .navi.desk-only { display: flex; }
  .nav { position: static; display: flex; flex-direction: column; gap: 6px; padding: 0; border: 0; }
  .navi { flex-direction: row; justify-content: flex-start; gap: 12px; min-height: 56px; padding: 12px 16px; color: var(--ink); font-size: 18px; text-align: left; }
  .navi:hover { background: var(--soft); }
  .navi.on { background: var(--teal-soft); color: var(--teal-dark); }
  .navi.on::after { display: none; }
  .lang-box { margin: auto 0 0; flex-direction: column; gap: 8px; }
  .night { width: 100%; justify-content: flex-start; min-height: 56px; padding: 0 14px; margin-top: 8px; }
  .night-label { display: block; }
  .langs { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .main { padding: 40px 40px 32px; }
  .ft { padding: 0 40px 24px; text-align: left; }
}
@media (min-width: 1200px) { .main { padding: 48px 56px 32px; } .ft { padding: 0 56px 24px; } }
</style>
