<!-- Owner: Isaac. Full-screen frame for Login and Signup (no app sidebar: nothing else works before you log in).
     Left: a warm "paper" story (big serif greeting, a fanned real label and bill, three promises). Right: a plain sheet
     with the language and night-mode switches, the Log in / Create account tabs and the form (the slot).
     Phones: switches, greeting, the dose chip, form, then the promises. -->
<script setup>
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { setLocale } from '../../i18n'
import { theme, toggleTheme } from '../../theme'
import AppIcon from './AppIcon.vue'

defineProps({ active: { type: String, required: true } }) // 'login' or 'signup'
const { t, locale } = useI18n()
const route = useRoute()
const LANGS = { en: 'EN', zh: '中文', ms: 'BM', ta: 'தமிழ்' }
const PROMISES = [
  { key: 'read', icon: 'volume' },
  { key: 'bill', icon: 'receipt' },
  { key: 'private', icon: 'shield' },
]

// The chip says the label's dose in each language in turn (from the Explain page's own templates), then settles on
// the page language. Plays once, about 8 s, and stops at the first tap or key in the form, a language change or a hidden tab.
const CHIP_LANGS = ['en', 'zh', 'ms', 'ta']
const chipText = (l) => t('explain.med.title', { amount: 1, unit: t('unit.tablet', 1, { locale: l }), times: 2 }, { plural: 2, locale: l })
const reduceMq = matchMedia('(prefers-reduced-motion: reduce)')
const order = CHIP_LANGS.filter((l) => l !== locale.value)
const chipLang = ref(reduceMq.matches ? locale.value : order[0])
let timer
const stopChip = () => { clearTimeout(timer); timer = null; chipLang.value = locale.value }
const nextChip = () => {
  const i = order.indexOf(chipLang.value) + 1
  if (i >= order.length) return stopChip()
  chipLang.value = order[i]
  timer = setTimeout(nextChip, 2200)
}
watch(locale, stopChip)
onMounted(() => {
  if (!reduceMq.matches) timer = setTimeout(nextChip, 2000)
  document.addEventListener('visibilitychange', stopChip)
})
onBeforeUnmount(() => { clearTimeout(timer); document.removeEventListener('visibilitychange', stopChip) })
</script>

<template>
  <div class="auth" :class="`lang-${locale}`">
    <div class="auth-top">
      <div class="segmented auth-langs" role="group" :aria-label="t('nav.language')">
        <button v-for="(label, code) in LANGS" :key="code" type="button" :lang="code" :aria-pressed="locale === code" @click="setLocale(code)">{{ label }}</button>
      </div>
      <button type="button" class="auth-night" :aria-pressed="theme === 'dark'" :aria-label="t('nav.night')" :title="t('nav.night')" @click="toggleTheme">
        <AppIcon :name="theme === 'dark' ? 'sun' : 'moon'" :size="22" />
      </button>
    </div>

    <section class="auth-story">
      <RouterLink to="/welcome" class="auth-brand">
        <img src="/logo-192.png" alt="" class="logo-tile" />
        <span>Ah Ma Ah Gong <span class="auth-brand-can">Can</span></span>
      </RouterLink>
      <div class="auth-hello">
        <h1>{{ t(`auth.hello.${active}`) }}</h1>
        <p>{{ t(`auth.hello.${active}Lead`) }}</p>
      </div>
      <!-- A real sample label and bill, and what the app turns them into. Decoration: the promises below say it in words.
           Phones show only the chip. All four sentences share one grid cell, so the chip never changes size while it cycles. -->
      <figure class="auth-papers" aria-hidden="true">
        <img src="/samples/bill-1.svg" alt="" class="paper paper-bill" />
        <div class="paper paper-med"><img src="/samples/med-1.svg" alt="" /><span class="paper-scan"></span></div>
        <span class="paper-chip"><span v-for="l in CHIP_LANGS" :key="l" :lang="l" :class="{ on: l === chipLang }">{{ chipText(l) }}</span></span>
      </figure>
      <section class="auth-promises auth-promises-desk" :aria-label="t('auth.promiseLabel')">
        <ul>
          <li v-for="p in PROMISES" :key="p.key"><span class="promise-icon"><AppIcon :name="p.icon" :size="22" /></span>{{ t(`auth.promise.${p.key}`) }}</li>
        </ul>
        <RouterLink to="/welcome" class="auth-about">{{ t('auth.about') }}<AppIcon name="right" :size="20" /></RouterLink>
      </section>
    </section>

    <section class="auth-sheet" @focusin="stopChip" @pointerdown="stopChip">
      <div class="auth-form">
        <nav class="auth-tabs" :aria-label="t('auth.tabs')">
          <RouterLink :to="{ name: 'login', query: route.query }" class="auth-tab" :class="{ on: active === 'login' }" :aria-current="active === 'login' ? 'page' : null">{{ t('auth.login') }}</RouterLink>
          <RouterLink :to="{ name: 'signup', query: route.query }" class="auth-tab" :class="{ on: active === 'signup' }" :aria-current="active === 'signup' ? 'page' : null">{{ t('auth.signup') }}</RouterLink>
        </nav>

        <slot />

        <p class="auth-note"><AppIcon name="lock" :size="20" /><span>{{ t('auth.privacy') }}</span></p>
      </div>
    </section>

    <!-- Phones: after the form. Desktop: the copy inside the story panel shows instead (only one is ever displayed). -->
    <section class="auth-promises auth-promises-phone" :aria-label="t('auth.promiseLabel')">
      <ul>
        <li v-for="p in PROMISES" :key="p.key"><span class="promise-icon"><AppIcon :name="p.icon" :size="22" /></span>{{ t(`auth.promise.${p.key}`) }}</li>
      </ul>
      <RouterLink to="/welcome" class="auth-about">{{ t('auth.about') }}<AppIcon name="right" :size="20" /></RouterLink>
    </section>
  </div>
</template>

<style>
/* Not scoped on purpose: Login and Signup put their form inside the slot and reuse .auth-field, .auth-label and friends. */
.auth { min-height: 100vh; min-height: 100dvh; display: flex; flex-direction: column; background: var(--color-card); }
.auth-top { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 16px; background: var(--color-surface-2); }
.auth-langs { flex: 1; max-width: 360px; background: var(--color-page); }
.auth-langs > button[aria-pressed='true'] { background: var(--color-card); color: var(--color-primary-text); box-shadow: var(--shadow-card); }
.auth-night { width: var(--hit); height: var(--hit); flex: none; display: grid; place-items: center; border: 0; border-radius: 50%; background: var(--color-page); color: var(--color-text); }

/* The story: warm paper, the one big serif moment */
.auth-story { position: relative; display: flex; flex-direction: column; gap: 20px; padding: 8px 20px 28px; background: var(--color-surface-2); }
.auth-brand { display: flex; align-items: center; gap: 12px; align-self: flex-start; color: var(--color-text); font-size: 18px; font-weight: 800; line-height: 1.15; text-decoration: none; }
.auth-brand .logo-tile { width: 44px; height: 44px; border-radius: 12px; }
.auth-brand-can { color: var(--color-primary-text); }
.auth-hello { display: flex; flex-direction: column; gap: 12px; }
.auth-hello h1 { font-family: var(--font-display); font-weight: 400; font-size: clamp(38px, 9vw, 76px); line-height: 1.02; letter-spacing: -0.02em; text-wrap: balance; }
.auth-hello p { max-width: 34ch; font-size: var(--fs-lead); line-height: 1.5; color: var(--color-text-muted); text-wrap: pretty; }
.lang-ta .auth-hello h1 { font-family: var(--font-sans); font-weight: 800; font-size: clamp(30px, 6vw, 48px); line-height: 1.2; }
.auth-papers { margin: 0; }
.paper { display: none; }
.paper-chip { display: grid; place-items: center; width: fit-content; text-align: center; text-wrap: balance; max-width: 100%; padding: 10px 16px; border-radius: 16px; background: var(--color-primary); color: var(--color-on-primary); font-family: var(--font-display); font-size: 18px; line-height: 1.35; font-variant-numeric: lining-nums; box-shadow: var(--shadow-glow); }
/* Tamil is the longest sentence and sets the chip's size: the plainer script face keeps it to two lines on a phone. */
.paper-chip > [lang='ta'] { font-family: var(--font-sans); font-size: max(16px, 0.9em); font-weight: 600; }
/* Each sentence comes into focus as the last one blurs away (exit faster than entrance). */
.paper-chip > span { grid-area: 1 / 1; opacity: 0; filter: blur(3px); transition: opacity 160ms ease-in, filter 160ms ease-in; }
.paper-chip > span.on { opacity: 1; filter: none; transition: opacity 420ms var(--ease-out) 140ms, filter 420ms var(--ease-out) 140ms; }

/* The sheet: plain, quiet, all about the form */
.auth-sheet { display: flex; padding: 24px 20px 32px; background: var(--color-card); }
.auth-form { width: 100%; max-width: 460px; margin: 0 auto; display: flex; flex-direction: column; gap: 22px; }
.auth-tabs { display: flex; gap: 28px; border-bottom: 1px solid var(--color-border); }
.auth-tab { min-height: var(--hit); display: flex; align-items: center; margin-bottom: -1px; border-bottom: 3px solid transparent; color: var(--color-text-muted); font-size: var(--t19, 19px); font-weight: 600; text-decoration: none; transition: color var(--dur) var(--ease-out), border-color var(--dur) var(--ease-out); }
.auth-tab:hover { color: var(--color-text); }
.auth-tab.on { color: var(--color-text); font-weight: 800; border-color: var(--color-primary); }

.auth-label { display: block; margin-bottom: var(--s-2); font-size: 18px; font-weight: 700; }
.auth-field {
  display: flex; align-items: center; gap: 12px; min-height: var(--h-field); padding: 0 6px 0 var(--s-4);
  border: 1.5px solid var(--color-border-strong); border-radius: var(--r-field); background: var(--color-page); color: var(--color-text-muted);
  transition: border-color var(--dur) var(--ease-out), box-shadow var(--dur) var(--ease-out), background-color var(--dur) var(--ease-out);
}
.auth-field:focus-within { border-color: var(--color-primary); background: var(--color-card); color: var(--color-primary-text); box-shadow: var(--focus-ring); }
.auth-field.bad { border: 2px solid var(--color-danger); }
.auth-field input, .auth-field select { flex: 1; min-width: 0; min-height: var(--z52, 52px); border: 0; outline: 0; background: transparent; color: var(--color-text); font: 500 19px var(--font-sans); }
.auth-field input:focus, .auth-field select:focus { box-shadow: none; }
.auth-eye { width: var(--hit); height: var(--hit); display: grid; place-items: center; border: 0; border-radius: var(--r-sm); background: transparent; color: var(--color-text-muted); }
.auth-eye:hover { background: var(--color-surface-2); color: var(--color-text); }
.auth-check { display: flex; align-items: center; gap: 12px; min-height: var(--hit); font-size: 18px; font-weight: 600; cursor: pointer; }
.auth-check input { width: 26px; height: 26px; flex: none; accent-color: var(--color-primary); }
.auth-help { display: block; margin-top: var(--s-2); font-size: var(--fs-small); line-height: 1.45; color: var(--color-text-muted); }
/* "Forgot your password?": a big, plain tap target that opens a short help text (Login). */
.auth-forgot summary { display: inline-flex; align-items: center; min-height: var(--hit); font-size: 18px; font-weight: 700; color: var(--color-link); cursor: pointer; text-decoration: underline; text-underline-offset: 3px; }
.auth-forgot summary::-webkit-details-marker { display: none; }
.auth-warn { display: flex; gap: 8px; align-items: flex-start; margin-top: var(--s-2); color: var(--color-danger-text); font-size: var(--fs-small); font-weight: 600; line-height: 1.45; }
.auth-note { display: flex; gap: var(--s-2); margin: 0; font-size: var(--fs-small); line-height: 1.5; color: var(--color-text-muted); }
.auth-note .icon { flex: none; margin-top: 1px; color: var(--color-primary-text); }

/* Promises: what you get, in words */
.auth-promises { display: flex; flex-direction: column; gap: 18px; padding: 28px 20px 40px; background: var(--color-surface-2); }
.auth-promises-desk { display: none; }
.auth-promises ul { display: grid; gap: 14px; margin: 0; padding: 0; list-style: none; }
.auth-promises li { display: flex; align-items: flex-start; gap: 14px; font-size: 18px; font-weight: 600; line-height: 1.45; }
.promise-icon { width: 44px; height: 44px; flex: none; display: grid; place-items: center; border-radius: 14px; background: var(--color-card); color: var(--color-primary-text); box-shadow: var(--shadow-card); }
.auth-about { display: inline-flex; align-items: center; gap: 6px; align-self: flex-start; min-height: var(--hit); color: var(--color-link); font-size: 18px; font-weight: 700; }

/* Tablets and wide phones: every band uses the form's centred 460px column, so all left edges line up. */
@media (min-width: 576px) and (max-width: 991.98px) {
  .auth-top, .auth-story, .auth-promises { padding-inline: max(20px, calc((100% - 460px) / 2)); }
  .auth-hello h1 { font-size: 56px; }
  .lang-ta .auth-hello h1 { font-size: 40px; }
}

/* Desktop: the paper story on the left (greeting, papers, promises), the sheet with its switches on the right. */
@media (min-width: 992px) {
  .auth { display: grid; grid-template-columns: minmax(0, 1.08fr) minmax(480px, 0.92fr); grid-template-rows: auto 1fr; grid-template-areas: 'story top' 'story sheet'; }
  .auth-top { grid-area: top; justify-content: flex-end; padding: 24px 40px 0; background: var(--color-card); border-left: 1px solid var(--color-border); }
  /* One screen tall and stays put while a long form (signup) scrolls, so there is never an empty gap. */
  .auth-story { grid-area: story; position: sticky; top: 0; align-self: start; height: 100vh; height: 100dvh; gap: clamp(14px, 2.6vh, 28px); padding: clamp(24px, 4vh, 40px) 48px; overflow: hidden; }
  /* The greeting shrinks with the window height, so the pictures and promises always fit. */
  .auth-hello h1 { font-size: clamp(36px, 7.5vh, 72px); }
  .auth-sheet { grid-area: sheet; align-items: center; padding: 24px 40px 48px; border-left: 1px solid var(--color-border); }
  .auth-promises-phone { display: none; }
  .auth-promises-desk { display: flex; padding: 0; background: none; }
  /* The pictures fill whatever height is left: sized from the box itself (container units), never hidden. */
  .auth-papers { display: block; position: relative; flex: 1 1 0; min-height: 120px; margin: 0; container-type: size; }
  .paper { display: block; position: absolute; width: min(58cqw, 92cqh, 340px); border-radius: 10px; background: #fff; box-shadow: var(--shadow-hover); animation: paper-in 700ms var(--ease-out) both; }
  .paper-bill { left: 34%; top: 0; transform: rotate(6deg); animation-delay: 80ms; }
  .paper-med { left: 2%; top: 18%; overflow: hidden; transform: rotate(-6deg); }
  .paper-med img { display: block; width: 100%; }
  /* Once the label lands, a teal line reads it top to bottom, once: the app's own job, in one gesture. */
  .paper-scan { position: absolute; inset: 0; opacity: 0; background: linear-gradient(to bottom, transparent 55%, color-mix(in srgb, var(--color-primary) 16%, transparent) 97%, var(--color-primary) 97%); animation: paper-scan 1200ms cubic-bezier(0.65, 0, 0.35, 1) 700ms both; }
  .paper-chip { position: absolute; left: 18%; bottom: 4%; max-width: 76cqw; font-size: clamp(16px, 7cqh, 24px); transform: rotate(-2deg); animation: paper-in 700ms var(--ease-out) 220ms both; }
}
/* Short laptop screens: the papers make way so the promises still fit in the panel. */
@media (min-width: 992px) and (max-height: 560px) { .auth-papers { display: none; } } /* only very short windows drop them */
@keyframes paper-in { from { opacity: 0; translate: 0 24px; } }
@keyframes paper-scan { 0% { opacity: 1; translate: 0 -100%; } 85% { opacity: 1; translate: 0 0; } 100% { opacity: 0; translate: 0 0; } }
</style>
