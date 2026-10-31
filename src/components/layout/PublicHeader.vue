<!-- Owner: Isaac. The top bar on the pages before logging in (Start, Log in, Create account, Forgot, Reset): the app's
     name (back to Start), the language switch, and the page's own buttons in the slot (Start: Log in).
     Phones: name and buttons on one row, the languages full width below. -->
<script setup>
import { useI18n } from 'vue-i18n'
import { chooseLocale } from '../../i18n'

const { t, locale } = useI18n()
const LANGS = { en: 'EN', zh: '中文', ms: 'BM', ta: 'தமிழ்' }
</script>

<template>
  <header class="ph">
    <RouterLink :to="{ name: 'start' }" class="ph-brand">
      <img src="/logo-192.png" alt="" class="logo-tile" width="44" height="44" />
      <span>Ah Ma Ah Gong <span class="ph-can">Can</span></span>
    </RouterLink>
    <div class="segmented ph-langs" role="group" :aria-label="t('nav.language')">
      <button v-for="(label, code) in LANGS" :key="code" type="button" :lang="code" :aria-pressed="locale === code" @click="chooseLocale(code)">{{ label }}</button>
    </div>
    <div class="ph-acts"><slot /></div>
  </header>
</template>

<style scoped>
.ph { display: grid; grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: 'brand acts' 'langs langs'; align-items: center; gap: 12px 16px; padding: 12px max(16px, calc((100% - 1180px) / 2)) 14px; background: var(--color-card); border-bottom: 1px solid var(--color-border); }
.ph-brand { grid-area: brand; display: flex; align-items: center; gap: 12px; min-height: var(--hit); color: var(--color-text); font-family: var(--font-display); font-size: 20px; line-height: 1.15; text-decoration: none; }
.ph-brand:hover { color: var(--color-text); }
.ph-brand .logo-tile { width: 44px; height: 44px; border-radius: 12px; }
.ph-can { color: var(--color-primary-text); }
.ph-langs { grid-area: langs; }
.ph-langs > button[aria-pressed='true'] { color: var(--color-primary-text); }
.ph-acts { grid-area: acts; display: flex; align-items: center; gap: 10px; }
.ph-acts:empty { display: none; }
@media (min-width: 768px) {
  .ph { grid-template-columns: auto minmax(0, 1fr) auto; grid-template-areas: 'brand langs acts'; padding-block: 14px; }
  .ph-langs { justify-self: end; width: min(100%, 360px); }
}
</style>
