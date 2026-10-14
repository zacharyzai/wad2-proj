<!-- Owner: Isaac (app shell). First version from the wireframes (header, nav, footer); Isaac to refine. -->
<script setup>
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { setLocale } from './i18n'

const { t, locale } = useI18n()
const route = useRoute()

// Each language button is written in its own script.
const LANG_BUTTONS = { en: 'EN', zh: '中文', ms: 'BM', ta: 'தமிழ்' }
const NAV = [
  { to: '/scan', key: 'nav.scan', icon: 'M3 8h4l2-3h6l2 3h4v12H3z M12 17a4 4 0 1 0 0-8a4 4 0 0 0 0 8z' },
  { to: '/schedule', key: 'nav.schedule', icon: 'M4 6h16v14H4z M4 10h16 M8 3v5 M16 3v5' },
  { to: '/history', key: 'nav.history', icon: 'M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18z M12 7v5l3 2' },
  { to: '/login', key: 'nav.account', icon: 'M12 12a4 4 0 1 0 0-8a4 4 0 0 0 0 8z M4 21c0-4 4-6 8-6s8 2 8 6' },
]
</script>

<template>
  <div class="shell" :class="`lang-${locale}`">
    <header class="hd">
      <RouterLink to="/" class="brand"><span class="logo" aria-hidden="true"></span>{{ t('app.name') }}</RouterLink>
      <div class="langs" role="group" :aria-label="t('nav.language')">
        <button
          v-for="(label, code) in LANG_BUTTONS"
          :key="code"
          type="button"
          class="lng"
          :lang="code"
          :aria-pressed="locale === code"
          @click="setLocale(code)"
        >
          {{ label }}
        </button>
      </div>
      <RouterLink to="/login" class="acct">{{ t('nav.login') }}</RouterLink>
    </header>

    <div class="bd">
      <nav class="nav" :aria-label="t('nav.main')">
        <!-- Prefix match so /scan/confirm and /scan/explain keep Scan highlighted. -->
        <RouterLink v-for="item in NAV" :key="item.to" :to="item.to" class="navi" :class="{ on: route.path.startsWith(item.to) }">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path :d="item.icon" /></svg>
          <span>{{ t(item.key) }}</span>
        </RouterLink>
      </nav>
      <div class="col-main">
        <main class="main"><div class="wrap"><RouterView /></div></main>
        <footer class="ft">{{ t('app.disclaimer') }}</footer>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* <768 bottom bar · 768–991 side rail · ≥992 labelled sidebar. Content max 1100px. */
.shell { min-height: 100vh; display: flex; flex-direction: column; padding-bottom: 80px; }
.hd { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; padding: 12px 16px; border-bottom: 2px solid var(--ink); }
.brand { flex: 1 1 0; min-width: 0; display: flex; align-items: center; gap: 10px; font-size: 21px; font-weight: 700; line-height: 1.15; color: var(--ink); text-decoration: none; }
.logo { width: 32px; height: 32px; border-radius: 8px; background: var(--teal); flex: none; }
.langs { order: 3; flex: 1 1 100%; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
.lng { min-height: 48px; min-width: 48px; padding: 0 10px; border: 2px solid var(--line-strong); border-radius: 10px; background: #fff; color: var(--ink); font-weight: 700; font-size: 18px; }
.lng[aria-pressed='true'] { background: var(--teal); border-color: var(--teal); color: #fff; }
.acct { display: flex; align-items: center; min-height: 48px; padding: 0 14px; border: 2px solid var(--ink); border-radius: 10px; color: var(--ink); font-weight: 700; text-decoration: none; }

.bd { display: flex; flex-direction: column; flex: 1 1 auto; }
.col-main { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; }
.main { flex: 1 1 auto; padding: 20px 16px 32px; }
.wrap { max-width: 1100px; margin: 0 auto; }
.ft { padding: 12px 16px; border-top: 2px solid var(--line); background: var(--soft); line-height: 1.4; }

.nav { position: fixed; left: 0; right: 0; bottom: 0; z-index: 10; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 4px; padding: 6px; border-top: 2px solid var(--ink); background: #fff; }
.navi { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; min-height: 64px; padding: 6px 2px; border-radius: 10px; color: var(--ink); text-decoration: none; font-weight: 700; font-size: 16px; line-height: 1.2; text-align: center; }
.navi.on { background: var(--teal); color: #fff; }
.lang-ta .navi { font-size: 15px; }

@media (min-width: 768px) {
  .shell { padding-bottom: 0; }
  .hd { flex-wrap: nowrap; padding: 12px 24px; }
  .langs { order: 0; flex: 0 0 auto; display: flex; }
  .bd { flex-direction: row; }
  .nav { position: sticky; top: 0; align-self: flex-start; height: 100vh; display: flex; flex-direction: column; flex: 0 0 112px; border-top: 0; border-right: 2px solid var(--ink); padding: 12px 8px; gap: 8px; }
  .navi { min-height: 76px; }
  .main { padding: 28px 32px 40px; }
  .ft { padding: 14px 32px; }
}
@media (min-width: 992px) {
  .nav { flex-basis: 232px; padding: 20px 12px; }
  .navi { flex-direction: row; justify-content: flex-start; gap: 12px; min-height: 56px; padding: 12px 16px; font-size: 18px; text-align: left; }
  .main { padding: 40px 40px 48px; }
  .ft { padding: 16px 40px; }
}
@media (min-width: 1200px) { .main { padding: 48px 56px 56px; } }
</style>
