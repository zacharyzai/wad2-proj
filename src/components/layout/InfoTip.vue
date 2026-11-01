<!-- A small "i" button that keeps a line of help out of the way until it is wanted. Mouse: hover shows it, click keeps it open.
     Touch and keyboard: tap or Enter/Space toggles. Esc, or a tap anywhere else, closes it. The text is also the described-by
     of whatever `id` points at, so a screen reader reads it with the field. The text opens across the nearest positioned
     ancestor (give the row it belongs to `position: relative`), so it never runs off a narrow screen. -->
<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import AppIcon from './AppIcon.vue'

defineProps({
  text: { type: String, required: true },
  label: { type: String, required: true }, // the button's name, e.g. "More about: Amount in the pack"
  id: { type: String, required: true },
})

const root = ref(null)
const pinned = ref(false) // opened by a click, tap or key
const hovering = ref(false) // a mouse is over it (never set by touch, where hover would fire on the same tap)
const open = computed(() => pinned.value || hovering.value)

const onEnter = (e) => (hovering.value = e.pointerType === 'mouse')
const onLeave = () => (hovering.value = false)
const closeOutside = (e) => {
  if (!root.value?.contains(e.target)) pinned.value = false
}
onMounted(() => document.addEventListener('pointerdown', closeOutside))
onBeforeUnmount(() => document.removeEventListener('pointerdown', closeOutside))
</script>

<template>
  <span ref="root" class="tip" @pointerenter="onEnter" @pointerleave="onLeave" @keydown.esc="(pinned = false), (hovering = false)">
    <button type="button" class="tip-btn" :aria-label="label" :aria-expanded="open" :aria-controls="id" data-testid="info-tip" @click="pinned = !pinned">
      <AppIcon name="info" :size="22" />
    </button>
    <Transition name="tip">
      <span v-show="open" :id="id" role="note" class="tip-text" data-testid="info-tip-text">{{ text }}</span>
    </Transition>
  </span>
</template>

<style scoped>
.tip { display: inline-flex; }
/* The picture is 22px; the part you can press is 44px, drawn outside the line so the label row doesn't grow. */
.tip-btn { display: inline-grid; place-items: center; min-width: 44px; min-height: 44px; margin: -11px -6px; padding: 0; border: 0; border-radius: var(--r-pill); background: none; color: var(--color-primary-text); cursor: pointer; }
.tip-btn:focus-visible { outline: none; box-shadow: var(--focus-ring); }
@media (hover: hover) and (pointer: fine) { .tip-btn:hover { background: var(--color-tint); } }
.tip-text { position: absolute; z-index: 20; top: calc(100% + 6px); inset-inline: 0; padding: 12px 14px; border: 1px solid var(--color-border-strong); border-radius: var(--r-tile); background: var(--color-card); color: var(--color-text); box-shadow: var(--shadow-hover); font-size: 16px; font-weight: 500; line-height: 1.45; }
.tip-enter-active { transition: opacity 150ms var(--ease-out), translate 150ms var(--ease-out); }
.tip-leave-active { transition: opacity 100ms ease-out; }
.tip-enter-from { opacity: 0; translate: 0 -4px; }
.tip-leave-to { opacity: 0; }
</style>
