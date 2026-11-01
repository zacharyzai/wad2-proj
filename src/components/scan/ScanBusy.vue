<!-- Owner: Asher (built by Claude, declared in README.txt). Scan, while working: the photo with personal details being
     blacked out (or, for a sample, the turning pill), the two steps (covered on this phone, then read), and Cancel. -->
<script setup>
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AppIcon from '../layout/AppIcon.vue'
import LoadingState from '../layout/LoadingState.vue'
import PillLoader from '../layout/PillLoader.vue'

defineProps({
  coverView: { type: Object, default: null }, // { original, covered } of the page being covered; null for a sample
  covering: Boolean, // step 1, on this phone
  coverPage: { type: Object, default: null }, // { n, total } for "Covering page 2 of 3"
  readingType: { type: String, required: true }, // 'medication' | 'bill'
  slow: Boolean, // past 15 s: say it is slower than usual
})
const emit = defineEmits(['cancel'])
const { t } = useI18n()

// The button that started the scan is gone, so keyboard focus fell to the page: put it on Cancel, the one thing to press here.
const cancelButton = ref(null)
onMounted(() => (document.activeElement === document.body || !document.activeElement) && cancelButton.value?.focus())
</script>

<template>
  <div class="busy rise">
    <div v-if="coverView" class="cover-view" :class="{ done: coverView.covered }" aria-hidden="true">
      <img :src="coverView.original" alt="" />
      <img v-if="coverView.covered" :src="coverView.covered" alt="" class="cover-after" />
      <span class="cover-line"></span>
    </div>
    <!-- Reading a sample (no photo to show): the turning pill, large, inside soft pulsing rings. -->
    <div v-else class="progress-ring" aria-hidden="true">
      <span class="progress-ring__pulse" style="inset: 26px"></span>
      <span class="progress-ring__pulse" style="inset: 42px"></span>
      <span class="progress-ring__core"><PillLoader :size="66" /></span>
    </div>
    <LoadingState :label="covering ? (coverPage ? t('scan.coveringPage', coverPage) : t('scan.covering')) : t(`scan.reading.${readingType}`)" :pill="!!coverView" />
    <!-- A photo goes through two steps: covered on this phone, then read. Samples only have the second. -->
    <ol v-if="coverView" class="scan-steps" data-testid="scan-steps">
      <li :class="covering ? 'now' : 'done'" :aria-current="covering ? 'step' : null">
        <span class="step-mark" aria-hidden="true"><AppIcon v-if="!covering" name="check" :size="18" :stroke="3" /><template v-else>1</template></span>{{ t('scan.steps.cover') }}
      </li>
      <li :class="covering ? 'next' : 'now'" :aria-current="covering ? null : 'step'">
        <span class="step-mark" aria-hidden="true">2</span>{{ t(`scan.steps.read.${readingType}`) }}
      </li>
    </ol>
    <p class="lead-text" data-testid="scan-wait">{{ slow ? t('scan.slow') : t('scan.wait') }}</p>
    <span class="reassure-pill"><AppIcon name="shield" :size="20" class="text-teal" />{{ t('scan.neverStored') }}</span>
    <button ref="cancelButton" type="button" class="btn btn-ghost" @click="emit('cancel')">{{ t('scan.cancel') }}</button>
  </div>
</template>

<style scoped src="../../styles/components/ScanBusy.css"></style>
