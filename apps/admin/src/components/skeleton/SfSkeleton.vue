<template>
  <div v-if="count > 1" class="sf-skel-stack" :style="stackStyle" role="status" aria-busy="true" aria-label="加载中">
    <span v-for="i in count" :key="i" class="sf-skel" :class="shapeClass" :style="blockStyle" />
  </div>
  <span v-else class="sf-skel" :class="shapeClass" :style="blockStyle" role="status" aria-busy="true" aria-label="加载中" />
</template>

<script setup lang="ts">
import { computed } from 'vue'

/**
 * 微光骨架基础块：尺寸 / 圆角全部内联，形状由变体类控制。
 * 颜色统一走 styles/skeleton.css 的 --skel-* 变量（亮/暗两套自动切换）。
 */
const props = withDefaults(
  defineProps<{
    /** 宽度：数字按 px 处理，字符串原样透传（如 '60%'） */
    w?: string | number
    /** 高度：数字按 px 处理 */
    h?: string | number
    /** 圆角：数字按 px 处理 */
    radius?: string | number
    /** 圆形（头像 / 图标占位），只给 w 时高度自动跟随 */
    circle?: boolean
    /** 文本条：默认高 0.8em、圆角 6px */
    text?: boolean
    /** 胶囊（标签 / 徽章占位） */
    pill?: boolean
    /** 卡片块（大圆角） */
    card?: boolean
    /** 重复块数量，>1 时外层套 .sf-skel-stack */
    count?: number
    /** count > 1 时的列间距 */
    gap?: string | number
  }>(),
  { count: 1 },
)

/** 数字统一转 px，字符串保持原样（支持 % / rem / auto） */
function toSize(value: string | number | undefined): string | undefined {
  if (value === undefined || value === '') return undefined
  return typeof value === 'number' ? `${value}px` : value
}

const shapeClass = computed(() => ({
  'sf-skel--circle': props.circle === true,
  'sf-skel--text': props.text === true,
  'sf-skel--pill': props.pill === true,
  'sf-skel--card': props.card === true,
}))

const blockStyle = computed<Record<string, string>>(() => {
  const style: Record<string, string> = {}
  const width = toSize(props.w)
  const height = toSize(props.h)
  const radius = toSize(props.radius)
  if (width) style.width = width
  // 圆形只给宽度时，高度跟随宽度，保证是正圆
  if (height) {
    style.height = height
  } else if (props.circle === true && width) {
    style.height = width
  }
  if (radius) style.borderRadius = radius
  return style
})

const stackStyle = computed<Record<string, string>>(() => {
  const style: Record<string, string> = {}
  const gap = toSize(props.gap)
  if (gap) style['--skel-stack-gap'] = gap
  return style
})
</script>
