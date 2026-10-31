<!-- The app's capsule character (the same one that waves goodbye in LeaveDialog.vue), as the chatbot's face on Ask.
     mood: idle (resting; blinks once), thinking (bobs, thought dots), listening (looks up, "hearing" arcs), speaking
     (mouth moves, sound waves) or happy (one little bounce when an answer arrives). wave: an arm waves hello three times
     (the welcome screen). Moving moods only run while that thing is happening (waiting, listening, reading aloud).
     Decoration: aria-hidden; what it shows is always said in words nearby. Reduced motion: it stays still. -->
<script setup>
defineProps({
  mood: { type: String, default: 'idle' }, // 'idle' | 'thinking' | 'listening' | 'speaking' | 'happy'
  size: { type: Number, default: 44 },
  wave: { type: Boolean, default: false },
})
</script>

<template>
  <svg class="cb" :class="[`cb-${mood}`, { 'cb-waving': wave }]" :width="size" :height="size * 0.8" viewBox="0 0 120 96" aria-hidden="true" focusable="false">
    <defs>
      <clipPath :id="`cb-clip-${size}`"><rect x="22" y="30" width="76" height="38" rx="19" /></clipPath>
    </defs>
    <ellipse class="shadow" cx="60" cy="86" rx="30" ry="4" />
    <!-- Thinking: three dots rising from the top corner -->
    <g class="dots"><circle cx="96" cy="22" r="3" /><circle cx="104" cy="13" r="4" /><circle cx="114" cy="4" r="3.5" /></g>
    <!-- Listening: arcs on the left, like sound coming in -->
    <g class="hear"><path d="M14 40 q-6 9 0 18" /><path d="M7 35 q-9 14 0 28" /></g>
    <!-- Speaking: arcs on the right, like sound going out -->
    <g class="talk"><path d="M106 40 q6 9 0 18" /><path d="M113 35 q9 14 0 28" /></g>
    <g class="body">
      <g transform="rotate(-14 60 49)">
        <!-- Waving hello: a resting arm on the left (like the goodbye one) and the waving arm on the right -->
        <g v-if="wave"><path class="limb" d="M30 62 L20 74" /><circle class="hand" cx="18" cy="77" r="4.5" /></g>
        <g v-if="wave" class="arm"><path class="limb" d="M97 44 L112 33" /><circle class="hand" cx="115" cy="31" r="4.5" /></g>
        <g :clip-path="`url(#cb-clip-${size})`">
          <rect class="half-a" x="22" y="30" width="38" height="38" /><rect class="half-b" x="60" y="30" width="38" height="38" />
          <rect class="gloss" x="30" y="35" width="60" height="6" rx="3" />
        </g>
        <g class="eyes"><circle cx="72" cy="45" r="3" /><circle cx="85" cy="45" r="3" /></g>
        <path class="smile" d="M71 53 Q78.5 59 86 53" />
        <ellipse class="mouth" cx="78.5" cy="55" rx="4" ry="3.2" />
        <circle class="cheek" cx="66" cy="52" r="2.8" /><circle class="cheek" cx="91" cy="52" r="2.8" />
      </g>
    </g>
  </svg>
</template>

<style scoped>
.cb { display: block; flex: none; overflow: visible; }
.cb * { transform-box: fill-box; transform-origin: center; }
.shadow { fill: rgba(0, 0, 0, 0.12); }
.half-a { fill: var(--color-primary); }
.half-b { fill: #f3d27a; }
.gloss { fill: #fff; opacity: 0.35; }
.eyes { fill: #2b2622; animation: blink 3.6s ease-in-out 1s 1; }
.smile { fill: none; stroke: #2b2622; stroke-width: 2.4; stroke-linecap: round; }
.mouth { fill: #2b2622; opacity: 0; }
.cheek { fill: #f08a7e; opacity: 0.5; }
.limb { fill: none; stroke: var(--color-text); stroke-width: 3; stroke-linecap: round; }
.hand { fill: #fffdfa; stroke: var(--color-text); stroke-width: 2; }
.dots circle { fill: var(--color-primary); opacity: 0; }
.hear path, .talk path { fill: none; stroke: var(--color-primary); stroke-width: 3; stroke-linecap: round; opacity: 0; }

/* Thinking: a gentle bob, the dots light up one after another. */
.cb-thinking .body { animation: bob 1.2s ease-in-out infinite; }
.cb-thinking .dots circle { animation: dot 1.2s ease-in-out infinite; }
.cb-thinking .dots circle:nth-child(2) { animation-delay: 0.2s; }
.cb-thinking .dots circle:nth-child(3) { animation-delay: 0.4s; }
.cb-thinking .eyes { transform: translate(1.5px, -2px); transition: transform 300ms ease; }

/* Listening: eyes up, arcs pulse in from the left. */
.cb-listening .eyes { transform: translate(-1px, -2px); transition: transform 300ms ease; }
.cb-listening .hear path { animation: arc 1s ease-out infinite; }
.cb-listening .hear path + path { animation-delay: 0.25s; }

/* Speaking: the smile becomes a moving mouth; waves go out on the right. */
.cb-speaking .smile { opacity: 0; }
.cb-speaking .mouth { opacity: 1; animation: talk 0.36s ease-in-out infinite alternate; }
.cb-speaking .talk path { animation: arc 0.9s ease-out infinite; }
.cb-speaking .talk path + path { animation-delay: 0.2s; }

/* Happy: one small bounce. */
.cb-happy .body { animation: hop 620ms var(--ease-spring) 1; }

/* Waving hello: three swings from the shoulder. */
.cb-waving .arm { transform-origin: 0% 100%; animation: wave 0.7s ease-in-out 0.4s 3; }

@keyframes blink { 0%, 92%, 100% { transform: scaleY(1); } 96% { transform: scaleY(0.1); } }
@keyframes bob { 50% { transform: translateY(-3px); } }
@keyframes dot { 0%, 100% { opacity: 0.15; } 50% { opacity: 0.9; } }
@keyframes arc { from { opacity: 0.9; } to { opacity: 0; } }
@keyframes talk { from { transform: scaleY(0.35); } to { transform: scaleY(1); } }
@keyframes hop { 40% { transform: translateY(-7px); } }
@keyframes wave { 50% { transform: rotate(-32deg); } }
@media (prefers-reduced-motion: reduce) {
  .cb *, .cb { animation: none !important; }
  .cb-thinking .dots circle { opacity: 0.6; }
  .cb-speaking .talk path, .cb-listening .hear path { opacity: 0.6; }
}
</style>
