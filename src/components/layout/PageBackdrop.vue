<!-- Owner: Asher. The background of every page in the app (App.vue puts it behind the page): faint line drawings of what the
     app is about, scattered behind the cards and drifting slowly. Medicine (capsules, a tablet, a bottle), bills (a receipt,
     coins), the day (a calendar, a clock), health (a heartbeat), and the people it is for: an older couple, a walking stick,
     and caring hands holding a heart. The set repeats down a long page (one set per TILE px), so it never thins out.
     Behind everything (the cards and their words are always on top), never clickable, hidden from screen readers.
     Reduced motion, and on phones: they stay where they are. -->
<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'

// One set of drawings per TILE px of page; as many sets as the page is long.
const TILE = 900
const tiles = ref(1)
const box = ref(null)
let watcher = null
onMounted(() => {
  watcher = new ResizeObserver(
    ([e]) => (tiles.value = Math.max(1, Math.ceil(e.contentRect.height / TILE))),
  )
  watcher.observe(box.value)
})
onBeforeUnmount(() => watcher?.disconnect())

// Where each drawing sits (% of the page), how big (px), its tilt, its colour, and how long one slow float takes (s).
const ITEMS = [
  { icon: 'capsule', x: 3, y: 4, size: 64, tilt: -30, tone: 'coral', float: 19 },
  { icon: 'heart', x: 46, y: 1, size: 54, tilt: 0, tone: 'coral', float: 23 },
  { icon: 'receipt', x: 93, y: 6, size: 60, tilt: 12, tone: 'blue', float: 21 },
  { icon: 'elders', x: 1, y: 30, size: 84, tilt: 0, tone: 'teal', float: 25 },
  { icon: 'tablet', x: 96, y: 30, size: 44, tilt: 0, tone: 'amber', float: 17 },
  { icon: 'calendar', x: 48, y: 44, size: 56, tilt: -8, tone: 'amber', float: 22 },
  { icon: 'bottle', x: 94, y: 52, size: 62, tilt: 10, tone: 'teal', float: 20 },
  { icon: 'hands', x: 2, y: 62, size: 78, tilt: 0, tone: 'coral', float: 24 },
  { icon: 'coins', x: 70, y: 70, size: 52, tilt: 0, tone: 'green', float: 18 },
  { icon: 'cane', x: 28, y: 78, size: 60, tilt: 8, tone: 'purple', float: 26 },
  { icon: 'clock', x: 92, y: 84, size: 52, tilt: 0, tone: 'purple', float: 21 },
  { icon: 'capsule', x: 52, y: 92, size: 50, tilt: 35, tone: 'teal', float: 20 },
  { icon: 'tablet', x: 8, y: 94, size: 40, tilt: 0, tone: 'coral', float: 16 },
]
</script>

<template>
  <div ref="box" class="backdrop" aria-hidden="true" data-testid="page-backdrop">
    <div
      v-for="k in tiles"
      :key="k"
      class="bd-set"
      :style="{ top: `${(k - 1) * TILE}px`, height: `${TILE}px` }"
    >
      <span
        v-for="(it, i) in ITEMS"
        :key="i"
        class="bit"
        :class="`tone-${it.tone}`"
        :style="{
          left: `${it.x}%`,
          top: `${it.y}%`,
          width: `${it.size}px`,
          '--tilt': `${it.tilt}deg`,
          '--float': `${it.float + 8}s`,
          '--delay': `${-i * 1.7}s`,
        }"
      >
        <svg viewBox="0 0 64 64" focusable="false">
          <template v-if="it.icon === 'capsule'">
            <rect x="8" y="22" width="48" height="20" rx="10" />
            <path d="M32 22v20" />
            <path class="fill" d="M32 22H18a10 10 0 0 0 0 20h14z" />
          </template>
          <template v-else-if="it.icon === 'tablet'">
            <circle cx="32" cy="32" r="20" />
            <path d="M18 32h28" />
          </template>
          <template v-else-if="it.icon === 'bottle'">
            <rect x="22" y="8" width="20" height="10" rx="2" />
            <path d="M18 22a4 4 0 0 1 4-4h20a4 4 0 0 1 4 4v32a4 4 0 0 1-4 4H22a4 4 0 0 1-4-4z" />
            <path d="M32 30v16M24 38h16" />
          </template>
          <template v-else-if="it.icon === 'receipt'">
            <path d="M16 6h32v50l-4-3-4 3-4-3-4 3-4-3-4 3-4-3-4 3z" />
            <path d="M22 18h20M22 26h14M22 34h18M22 44h8" />
          </template>
          <template v-else-if="it.icon === 'coins'">
            <ellipse cx="26" cy="40" rx="16" ry="6" />
            <path d="M10 40v6c0 3.3 7.2 6 16 6s16-2.7 16-6v-6" />
            <circle cx="42" cy="22" r="13" />
            <path
              d="M45 17c-1-1.4-2.4-2-4-2-2.3 0-4 1.2-4 2.9 0 4 8 2 8 6.1 0 1.9-1.7 3.1-4.1 3.1-1.8 0-3.3-.8-4.1-2.1M41 13v2M41 27v2"
            />
          </template>
          <template v-else-if="it.icon === 'calendar'">
            <rect x="10" y="14" width="44" height="40" rx="6" />
            <path d="M10 26h44M22 8v12M42 8v12" />
            <path d="M22 40l6 6 12-12" />
          </template>
          <template v-else-if="it.icon === 'clock'">
            <circle cx="32" cy="32" r="22" />
            <path d="M32 18v14l9 6" />
          </template>
          <template v-else-if="it.icon === 'heart'">
            <path d="M32 54S8 40 8 24a12 12 0 0 1 24-4 12 12 0 0 1 24 4c0 16-24 30-24 30z" />
            <path d="M14 32h10l4-8 6 16 4-8h12" />
          </template>
          <!-- Two older people side by side: one with glasses, one with a bun. -->
          <template v-else-if="it.icon === 'elders'">
            <circle cx="22" cy="22" r="8" />
            <path d="M18 22h8M14 21h4M26 21h4" />
            <path d="M8 56c0-9 6-16 14-16s14 7 14 16" />
            <circle cx="44" cy="24" r="8" />
            <circle cx="44" cy="13" r="3.5" />
            <path d="M30 56c0-8 6-14 14-14s14 6 14 14" />
          </template>
          <template v-else-if="it.icon === 'cane'">
            <path d="M38 58V18a10 10 0 0 0-20 0" />
            <path d="M34 58h8" />
          </template>
          <!-- Caring hands: two cupped hands holding a heart. -->
          <template v-else>
            <path d="M32 30s-10-6-10-13a6 6 0 0 1 10-4 6 6 0 0 1 10 4c0 7-10 13-10 13z" />
            <path d="M6 36l10 8c3 2.4 6 3 10 3h12c4 0 7-.6 10-3l10-8" />
            <path d="M6 36c2-2 5-2 7 0l7 6M58 36c-2-2-5-2-7 0l-7 6" />
          </template>
        </svg>
      </span>
    </div>
  </div>
</template>

<style scoped>
/* Covers the page and its margins, behind everything. */
.backdrop {
  position: absolute;
  inset: 0;
  z-index: -1;
  overflow: hidden;
  pointer-events: none;
}
.bd-set {
  position: absolute;
  left: 0;
  right: 0;
} /* not .tile: that is the app's own teal icon square */
.bit {
  position: absolute;
  display: block;
  translate: -50% -50%;
  color: var(--tone);
  opacity: 0.22;
  animation: drift var(--float) ease-in-out var(--delay) infinite;
}
svg {
  display: block;
  width: 100%;
  height: auto;
  overflow: visible;
  rotate: var(--tilt);
}
svg * {
  fill: none;
  stroke: currentColor;
  stroke-width: 2.6;
  stroke-linecap: round;
  stroke-linejoin: round;
}
svg .fill {
  fill: currentColor;
  opacity: 0.35;
  stroke: none;
}
.tone-teal {
  --tone: var(--color-primary-text);
}
.tone-coral {
  --tone: #d8553f;
}
.tone-amber {
  --tone: #c98a12;
}
.tone-blue {
  --tone: #3a7bc8;
}
.tone-green {
  --tone: #1e9a57;
}
.tone-purple {
  --tone: #6a4fa8;
}
:root[data-theme='dark'] .bit {
  opacity: 0.16;
}
/* A slow drift: up, across and back, with a slight turn, over about half a minute; never the same moment for two drawings
   (each starts at its own point). Slow enough to notice only when you look. */
@keyframes drift {
  0%,
  100% {
    transform: translate(0, 0) rotate(0deg);
  }
  25% {
    transform: translate(12px, -16px) rotate(6deg);
  }
  50% {
    transform: translate(-4px, -22px) rotate(-2deg);
  }
  75% {
    transform: translate(-14px, -8px) rotate(-7deg);
  }
}
/* Phones (the senior's device, same 992px line as tokens.css) keep the drawings but still: nothing moves behind the words,
   and the phone isn't kept busy animating 26-39 drawings on every page. Desktop (the caregiver's) keeps the drift. */
@media (prefers-reduced-motion: reduce), (max-width: 991.98px) {
  .bit {
    animation: none;
  }
}
</style>
