<template>
  <span class="hand-label">
    <slot />
    <svg
      class="hand-line"
      viewBox="0 0 100 14"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M3 8.5 C 26 3, 55 13.5, 97 6"
        fill="none"
        stroke="currentColor"
        stroke-width="3"
        stroke-linecap="round"
        vector-effect="non-scaling-stroke"
      />
    </svg>
  </span>
</template>

<style>
.hand-label {
  position: relative;
  display: inline-block;
}
.hand-line {
  position: absolute;
  left: 0;
  top: calc(100% - 1px);
  width: 100%;
  height: 14px;
  overflow: visible;
  pointer-events: none;
  clip-path: inset(0 50% 0 50%);
  transition: clip-path 250ms cubic-bezier(0.65, 0, 0.35, 1);
}
/* Pressed and keyboard focus everywhere; hover only where there is a real mouse (touch fires hover on a tap and leaves it stuck). */
:is(.cta, .big-cta):is(:focus-visible, :active) .hand-line {
  clip-path: inset(0 0 0 0);
  transition-duration: 350ms;
  transition-timing-function: cubic-bezier(0.23, 1, 0.32, 1);
}
@media (hover: hover) and (pointer: fine) {
  :is(.cta, .big-cta):hover .hand-line {
    clip-path: inset(0 0 0 0);
    transition-duration: 350ms;
    transition-timing-function: cubic-bezier(0.23, 1, 0.32, 1);
  }
}
/* Less motion: nothing sweeps; the line just fades in and out. */
@media (prefers-reduced-motion: reduce) {
  .hand-line {
    clip-path: none;
    opacity: 0;
    transition: opacity 120ms ease-out;
  }
  :is(.cta, .big-cta):is(:focus-visible, :active) .hand-line {
    opacity: 1;
  }
}
@media (prefers-reduced-motion: reduce) and (hover: hover) and (pointer: fine) {
  :is(.cta, .big-cta):hover .hand-line {
    opacity: 1;
  }
}
</style>
