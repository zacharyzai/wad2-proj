<!-- Owner: Zachary. Dev-only test bench (/dev/redact, not in production builds) for src/utils/redact.js:
     drop in real label and bill photos and check what gets blacked out before anything would be sent to the AI.
     Nothing here leaves the browser. English only on purpose: it is a developer tool, not part of the app. -->
<script setup>
import { reactive, ref } from 'vue'
import { redactImage } from '../../utils/redact'

const MAX_SIDE = 1600 // same as ScanView, so results match what the app would send
const results = reactive([])
const busy = ref(false)

async function toJpeg(src) {
  const img = await new Promise((resolve, reject) => {
    const i = new Image()
    i.onload = () => resolve(i)
    i.onerror = reject
    i.src = src
  })
  const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(img.naturalWidth * scale)
  canvas.height = Math.round(img.naturalHeight * scale)
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', 0.8)
}

async function run(name, src) {
  const row = reactive({ name, original: null, redacted: null, hits: [], text: '', ms: null, error: null })
  results.unshift(row)
  try {
    row.original = await toJpeg(src)
    const out = await redactImage(row.original)
    Object.assign(row, { redacted: out.dataUrl, hits: out.hits, text: out.text, ms: out.ms })
  } catch (err) {
    row.error = String(err?.message ?? err)
  }
}

async function onFiles(event) {
  busy.value = true
  for (const file of event.target.files) {
    const url = URL.createObjectURL(file)
    await run(file.name, url)
    URL.revokeObjectURL(url)
  }
  event.target.value = ''
  busy.value = false
}

async function runSamples() {
  busy.value = true
  for (const id of ['med-1', 'med-2', 'med-3', 'bill-1', 'dev-personal']) await run(id, id === 'dev-personal' ? fakeLabel() : `/samples/${id}.svg`)
  busy.value = false
}

// A made-up label with fake personal details, to check the positive case without a real photo.
function fakeLabel() {
  const rows = ['POLYCLINIC PHARMACY', 'Name: TAN AH KOW', 'NRIC: S1234567D   DOB: 15/03/1948', 'Tel: 9123 4567', 'Blk 123 Bedok North Ave 3 #04-56', 'METFORMIN 500 MG TABLET', 'TAKE 1 TABLET 2 TIMES A DAY', 'AFTER FOOD']
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="560"><rect width="100%" height="100%" fill="#fff"/>${rows
    .map((r, i) => `<text x="40" y="${70 + i * 62}" font-family="Arial" font-size="34" font-weight="${i === 5 ? 700 : 400}">${r}</text>`)
    .join('')}</svg>`
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
}
</script>

<template>
  <div class="page">
    <div class="page-head">
      <h1>Redaction test bench</h1>
      <p class="lead-text">Pick label or bill photos. Each one is read on this device and the personal details are blacked out. Nothing is uploaded.</p>
    </div>

    <div class="d-flex flex-wrap gap-3">
      <label class="btn btn-primary">
        Choose photos
        <input type="file" accept="image/*" multiple class="d-none" :disabled="busy" @change="onFiles" />
      </label>
      <button type="button" class="btn btn-secondary" :disabled="busy" @click="runSamples">Run built-in samples</button>
    </div>
    <p v-if="busy" role="status" class="lead-text">Reading… the first photo also downloads the reader (about 5 MB).</p>

    <table v-if="results.length" class="table">
      <thead><tr><th>Photo</th><th>Covered</th><th>Time</th></tr></thead>
      <tbody>
        <tr v-for="r in results" :key="r.name + r.ms">
          <td>{{ r.name }}</td>
          <td>{{ r.error ? 'error' : r.hits.length ? [...new Set(r.hits.map((h) => h.reason))].join(', ') : 'nothing' }}</td>
          <td>{{ r.ms != null ? (r.ms / 1000).toFixed(1) + ' s' : '…' }}</td>
        </tr>
      </tbody>
    </table>

    <section v-for="r in results" :key="'c' + r.name + r.ms" class="card d-flex flex-column gap-3">
      <h2 class="h4 mb-0">{{ r.name }}</h2>
      <p v-if="r.error" class="alert alert-danger">{{ r.error }}</p>
      <div class="pair">
        <figure v-if="r.original"><figcaption>Original</figcaption><img :src="r.original" alt="Original photo" /></figure>
        <figure v-if="r.redacted"><figcaption>What would be sent</figcaption><img :src="r.redacted" alt="Photo with personal details blacked out" /></figure>
      </div>
      <ul v-if="r.hits.length">
        <li v-for="(h, i) in r.hits" :key="i"><strong>{{ h.reason }}</strong>: {{ h.text }}</li>
      </ul>
      <details v-if="r.text">
        <summary>Everything the reader saw (check for anything missed)</summary>
        <pre>{{ r.text }}</pre>
      </details>
    </section>
  </div>
</template>

<style scoped>
.pair { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px; }
figure { margin: 0; display: flex; flex-direction: column; gap: 8px; }
figcaption { font-weight: 700; }
figure img { width: 100%; border: 1px solid var(--color-border); border-radius: 12px; }
pre { white-space: pre-wrap; font-size: 16px; }
</style>
