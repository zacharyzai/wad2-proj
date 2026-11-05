<script setup>
import { computed, onBeforeUnmount, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AppIcon from '../layout/AppIcon.vue'
import { isPdf, pdfToJpegs, MAX_PAGES } from '../../utils/pdfToImage'

const TYPES = [
  'image/png',
  'image/jpeg',
  'image/heic',
  'image/heif',
  'image/webp',
  'application/pdf',
]
const MAX_BYTES = 10 * 1024 * 1024

const emit = defineEmits(['select'])
const { t } = useI18n()

const input = ref(null)
let adding = false // the next pick adds pages instead of replacing them
// [{ file, url, noThumb }]. noThumb: the browser can't draw it (e.g. HEIC outside Safari); Scan still tries.
const chosen = ref([])
const error = ref(null)
const dragging = ref(false)
const canAdd = computed(
  () => chosen.value.length < MAX_PAGES && !chosen.value.some((c) => isPdf(c.file)),
)

// Frees the memory held by preview images.
function forget(list) {
  for (const c of list) if (c.url?.startsWith('blob:')) URL.revokeObjectURL(c.url)
}

// Accepts the picked files if they are photos or PDFs, otherwise shows an error.
function choose(picked) {
  if (!picked.length) return
  // Some browsers give HEIC (and some PDF) files no type, so the name decides.
  if (picked.some((f) => !TYPES.includes(f.type) && !/\.(heic|heif|pdf)$/i.test(f.name)))
    return (error.value = t('scan.dz.wrongType'))
  if (picked.some((f) => f.size > MAX_BYTES)) return (error.value = t('scan.dz.tooBig'))
  const files = [...(adding ? chosen.value.map((c) => c.file) : []), ...picked]
  // A PDF already holds its pages: it goes on its own.
  if (files.length > 1 && files.some(isPdf))
    return (error.value = t('scan.dz.pdfAlone', { max: MAX_PAGES }))
  if (files.length > MAX_PAGES) return (error.value = t('scan.dz.tooMany', { max: MAX_PAGES }))
  error.value = null
  if (!adding) forget(chosen.value)
  const fresh = picked.map((file) =>
    isPdf(file)
      ? { file, url: null, noThumb: true }
      : { file, url: URL.createObjectURL(file), noThumb: false },
  )
  chosen.value = adding ? [...chosen.value, ...fresh] : fresh
  fresh.filter((c) => isPdf(c.file)).forEach(previewPdf)
}

// An <img> can't draw a PDF, so its first page is drawn small instead (the same as a photo's preview). If that fails
// (a damaged file), the name alone shows, and Scan then says the file can't be used.
function previewPdf(entry) {
  pdfToJpegs(entry.file, { pages: 1, width: 360 })
    .then(([preview]) => {
      const live = chosen.value.find((c) => c.file === entry.file)
      if (!live) return // another file was picked meanwhile
      live.url = preview
      live.noThumb = false
    })
    .catch(() => {})
}

// Opens the file picker, to replace the pages or add to them.
function pick(add) {
  adding = add
  input.value.click()
}

// Handles files chosen in the file picker.
function onInput(event) {
  choose([...event.target.files])
  event.target.value = '' // lets the same file be picked again
}

// Handles files dropped onto the box.
function onDrop(event) {
  dragging.value = false
  adding = false
  choose([...event.dataTransfer.files])
}

// dragleave also fires when moving over a child; only stop when the pointer really leaves the zone.
function onLeave(event) {
  if (!event.currentTarget.contains(event.relatedTarget)) dragging.value = false
}

onBeforeUnmount(() => forget(chosen.value))
</script>

<template>
  <div class="dz-card">
    <input
      ref="input"
      type="file"
      multiple
      accept="image/png,image/jpeg,image/heic,image/heif,image/webp,application/pdf"
      class="d-none"
      data-testid="upload-input"
      @change="onInput"
    />

    <div v-if="chosen.length" class="dz-chosen">
      <img
        v-if="chosen.length === 1 && !chosen[0].noThumb"
        :src="chosen[0].url"
        :alt="t('scan.dz.previewAlt')"
        class="dz-thumb"
        @error="chosen[0].noThumb = true"
      />
      <ol v-else-if="chosen.length > 1" class="dz-pages" data-testid="upload-pages">
        <li v-for="(c, i) in chosen" :key="i">
          <img
            v-if="!c.noThumb"
            :src="c.url"
            :alt="t('scan.dz.pageAlt', { n: i + 1, total: chosen.length })"
            class="dz-page"
            @error="c.noThumb = true"
          />
          <span v-else class="dz-page dz-page-name">{{ c.file.name }}</span>
        </li>
      </ol>
      <p class="dz-name">
        {{ chosen.length === 1 ? chosen[0].file.name : t('scan.dz.count', { n: chosen.length }) }}
      </p>
      <div class="d-flex flex-column gap-3">
        <button
          type="button"
          class="btn btn-primary"
          @click="
            emit(
              'select',
              chosen.map((c) => c.file),
            )
          "
        >
          <AppIcon name="scan" />{{ t('scan.dz.scan') }}
        </button>
        <button
          v-if="canAdd"
          type="button"
          class="btn btn-secondary"
          data-testid="upload-add"
          @click="pick(true)"
        >
          <AppIcon name="plus" />{{ t('scan.dz.addPage') }}
        </button>
        <button type="button" class="btn btn-ghost" @click="pick(false)">
          <AppIcon name="upload" />{{ t('scan.dz.change') }}
        </button>
      </div>
    </div>

    <div
      v-else
      class="dz"
      :class="{ 'dz-over': dragging }"
      role="button"
      tabindex="0"
      @click="pick(false)"
      @keydown.enter.space.prevent="pick(false)"
      @dragover.prevent="dragging = true"
      @dragleave="onLeave"
      @drop.prevent="onDrop"
    >
      <span class="dz-stack" aria-hidden="true">
        <span class="dz-sq dz-back-l"></span>
        <span class="dz-sq dz-back-r"></span>
        <span class="dz-sq dz-front">
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <path d="M14 2v6h6" />
            <path d="M12 18v-6" />
            <path d="m9 15 3-3 3 3" />
          </svg>
        </span>
      </span>
      <span class="dz-title">{{ t('scan.dz.title') }}</span>
      <span class="dz-hint">{{ t('scan.dz.hint', { max: MAX_PAGES }) }}</span>
      <!-- Looks like a button; the whole zone is the real one (a button inside a button would confuse screen readers).
           Its name is all the text inside it, so what people see is what a voice-control user can say. -->
      <span class="dz-pill"><AppIcon name="upload" :size="20" />{{ t('scan.dz.browse') }}</span>
    </div>

    <p v-if="error" class="dz-error" role="alert"><AppIcon name="alert" :size="20" />{{ error }}</p>
  </div>
</template>

<style scoped>
.dz-card {
  width: 100%;
  max-width: 560px;
  margin-inline: auto;
  padding: 28px;
  border: 1px solid var(--color-border);
  border-radius: var(--r-tile);
  background: var(--color-card);
}
.dz {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 56px 20px;
  text-align: center;
  cursor: pointer;
  border: 1.5px dashed var(--color-border-strong);
  border-radius: var(--r-panel);
  transition:
    border-color var(--dur) var(--ease-out),
    background-color var(--dur) var(--ease-out);
}
.dz:hover,
.dz-over {
  border-color: var(--color-primary);
}
.dz-over {
  background: var(--color-tint);
}
.dz:focus-visible {
  outline: 3px solid var(--color-primary);
  outline-offset: 3px;
}

.dz-stack {
  position: relative;
  width: var(--z64, 64px);
  height: var(--z64, 64px);
  margin-bottom: 12px;
}
.dz-sq {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  border: 1px solid var(--color-border-strong);
  border-radius: 14px;
  background: var(--color-card);
  transition: transform var(--dur) var(--ease-settle);
}
.dz-back-l {
  transform: translateX(-10px) rotate(-8deg);
}
.dz-back-r {
  transform: translateX(10px) rotate(8deg);
}
.dz-front {
  color: var(--color-text-muted);
  box-shadow: var(--shadow-card);
}
.dz:hover .dz-back-l,
.dz-over .dz-back-l {
  transform: translateX(-20px) rotate(-14deg);
}
.dz:hover .dz-back-r,
.dz-over .dz-back-r {
  transform: translateX(20px) rotate(14deg);
}

.dz-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--color-text);
}
.dz-hint {
  font-size: 16px;
  color: var(--color-text-muted);
}
.dz-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 48px;
  margin-top: 8px;
  padding: 0 22px;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--r-pill);
  background: var(--color-card);
  color: var(--color-text);
  font-size: 17px;
  font-weight: 600;
}
.dz:hover .dz-pill,
.dz-over .dz-pill {
  border-color: var(--color-primary);
  color: var(--color-tint-text);
}

.dz-chosen {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.dz-thumb {
  width: 100%;
  max-height: 280px;
  object-fit: contain;
  border: 1px solid var(--color-border);
  border-radius: 14px;
  background: var(--color-surface-2);
}
.dz-pages {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
  gap: 12px;
  margin: 0;
  padding: 0;
  list-style: none;
  counter-reset: page;
}
.dz-pages li {
  position: relative;
  counter-increment: page;
}
/* The page number on each thumbnail, so the order the AI reads them in is visible. */
.dz-pages li::after {
  content: counter(page);
  position: absolute;
  top: 6px;
  left: 6px;
  min-width: 28px;
  padding: 2px 8px;
  border-radius: var(--r-pill);
  background: var(--color-text);
  color: var(--color-card);
  font-size: 16px;
  font-weight: 700;
  text-align: center;
}
.dz-page {
  display: block;
  width: 100%;
  aspect-ratio: 3 / 4;
  object-fit: cover;
  border: 1px solid var(--color-border);
  border-radius: 12px;
  background: var(--color-surface-2);
}
.dz-page-name {
  display: grid;
  place-items: center;
  padding: 8px;
  font-size: 16px;
  color: var(--color-text-muted);
  overflow-wrap: anywhere;
}
.dz-name {
  margin: 0;
  font-size: 16px;
  color: var(--color-text-muted);
  overflow-wrap: anywhere;
}
.dz-error {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 16px 0 0;
  font-size: 17px;
  font-weight: 600;
  color: var(--color-danger-text);
}

@media (max-width: 575.98px) {
  .dz-card {
    padding: 16px;
  }
  .dz {
    padding: 40px 16px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .dz,
  .dz-sq {
    transition: none;
  }
  .dz:hover .dz-back-l,
  .dz-over .dz-back-l {
    transform: translateX(-10px) rotate(-8deg);
  }
  .dz:hover .dz-back-r,
  .dz-over .dz-back-r {
    transform: translateX(10px) rotate(8deg);
  }
}
</style>
