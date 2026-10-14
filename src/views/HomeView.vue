<!-- Owner: Isaac. Revamp from wireframe 1a (scan-first home, logged-out); next dose and last scan come with auth/history (1b). -->
<script setup>
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const CHOICES = [
  { type: 'medication', key: 'med', icon: 'M7.5 4.5a4.95 4.95 0 0 1 7 7l-6 6a4.95 4.95 0 0 1-7-7z M5 9l7 7' },
  { type: 'bill', key: 'bill', icon: 'M6 3h12v18l-3-2-3 2-3-2-3 2z M9 8h6 M9 12h6' },
]
</script>

<template>
  <div class="home">
    <section class="hero">
      <img src="/logo.svg" alt="" class="hero-logo" />
      <h1 class="h-page">{{ t('home.title') }}</h1>
      <p class="lead-lg text-soft">{{ t('home.lead') }}</p>

      <div class="choices">
        <RouterLink v-for="(c, i) in CHOICES" :key="c.type" :to="{ name: 'scan', query: { type: c.type } }" class="choice" :class="{ main: i === 0 }">
          <span class="choice-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path :d="c.icon" /></svg>
          </span>
          <span class="d-flex flex-column gap-1">
            <span class="choice-title">{{ t(`home.${c.key}.title`) }}</span>
            <span class="choice-text">{{ t(`home.${c.key}.text`) }}</span>
          </span>
        </RouterLink>
      </div>
    </section>

    <aside class="side-col">
      <RouterLink :to="{ name: 'scan' }" class="sample-tile">{{ t('home.sample') }} →</RouterLink>
      <div class="box d-flex flex-column gap-3">
        <h2 class="h-sec">{{ t('home.keep.title') }}</h2>
        <p>{{ t('home.keep.text') }}</p>
        <RouterLink to="/login" class="btn-alt align-self-start">{{ t('home.keep.login') }}</RouterLink>
      </div>
    </aside>
  </div>
</template>

<style scoped>
.home { display: grid; gap: 24px; }
.hero { display: flex; flex-direction: column; gap: 14px; text-align: center; align-items: center; }
.hero-logo { width: 88px; height: 88px; }
.choices { align-self: stretch; display: flex; flex-direction: column; gap: 14px; margin-top: 8px; text-align: left; }
.choice { display: flex; align-items: center; gap: 16px; min-height: 96px; padding: 18px 20px; border: 2px solid var(--teal); border-radius: 20px; background: var(--surface); color: var(--teal-dark); text-decoration: none; }
.choice:hover { background: var(--teal-soft); color: var(--teal-dark); }
.choice.main { background: var(--teal); color: #fff; }
.choice.main:hover { background: var(--teal-press); color: #fff; }
.choice-icon { flex: none; display: flex; align-items: center; justify-content: center; width: 52px; height: 52px; border: 2px solid currentColor; border-radius: 14px; }
.choice-title { font-size: 24px; font-weight: 800; line-height: 1.2; }
.choice-text { font-size: 18px; line-height: 1.35; }
.choice:not(.main) .choice-text { color: var(--ink); }
.side-col { display: flex; flex-direction: column; gap: 16px; }
.sample-tile { display: flex; align-items: center; min-height: 64px; padding: 14px 20px; border: 2px dashed var(--line-strong); border-radius: 20px; color: var(--teal-dark); font-size: 20px; font-weight: 700; text-decoration: none; background: var(--surface); }
.sample-tile:hover { border-color: var(--teal); }

@media (min-width: 992px) {
  .home { grid-template-columns: minmax(0, 7fr) minmax(0, 5fr); gap: 40px; align-items: start; }
  .hero { text-align: left; align-items: flex-start; }
  .hero-logo { width: 72px; height: 72px; }
}
</style>
