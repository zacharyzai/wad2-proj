<!-- Scan start page for one kind of document: take a photo, upload, or try a sample. -->
<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import AppIcon from '../layout/AppIcon.vue'
import UploadDropzone from './UploadDropzone.vue'

const props = defineProps({
  type: { type: String, required: true }, // 'medication' | 'bill'
  cameraBlocked: Boolean,
  examples: { type: Array, required: true }, // the samples for this kind
  examplesOpen: { type: Boolean, default: false }, // the examples list is open (v-model:examples-open)
})
const emit = defineEmits(['update:examplesOpen', 'take', 'files', 'sample'])
// Read and assign `examplesOpen` like a local value; assigning it tells the parent through the `update:` event.
const examplesOpen = computed({
  get: () => props.examplesOpen,
  set: (value) => emit('update:examplesOpen', value),
})

// Tips for the kind chosen: good light for both, then what matters for that paper.
const TIPS_FOR = {
  medication: [
    { key: 'tips.light', icon: 'sun' },
    { key: 'tipsFor.medication.label', icon: 'pill' },
    { key: 'tips.whole', icon: 'zoom' },
  ],
  bill: [
    { key: 'tips.light', icon: 'sun' },
    { key: 'tipsFor.bill.flat', icon: 'scan' },
    { key: 'tipsFor.bill.total', icon: 'receipt' },
  ],
}
const { t } = useI18n()
</script>

<template>
  <div class="page rise">
    <div class="d-flex align-items-start gap-3">
      <RouterLink
        :to="{ name: 'scan' }"
        class="back"
        :aria-label="t('scan.choose.again')"
        :title="t('scan.choose.again')"
        data-testid="scan-back"
      ></RouterLink>
      <div class="page-head">
        <h1>{{ t(type === 'bill' ? 'home.bill.title' : 'home.med.title') }}</h1>
        <p class="lead-text">{{ t(`scan.lead.${type}`) }}</p>
      </div>
    </div>

    <!-- One place to add the photo, with the tips beside it on wide screens (under it on a phone). -->
    <div class="cols">
      <section class="d-flex flex-column gap-3" aria-labelledby="add-title">
        <h2 id="add-title" class="visually-hidden">{{ t('scan.addPhoto') }}</h2>
        <!-- Camera first (most people scan with a phone), then upload. Both named for what is being scanned. -->
        <button
          type="button"
          class="btn btn-primary"
          data-guide="scan-take"
          data-testid="scan-take"
          @click="emit('take')"
        >
          <AppIcon name="camera" />{{ t(`scan.takeOf.${type}`) }}
        </button>
        <p v-if="cameraBlocked" class="alert alert-warning m-0" role="alert">
          <AppIcon name="alert" />{{ t('scan.cameraBlocked') }}
        </p>
        <p class="or">{{ t('scan.or') }}</p>
        <UploadDropzone class="dz-full" @select="(files) => emit('files', files)" />
        <p class="privacy"><AppIcon name="shield" :size="20" />{{ t('scan.privacy') }}</p>
      </section>

      <div class="d-flex flex-column gap-3">
        <section class="card tips-card" aria-labelledby="tips-title">
          <h2 id="tips-title" class="section-label m-0">{{ t('scan.tipsTitle') }}</h2>
          <ul class="tips" data-testid="scan-tips">
            <li v-for="tip in TIPS_FOR[type]" :key="tip.key">
              <span class="tile tile-soft"><AppIcon :name="tip.icon" :size="22" /></span>
              <span
                ><strong>{{ t(`scan.${tip.key}.title`) }}.</strong>
                {{ t(`scan.${tip.key}.text`) }}</span
              >
            </li>
          </ul>
        </section>

        <!-- Samples: one quiet link that opens a short list for this kind. It slides open (the samples fade in one after
             another) and closes the same way in reverse (the samples lift away, last first, then it folds shut); the arrow
             turns. Closed, the list can't be reached by Tab or a screen reader (inert). -->
        <div class="examples" :class="{ open: examplesOpen }">
          <button
            type="button"
            class="btn btn-ghost examples-toggle"
            :aria-expanded="examplesOpen"
            aria-controls="scan-examples"
            data-guide="scan-examples"
            data-testid="scan-examples"
            @click="examplesOpen = !examplesOpen"
          >
            <AppIcon name="sparkles" />{{ t('scan.examples')
            }}<AppIcon name="down" :size="20" class="examples-chev" />
          </button>
          <div id="scan-examples" class="examples-drawer" :inert="examplesOpen ? null : ''">
            <div class="examples-list">
              <div class="examples-inner" :style="{ '--n': examples.length }">
                <button
                  v-for="(sample, i) in examples"
                  :key="sample.id"
                  type="button"
                  class="card card-interactive sample"
                  :style="{ '--i': i }"
                  @click="emit('sample', sample)"
                >
                  <img
                    :src="`/samples/${sample.id}.svg`"
                    alt=""
                    loading="lazy"
                    decoding="async"
                    class="sample-thumb"
                  />
                  <span class="d-flex flex-column flex-grow-1">
                    <span class="sample-name">{{ t(`scan.samples.${sample.key}`) }}</span>
                    <span class="text-muted-a11y sample-kind">{{
                      t(`scan.sampleOf.${sample.type}`)
                    }}</span>
                  </span>
                  <AppIcon name="right" :size="22" class="text-teal" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped src="../../styles/components/ScanKindPage.css"></style>
