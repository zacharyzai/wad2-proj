<!-- The "What would you like to scan?" question with a Label card and a Bill card. -->
<script setup>
import { computed, onBeforeUnmount, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useScanStore } from '../../stores/scan'
import AppIcon from '../layout/AppIcon.vue'
import KindIcon from '../layout/KindIcon.vue'
import ScanLaunch from './ScanLaunch.vue'

const props = defineProps({
  pending: { type: Object, default: null }, // a photo picked on Home: { file, url }
})
const emit = defineEmits(['pick', 'drop'])

const KIND_PAPER = { medication: 'med-1', bill: 'bill-1' } // the sample each card shows
const KINDS = Object.keys(KIND_PAPER)
const { t, tm, rt } = useI18n()
const scanStore = useScanStore()

// The last scan, offered back: coming back from Ask, a refresh or any other page no longer loses it.
const resume = computed(() => {
  const s = scanStore.current
  if (!s || props.pending) return null
  const name = s.type === 'bill' ? s.bill?.clinic || t('explain.tag.bill') : s.medication?.name
  if (!name) return null
  return {
    kind: s.type,
    name,
    checked: scanStore.confirmed,
    to: { name: scanStore.confirmed ? 'explain' : 'confirm' },
  }
})

// Picking a card: its short picture plays first (about 1.7 seconds), then its scan page opens. Reduced motion: at once.
// SLOW stretches every part of the picture (ScanLaunch.vue) and this wait by the same amount: 1 is the original second, 2 is twice as slow.
const SLOW = 1.6
const LAUNCH_MS = 1050 * SLOW
const launching = ref(null) // { kind, x, y, k } while the picture plays
let launchTimer = 0
// Picks Label or Bill; the card grows towards the screen before the page changes.
function choose(event, kind) {
  if (launching.value) return // already on its way: a second tap does nothing
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return emit('pick', kind)
  const box = event.currentTarget.getBoundingClientRect()
  launching.value = { kind, x: box.left + box.width / 2, y: box.top + box.height / 2, k: SLOW }
  launchTimer = setTimeout(() => emit('pick', kind), LAUNCH_MS)
}
onBeforeUnmount(() => clearTimeout(launchTimer))

// The card leans a little towards the mouse, and a soft light follows it (CSS reads --mx, --my: 0 to 1 across the card).
function lean(e) {
  if (e.pointerType !== 'mouse') return
  const box = e.currentTarget.getBoundingClientRect()
  e.currentTarget.style.setProperty('--mx', ((e.clientX - box.left) / box.width).toFixed(3))
  e.currentTarget.style.setProperty('--my', ((e.clientY - box.top) / box.height).toFixed(3))
}
// Resets the card's lean towards the pointer.
function unlean(e) {
  e.currentTarget.style.removeProperty('--mx')
  e.currentTarget.style.removeProperty('--my')
}
</script>

<template>
  <div class="page rise picker">
    <div class="page-head">
      <h1>{{ t('scan.choose.question') }}</h1>
      <p v-if="!pending" class="lead-text pick-lead">{{ t('scan.choose.lead') }}</p>
    </div>
    <section
      v-if="resume"
      class="resume card"
      aria-labelledby="resume-title"
      data-testid="scan-resume"
    >
      <KindIcon :kind="resume.kind" />
      <div class="resume-text">
        <h2 id="resume-title" class="h3 m-0">{{ t('scan.resume.title') }}: {{ resume.name }}</h2>
        <p class="m-0 text-muted-a11y">
          {{ t(resume.checked ? 'scan.resume.checked' : 'scan.resume.unchecked') }}
        </p>
      </div>
      <RouterLink :to="resume.to" class="btn btn-primary" data-testid="scan-resume-go"
        ><AppIcon name="right" :size="22" />{{
          t(resume.checked ? 'scan.resume.seeAgain' : 'scan.resume.carryOn')
        }}</RouterLink
      >
    </section>
    <!-- A photo picked on Home waits here: picking a card reads it as that kind. -->
    <div v-if="pending" class="pending card" data-testid="scan-pending">
      <img :src="pending.url" :alt="t('scan.dz.previewAlt')" class="pending-thumb" />
      <p class="m-0">{{ t('scan.choose.pending') }}</p>
    </div>
    <div class="picks" data-guide="scan-choice">
      <button
        v-for="k in KINDS"
        :key="k"
        type="button"
        class="pick"
        :class="`pick-${k}`"
        :data-guide="`scan-choice-${k}`"
        :data-testid="`choose-${k}`"
        @click="choose($event, k)"
        @pointermove="lean"
        @pointerleave="unlean"
      >
        <span class="pick-img">
          <span class="pick-scene" aria-hidden="true">
            <svg
              v-if="k === 'medication'"
              class="pick-deco"
              viewBox="0 0 200 150"
              preserveAspectRatio="xMidYMid slice"
              focusable="false"
            >
              <g class="drift-a">
                <rect
                  x="12"
                  y="18"
                  width="46"
                  height="20"
                  rx="10"
                  transform="rotate(-28 35 28)"
                  fill="#f3d27a"
                />
                <rect
                  x="12"
                  y="18"
                  width="23"
                  height="20"
                  rx="10"
                  transform="rotate(-28 35 28)"
                  fill="#ffffff"
                />
              </g>
              <g class="drift-b">
                <circle cx="176" cy="30" r="11" fill="#ffffff" opacity="0.9" />
                <path d="M169 30h14" stroke="#7fc8c0" stroke-width="2.5" stroke-linecap="round" />
              </g>
              <g class="drift-a">
                <rect
                  x="150"
                  y="112"
                  width="40"
                  height="18"
                  rx="9"
                  transform="rotate(24 170 121)"
                  fill="#f08a7e"
                />
                <rect
                  x="150"
                  y="112"
                  width="20"
                  height="18"
                  rx="9"
                  transform="rotate(24 170 121)"
                  fill="#ffe3de"
                />
              </g>
            </svg>
            <svg
              v-else
              class="pick-deco"
              viewBox="0 0 200 150"
              preserveAspectRatio="xMidYMid slice"
              focusable="false"
            >
              <g class="drift-a">
                <circle cx="28" cy="30" r="15" fill="#ffd66b" />
                <circle cx="28" cy="30" r="10" fill="none" stroke="#e7a93a" stroke-width="2.5" />
              </g>
              <g class="drift-b">
                <circle cx="178" cy="118" r="13" fill="#ffd66b" />
                <circle cx="178" cy="118" r="8" fill="none" stroke="#e7a93a" stroke-width="2.5" />
              </g>
              <g class="drift-b">
                <rect x="160" y="16" width="30" height="20" rx="5" fill="#ffffff" opacity="0.85" />
                <circle cx="175" cy="26" r="5" fill="#8fd1a6" />
              </g>
            </svg>
            <img :src="`/samples/${KIND_PAPER[k]}.svg`" alt="" class="pick-paper" />
          </span>
          <span class="pick-tag">{{
            t(pending ? `scan.pendingScan.${k}` : `scan.choose.${k}.go`)
          }}</span>
          <!-- The corner cut out of the picture, and the arrow sitting in it. -->
          <span class="pick-notch" aria-hidden="true"></span>
          <span class="pick-arrow" aria-hidden="true">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M7 17 17 7" />
              <path d="M8 7h9v9" />
            </svg>
          </span>
        </span>
        <span class="pick-words">
          <span class="pick-title">{{ t(`scan.choose.${k}.title`) }}</span>
          <span class="pick-text">{{ t(`scan.choose.${k}.text`) }}</span>
          <span class="pick-tags">
            <span v-for="tag in tm(`scan.choose.${k}.tags`)" :key="rt(tag)" class="pick-chip">{{
              rt(tag)
            }}</span>
          </span>
        </span>
      </button>
    </div>
    <ScanLaunch v-if="launching" v-bind="launching" />
    <button v-if="pending" type="button" class="btn btn-ghost" @click="emit('drop')">
      <AppIcon name="x" />{{ t('scan.dz.change') }}
    </button>
  </div>
</template>

<style scoped src="../../styles/components/ScanPicker.css"></style>
