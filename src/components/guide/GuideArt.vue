<!-- Pictures for the Beginner's guide cards (Claude Design "TourArt"): simple shapes on a soft blob, in the app's colours.
     step 1 (welcome): language buttons that really switch the app language. step 5 (finish): a question and an answer. -->
<script setup>
import { useI18n } from 'vue-i18n'
import { setLocale } from '../../i18n'
import AppIcon from '../layout/AppIcon.vue'

defineProps({ step: { type: Number, required: true } })
const { t, locale } = useI18n()
const LANGS = { en: 'EN', zh: '中文', ms: 'BM', ta: 'தமிழ்' }
</script>

<template>
  <div class="art">
    <span class="g-blob" aria-hidden="true"></span>

    <div v-if="step === 1" class="sheet langs" role="group" :aria-label="t('nav.language')">
      <button v-for="(label, code) in LANGS" :key="code" type="button" :lang="code" :aria-pressed="locale === code" @click="setLocale(code)">{{ label }}</button>
      <span class="badge-dot big tr" aria-hidden="true"><AppIcon name="volume" :size="26" /></span>
    </div>

    <div v-else class="sheet chat" aria-hidden="true">
      <span class="bubble mine"><span class="bar"></span><span class="bar w60"></span></span>
      <span class="bubble theirs"><span class="bar"></span><span class="bar"></span><span class="bar w50"></span></span>
      <span class="badge-dot big bl"><AppIcon name="pill" :size="26" /></span>
      <span class="badge-dot soft tr"><AppIcon name="users" :size="22" /></span>
    </div>
  </div>
</template>

<style scoped>
.art { position: relative; height: var(--art-h, 176px); display: grid; place-items: center; }
.g-blob { position: absolute; width: min(80%, 330px); height: 88%; border-radius: 58% 42% 55% 45% / 52% 60% 40% 48%; background: var(--color-tint); }
.sheet { position: relative; box-sizing: border-box; background: var(--color-card); border-radius: 14px; padding: 16px; box-shadow: var(--shadow-card); display: flex; flex-direction: column; gap: 10px; }
.bar { display: block; height: 10px; width: 100%; border-radius: 5px; background: var(--color-border-strong); }
.w60 { width: 60%; } .w50 { width: 50%; }
.badge-dot { position: absolute; box-sizing: border-box; display: grid; place-items: center; border-radius: 50%; border: 4px solid var(--color-card); }
.badge-dot.big { width: 60px; height: 60px; background: var(--color-primary); color: var(--color-on-primary); }
.badge-dot.soft { width: 50px; height: 50px; background: var(--color-tint); color: var(--color-tint-text); }
.tr { top: -22px; right: -24px; } .bl { bottom: -22px; left: -24px; }

/* 1: working language buttons */
.langs { width: 240px; padding: 12px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; border-radius: 18px; }
.langs button { min-height: var(--z52, 52px); border: 0; border-radius: 14px; background: var(--color-surface-2); color: var(--color-text); font: 600 18px var(--font-sans); }
.langs button[aria-pressed='true'] { background: var(--color-primary); color: var(--color-on-primary); font-weight: 700; }

/* 5: a question and an answer */
.chat { width: 236px; padding: 14px; border-radius: var(--r-tile); transform: rotate(-3deg); }
.bubble { display: flex; flex-direction: column; gap: 7px; padding: 12px; }
.bubble .bar { height: 9px; }
.mine { align-self: flex-end; width: 62%; border-radius: var(--r-tile) var(--r-tile) 4px var(--r-tile); background: var(--color-primary); }
.mine .bar { background: rgba(255, 255, 255, 0.85); }
.theirs { width: 80%; border-radius: var(--r-tile) var(--r-tile) var(--r-tile) 4px; background: var(--color-surface-2); }
</style>
