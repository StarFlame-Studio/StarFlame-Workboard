<template>
  <span v-if="cardThemeMode === 'liquid'" ref="layer" aria-hidden="true"
    class="lg-layer" :style="{ '--lg-corners': corners, '--lg-filter': filter }" />
</template>

<script setup lang="ts">
import { computed, ref, watch, watchEffect } from 'vue'
import { cardThemeMode } from '@/lib/cardTheme'
import { acquireGlassFilter, supportsGlassSvgFilter } from '@/lib/glassFilter'
import { buildLiquidGlassMap, cssCorners, innerCorners, type LensBox } from '@/lib/liquidGlassMap'
import { liquidGlassConfig } from '@/lib/liquidGlassSettings'
import { observeResize, observeVisibility, unobserveResize, unobserveVisibility } from '@/lib/sharedObservers'

// PR #1 的折射层仍独立于卡片内容，贴图和裁剪都以这一层的布局尺寸为准。
// 浏览器直接取当前位置的页面背景。滚动、拖动和 hover 不需要重算屏幕坐标。
const layer = ref<HTMLElement | null>(null)
const box = ref<LensBox | null>(null)
const visible = ref(false)
const lens = ref<string>()
const svgSupported = typeof window !== 'undefined' && supportsGlassSvgFilter()

watch(layer, (el, _, cleanup) => {
  box.value = null
  visible.value = false
  const host = el?.parentElement
  if (!el || !host) return

  const measure = () => {
    // getComputedStyle 返回布局 CSS 像素，保留小数，避免混入 transform / CSS zoom。
    const style = getComputedStyle(el)
    const width = parseFloat(style.width)
    const height = parseFloat(style.height)
    box.value = width > 0 && height > 0
      ? { width, height, corners: innerCorners(getComputedStyle(host), width, height) }
      : null
  }
  measure()
  observeResize(el, measure)
  observeVisibility(el, (value) => {
    if (value) measure()
    visible.value = value
  }, '320px')
  cleanup(() => {
    unobserveVisibility(el)
    unobserveResize(el)
  })
}, { flush: 'post' })

const corners = computed(() => box.value ? cssCorners(box.value.corners) : undefined)
const props = defineProps<{ capsule?: boolean }>()
const blur = computed(() => {
  const { backdropBlur, pillBlur, displace } = liquidGlassConfig.value
  return Math.hypot(props.capsule ? pillBlur : backdropBlur, displace)
})
const filter = computed(() => {
  if (!visible.value) return 'none'
  return lens.value ?? ('blur(' + blur.value + 'px) saturate(' + liquidGlassConfig.value.saturation + ')')
})

watchEffect((cleanup) => {
  lens.value = undefined
  const geometry = box.value
  if (!svgSupported || !visible.value || !geometry) return
  const config = liquidGlassConfig.value
  const short = Math.min(geometry.width, geometry.height)
  const band = Math.min(short / 4, 28, Math.max(2.5, short * config.borderWidth * 0.5))
  const strength = Math.min(1.6, Math.abs(config.distortionScale) / 260)
  if (!strength) return
  const map = buildLiquidGlassMap(geometry, band, strength, config.refractBlur)
  if (!map) return
  const lease = acquireGlassFilter({
    map, width: geometry.width, height: geometry.height, blur: blur.value, saturation: config.saturation,
  })
  lens.value = 'url(#' + lease.id + ')'
  cleanup(lease.release)
}, { flush: 'post' })
</script>

<style>
.lg-layer {
  position: absolute;
  inset: 0;
  z-index: 0;
  display: block;
  box-sizing: border-box;
  pointer-events: none;
  border-radius: var(--lg-corners, inherit);
  /* 固定输出裁剪，防止合成器在放大、滚动或卡片变换时外露滤镜像素。 */
  clip-path: inset(0 round var(--lg-corners, 0px));
  -webkit-backdrop-filter: var(--lg-filter, none);
  backdrop-filter: var(--lg-filter, none);
}
</style>
