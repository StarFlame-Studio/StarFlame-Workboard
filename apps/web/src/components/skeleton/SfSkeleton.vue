<template>
  <div class="sf-skel-stack" :style="{ gap: gapStyle }">
    <span
      v-for="i in count"
      :key="i"
      :class="['sf-skel', shapeClass]"
      :style="blockStyle(i)"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

/**
 * 通用微光骨架块。
 * 宽高支持数字（px）与字符串（% / rem / vw 等）。
 */
const props = withDefaults(
  defineProps<{
    /** 宽度 */
    w?: string | number
    /** 高度 */
    h?: string | number
    /** 圆角（数字按 px） */
    radius?: string | number
    /** 圆形（头像 / 图标占位） */
    circle?: boolean
    /** 文本行（细、小圆角） */
    text?: boolean
    /** 胶囊（chip 占位） */
    pill?: boolean
    /** 卡片（用页面卡片圆角） */
    card?: boolean
    /** 数量：>1 时纵向堆叠 */
    count?: number
    /** 堆叠间距（px） */
    gap?: number
  }>(),
  {
    w: '100%',
    h: 14,
    radius: undefined,
    circle: false,
    text: false,
    pill: false,
    card: false,
    count: 1,
    gap: 10,
  },
)

const gapStyle = computed(() => `${props.gap}px`)

const shapeClass = computed(() => [
  props.circle ? 'sf-skel--circle' : '',
  props.pill ? 'sf-skel--pill' : '',
  props.card ? 'sf-skel--card' : '',
  props.text ? 'sf-skel--text' : '',
])

function size(value: string | number | undefined): string | undefined {
  if (value === undefined) return undefined
  return typeof value === 'number' ? `${value}px` : value
}

function blockStyle(index: number): Record<string, string> {
  const style: Record<string, string> = {}
  const width = size(props.w)
  const height = size(props.h)
  const radius = size(props.radius)
  // 文本块多行时最后一行收窄一点，更像真实段落
  if (props.text && props.count > 1 && index === props.count) {
    style.width = typeof props.w === 'number' ? `${Math.round(props.w * 0.62)}px` : '62%'
  } else if (width) {
    style.width = width
  }
  if (height) style.height = height
  if (radius) style.borderRadius = radius
  return style
}
</script>