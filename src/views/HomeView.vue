<!-- Owner: Isaac. From the Claude Design Home screen: gradient hero, what you can scan, samples. -->
<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { scanStore } from '../stores/scan'
import AppIcon from '../components/layout/AppIcon.vue'

const { t } = useI18n()
const router = useRouter()

const CHOICES = [
  { type: 'medication', key: 'med', icon: 'pill' },
  { type: 'bill', key: 'bill', icon: 'receipt' },
]
const SAMPLES = [
  { id: 'med-1', key: 'med1' },
  { id: 'bill-1', key: 'bill1' },
]

const hour = new Date().getHours()
const greet = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'

// Scan reads the picked file on arrival, so Home doesn't need its own copy of the upload logic.
const upload = ref(null)
function onFile(event) {
  const file = event.target.files[0]
  event.target.value = ''
  if (!file) return
  scanStore.pendingFile = file
  router.push({ name: 'scan' })
}
</script>

<template>
  <div class="page">
    <section class="hero home-hero">
      <span class="blob" style="width: 320px; height: 320px; top: -140px; right: -90px"></span>
      <span class="blob" style="width: 200px; height: 200px; bottom: -90px; left: -60px; background: rgba(0, 184, 169, 0.28)"></span>
      <span class="blob" style="width: 120px; height: 120px; top: 40%; right: 38%; background: rgba(255, 255, 255, 0.06)"></span>

      <div class="hero-text rise">
        <div class="d-flex align-items-center gap-3">
          <img src="/logo-512.png" alt="" class="logo-tile hero-logo" />
          <span class="greet">{{ t(`home.greet.${greet}`) }}</span>
        </div>
        <h1 class="display">{{ t('home.title') }}</h1>
        <p class="hero-lead">{{ t('home.lead') }}</p>
        <div class="hero-acts">
          <RouterLink :to="{ name: 'scan' }" class="btn btn-on-hero"><AppIcon name="scan" />{{ t('pages.scan') }}</RouterLink>
          <button type="button" class="btn btn-on-hero-outline" @click="upload.click()"><AppIcon name="upload" />{{ t('scan.upload') }}</button>
          <input ref="upload" type="file" accept="image/*" class="d-none" @change="onFile" />
        </div>
      </div>

      <!-- Desktop only: what a label looks like, so people know what to photograph. -->
      <figure class="hero-art" aria-hidden="true">
        <img src="/samples/med-1.svg" alt="" class="hero-label" />
      </figure>
    </section>

    <section class="d-flex flex-column gap-3">
      <h2 class="section-label">{{ t('home.what') }}</h2>
      <div class="grid stagger">
        <RouterLink v-for="c in CHOICES" :key="c.type" :to="{ name: 'scan', query: { type: c.type } }" class="card card-interactive choice-card">
          <span class="tile tile-lg"><AppIcon :name="c.icon" :size="28" /></span>
          <span class="d-flex flex-column gap-1 flex-grow-1 min-w-0">
            <span class="choice-title">{{ t(`home.${c.key}.title`) }}</span>
            <span class="text-muted-a11y">{{ t(`home.${c.key}.text`) }}</span>
          </span>
          <span class="chev"><AppIcon name="right" :size="22" /></span>
        </RouterLink>
      </div>
    </section>

    <section class="d-flex flex-column gap-3">
      <h2 class="section-label">{{ t('home.sample') }}</h2>
      <div class="grid">
        <RouterLink v-for="s in SAMPLES" :key="s.id" :to="{ name: 'scan', query: { sample: s.id } }" class="sample-link">
          <AppIcon name="sparkles" />
          <span class="flex-grow-1">{{ t(`scan.samples.${s.key}`) }}</span>
          <AppIcon name="right" :size="22" />
        </RouterLink>
      </div>
    </section>
  </div>
</template>

<style scoped src="../styles/views/HomeView.css"></style>
