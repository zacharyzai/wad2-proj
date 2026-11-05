<!-- The language switch, the same everywhere: the top bar before logging in (PublicHeader.vue) and, in the
     app, the sidebar on computers and a row under the header on phones (App.vue), so a language is one tap from any page.
     Short labels (EN · 中文 · BM · தமிழ்) so all four fit a phone; screen readers hear each language's full name too (the
     visible label stays at the start of it). Logged in, the auth store saves the choice to the account
     (docs/auth-contract.md), so the app opens in it on every device. -->
<script setup>
import { useI18n } from 'vue-i18n'
import { LOCALES, chooseLocale } from '../../i18n'

const { t, locale } = useI18n()
const SHORT = { en: 'EN', zh: '中文', ms: 'BM', ta: 'தமிழ்' }
</script>

<template>
  <div
    class="segmented lang-switch"
    role="group"
    :aria-label="t('nav.language')"
    data-testid="lang-switch"
  >
    <button
      v-for="(label, code) in SHORT"
      :key="code"
      type="button"
      :lang="code"
      :aria-pressed="locale === code"
      @click="chooseLocale(code)"
    >
      {{ label
      }}<span v-if="LOCALES[code] !== label" class="visually-hidden"> {{ LOCALES[code] }}</span>
    </button>
  </div>
</template>

<style scoped>
.lang-switch > button[aria-pressed='true'] {
  color: var(--color-primary-text);
}
</style>
