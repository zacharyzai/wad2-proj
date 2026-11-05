<!-- Owner: Asher. From the Claude Design Scan screens. One page, six screens (components/scan/):
       ScanPicker    "What would you like to scan today?" (no kind in the address yet, or a photo from Home waiting)
       ScanKindPage  that kind's page: camera, upload, tips, samples (?type=medication | bill, so Back returns to the question)
       LiveCamera    the live camera
       ScanPages     a bill photographed page by page: each page checked as it is taken, then "another page?"
       ScanBusy      covering personal details on this phone, then reading
       ScanProblem   an unclear photo, the wrong paper, or a service error
     This page runs the scan itself: photo → shrink (utils/images.js) → check (utils/photoCheck.js) → cover details
     (utils/redact.js) → send (/api/scan) → Confirm. Bills have no tab of their own: they start here. -->
<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { scanImage, scanSample } from '../api/client'
import { redactImage, warmUp } from '../utils/redact'
import { checkPhoto, CHECK_ERRORS } from '../utils/photoCheck'
import { compress, fitUpload, loadImage, toJpeg } from '../utils/images'
import { MAX_PAGES } from '../utils/pdfToImage'
import { useScanStore } from '../stores/scan'
import ScanPicker from '../components/scan/ScanPicker.vue'
import ScanKindPage from '../components/scan/ScanKindPage.vue'
import LiveCamera from '../components/scan/LiveCamera.vue'
import ScanPages from '../components/scan/ScanPages.vue'
import ScanBusy from '../components/scan/ScanBusy.vue'
import ScanProblem from '../components/scan/ScanProblem.vue'
const scanStore = useScanStore()
// The scan in progress lives in the scan store, not on this page, so it carries on when the person taps elsewhere mid-way
// (a tab, Back, Home): coming back to Scan shows it still covering or reading, or what went wrong. One that finishes while
// they are on another page doesn't pull them to Confirm: it is kept, and scanStore.away tells the rest of the app
// (components/scan/ScanAwayNotice.vue). Log out stops it (scanStore.forget). Photos are never stored.
const {
  reading: state,
  covering,
  coverView,
  coverPage,
  readingType,
  errorCode,
  slow,
  pages: photos,
  pagesPdf: pdfPages,
  fromPdf,
  checkedShots,
  lastRequest,
  coverDocType,
  run,
  handingOver,
  pageOpen,
} = storeToRefs(scanStore)
const { t } = useI18n()

const SAMPLES = [
  { id: 'med-1', type: 'medication', key: 'med1' },
  { id: 'med-2', type: 'medication', key: 'med2' },
  { id: 'med-3', type: 'medication', key: 'med3' },
  { id: 'bill-1', type: 'bill', key: 'bill1' },
]

const route = useRoute()
const router = useRouter()
// What the next photo is of. The question shows until a kind is picked; the pick goes in the address (?type=bill), so
// Back returns to the question, and links that already know (?type=, #bill from old Bill links) open that kind straight away.
const KINDS = ['medication', 'bill']
const chosen = computed(() =>
  KINDS.includes(route.query.type) ? route.query.type : route.hash === '#bill' ? 'bill' : null,
)
const type = ref(
  chosen.value ?? SAMPLES.find((x) => x.id === route.query.sample)?.type ?? 'medication',
)
watch(chosen, (k) => k && (type.value = k))
// A card: with a photo from Home waiting, read it as that kind straight away; otherwise open that kind's page.
function pick(k) {
  if (pending.value) {
    type.value = k
    return scanPending()
  }
  examplesOpen.value = false
  router.push({ name: 'scan', query: { type: k } })
}
// Samples sit behind "Try an example", a short list for the kind chosen.
const examplesOpen = ref(false)
const examples = computed(() => SAMPLES.filter((x) => x.type === type.value))

// A photo picked on Home: it waits on the question until they say what it is (Home doesn't guess). { file, url }
const pending = ref(null)
function dropPending() {
  if (pending.value) URL.revokeObjectURL(pending.value.url)
  pending.value = null
}
function scanPending() {
  const { file } = pending.value
  dropPending()
  useFiles([file], type.value)
}
onBeforeUnmount(dropPending)

const REVEAL_MS = 1100 // matches the cover-wipe animation in ScanBusy.css
// One limit for a whole scan, tap to answer: covering gets up to 12 s of it per page, the request the rest (the server's AI
// stops at 16 s, plus 4 s a page, server/services/gemini.js). Past it, a TIMEOUT error with Try again instead of waiting on.
const SCAN_LIMIT_MS = 30_000
const PAGE_LIMIT_MS = 10_000 // each page after the first: covered on this phone, then read
const scanLimit = (pages) => SCAN_LIMIT_MS + PAGE_LIMIT_MS * (Math.max(1, pages) - 1)
const COVER_LIMIT_MS = 12_000
const camera = ref(null)
const upload = ref(null)

// The scan in progress belongs to the scan store, not to this page.
// They are away from the moment they tap elsewhere, not when the next page has opened: a reply arriving in between is
// already one for while they were away.
pageOpen.value = true
const onScanPage = () => pageOpen.value
// Back on Scan mid-scan: its kind again (the address may not say), and nothing more to tell them elsewhere.
if (state.value !== 'idle') type.value = readingType.value
scanStore.away = null
// Leaving mid-scan: it carries on, and the rest of the app says so. An error they have seen here starts fresh next time.
function leaving() {
  pageOpen.value = false
  if (state.value === 'loading') scanStore.away = { type: readingType.value, status: 'working' }
  else if (state.value === 'error') state.value = 'idle'
}
// A tap away that didn't happen after all (a second tap back to Scan before the next page opened cancels the first): still
// here. Checked after every move, finished or not.
const stopChecking = router.afterEach(() => {
  if (router.currentRoute.value.name !== 'scan') return
  pageOpen.value = true
  scanStore.away = null
})
onBeforeUnmount(stopChecking)

// Too dark, blurry or glary? 'dark' | 'blurry' | 'glare' | null. Tests that fake covering skip this check too.
const photoCheck = (page) =>
  (window.__photoCheckForTests ?? (window.__redactForTests ? async () => null : checkPhoto))(page)
function freshPages() {
  pdfPages.value = null
  fromPdf.value = new Set()
  checkedShots.value.clear()
}

// Live camera (LiveCamera.vue shows it). No camera API (e.g. plain http on a phone): the native camera via the file input.
const stream = ref(null)
const cameraBlocked = ref(false)
async function startCamera() {
  cameraBlocked.value = false
  if (!navigator.mediaDevices?.getUserMedia) return camera.value.click()
  try {
    stream.value = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1920 } },
      audio: false,
    })
  } catch {
    cameraBlocked.value = true // permission denied or no camera
  }
}
function stopCamera() {
  stream.value?.getTracks().forEach((track) => track.stop())
  stream.value = null
}
// A medicine label is one photo: sent straight away. A bill can have more pages: the photo joins its pages (below).
function capture(frame) {
  stopCamera()
  if (type.value === 'bill') return addShot(frame)
  freshPages()
  photos.value = [frame]
  coverAndSend(type.value)
}
function cancelCamera() {
  stopCamera()
  retakeAt.value = null
}
// No live camera (the phone's own camera app opened instead): a bill photo joins its pages, the same as Capture.
async function onCameraFile(event) {
  const [file] = event.target.files
  event.target.value = '' // lets the same file be picked again
  if (!file) return
  if (type.value !== 'bill') return useFiles([file])
  const url = URL.createObjectURL(file)
  try {
    const img = await loadImage(url)
    addShot(toJpeg(img, img.naturalWidth, img.naturalHeight))
  } catch {
    errorCode.value = 'UNSUPPORTED_FILE'
    state.value = 'error'
  } finally {
    URL.revokeObjectURL(url)
  }
}
async function retake() {
  state.value = 'idle'
  startCamera()
}
onBeforeUnmount(stopCamera)

// A bill photographed page by page (ScanPages.vue; the upload box has its own "Add another page"). After each photo the
// person sees their pages and is asked one thing: is there another page? Each photo is checked as soon as it is taken, so a
// dark or blurry page is retaken there and then, not found out after the last one. Retake keeps the page in its place.
const shots = ref([]) // [{ id, src, problem: 'checking' | 'dark' | 'blurry' | 'glare' | null, anyway }]
const retakeAt = ref(null) // the page the camera is retaking (0-based), or null for the next page
const askThrow = ref(false)
const pagesView = ref(null)
let shotId = 0
const cameraNote = computed(() => {
  if (type.value !== 'bill') return null
  return retakeAt.value !== null
    ? t('scan.pages.retaking', { n: retakeAt.value + 1 })
    : t('scan.pages.taking', { n: shots.value.length + 1 })
})
const focusPages = () => setTimeout(() => pagesView.value?.focusTitle()) // once the camera has closed and the pages are back

async function addShot(src) {
  const shot = { id: ++shotId, src, problem: 'checking', anyway: false }
  if (retakeAt.value === null) shots.value.push(shot)
  else shots.value.splice(retakeAt.value, 1, shot)
  retakeAt.value = null
  askThrow.value = false
  focusPages()
  const problem = await photoCheck(src).catch(() => null)
  const live = shots.value.find((s) => s.id === shot.id)
  if (live) live.problem = problem
}
function shootPage(i = null) {
  retakeAt.value = i
  askThrow.value = false
  startCamera()
}
function removeShot(i) {
  shots.value.splice(i, 1)
  if (shots.value.length) focusPages()
}
function readShots() {
  freshPages()
  photos.value = shots.value.map((s) => s.src)
  photos.value.forEach((page) => checkedShots.value.add(page))
  shots.value = []
  coverAndSend('bill')
}
let leaveTo = null
function cancelShots() {
  if (shots.value.length >= 2) return (askThrow.value = true)
  throwShots()
}
function keepShots() {
  leaveTo = null
  askThrow.value = false
  focusPages()
}
function throwShots() {
  shots.value = []
  retakeAt.value = null
  askThrow.value = false
  if (leaveTo) router.push(leaveTo) // the guard lets it through now that there are no pages
  leaveTo = null
}
// Leaving (a tab, the browser's Back) with 2+ pages asks first, like Cancel, instead of silently losing the photos.
onBeforeRouteLeave((to) => {
  if (shots.value.length >= 2) {
    leaveTo = to
    askThrow.value = true
    return false
  }
  if (!handingOver.value) leaving()
  return true
})

// request(ms) makes the call with that time limit. Try again gives it a fresh full limit.
async function send(docType, request, limit = scanLimit(photos.value.length)) {
  const id = ++run.value
  lastRequest.value = { docType, request }
  readingType.value = docType
  state.value = 'loading'
  const res = await request(limit)
  if (id !== run.value) return
  if (!res.ok) {
    errorCode.value = res.error.code
    state.value = 'error'
    if (!onScanPage()) scanStore.away = { type: docType, status: 'failed' }
    return
  }
  Object.assign(scanStore, {
    current: res.data,
    photos: photos.value,
    pdfPages: pdfPages.value,
    confirmed: false,
  })
  // On another page: keep it for when they are ready ("Your label is ready to check"), never pull them away.
  if (!onScanPage()) {
    state.value = 'idle'
    scanStore.away = { type: docType, status: 'ready' }
    return
  }
  handingOver.value = true
  await router.push({ name: 'confirm' })
  handingOver.value = false
  state.value = 'idle' // after the page has gone, so the picker never flashes up first
}

function onFile(event) {
  const files = [...event.target.files]
  event.target.value = '' // lets the same file be picked again
  if (files.length) useFiles(files)
}

async function useFiles(files, k = type.value) {
  type.value = k
  // Shrinking a big photo takes about a second on old phones; show that we're working, so nobody taps again.
  coverView.value = null
  readingType.value = type.value
  covering.value = true
  state.value = 'loading'
  try {
    const result = await compress(files)
    freshPages()
    photos.value = result.pages
    pdfPages.value = result.pdfPages
    fromPdf.value = result.fromPdf
  } catch {
    // The browser couldn't open a file (e.g. HEIC on a laptop, or not an image), so the server was never asked.
    covering.value = false
    photos.value = []
    errorCode.value = 'UNSUPPORTED_FILE'
    state.value = 'error'
    return
  }
  coverAndSend(type.value)
}

// Zachary: personal details are blacked out on this phone first (src/utils/redact.js), and only the covered photos are sent.
// If covering fails, nothing is sent. The covered photos are also what Confirm shows, so the user sees exactly what was sent.
// e2e tests swap in a fake via window.__redactForTests (e2e/helpers/mockImageScan.js); real covering needs the reader download.
// Each page is checked and covered on its own, one after another (the reader reads one picture at a time).
async function coverAndSend(docType, skipCheck = false) {
  const id = ++run.value
  const pages = photos.value
  const deadline = Date.now() + scanLimit(pages.length)
  coverDocType.value = docType
  lastRequest.value = null // Try again covers again until the covered photos have been sent
  readingType.value = docType
  covering.value = true
  state.value = 'loading'
  const fail = (code) => {
    covering.value = false
    coverPage.value = null
    errorCode.value = code
    state.value = 'error'
    if (!onScanPage()) scanStore.away = { type: docType, status: 'failed' }
  }
  // Too dark, blurry or glary: say so now, before covering and uploading.
  for (const page of pages) {
    coverView.value = { original: page, covered: null }
    const problem =
      skipCheck || fromPdf.value.has(page) || checkedShots.value.has(page)
        ? null
        : await photoCheck(page)
    if (id !== run.value) return // cancelled
    if (problem) return fail(CHECK_ERRORS[problem])
  }
  let tooSlow = false
  const timeUp = new Promise((resolve) =>
    setTimeout(() => resolve((tooSlow = true) && null), COVER_LIMIT_MS * pages.length),
  )
  let covered = []
  for (const [i, page] of pages.entries()) {
    coverPage.value = pages.length > 1 ? { n: i + 1, total: pages.length } : null
    coverView.value = { original: page, covered: null }
    let result = null
    try {
      result = await Promise.race([(window.__redactForTests ?? redactImage)(page), timeUp])
    } catch {
      // Reader could not load (offline, very old phone) or crashed: fail closed.
    }
    if (id !== run.value) return // cancelled
    if (!result) return fail(tooSlow ? 'TIMEOUT' : 'COVER_FAILED')
    // A page where nothing looks like a label or bill (a blank back page) would be all black: it is left out.
    if (!result.keep.length) continue
    covered.push(result.dataUrl)
    coverView.value = { original: page, covered: result.dataUrl }
    // Let the blacked-out version wipe in before the next step (shorter with reduced motion: there is no wipe).
    await new Promise((done) =>
      setTimeout(done, matchMedia('(prefers-reduced-motion: reduce)').matches ? 300 : REVEAL_MS),
    )
    if (id !== run.value) return
  }
  // No page had anything to read: don't send black pictures.
  if (!covered.length) return fail('UNREADABLE_IMAGE')
  covered = await fitUpload(covered).catch(() => covered)
  if (id !== run.value) return
  photos.value = covered
  covering.value = false
  coverPage.value = null
  send(docType, (ms) => scanImage(docType, photos.value, ms), deadline - Date.now())
}

function trySample(sample) {
  freshPages()
  // The sample's picture goes to Confirm too, so there is something to check the fields against.
  photos.value = [`/samples/${sample.id}.svg`]
  coverView.value = null
  send(sample.type, (ms) => scanSample(sample.id, ms))
}

function retry() {
  if (errorCode.value === 'COVER_FAILED' || !lastRequest.value)
    return coverAndSend(coverDocType.value)
  send(lastRequest.value.docType, lastRequest.value.request)
}

// "Use a sample instead" on the error screen: back to the page with the examples already open.
function showExamples() {
  examplesOpen.value = true
  state.value = 'idle'
  if (!chosen.value) router.replace({ name: 'scan', query: { type: type.value } }) // e.g. a photo from Home: its kind's page
}

function cancel() {
  run.value++
  covering.value = false
  state.value = 'idle'
}

// "Was this meant to be a bill?" Yes: read the same covered photo as the other kind.
const readAs = (kind) => send(kind, (ms) => scanImage(kind, photos.value, ms))

// Home can hand over a picked photo or ask for a sample (/scan?sample=med-1).
onMounted(() => {
  const file = scanStore.pendingFile // a photo picked on Home: shown here, waiting for the choice above it
  scanStore.pendingFile = null
  if (file) {
    pending.value = { file, url: URL.createObjectURL(file) }
    if (chosen.value) router.replace({ name: 'scan' }) // a photo from Home is always asked about first
  }
  const sample = SAMPLES.find((s) => s.id === route.query.sample)
  // Opened to take or pick a photo: start downloading the reader now (not for a sample, which never needs it; tests use a fake).
  if (!sample) return window.__redactForTests || warmUp()
  router.replace({ query: {} }) // so Back from Confirm doesn't run the sample again
  trySample(sample)
})
</script>

<template>
  <!-- Kept outside the screens so Retake/Upload work from the error screen too. -->
  <input
    ref="camera"
    type="file"
    accept="image/*"
    capture="environment"
    class="d-none"
    data-testid="camera-input"
    @change="onCameraFile"
  />
  <input
    ref="upload"
    type="file"
    multiple
    accept="image/*,application/pdf"
    class="d-none"
    @change="onFile"
  />

  <ScanBusy
    v-if="state === 'loading'"
    :cover-view="coverView"
    :covering="covering"
    :cover-page="coverPage"
    :reading-type="readingType"
    :slow="slow"
    @cancel="cancel"
  />

  <ScanProblem
    v-else-if="state === 'error'"
    :code="errorCode"
    :type="type"
    :photo="photos[0] ?? null"
    @retake="retake"
    @upload="upload.click()"
    @anyway="coverAndSend(coverDocType, true)"
    @examples="showExamples"
    @retry="retry"
    @read-as="readAs"
    @not-other="errorCode = 'MISMATCH'"
  />

  <LiveCamera
    v-else-if="stream"
    :stream="stream"
    :type="type"
    :note="cameraNote"
    :back="shots.length > 0"
    @capture="capture"
    @cancel="cancelCamera"
  />

  <ScanPages
    v-else-if="shots.length"
    ref="pagesView"
    :shots="shots"
    :max="MAX_PAGES"
    :camera-blocked="cameraBlocked"
    :ask-throw="askThrow"
    @retake="shootPage"
    @anyway="(i) => (shots[i].anyway = true)"
    @remove="removeShot"
    @add="shootPage()"
    @done="readShots"
    @cancel="cancelShots"
    @keep="keepShots"
    @throw="throwShots"
  />

  <ScanPicker v-else-if="!chosen || pending" :pending="pending" @pick="pick" @drop="dropPending" />

  <ScanKindPage
    v-else
    :key="chosen"
    v-model:examples-open="examplesOpen"
    :type="type"
    :camera-blocked="cameraBlocked"
    :examples="examples"
    @take="startCamera"
    @files="(files) => useFiles(files, type)"
    @sample="trySample"
  />
</template>
