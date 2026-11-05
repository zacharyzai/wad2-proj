<!-- Owner: Asher (built by Claude, declared in README.txt). Scan, the live camera: its own screen, so the picture is big and
     Capture is the only thing to press. ScanView opens the camera (getUserMedia) and passes the stream in; Capture emits the
     frame as a JPEG. Laptops ignore `capture` on file inputs, so this is the only way to reach their webcam. -->
<script setup>
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { toJpeg } from '../../utils/images'
import AppIcon from '../layout/AppIcon.vue'

const props = defineProps({
  stream: { type: Object, required: true }, // the camera's MediaStream
  type: { type: String, required: true }, // 'medication' | 'bill'
  note: { type: String, default: null }, // a bill photographed page by page: "Page 2"
  back: { type: Boolean, default: false }, // pages already taken: Cancel goes back to them
})
const emit = defineEmits(['capture', 'cancel'])
const { t } = useI18n()

const video = ref(null)
// Until the first frame arrives the video is 0×0, and capturing would send an empty image.
const ready = ref(false)
onMounted(() => (video.value.srcObject = props.stream))
const capture = () =>
  emit('capture', toJpeg(video.value, video.value.videoWidth, video.value.videoHeight))
</script>

<template>
  <div class="page">
    <div class="page-head">
      <h1>{{ t(type === 'bill' ? 'home.bill.title' : 'home.med.title') }}</h1>
      <p v-if="note" class="lead-text" data-testid="scan-page-n">{{ note }}</p>
    </div>
    <div class="frame-area">
      <video
        ref="video"
        class="live"
        autoplay
        playsinline
        muted
        @playing="ready = true"
        :aria-label="t('scan.preview')"
      ></video>
      <span class="frame" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
      <span class="frame-hint"><AppIcon name="sun" :size="18" />{{ t(`scan.frame.${type}`) }}</span>
    </div>
    <button
      type="button"
      class="btn btn-primary"
      :disabled="!ready"
      data-testid="scan-capture"
      @click="capture"
    >
      <AppIcon name="camera" />{{ t('scan.capture') }}
    </button>
    <button type="button" class="btn btn-secondary" @click="emit('cancel')">
      <AppIcon :name="back ? 'left' : 'x'" />{{ back ? t('scan.pages.back') : t('scan.cancel') }}
    </button>
  </div>
</template>

<style scoped src="../../styles/components/LiveCamera.css"></style>
