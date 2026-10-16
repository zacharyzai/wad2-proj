<!-- Owner: Asher. First version from wireframe 1b (camera/upload, samples, loading and error states). -->
<script setup>
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { scanImage, scanSample } from '../api/client'
import { scanStore } from '../stores/scan'

const SAMPLES = [
  { id: 'med-1', type: 'medication', key: 'med1' },
  { id: 'med-2', type: 'medication', key: 'med2' },
  { id: 'med-3', type: 'medication', key: 'med3' },
  { id: 'bill-1', type: 'bill', key: 'bill1' },
]
// A new photo can fix these; anything else is on our side, so the same photo is kept for "Try again".
const PHOTO_ERRORS = ['UNREADABLE_IMAGE', 'IMAGE_TOO_LARGE', 'BAD_REQUEST', 'UNSUPPORTED_FILE']
const MAX_SIDE = 1600

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const type = computed(() => (route.query.type === 'bill' ? 'bill' : 'medication'))
const otherType = computed(() => (type.value === 'bill' ? 'medication' : 'bill'))

const state = ref('idle') // idle | loading | error
const readingType = ref(type.value)
const errorCode = ref(null)
const photo = ref(null)
const camera = ref(null)
const upload = ref(null)
let lastRequest = null
let run = 0 // bumped by Cancel so a late reply is ignored

// Keeps the upload well under the 4 MB API limit (contract asks for about 1 MB).
function toJpeg(source, width, height) {
  const scale = Math.min(1, MAX_SIDE / Math.max(width, height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(width * scale)
  canvas.height = Math.round(height * scale)
  canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', 0.8)
}

// An <img> decodes everything the browser can show (JPEG, PNG, WebP, SVG, …) and applies photo rotation;
// createImageBitmap can't read SVG.
function loadImage(file) {
  const url = URL.createObjectURL(file)
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = url
  }).finally(() => URL.revokeObjectURL(url))
}

async function compress(file) {
  const img = await loadImage(file)
  if (!img.naturalWidth || !img.naturalHeight) throw new Error('Image has no size')
  return toJpeg(img, img.naturalWidth, img.naturalHeight)
}

// Live camera in the frame box (wireframe 1b). Laptops ignore `capture` on file inputs, so this is the only way to reach their webcam.
const video = ref(null)
const stream = ref(null)
const cameraBlocked = ref(false)
// Until the first frame arrives the video is 0×0, and capturing would send an empty image.
const cameraReady = ref(false)

async function startCamera() {
  cameraBlocked.value = false
  // No camera API (e.g. plain http on a phone): the native camera via the file input still works.
  if (!navigator.mediaDevices?.getUserMedia) return camera.value.click()
  try {
    stream.value = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 } }, audio: false })
  } catch {
    cameraBlocked.value = true // permission denied or no camera
    return
  }
  video.value.srcObject = stream.value
}

function stopCamera() {
  stream.value?.getTracks().forEach((track) => track.stop())
  stream.value = null
  cameraReady.value = false
}

function capture() {
  photo.value = toJpeg(video.value, video.value.videoWidth, video.value.videoHeight)
  stopCamera()
  const docType = type.value
  send(docType, () => scanImage(docType, photo.value))
}

async function retake() {
  state.value = 'idle'
  await nextTick() // the <video> only exists on the idle screen
  startCamera()
}

onBeforeUnmount(stopCamera)

async function send(docType, request) {
  const id = ++run
  lastRequest = { docType, request }
  readingType.value = docType
  state.value = 'loading'
  const res = await request()
  if (id !== run) return
  if (!res.ok) {
    errorCode.value = res.error.code
    state.value = 'error'
    return
  }
  scanStore.current = res.data
  scanStore.photo = photo.value
  scanStore.confirmed = false
  router.push({ name: 'confirm' })
}

async function onFile(event) {
  const file = event.target.files[0]
  event.target.value = '' // lets the same file be picked again
  if (!file) return
  try {
    photo.value = await compress(file)
  } catch {
    // The browser couldn't open the file (e.g. HEIC on a laptop, or not an image), so the server was never asked.
    photo.value = null
    errorCode.value = 'UNSUPPORTED_FILE'
    state.value = 'error'
    return
  }
  const docType = type.value
  send(docType, () => scanImage(docType, photo.value))
}

function trySample(sample) {
  photo.value = null
  send(sample.type, () => scanSample(sample.id))
}

function retry() {
  send(lastRequest.docType, lastRequest.request)
}

function cancel() {
  run++
  state.value = 'idle'
}

const photoError = computed(() => PHOTO_ERRORS.includes(errorCode.value))
</script>

<template>
  <!-- Kept outside the states so Retake/Upload work from the error screen too. -->
  <input ref="camera" type="file" accept="image/*" capture="environment" class="d-none" data-testid="camera-input" @change="onFile" />
  <input ref="upload" type="file" accept="image/*" class="d-none" data-testid="upload-input" @change="onFile" />

  <div v-if="state === 'loading'" class="d-flex flex-column gap-4" role="status">
    <img v-if="photo" :src="photo" alt="" class="photo scan-preview" />
    <div class="d-flex flex-column gap-2">
      <h1 class="h-page">{{ t(`scan.reading.${readingType}`) }}</h1>
      <p class="lead-lg">{{ t('scan.wait') }}</p>
    </div>
    <div class="progress" style="height: 14px">
      <div class="progress-bar progress-bar-striped progress-bar-animated w-100" style="background-color: var(--teal)"></div>
    </div>
    <button type="button" class="btn-alt" @click="cancel">{{ t('scan.cancel') }}</button>
  </div>

  <div v-else-if="state === 'error'" class="d-flex flex-column gap-4">
    <div class="alert-red" role="alert">
      <span class="tag tag-red flex-shrink-0">{{ t('scan.errorTag') }}</span>
      <div class="d-flex flex-column gap-1">
        <div class="title">{{ t(`errors.${errorCode}`) }}</div>
        <div v-if="photoError">{{ t('scan.photoHint') }}</div>
        <div v-else-if="photo">{{ t('scan.photoKept') }}</div>
      </div>
    </div>
    <img v-if="photo" :src="photo" :alt="t('scan.yourPhoto')" class="photo scan-preview" />
    <div class="acts">
      <template v-if="photoError">
        <button type="button" class="btn-main" @click="retake">{{ t('scan.retake') }}</button>
        <button type="button" class="btn-alt" @click="upload.click()">{{ t('scan.uploadOther') }}</button>
      </template>
      <template v-else>
        <button type="button" class="btn-main" @click="retry">{{ t('scan.tryAgain') }}</button>
        <button type="button" class="btn-alt" @click="state = 'idle'">{{ t('scan.useSample') }}</button>
      </template>
    </div>
  </div>

  <div v-else class="d-flex flex-column gap-4">
    <div class="d-flex align-items-start gap-3">
      <RouterLink to="/" class="back" :aria-label="t('nav.back')"></RouterLink>
      <div class="d-flex flex-column gap-2">
        <h1 class="h-page">{{ t(`scan.title.${type}`) }}</h1>
        <p class="lead-lg">
          {{ t(`scan.switchQ.${type}`) }}
          <RouterLink :to="{ query: { type: otherType } }" class="fw-bold">{{ t(`scan.switch.${type}`) }}</RouterLink>
        </p>
      </div>
    </div>

    <div class="row g-4">
      <div class="col-lg-7 d-flex flex-column gap-3">
        <div class="ph frame-area">
          <video v-show="stream" ref="video" class="live" autoplay playsinline muted @playing="cameraReady = true" :aria-label="t('scan.preview')"></video>
          <!-- Example shown while the camera is off, so people know what to photograph. -->
          <template v-if="!stream">
            <span class="tag example-tag">{{ t('scan.example') }}</span>
            <img :src="`/samples/${type === 'bill' ? 'bill-1' : 'med-1'}.svg`" :alt="t(`scan.exampleAlt.${type}`)" class="example" />
          </template>
          <span class="frame" aria-hidden="true"><span v-if="stream" class="frame-label">{{ t(`scan.frame.${type}`) }}</span></span>
        </div>
        <p v-if="cameraBlocked" class="banner-amber" role="alert">{{ t('scan.cameraBlocked') }}</p>
        <div class="acts">
          <template v-if="stream">
            <button type="button" class="btn-main" :disabled="!cameraReady" @click="capture">{{ t('scan.capture') }}</button>
            <button type="button" class="btn-alt" @click="stopCamera">{{ t('scan.cancel') }}</button>
          </template>
          <template v-else>
            <button type="button" class="btn-main" @click="startCamera">{{ t('scan.take') }}</button>
            <button type="button" class="btn-alt" @click="upload.click()">{{ t('scan.upload') }}</button>
          </template>
        </div>
      </div>
      <div class="col-lg-5">
        <div class="box d-flex flex-column gap-3">
          <h2 class="h-sec">{{ t('scan.tips.title') }}</h2>
          <div v-for="tip in ['light', 'flat', 'whole']" :key="tip">
            <div class="fw-bold lead-lg">{{ t(`scan.tips.${tip}.title`) }}</div>
            <div>{{ t(`scan.tips.${tip}.text`) }}</div>
          </div>
        </div>
      </div>
    </div>

    <div class="d-flex flex-column gap-3">
      <h2 class="h-sec">{{ t('scan.samplesTitle') }}</h2>
      <div class="samples">
        <button v-for="sample in SAMPLES" :key="sample.id" type="button" class="sample" @click="trySample(sample)">
          <img :src="`/samples/${sample.id}.svg`" alt="" class="sample-thumb" />
          <span class="fw-bold">{{ t(`scan.samples.${sample.key}`) }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.scan-preview { max-height: 360px; }
.frame-area { position: relative; aspect-ratio: 4 / 3; overflow: hidden; background: var(--surface); }
.example { position: absolute; inset: 14% 10%; width: 80%; height: 72%; padding: 8px; object-fit: contain; }
.example-tag { position: absolute; top: 10px; left: 12px; background: var(--surface); font: 700 16px var(--bs-body-font-family); color: var(--ink); }
.live { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.frame { position: absolute; inset: 14% 10%; display: flex; align-items: flex-end; justify-content: center; padding: 10px; border: 3px dashed var(--ink); border-radius: 10px; }
.frame-label { background: var(--surface); padding: 2px 10px; border-radius: 6px; font: 700 18px var(--bs-body-font-family); color: var(--ink); text-align: center; }
.samples { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
@media (min-width: 768px) { .samples { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
.sample { display: flex; flex-direction: column; gap: 8px; padding: 0; border: 0; background: none; color: var(--ink); text-align: left; }
.sample-thumb { width: 100%; aspect-ratio: 1; padding: 8px; object-fit: contain; border: 1.5px solid var(--ink); border-radius: 20px; background: var(--surface); }
.sample:hover .sample-thumb { border-color: var(--teal); }
</style>
