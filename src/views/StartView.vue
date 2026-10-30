<!-- Owner: Isaac. The first page for anyone not logged in: what the app does in one sentence, "Join for free" (Create
     account) and "Log in", and a picture of it working: a real sample label behind a phone showing what the app makes of it.
     Two choices only, both big and in words. The welcome page (/welcome) tells the longer story. -->
<script setup>
import { useI18n } from 'vue-i18n'
import AppIcon from '../components/layout/AppIcon.vue'
import PublicHeader from '../components/layout/PublicHeader.vue'

const { t, locale } = useI18n()
const PROMISES = [
  { key: 'read', icon: 'volume' },
  { key: 'bill', icon: 'receipt' },
  { key: 'private', icon: 'shield' },
]
// The phone shows what the Explain page says about the sample label, in the page language (its own words).
const doseText = () => t('explain.med.title', { amount: 1, unit: t('unit.tablet', 1), times: 2 }, 2)
</script>

<template>
  <div class="start" :class="`lang-${locale}`">
    <!-- Both choices in the top bar too, as on most sites (wider screens; on phones "Join for free" is the first button below). -->
    <PublicHeader>
      <RouterLink :to="{ name: 'login' }" class="btn btn-outline btn-sm head-btn" data-testid="start-header-login"><AppIcon name="user" :size="20" />{{ t('nav.login') }}</RouterLink>
      <RouterLink :to="{ name: 'signup' }" class="btn btn-primary btn-sm head-btn head-join" data-testid="start-header-join">{{ t('start.join') }}</RouterLink>
    </PublicHeader>

    <section class="band" aria-labelledby="start-title">
      <span class="band-glow" aria-hidden="true"></span>
      <div class="band-in">
        <div class="pitch">
          <h1 id="start-title">{{ t('start.title') }}</h1>
          <p class="pitch-lead">{{ t('start.text') }}</p>
          <RouterLink :to="{ name: 'signup' }" class="btn btn-on-hero join" data-testid="start-join">{{ t('start.join') }}<AppIcon name="right" :size="24" :stroke="2.5" /></RouterLink>
          <div class="have">
            <span>{{ t('start.have') }}</span>
            <RouterLink :to="{ name: 'login' }" class="btn btn-on-hero-outline have-login" data-testid="start-login">{{ t('nav.login') }}</RouterLink>
          </div>
          <RouterLink to="/welcome" class="about">{{ t('auth.about') }}<AppIcon name="right" :size="20" /></RouterLink>
        </div>

        <!-- A real sample label, and the phone showing what the app makes of it. Decoration: the words say it. -->
        <figure class="demo" aria-hidden="true">
          <img src="/samples/med-1.svg" alt="" class="paper" width="480" height="360" />
          <div class="phone">
            <span class="phone-top"><img src="/logo-192.png" alt="" class="phone-logo" />Ah Ma Ah Gong Can</span>
            <div class="phone-card">
              <span class="phone-med"><span class="phone-tile"><AppIcon name="pill" :size="20" /></span><span><b>Metformin</b><small>500 mg</small></span></span>
              <span class="phone-dose">{{ doseText() }}</span>
              <span class="phone-chips">
                <span class="phone-chip on"><AppIcon name="sunrise" :size="16" />{{ t('timing.morning') }}</span>
                <span class="phone-chip on"><AppIcon name="sunset" :size="16" />{{ t('timing.evening') }}</span>
                <span class="phone-chip"><AppIcon name="food" :size="16" />{{ t('food.after') }}</span>
              </span>
            </div>
            <!-- Today's doses, as on Schedule: the morning one ticked. -->
            <div class="phone-card phone-today">
              <span class="phone-row done"><span class="phone-box"><AppIcon name="check" :size="14" :stroke="3" /></span><span>{{ t('timing.morning') }}</span><small>1 {{ t('unit.tablet', 1) }}</small></span>
              <span class="phone-row"><span class="phone-box"></span><span>{{ t('timing.evening') }}</span><small>1 {{ t('unit.tablet', 1) }}</small></span>
            </div>
            <span class="phone-play"><span class="phone-play-btn"><AppIcon name="play" :size="18" /></span>{{ t('player.play') }}</span>
          </div>
        </figure>
      </div>
      <svg class="wave" viewBox="0 0 1440 120" preserveAspectRatio="none" aria-hidden="true">
        <path class="wave-back" d="M0 70C240 20 480 10 760 46s520 64 680 16V120H0z" />
        <path class="wave-front" d="M0 92C300 52 560 60 820 86s440 30 620-6V120H0z" />
      </svg>
    </section>

    <section class="gets" aria-labelledby="start-gets">
      <h2 id="start-gets" class="section-label">{{ t('start.what') }}</h2>
      <ul>
        <li v-for="p in PROMISES" :key="p.key"><span class="tile tile-soft tile-lg"><AppIcon :name="p.icon" :size="26" /></span>{{ t(`auth.promise.${p.key}`) }}</li>
      </ul>
      <p class="note"><AppIcon name="lock" :size="20" /><span>{{ t('auth.privacy') }}</span></p>
    </section>
  </div>
</template>

<style scoped>
.start { min-height: 100vh; min-height: 100dvh; display: flex; flex-direction: column; background: var(--color-page); }
.head-btn { min-height: var(--hit); border-radius: var(--r-pill); padding-inline: 18px; }
.head-join { display: none; }
@media (min-width: 768px) { .head-join { display: inline-flex; } }

/* The teal band: the one big moment. Solid teal (white text 5.9:1), a soft light in one corner, a wave into the page. */
.band { --band: var(--color-primary); position: relative; overflow: hidden; isolation: isolate; background: var(--band); color: #fff; }
:root[data-theme='dark'] .band { --band: var(--color-primary-pressed); }
.band-glow { position: absolute; z-index: -1; width: 720px; height: 720px; right: -220px; top: -320px; border-radius: 50%; background: radial-gradient(circle, rgba(255, 255, 255, 0.12), transparent 65%); }
.band-in { max-width: 1180px; margin: 0 auto; padding: 40px 20px 32px; display: grid; gap: 40px; align-items: center; }
.pitch { display: flex; flex-direction: column; align-items: flex-start; gap: 22px; }
.pitch h1 { font-family: var(--font-display); font-weight: 400; font-size: clamp(38px, 8.5vw, 64px); line-height: 1.06; letter-spacing: -0.015em; color: #fff; text-wrap: balance; }
.lang-ta .pitch h1 { font-family: var(--font-sans); font-weight: 800; font-size: clamp(28px, 5vw, 42px); line-height: 1.25; }
.pitch-lead { max-width: 34em; font-size: clamp(19px, 1.6vw, 22px); line-height: 1.55; color: #e0f7f5; text-wrap: pretty; } /* 5.4:1 on teal */
/* The main choice: a big white pill with an arrow, the way to begin. */
.join { min-height: 68px; padding: 0 30px 0 34px; border-radius: var(--r-pill); font-size: clamp(21px, 2vw, 24px); gap: 14px; }
.have { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 16px; font-size: 19px; font-weight: 600; color: #e0f7f5; }
.have-login { min-height: 56px; padding: 0 26px; border-radius: var(--r-pill); font-size: 20px; }
.about { display: inline-flex; align-items: center; gap: 6px; min-height: var(--hit); color: #fff; font-size: 18px; font-weight: 700; text-decoration: underline; text-underline-offset: 4px; }
.about:hover { color: #e0f7f5; }

/* The picture: the sample label, tilted, behind a phone showing the plain words. Scaled down on phones. */
.demo { position: relative; margin: 0; justify-self: center; width: min(100%, 460px); aspect-ratio: 1 / 1.02; }
.paper { position: absolute; left: 0; top: 6%; width: 74%; height: auto; border-radius: 12px; background: #fff; transform: rotate(-6deg); box-shadow: 0 30px 60px -28px rgba(0, 0, 0, 0.55); }
.phone { position: absolute; right: 0; bottom: 0; width: 58%; aspect-ratio: 9 / 16; display: flex; flex-direction: column; gap: 10px; padding: 14px 12px; border: 9px solid #172120; border-radius: 34px; background: var(--color-page); color: var(--color-text); box-shadow: 0 40px 70px -30px rgba(0, 0, 0, 0.6); font-size: 13px; line-height: 1.3; }
.phone-top { display: flex; align-items: center; gap: 7px; font-family: var(--font-display); font-size: 12px; }
.phone-logo { width: 20px; height: 20px; border-radius: 6px; }
.phone-card { display: flex; flex-direction: column; gap: 10px; padding: 12px; border-radius: 16px; background: var(--color-card); box-shadow: var(--shadow-card); }
.phone-med { display: flex; align-items: center; gap: 9px; }
.phone-med b { display: block; font-family: var(--font-display); font-weight: 400; font-size: 17px; }
.phone-med small { display: block; color: var(--color-text-muted); font-size: 11px; }
.phone-tile { display: grid; place-items: center; width: 32px; height: 32px; border-radius: 10px; background: var(--color-primary); color: #fff; }
.phone-dose { font-family: var(--font-display); font-size: 16px; line-height: 1.25; font-variant-numeric: lining-nums; }
.lang-ta .phone-dose { font-family: var(--font-sans); font-weight: 700; font-size: 13px; }
.phone-chips { display: flex; flex-wrap: wrap; gap: 5px; }
.phone-chip { display: inline-flex; align-items: center; gap: 4px; padding: 4px 8px; border-radius: 999px; background: var(--color-surface-2); color: var(--color-text-muted); font-size: 11px; font-weight: 600; }
.phone-chip.on { background: var(--color-primary); color: #fff; }
.phone-today { gap: 0; padding: 4px 12px; }
.phone-row { display: flex; align-items: center; gap: 9px; padding: 9px 0; font-weight: 700; font-size: 13px; }
.phone-row + .phone-row { border-top: 1px solid var(--color-border); }
.phone-row small { margin-left: auto; color: var(--color-text-muted); font-weight: 600; font-size: 11px; }
.phone-box { display: grid; place-items: center; width: 22px; height: 22px; flex: none; border-radius: 7px; border: 2px solid var(--color-border-strong); color: #fff; }
.phone-row.done .phone-box { background: var(--color-primary); border-color: var(--color-primary); }
.phone-play { display: flex; align-items: center; gap: 9px; margin-top: auto; padding: 9px 10px; border-radius: 16px; background: var(--color-card); box-shadow: var(--shadow-card); font-weight: 700; font-size: 13px; }
.phone-play-btn { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 50%; background: var(--color-primary); color: #fff; }

/* The wave: a lighter crest behind, the page colour in front, so the band flows into the page. */
.wave { display: block; width: 100%; height: clamp(48px, 7vw, 110px); margin: -8px 0 -1px; } /* -1px: no hairline of teal under the wave */
.wave-back { fill: rgba(255, 255, 255, 0.16); }
.wave-front { fill: var(--color-page); }

/* What you get, in words. */
.gets { width: 100%; max-width: 1180px; margin: 0 auto; padding: 8px 20px 48px; display: flex; flex-direction: column; gap: 18px; }
.gets ul { display: grid; gap: 14px; margin: 0; padding: 0; list-style: none; }
.gets li { display: flex; align-items: center; gap: 16px; padding: 18px 20px; border-radius: var(--r-card); background: var(--color-card); border: 1px solid var(--color-border); box-shadow: var(--shadow-card); font-size: 18px; font-weight: 600; line-height: 1.45; }
.gets .tile { flex: none; }
.note { display: flex; gap: 10px; margin: 4px 0 0; font-size: 16px; line-height: 1.5; color: var(--color-text-muted); }
.note .icon { flex: none; margin-top: 2px; color: var(--color-primary-text); }

@media (max-width: 575.98px) {
  .join, .have-login { width: 100%; justify-content: center; }
  .have { flex-direction: column; align-items: stretch; text-align: center; width: 100%; }
  .demo { width: min(100%, 340px); }
}
@media (min-width: 768px) {
  .gets ul { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .gets li { flex-direction: column; align-items: flex-start; }
}
@media (min-width: 992px) {
  .band-in { grid-template-columns: minmax(0, 1.1fr) minmax(0, 0.9fr); padding: 56px 28px 24px; gap: 56px; }
  .phone { font-size: 14px; }
  .phone-dose { font-size: 18px; }
}
</style>
