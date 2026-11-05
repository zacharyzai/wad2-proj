<!-- The short picture after a card is picked on Scan's question (ScanPicker.vue), so the scan page doesn't
     just appear. From the card that was tapped, a soft wash of its colour spreads over the screen while things of its kind
     burst out and settle around the middle, then drift gently up as the scan page opens:
       medication  capsules, tablets, a blister pack, a syrup bottle and a cream tube, round a big medicine bottle
       bill        receipts, notes and coins, round a big receipt with a coin stamped on it
     About 1.7 seconds (ScanPicker's SLOW stretches every time below by k). Decoration (aria-hidden): the scan page says where you are. Covers the screen, so a second
     tap can't land on the other card. Never shown with reduced motion (the card opens at once). -->
<script setup>
import { computed } from 'vue'

const props = defineProps({
  kind: { type: String, required: true }, // 'medication' | 'bill'
  x: { type: Number, required: true }, // the centre of the card it came from
  y: { type: Number, required: true },
  k: { type: Number, default: 1 }, // how much slower than the original second: every time below is multiplied by it
})

const SHAPES = {
  medication: [
    'capsule',
    'tablet',
    'bottle',
    'capsule2',
    'blister',
    'tablet2',
    'tube',
    'capsule',
    'tablet',
    'capsule2',
    'blister',
    'tablet2',
  ],
  bill: [
    'receipt',
    'coin',
    'note',
    'coin',
    'receipt',
    'note',
    'coin',
    'note',
    'receipt',
    'coin',
    'note',
    'coin',
  ],
}
// Where each one settles round the middle: a ring, a little uneven, so it looks thrown rather than placed.
const SPREAD = [0.9, 0.7, 1, 0.78, 0.95, 0.72, 0.88, 1, 0.75, 0.92, 0.8, 0.98]
const items = computed(() => {
  const w = window.innerWidth
  const h = window.innerHeight
  const reach = Math.min(w, h) * 0.38
  return SHAPES[props.kind].map((shape, i) => {
    const angle = (i / 12) * Math.PI * 2 + 0.3
    const tx = w / 2 + Math.cos(angle) * reach * SPREAD[i] * (w > h ? 1.5 : 1)
    const ty = h / 2 + Math.sin(angle) * reach * SPREAD[i]
    const delay = (60 + i * 22) * props.k
    return {
      shape,
      style: {
        left: `${tx}px`,
        top: `${ty}px`,
        '--fx': `${props.x - tx}px`,
        '--fy': `${props.y - ty}px`,
        '--rot': `${(i % 2 ? 1 : -1) * (20 + ((i * 37) % 50))}deg`,
        '--s': `${Math.round(Math.min(w, h) * (0.1 + (i % 3) * 0.025))}px`,
        animationDelay: `${delay}ms, ${delay + 520 * props.k}ms`, // it drifts away once it has landed
      },
    }
  })
})
const from = computed(() => ({ '--x': `${props.x}px`, '--y': `${props.y}px`, '--k': props.k }))
</script>

<template>
  <Teleport to="body">
    <div
      class="sl"
      :class="`sl-${kind}`"
      :style="from"
      aria-hidden="true"
      data-testid="scan-launch"
      :data-kind="kind"
    >
      <div class="sl-wash"></div>
      <span v-for="(it, i) in items" :key="i" class="sl-item" :style="it.style">
        <svg viewBox="0 0 64 64" focusable="false">
          <g v-if="it.shape === 'capsule'" transform="rotate(-35 32 32)">
            <rect x="8" y="21" width="48" height="22" rx="11" fill="#1a7070" />
            <path d="M32 21h13a11 11 0 0 1 0 22H32z" fill="#f3d27a" />
            <rect x="13" y="25" width="16" height="4" rx="2" fill="#fff" opacity="0.5" />
          </g>
          <g v-else-if="it.shape === 'capsule2'" transform="rotate(25 32 32)">
            <rect x="8" y="21" width="48" height="22" rx="11" fill="#f08a7e" />
            <path d="M32 21h13a11 11 0 0 1 0 22H32z" fill="#fff" />
            <rect
              x="8"
              y="21"
              width="48"
              height="22"
              rx="11"
              fill="none"
              stroke="#c9604f"
              stroke-width="2"
            />
          </g>
          <g v-else-if="it.shape === 'tablet'">
            <circle cx="32" cy="32" r="20" fill="#fff" stroke="#b9d6d2" stroke-width="3" />
            <path d="M20 32h24" stroke="#b9d6d2" stroke-width="3" stroke-linecap="round" />
          </g>
          <g v-else-if="it.shape === 'tablet2'">
            <ellipse
              cx="32"
              cy="32"
              rx="22"
              ry="15"
              fill="#f3d27a"
              stroke="#d9ae4a"
              stroke-width="3"
            />
            <ellipse cx="27" cy="27" rx="8" ry="3" fill="#fff" opacity="0.55" />
          </g>
          <g v-else-if="it.shape === 'bottle'">
            <rect
              x="20"
              y="8"
              width="24"
              height="10"
              rx="3"
              fill="#fff"
              stroke="#6c8a86"
              stroke-width="2"
            />
            <rect x="16" y="17" width="32" height="40" rx="7" fill="#e58a3a" />
            <rect x="20" y="28" width="24" height="18" rx="3" fill="#fff" />
            <path d="M32 32v10M27 37h10" stroke="#1a7070" stroke-width="3" stroke-linecap="round" />
          </g>
          <g v-else-if="it.shape === 'blister'" transform="rotate(-12 32 32)">
            <rect
              x="8"
              y="14"
              width="48"
              height="36"
              rx="7"
              fill="#d8e4e7"
              stroke="#9fb4b9"
              stroke-width="2"
            />
            <circle
              v-for="c in [
                [20, 25],
                [32, 25],
                [44, 25],
                [20, 39],
                [32, 39],
                [44, 39],
              ]"
              :key="c.join()"
              :cx="c[0]"
              :cy="c[1]"
              r="5"
              fill="#fff"
              stroke="#9fb4b9"
              stroke-width="1.5"
            />
          </g>
          <g v-else-if="it.shape === 'tube'" transform="rotate(30 32 32)">
            <path d="M14 22h30l8 10-8 10H14z" fill="#fff" stroke="#8fb8b2" stroke-width="2" />
            <rect x="52" y="27" width="8" height="10" rx="2" fill="#1a7070" />
            <rect x="20" y="27" width="16" height="10" rx="2" fill="#8ff0e6" />
          </g>
          <g v-else-if="it.shape === 'receipt'" transform="rotate(-8 32 32)">
            <path
              d="M14 6h36v52l-6-4-6 4-6-4-6 4-6-4-6 4z"
              fill="#fff"
              stroke="#9aa6b2"
              stroke-width="2"
              stroke-linejoin="round"
            />
            <rect x="20" y="14" width="24" height="5" rx="2.5" fill="#3a7bc8" />
            <rect x="20" y="25" width="18" height="4" rx="2" fill="#c3cad2" />
            <rect x="20" y="33" width="22" height="4" rx="2" fill="#c3cad2" />
            <rect x="20" y="42" width="12" height="5" rx="2.5" fill="#4b5a69" />
          </g>
          <g v-else-if="it.shape === 'note'" transform="rotate(14 32 32)">
            <rect
              x="4"
              y="18"
              width="56"
              height="28"
              rx="4"
              fill="#8fd1a6"
              stroke="#4d9a6a"
              stroke-width="2"
            />
            <circle cx="32" cy="32" r="8" fill="none" stroke="#4d9a6a" stroke-width="2.5" />
            <circle cx="12" cy="32" r="2.5" fill="#4d9a6a" />
            <circle cx="52" cy="32" r="2.5" fill="#4d9a6a" />
          </g>
          <g v-else>
            <circle cx="32" cy="32" r="20" fill="#ffd66b" stroke="#e7a93a" stroke-width="3" />
            <circle cx="32" cy="32" r="13" fill="none" stroke="#e7a93a" stroke-width="2.5" />
            <path
              d="M36 26c-1-1.6-2.6-2.2-4.2-2.2-2.6 0-4.2 1.4-4.2 3.2 0 4.4 8.8 2.3 8.8 6.9 0 2.1-1.9 3.4-4.6 3.4-2 0-3.6-.8-4.6-2.3M32 21.6v2.2M32 37.4v2.2"
              fill="none"
              stroke="#b97d1c"
              stroke-width="2.5"
              stroke-linecap="round"
            />
          </g>
        </svg>
      </span>
      <!-- The big one in the middle. -->
      <span class="sl-hero">
        <svg v-if="kind === 'medication'" viewBox="0 0 120 120" focusable="false">
          <rect
            x="36"
            y="10"
            width="48"
            height="20"
            rx="6"
            fill="#fff"
            stroke="#1a7070"
            stroke-width="4"
          />
          <rect x="28" y="28" width="64" height="82" rx="14" fill="#1a7070" />
          <rect x="36" y="48" width="48" height="40" rx="6" fill="#fffdfa" />
          <path d="M60 56v24M48 68h24" stroke="#e2533c" stroke-width="7" stroke-linecap="round" />
          <rect x="34" y="34" width="8" height="66" rx="4" fill="#fff" opacity="0.18" />
        </svg>
        <svg v-else viewBox="0 0 120 120" focusable="false">
          <path
            d="M26 8h68v100l-8.5-6-8.5 6-8.5-6-8.5 6-8.5-6-8.5 6-8.5-6-8.5 6z"
            fill="#fff"
            stroke="#4b5a69"
            stroke-width="4"
            stroke-linejoin="round"
          />
          <rect x="34" y="18" width="52" height="10" rx="3" fill="#3a7bc8" />
          <rect x="36" y="40" width="34" height="6" rx="3" fill="#b9c2cc" />
          <rect x="36" y="54" width="42" height="6" rx="3" fill="#b9c2cc" />
          <rect x="36" y="68" width="26" height="8" rx="4" fill="#4b5a69" />
          <g class="sl-stamp">
            <circle cx="86" cy="86" r="22" fill="#1e9a57" stroke="#fff" stroke-width="4" />
            <path
              d="M93 77c-2-2.6-4.4-3.6-7-3.6-4.4 0-7 2.3-7 5.4 0 7.4 15 3.9 15 11.6 0 3.5-3.2 5.8-7.7 5.8-3.4 0-6.1-1.4-7.7-3.9M86 70v4M86 98v4"
              fill="none"
              stroke="#fff"
              stroke-width="4"
              stroke-linecap="round"
            />
          </g>
        </svg>
      </span>
    </div>
  </Teleport>
</template>

<style scoped>
.sl {
  position: fixed;
  inset: 0;
  z-index: 60;
  overflow: hidden;
  cursor: progress;
}
/* The wash: a circle of the card's colour growing out of it until it covers the screen. */
.sl-wash {
  position: absolute;
  inset: 0;
  clip-path: circle(0 at var(--x) var(--y));
  animation: spread calc(560ms * var(--k)) cubic-bezier(0.5, 0, 0.2, 1) both;
}
.sl-medication .sl-wash {
  background: radial-gradient(circle at var(--x) var(--y), #d5efea, #eef7f4 70%);
}
.sl-bill .sl-wash {
  background: radial-gradient(circle at var(--x) var(--y), #fde3cc, #fdf3e8 70%);
}
:root[data-theme='dark'] .sl-medication .sl-wash {
  background: radial-gradient(circle at var(--x) var(--y), #1d4744, #122725 70%);
}
:root[data-theme='dark'] .sl-bill .sl-wash {
  background: radial-gradient(circle at var(--x) var(--y), #4a3020, #221a14 70%);
}
@keyframes spread {
  to {
    clip-path: circle(150vmax at var(--x) var(--y));
  }
}

/* Each thing: thrown out of the card to its place round the middle, turning as it goes, then drifting up and away. */
.sl-item {
  position: absolute;
  width: var(--s);
  height: var(--s);
  margin: calc(var(--s) / -2) 0 0 calc(var(--s) / -2);
  animation:
    burst calc(620ms * var(--k)) cubic-bezier(0.2, 0.9, 0.3, 1.1) both,
    away calc(400ms * var(--k)) ease-in forwards;
}
.sl-item svg,
.sl-hero svg {
  display: block;
  width: 100%;
  height: 100%;
  overflow: visible;
  filter: drop-shadow(0 8px 10px rgba(30, 40, 40, 0.18));
}
@keyframes burst {
  from {
    translate: var(--fx) var(--fy);
    scale: 0.2;
    rotate: 0deg;
    opacity: 0;
  }
  30% {
    opacity: 1;
  }
  to {
    translate: 0 0;
    scale: 1;
    rotate: var(--rot);
    opacity: 1;
  }
}
@keyframes away {
  from {
    translate: 0 0;
    scale: 1;
    rotate: var(--rot);
    opacity: 1;
  }
  to {
    translate: 0 -28px;
    scale: 1;
    rotate: var(--rot);
    opacity: 0;
  }
}

/* The big one: pops up in the middle, wobbles once, then goes up with the rest. */
.sl-hero {
  position: absolute;
  left: 50%;
  top: 50%;
  width: min(40vmin, 200px);
  aspect-ratio: 1;
  translate: -50% -50%;
  animation:
    hero calc(520ms * var(--k)) cubic-bezier(0.3, 1.5, 0.5, 1) calc(180ms * var(--k)) both,
    hero-away calc(380ms * var(--k)) ease-in calc(720ms * var(--k)) forwards;
}
.sl-stamp {
  transform-box: fill-box;
  transform-origin: center;
  animation: stamp calc(340ms * var(--k)) cubic-bezier(0.3, 1.6, 0.5, 1) calc(520ms * var(--k)) both;
}
@keyframes hero {
  from {
    scale: 0;
    rotate: -12deg;
    opacity: 0;
  }
  70% {
    rotate: 4deg;
  }
  to {
    scale: 1;
    rotate: 0deg;
    opacity: 1;
  }
}
@keyframes hero-away {
  to {
    translate: -50% calc(-50% - 24px);
    opacity: 0;
  }
}
@keyframes stamp {
  from {
    scale: 2.2;
    opacity: 0;
    rotate: -25deg;
  }
}
</style>
