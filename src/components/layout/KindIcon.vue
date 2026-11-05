<!-- Small coloured icon that tells a medicine label from a bill. -->
<script setup>
import { computed } from 'vue'

const props = defineProps({
  kind: { type: String, required: true }, // 'medication' | 'bill'
  size: { type: [Number, String], default: 'var(--tile-lg)' },
})
const style = computed(() => ({
  '--kind-size': typeof props.size === 'number' ? `${props.size}px` : props.size,
}))
</script>

<template>
  <span
    class="kind"
    :class="kind === 'bill' ? 'kind-bill' : 'kind-med'"
    :style="style"
    aria-hidden="true"
  >
    <svg v-if="kind === 'bill'" viewBox="0 0 48 48" focusable="false">
      <!-- The paper, its torn bottom edge, a blue header strip, three lines of charges, and a green dollar for the total. -->
      <path class="paper" d="M12 6h24v34l-3 2.5-3-2.5-3 2.5-3-2.5-3 2.5-3-2.5-3 2.5-3-2.5z" />
      <rect class="band" x="13" y="7" width="22" height="5" rx="1" />
      <rect class="line" x="16" y="16" width="16" height="2.6" rx="1.3" />
      <rect class="line" x="16" y="21.5" width="12" height="2.6" rx="1.3" />
      <rect class="line" x="16" y="27" width="8" height="2.6" rx="1.3" />
      <circle class="coin" cx="31" cy="32" r="6.5" />
      <path
        class="dollar"
        d="M33.2 29.4c-.5-.8-1.3-1.1-2.2-1.1-1.3 0-2.2.7-2.2 1.7 0 2.3 4.6 1.2 4.6 3.6 0 1.1-1 1.8-2.4 1.8-1 0-1.9-.4-2.4-1.2M31 27.2v1.1M31 35.4v1.1"
      />
    </svg>
    <svg v-else viewBox="0 0 48 48" focusable="false">
      <!-- A capsule lying at an angle: a red half and a cream half, a seam, and a shine along the top. -->
      <g transform="rotate(-40 24 24)">
        <path class="half-red" d="M24 15h-8a9 9 0 0 0 0 18h8z" />
        <path class="half-cream" d="M24 15h8a9 9 0 0 1 0 18h-8z" />
        <rect class="outline" x="7" y="15" width="34" height="18" rx="9" />
        <path class="seam" d="M24 15v18" />
        <rect class="shine" x="11" y="18" width="10" height="3" rx="1.5" />
        <rect class="shine" x="27" y="18" width="9" height="3" rx="1.5" />
      </g>
    </svg>
  </span>
</template>

<style scoped>
.kind {
  --tile-bg: #fde9e4;
  flex: none;
  display: grid;
  place-items: center;
  width: var(--kind-size);
  height: var(--kind-size);
  border-radius: calc(var(--kind-size) * 0.3);
  background: var(--tile-bg);
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.06);
}
.kind-bill {
  --tile-bg: #e6effa;
}
/* The same light tiles in night mode: like a sticker on the dark card, they stand out more, which helps tired eyes. */
svg {
  display: block;
  width: 78%;
  height: 78%;
  overflow: visible;
}

/* The capsule: the same in day and night (it is a picture of a real thing). */
.half-red {
  fill: #e2533c;
}
.half-cream {
  fill: #fff3d6;
}
.outline,
.seam {
  fill: none;
  stroke: #8a2c1a;
  stroke-width: 2;
}
.seam {
  stroke-width: 1.6;
}
.shine {
  fill: #fff;
  opacity: 0.55;
}

/* The bill. */
.paper {
  fill: #fff;
  stroke: #4b5a69;
  stroke-width: 2;
  stroke-linejoin: round;
}
.band {
  fill: #3a7bc8;
}
.line {
  fill: #b9c2cc;
}
.coin {
  fill: #1e9a57;
  stroke: #fff;
  stroke-width: 1.5;
}
.dollar {
  fill: none;
  stroke: #fff;
  stroke-width: 1.7;
  stroke-linecap: round;
  stroke-linejoin: round;
}
</style>
