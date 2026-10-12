<!-- Owner: Isaac (app shell). Unstyled placeholder so every page is reachable during development. -->
<script setup>
import { useI18n } from 'vue-i18n'
import { LOCALES, setLocale } from './i18n'

const { t, locale } = useI18n()
</script>

<template>
  <nav>
    <RouterLink to="/">{{ t('app.name') }}</RouterLink> |
    <RouterLink to="/scan">{{ t('nav.scan') }}</RouterLink> |
    <RouterLink to="/schedule">{{ t('nav.schedule') }}</RouterLink> |
    <RouterLink to="/bill">{{ t('nav.bill') }}</RouterLink> |
    <RouterLink to="/history">{{ t('nav.history') }}</RouterLink> |
    <RouterLink to="/login">{{ t('nav.login') }}</RouterLink>
    <label>
      {{ t('nav.language') }}
      <select data-testid="language-select" :value="locale" @change="setLocale($event.target.value)">
        <option v-for="(label, code) in LOCALES" :key="code" :value="code">{{ label }}</option>
      </select>
    </label>
  </nav>
  <main>
    <RouterView />
  </main>
</template>
