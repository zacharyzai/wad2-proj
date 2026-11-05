<!-- Top bar before logging in: logo, language switch and a slot for buttons. -->
<script setup>
import LanguageSwitch from './LanguageSwitch.vue'
</script>

<template>
  <header class="ph">
    <RouterLink :to="{ name: 'start' }" class="ph-brand">
      <img src="/logo-192.png" alt="" class="logo-tile" width="44" height="44" />
      <span>Ah Ma Ah Gong <span class="ph-can">Can</span></span>
    </RouterLink>
    <LanguageSwitch class="ph-langs" />
    <div class="ph-acts"><slot /></div>
  </header>
</template>

<style scoped>
.ph {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  grid-template-areas: 'brand acts' 'langs langs';
  align-items: center;
  gap: 12px 16px;
  padding: 12px max(16px, calc((100% - 1180px) / 2)) 14px;
  background: var(--color-card);
  border-bottom: 1px solid var(--color-border);
}
.ph-brand {
  grid-area: brand;
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: var(--hit);
  color: var(--color-text);
  font-family: var(--font-display);
  font-size: 20px;
  line-height: 1.15;
  text-decoration: none;
}
.ph-brand:hover {
  color: var(--color-text);
}
.ph-brand .logo-tile {
  width: 44px;
  height: 44px;
  border-radius: 12px;
}
.ph-can {
  color: var(--color-primary-text);
}
.ph-langs {
  grid-area: langs;
}
.ph-acts {
  grid-area: acts;
  display: flex;
  align-items: center;
  gap: 10px;
}
.ph-acts:empty {
  display: none;
}
@media (min-width: 768px) {
  .ph {
    grid-template-columns: auto minmax(0, 1fr) auto;
    grid-template-areas: 'brand langs acts';
    padding-block: 14px;
  }
  .ph-langs {
    justify-self: end;
    width: min(100%, 360px);
  }
}
</style>
