<!-- Owner: Asher (built by Claude, declared in README.txt). Scan, the question: "What would you like to scan today?" with two
     big picture cards (Medicine label / Medical bill) that zoom in a little under the mouse. Above them: the last scan to
     carry on with, or a photo picked on Home waiting to be told what it is. -->
<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useScanStore } from '../../stores/scan'
import AppIcon from '../layout/AppIcon.vue'

const props = defineProps({
  pending: { type: Object, default: null }, // a photo picked on Home: { file, url }
})
const emit = defineEmits(['pick', 'drop'])

const KIND_PAPER = { medication: 'med-1', bill: 'bill-1' } // the sample each card shows
const KINDS = Object.keys(KIND_PAPER)
const { t } = useI18n()
const scanStore = useScanStore()

// The last scan, offered back: coming back from Ask, a refresh or any other page no longer loses it.
const resume = computed(() => {
  const s = scanStore.current
  if (!s || props.pending) return null
  const bill = s.type === 'bill'
  const name = bill ? s.bill?.clinic || t('explain.tag.bill') : s.medication?.name
  if (!name) return null
  return { icon: bill ? 'receipt' : 'pill', name, checked: scanStore.confirmed, to: { name: scanStore.confirmed ? 'explain' : 'confirm' } }
})
</script>

<template>
  <div class="page rise picker">
    <div class="page-head">
      <h1>{{ t('scan.choose.question') }}</h1>
      <p v-if="!pending" class="lead-text pick-lead">{{ t('scan.choose.lead') }}</p>
    </div>
    <section v-if="resume" class="resume card" aria-labelledby="resume-title" data-testid="scan-resume">
      <span class="tile tile-soft" aria-hidden="true"><AppIcon :name="resume.icon" :size="28" /></span>
      <div class="resume-text">
        <h2 id="resume-title" class="h3 m-0">{{ t('scan.resume.title') }}: {{ resume.name }}</h2>
        <p class="m-0 text-muted-a11y">{{ t(resume.checked ? 'scan.resume.checked' : 'scan.resume.unchecked') }}</p>
      </div>
      <RouterLink :to="resume.to" class="btn btn-primary" data-testid="scan-resume-go"><AppIcon name="right" :size="22" />{{ t(resume.checked ? 'scan.resume.seeAgain' : 'scan.resume.carryOn') }}</RouterLink>
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
        @click="emit('pick', k)"
      >
        <span class="pick-art" aria-hidden="true">
          <img :src="`/samples/${KIND_PAPER[k]}.svg`" alt="" class="pick-paper" />
        </span>
        <span class="pick-badge" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7" /><path d="M8 7h9v9" /></svg>
        </span>
        <span class="pick-words">
          <span class="pick-title">{{ t(`scan.choose.${k}.title`) }}</span>
          <span class="pick-text">{{ t(`scan.choose.${k}.text`) }}</span>
        </span>
        <span class="pick-go">{{ t(pending ? `scan.pendingScan.${k}` : `scan.choose.${k}.go`) }}<AppIcon name="right" :size="20" :stroke="2.5" /></span>
      </button>
    </div>
    <button v-if="pending" type="button" class="btn btn-ghost" @click="emit('drop')"><AppIcon name="x" />{{ t('scan.dz.change') }}</button>
  </div>
</template>

<style scoped src="../../styles/components/ScanPicker.css"></style>
