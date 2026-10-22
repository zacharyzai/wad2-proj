<!-- Owner: Isaac. Shared frame for Login and Signup: teal hero + card with two tabs. -->
<script setup>
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import AppIcon from './AppIcon.vue'
import BigButton from './BigButton.vue'

defineProps({ active: { type: String, required: true } }) // 'login' or 'signup'
const { t } = useI18n()
const route = useRoute()
</script>

<template>
  <div class="auth-page">
    <section class="auth-hero">
      <img src="/logo-192.png" alt="" class="auth-logo" />
      <h1 class="auth-name">{{ t('app.name') }}</h1>
      <p class="auth-lead">{{ t('auth.heroText') }}</p>
    </section>

    <section class="auth-side">
      <div class="auth-card">
        <nav class="auth-tabs" :aria-label="t('auth.tabs')">
          <RouterLink :to="{ name: 'login', query: route.query }" class="auth-tab" :class="{ on: active === 'login' }" :aria-current="active === 'login' ? 'page' : null">{{ t('auth.login') }}</RouterLink>
          <RouterLink :to="{ name: 'signup', query: route.query }" class="auth-tab" :class="{ on: active === 'signup' }" :aria-current="active === 'signup' ? 'page' : null">{{ t('auth.signup') }}</RouterLink>
        </nav>

        <slot />

        <div class="auth-or"><span></span>{{ t('auth.or') }}<span></span></div>
        <BigButton to="/scan" variant="alt">{{ t('auth.guest') }}</BigButton>

        <p class="auth-note">
          <AppIcon name="shield" :size="20" />
          <span>{{ t('auth.privacy') }}</span>
        </p>
      </div>
    </section>
  </div>
</template>

<style>
/* Not scoped on purpose: Login and Signup put their form inside the slot and reuse .auth-field / .auth-label. */
.auth-page { display: grid; grid-template-columns: 1fr; max-width: 1000px; margin: 0 auto; }
.auth-hero {
  position: relative; overflow: hidden; color: var(--color-on-primary);
  background: var(--gradient-hero); /* already has a dark-mode version in tokens.css */
  border-radius: var(--r-hero);
  padding: var(--s-5) var(--s-5) 72px; /* extra bottom space: the card overlaps it on phones */
  display: flex; flex-direction: column; gap: var(--s-3);
}
/* Decorative bubbles. Pure decoration, so they are pseudo-elements and the screen reader never sees them. */
.auth-hero::before, .auth-hero::after { content: ''; position: absolute; border-radius: 999px; pointer-events: none; }
.auth-hero::before { width: 360px; height: 360px; top: -160px; right: -120px; background: rgba(255, 255, 255, 0.08); }
.auth-hero::after { width: 220px; height: 220px; bottom: -100px; left: -70px; background: rgba(0, 184, 169, 0.3); }
/* Keep the logo and text above the bubbles. */
.auth-hero > * { position: relative; }
.auth-logo { width: 72px; height: 72px; border-radius: 18px; box-shadow: 0 6px 18px rgba(0, 0, 0, 0.22); }
.auth-name { margin: 0; font-size: var(--fs-display); font-weight: 800; line-height: var(--lh-tight); }
.auth-lead { margin: 0; font-size: var(--fs-lead); line-height: var(--lh-body); max-width: 440px; }
.auth-side { display: flex; justify-content: center; }
.auth-card {
  width: 100%; max-width: 440px; margin-top: -48px; position: relative;
  background: var(--color-card); border: 1px solid var(--color-border); border-radius: var(--r-hero);
  box-shadow: var(--shadow-hover);
  padding: var(--s-6); display: flex; flex-direction: column; gap: 18px;
}
.auth-tabs { display: flex; gap: var(--s-1); padding: var(--s-1); background: var(--color-surface-2); border-radius: 16px; }
.auth-tab {
  flex: 1; min-height: var(--hit); display: flex; align-items: center; justify-content: center;
  border-radius: var(--r-sm); font-weight: 600; color: var(--color-text-muted); text-decoration: none;
}
.auth-tab.on { background: var(--color-card); color: var(--color-primary-text); font-weight: 700; box-shadow: var(--shadow-card); }
.auth-label { font-weight: 700; margin-bottom: var(--s-2); display: block; }
.auth-field {
  display: flex; align-items: center; gap: 10px; min-height: var(--h-field); padding: 0 6px 0 var(--s-4);
  border: 1px solid var(--color-border-strong); border-radius: var(--r-field);
  background: var(--color-card); color: var(--color-text-muted);
}
.auth-field:focus-within { border-color: var(--color-primary); box-shadow: var(--focus-ring); }
.auth-field.bad { border: 2px solid var(--color-danger); }
.auth-field input, .auth-field select {
  flex: 1; min-width: 0; min-height: 52px; border: 0; outline: 0; background: transparent;
  color: var(--color-text); font: inherit;
}
.auth-eye {
  width: var(--hit); height: var(--hit); display: grid; place-items: center;
  border: 0; border-radius: var(--r-sm); background: transparent; color: var(--color-text-muted);
}
.auth-or { display: flex; align-items: center; gap: var(--s-3); color: var(--color-text-muted); font-size: var(--fs-small); }
.auth-or span { flex: 1; height: 1px; background: var(--color-border); }
.auth-note { margin: 0; display: flex; gap: var(--s-2); font-size: var(--fs-small); line-height: 1.5; color: var(--color-text-muted); }
.auth-note :first-child { flex: none; color: var(--color-primary-text); }

@media (min-width: 768px) {
  .auth-page { grid-template-columns: 1fr 1fr; align-items: stretch; } /* both columns as tall as the taller one */
  .auth-hero { padding: var(--s-10); justify-content: flex-end; border-radius: var(--r-hero) 0 0 var(--r-hero); }
  .auth-side { align-items: center; }
  .auth-card { margin-top: 0; margin-left: -40px; } /* overlaps the hero edge like the desktop design */
}
</style>