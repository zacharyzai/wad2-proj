<!-- Switch between English, 中文, Bahasa Melayu and தமிழ். -->
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
