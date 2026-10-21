<!-- Owner: Asher (built by Claude, declared in README.txt). Pick or drop a photo, check it, then Scan.
     Emits the chosen File as 'select'; ScanView compresses, covers and sends it as before. -->
<script setup>
import { onBeforeUnmount, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AppIcon from '../layout/AppIcon.vue'

const TYPES = ['image/png', 'image/jpeg', 'image/heic', 'image/heif', 'image/webp']
const MAX_BYTES = 10 * 1024 * 1024

const emit = defineEmits(['select'])
const { t } = useI18n()

const input = ref(null)
const file = ref(null)
const url = ref(null)
const noThumb = ref(false) // the browser can't draw it (e.g. HEIC outside Safari); Scan still tries
const error = ref(null)
const dragging = ref(false)

function choose(f) {
  if (!f) return
  // Some browsers give HEIC files no type, so the name decides.
  if (!TYPES.includes(f.type) && !/\.(heic|heif)$/i.test(f.name)) return (error.value = t('scan.dz.wrongType'))
  if (f.size > MAX_BYTES) return (error.value = t('scan.dz.tooBig'))
  error.value = null
  if (url.value) URL.revokeObjectURL(url.value)
  file.value = f
  url.value = URL.createObjectURL(f)
  noThumb.value = false
}

function onInput(event) {
  choose(event.target.files[0])
  event.target.value = '' // lets the same file be picked again
}

function onDrop(event) {
  dragging.value = false
  choose(event.dataTransfer.files[0])
}

// dragleave also fires when moving over a child; only stop when the pointer really leaves the zone.
function onLeave(event) {
  if (!event.currentTarget.contains(event.relatedTarget)) dragging.value = false
}

onBeforeUnmount(() => url.value && URL.revokeObjectURL(url.value))
</script>

<template>
  <div class="dz-card">
    <input ref="input" type="file" accept="image/png,image/jpeg,image/heic,image/heif,image/webp" class="d-none" data-testid="upload-input" @change="onInput" />

    <div v-if="file" class="dz-chosen">
      <img v-if="!noThumb" :src="url" :alt="t('scan.dz.previewAlt')" class="dz-thumb" @error="noThumb = true" />
      <p class="dz-name">{{ file.name }}</p>
      <div class="d-flex flex-column gap-3">
        <button type="button" class="btn btn-primary" @click="emit('select', file)"><AppIcon name="scan" />{{ t('scan.dz.scan') }}</button>
        <button type="button" class="btn btn-secondary" @click="input.click()"><AppIcon name="upload" />{{ t('scan.dz.change') }}</button>
      </div>
    </div>

    <div
      v-else
      class="dz"
      :class="{ 'dz-over': dragging }"
      role="button"
      tabindex="0"
      @click="input.click()"
      @keydown.enter.space.prevent="input.click()"
      @dragover.prevent="dragging = true"
      @dragleave="onLeave"
      @drop.prevent="onDrop"
    >
      <span class="dz-stack" aria-hidden="true">
        <span class="dz-sq dz-back-l"></span>
        <span class="dz-sq dz-back-r"></span>
        <span class="dz-sq dz-front">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M12 18v-6" /><path d="m9 15 3-3 3 3" />
          </svg>
        </span>
      </span>
      <span class="dz-title">{{ t('scan.dz.title') }}</span>
      <span class="dz-hint">{{ t('scan.dz.hint') }}</span>
      <!-- Looks like a button; the whole zone is the real one (a button inside a button would confuse screen readers).
           Its name is all the text inside it, so what people see is what a voice-control user can say. -->
      <span class="dz-pill"><AppIcon name="upload" :size="20" />{{ t('scan.dz.browse') }}</span>
    </div>

    <p v-if="error" class="dz-error" role="alert"><AppIcon name="alert" :size="20" />{{ error }}</p>
  </div>
</template>

<style scoped>
.dz-card { width: 100%; max-width: 560px; margin-inline: auto; padding: 28px; border: 1px solid var(--color-border); border-radius: 16px; background: var(--color-card); }
.dz {
  display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 56px 20px; text-align: center; cursor: pointer;
  border: 1.5px dashed var(--color-border-strong); border-radius: 20px;
  transition: border-color var(--dur) var(--ease-out), background-color var(--dur) var(--ease-out);
}
.dz:hover, .dz-over { border-color: var(--color-primary); }
.dz-over { background: var(--color-tint); }
.dz:focus-visible { outline: 3px solid var(--color-primary); outline-offset: 3px; }

.dz-stack { position: relative; width: 64px; height: 64px; margin-bottom: 12px; }
.dz-sq { position: absolute; inset: 0; display: grid; place-items: center; border: 1px solid var(--color-border-strong); border-radius: 14px; background: var(--color-card); transition: transform var(--dur) var(--ease-spring); }
.dz-back-l { transform: translateX(-10px) rotate(-8deg); }
.dz-back-r { transform: translateX(10px) rotate(8deg); }
.dz-front { color: var(--color-text-muted); box-shadow: var(--shadow-card); }
.dz:hover .dz-back-l, .dz-over .dz-back-l { transform: translateX(-20px) rotate(-14deg); }
.dz:hover .dz-back-r, .dz-over .dz-back-r { transform: translateX(20px) rotate(14deg); }

.dz-title { font-size: 18px; font-weight: 700; color: var(--color-text); }
.dz-hint { font-size: 16px; color: var(--color-text-muted); }
.dz-pill {
  display: inline-flex; align-items: center; gap: 8px; min-height: 48px; margin-top: 8px; padding: 0 22px;
  border: 1px solid var(--color-border-strong); border-radius: var(--r-pill); background: var(--color-card);
  color: var(--color-text); font-size: 17px; font-weight: 600;
}
.dz:hover .dz-pill, .dz-over .dz-pill { border-color: var(--color-primary); color: var(--color-tint-text); }

.dz-chosen { display: flex; flex-direction: column; gap: 16px; }
.dz-thumb { width: 100%; max-height: 280px; object-fit: contain; border: 1px solid var(--color-border); border-radius: 14px; background: var(--color-surface-2); }
.dz-name { margin: 0; font-size: 16px; color: var(--color-text-muted); overflow-wrap: anywhere; }
.dz-error { display: flex; align-items: center; gap: 8px; margin: 16px 0 0; font-size: 17px; font-weight: 600; color: var(--color-danger-text); }

@media (max-width: 575.98px) { .dz-card { padding: 16px; } .dz { padding: 40px 16px; } }
@media (prefers-reduced-motion: reduce) {
  .dz, .dz-sq { transition: none; }
  .dz:hover .dz-back-l, .dz-over .dz-back-l { transform: translateX(-10px) rotate(-8deg); }
  .dz:hover .dz-back-r, .dz-over .dz-back-r { transform: translateX(10px) rotate(8deg); }
}
</style>
