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
// Each list is shown twice in a row, so the loop is seamless: when the first copy has moved out, the second is in its place.
const LABEL_LOOP = ['med-1', 'med-2', 'med-3', 'med-1', 'med-2', 'med-3']
const RECEIPT_LOOP = ['bill-1', 'bill-2', 'bill-3', 'bill-1', 'bill-2', 'bill-3']
// Each picture's real size (from its SVG), so the tiles keep their shape while the pictures load instead of growing.
const SIZE = { 'med-1': 360, 'med-2': 360, 'med-3': 360, 'bill-1': 360, 'bill-2': 420, 'bill-3': 448 } // height when 480 wide

const SAMPLES = [
  { id: 'med-1', key: 'med1' },
  { id: 'bill-1', key: 'bill1' },
]

const hour = new Date().getHours()
const greet = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'

// Scan takes the picked file on arrival and asks what it is (medicine label or bill) before reading it, so Home doesn't
// guess, and doesn't need its own copy of the upload logic.
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

      <div class="hero-text">
        <div class="d-flex align-items-center gap-3">
          <img src="/logo-192.png" alt="" class="logo-tile hero-logo" width="72" height="72" /><!-- 192px: sharp at 72px on 2x screens, a third of the 512 file -->
          <span class="greet">{{ t(`home.greet.${greet}`) }}</span>
        </div>
        <h1 class="display">{{ t('home.title') }}</h1>
        <p class="hero-lead">{{ t('home.lead') }}</p>
        <div class="hero-acts">
          <RouterLink :to="{ name: 'scan', query: { type: 'medication' } }" class="btn btn-on-hero"><AppIcon name="scan" />{{ t('home.med.title') }}</RouterLink>
          <button type="button" class="btn btn-on-hero-outline" @click="upload.click()"><AppIcon name="upload" />{{ t('scan.upload') }}</button>
          <input ref="upload" type="file" accept="image/*" class="d-none" @change="onFile" />
        </div>
      </div>

      <!-- Desktop only: what a label looks like, so people know what to photograph. -->
      <figure class="hero-art" aria-hidden="true">
        <img src="/samples/med-1.svg" alt="" class="hero-label" width="480" height="360" />
      </figure>
    </section>

    <!-- Bento: the two scans are the big tiles; Ask and the samples sit beside them. Stacks in the same order on phones. -->
    <section class="d-flex flex-column gap-3">
      <h2 class="section-label">{{ t('home.what') }}</h2>
      <div class="bento">
        <RouterLink v-for="c in CHOICES" :key="c.type" :to="{ name: 'scan', query: { type: c.type } }" class="card card-interactive tile-link" :class="`b-${c.type}`">
          <span class="tile tile-lg"><AppIcon :name="c.icon" :size="28" /></span>
          <span class="d-flex flex-column gap-1">
            <span class="choice-title">{{ t(`home.${c.key}.title`) }}</span>
            <span class="text-muted-a11y">{{ t(`home.${c.key}.text`) }}</span>
          </span>
          <!-- Decoration, so hidden from screen readers. Paused on hover/focus; still with reduced motion. -->
          <span v-if="c.type === 'medication'" class="labels" aria-hidden="true">
            <span class="labels-track"><img v-for="(id, i) in LABEL_LOOP" :key="i" :src="`/samples/${id}.svg`" alt="" width="480" :height="SIZE[id]" /></span>
          </span>
          <span v-else class="receipt" aria-hidden="true">
            <span class="receipt-slot"></span>
            <span class="receipt-paper"><span class="receipt-track"><img v-for="(id, i) in RECEIPT_LOOP" :key="i" :src="`/samples/${id}.svg`" alt="" width="480" :height="SIZE[id]" /></span></span>
          </span>
          <span class="chev"><AppIcon name="right" :size="22" /></span>
        </RouterLink>

        <RouterLink :to="{ name: 'ask' }" class="card card-interactive tile-link b-ask">
          <span class="tile tile-lg"><AppIcon name="chat" :size="28" /></span>
          <span class="d-flex flex-column gap-1">
            <span class="choice-title">{{ t('pages.ask') }}</span>
            <span class="text-muted-a11y">{{ t('home.ask.text') }}</span>
          </span>
        </RouterLink>

        <!-- The Bill page has no tab of its own: this is the way back to the last bill and its subsidies (also in the desktop sidebar). -->
        <RouterLink :to="{ name: 'bill' }" class="card card-interactive tile-link b-breakdown" data-testid="home-breakdown">
          <span class="tile tile-lg"><AppIcon name="receipt" :size="28" /></span>
          <span class="d-flex flex-column gap-1">
            <span class="choice-title">{{ t('home.breakdown.title') }}</span>
            <span class="text-muted-a11y">{{ t('home.breakdown.text') }}</span>
          </span>
          <span class="chev"><AppIcon name="right" :size="22" /></span>
        </RouterLink>

        <div class="b-samples">
          <h3 class="section-label">{{ t('home.sample') }}</h3>
          <RouterLink v-for="s in SAMPLES" :key="s.id" :to="{ name: 'scan', query: { sample: s.id } }" class="sample-link">
            <AppIcon name="sparkles" />
            <span class="flex-grow-1">{{ t(`scan.samples.${s.key}`) }}</span>
            <AppIcon name="right" :size="22" />
          </RouterLink>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped src="../styles/views/HomeView.css"></style>
