<template>
  <div ref="wrap" class="sf-marquee" :class="{ 'is-scrolling': scrolling }">
    <div ref="inner" class="sf-marquee__inner" :style="innerStyle">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

/**
 * 单行文本容器：内容放不下时自动做「往返滚动」（marquee），
 * 放得下则安静显示。宽度或内容变化时会自动重新测量。
 */
const wrap = ref<HTMLElement | null>(null)
const inner = ref<HTMLElement | null>(null)
const overflow = ref(0)
const duration = ref(20)

const scrolling = computed(() => overflow.value > 4)
const innerStyle = computed(() => ({
  '--shift': -overflow.value + 'px',
  '--dur': duration.value + 's',
}))

function measure(): void {
  const w = wrap.value
  const i = inner.value
  if (!w || !i) return
  const diff = Math.ceil(i.scrollWidth - w.clientWidth)
  overflow.value = diff > 0 ? diff : 0
  // 约 20px/秒的匀速位移（位移占动画时长约 55%），长文本也保持从容
  duration.value = Math.min(60, Math.max(14, 12 + diff / 14))
}

let ro: ResizeObserver | undefined
let mo: MutationObserver | undefined

onMounted(() => {
  measure()
  if (typeof ResizeObserver !== 'undefined' && wrap.value) {
    ro = new ResizeObserver(() => measure())
    ro.observe(wrap.value)
  }
  if (typeof MutationObserver !== 'undefined' && inner.value) {
    mo = new MutationObserver(() => measure())
    mo.observe(inner.value, { childList: true, characterData: true, subtree: true })
  }
})

onBeforeUnmount(() => {
  ro?.disconnect()
  mo?.disconnect()
})
</script>

<style scoped>
.sf-marquee {
  overflow: hidden;
  min-width: 0;
  flex: 1 1 auto;
}

.sf-marquee__inner {
  display: flex;
  align-items: center;
  width: max-content;
  max-width: none;
  white-space: nowrap;
  will-change: transform;
}

.sf-marquee.is-scrolling .sf-marquee__inner {
  animation: sf-marquee-scroll var(--dur, 20s) linear infinite;
}

.sf-marquee.is-scrolling:hover .sf-marquee__inner {
  animation-play-state: paused;
}

@keyframes sf-marquee-scroll {
  0%,
  10% {
    transform: translateX(0);
  }
  45%,
  55% {
    transform: translateX(var(--shift, 0));
  }
  90%,
  100% {
    transform: translateX(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .sf-marquee.is-scrolling .sf-marquee__inner {
    animation: none;
  }
}
</style>
