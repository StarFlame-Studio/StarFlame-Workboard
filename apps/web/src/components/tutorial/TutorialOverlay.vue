<template>
  <teleport to="body">
    <div v-if="modelValue" :class="['tutorial-root', { 'is-dark': isDark }]" @keydown="onKeydown">
      <!-- 高亮遮罩：一个超大的 box-shadow 把四周压暗，中间留出被讲解的元素 -->
      <div v-if="rect" class="tutorial-spotlight" :style="spotlightStyle" />

      <div :class="['tutorial-card', rect ? 'is-anchored' : 'is-centered']" :style="cardStyle">
        <div class="tutorial-head">
          <v-icon class="tutorial-icon" color="primary" size="22">{{ current.icon }}</v-icon>
          <span class="tutorial-title">{{ current.title }}</span>
          <span class="tutorial-count">{{ index + 1 }} / {{ steps.length }}</span>
        </div>
        <p class="tutorial-body">{{ current.body }}</p>
        <div class="tutorial-actions">
          <v-btn class="text-medium-emphasis" variant="text" @click="skip">跳过教程</v-btn>
          <v-spacer />
          <v-btn v-if="index > 0" variant="tonal" @click="prev">上一步</v-btn>
          <v-btn v-if="!isLast" color="primary" variant="elevated" @click="next">下一步</v-btn>
          <v-btn v-else color="primary" prepend-icon="mdi-check" variant="elevated" @click="finish">我知道了</v-btn>
        </div>
      </div>
    </div>
  </teleport>
</template>

<script setup lang="ts">
/**
 * 引导式教程浮层（基础版）。
 *
 * 每一步用 selector 指到看板上真实存在的元素，浮层把该元素框出来并压暗其余区域，
 * 说明卡片自动放在目标下方（空间不够时放上方）。找不到目标元素时退化为居中卡片，
 * 教程依然能走完 —— 例如当天所有科目都还没作业、页面结构被精简时。
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { BASIC_TUTORIAL_STEPS, type TutorialStep } from '@/lib/tutorial'

const props = withDefaults(defineProps<{ modelValue: boolean; steps?: TutorialStep[] }>(), {
  modelValue: false,
  steps: () => BASIC_TUTORIAL_STEPS,
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  finish: []
}>()

const steps = computed(() => (props.steps.length > 0 ? props.steps : BASIC_TUTORIAL_STEPS))
const index = ref(0)
const current = computed<TutorialStep>(() => steps.value[Math.min(index.value, steps.value.length - 1)]!)
const isLast = computed(() => index.value >= steps.value.length - 1)

interface Box {
  top: number
  left: number
  width: number
  height: number
}

const rect = ref<Box | null>(null)
const cardStyle = ref<Record<string, string>>({})
/**
 * 浮层被 teleport 到 body，脱离了 .v-theme--dark 的 DOM 作用域，
 * 所以卡片配色要自己判断当前是不是暗色主题。
 */
const isDark = ref(false)

const CARD_WIDTH = 460
const CARD_GAP = 18
/** 卡片估算高度：只用于判断目标下方放不放得下，宁大勿小 */
const CARD_ESTIMATED_HEIGHT = 220

/**
 * 桌面端（逻辑宽度 ≥960px）整站给 html 加了 zoom: 1.15。
 * getBoundingClientRect() 返回的是缩放后的像素，而浮层里 position: fixed 的 top/left
 * 仍会被 zoom 再放大一次 —— 直接套用会让高亮框整体偏大 15%、往右下偏移。
 * 用一个已知布局宽度的探针元素反推缩放倍率，把坐标统一折算回布局（CSS）像素。
 */
const PROBE_WIDTH = 1000

function zoomScale(): number {
  const probe = document.createElement('div')
  probe.style.cssText =
    'position:fixed;top:0;left:0;width:' + PROBE_WIDTH + 'px;height:1px;visibility:hidden;pointer-events:none'
  document.body.appendChild(probe)
  const rendered = probe.getBoundingClientRect().width
  probe.remove()
  return rendered > 0 ? rendered / PROBE_WIDTH : 1
}

const spotlightStyle = computed<Record<string, string>>(() => {
  const box = rect.value
  if (!box) return {} as Record<string, string>
  const scale = zoomScale()
  return {
    top: box.top / scale + 'px',
    left: box.left / scale + 'px',
    width: box.width / scale + 'px',
    height: box.height / scale + 'px',
  }
})

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** 把说明卡片摆到目标附近；下方空间不够就翻到上方（坐标同样折算回布局像素） */
function placeCard(box: Box): void {
  const scale = zoomScale()
  const viewportW = window.innerWidth / scale
  const viewportH = window.innerHeight / scale
  const target = {
    top: box.top / scale,
    left: box.left / scale,
    width: box.width / scale,
    height: box.height / scale,
  }
  const width = Math.min(CARD_WIDTH, viewportW - 24)
  const left = clamp(
    target.left + target.width / 2 - width / 2,
    12,
    Math.max(12, viewportW - width - 12),
  )
  const spaceBelow = viewportH - target.top - target.height
  if (spaceBelow >= CARD_ESTIMATED_HEIGHT + CARD_GAP) {
    cardStyle.value = {
      left: left + 'px',
      width: width + 'px',
      top: target.top + target.height + CARD_GAP + 'px',
    }
  } else {
    cardStyle.value = {
      left: left + 'px',
      width: width + 'px',
      bottom: viewportH - target.top + CARD_GAP + 'px',
    }
  }
}

async function measure(): Promise<void> {
  rect.value = null
  cardStyle.value = {}
  if (!props.modelValue) return
  await nextTick()
  const step = current.value
  const selector = step.selector
  if (!selector) return
  const found = document.querySelector<HTMLElement>(selector)
  if (!found) return
  const target = (step.highlightClosest ? found.closest<HTMLElement>(step.highlightClosest) : null) ?? found
  const box = target.getBoundingClientRect()
  if (box.width < 2 || box.height < 2) return
  // 目标可能在可视区外（例如下方空闲科目区），先滚进来再重新测量
  if (box.top < 8 || box.bottom > window.innerHeight - 8) {
    target.scrollIntoView({ block: 'center', behavior: 'smooth' })
    window.setTimeout(() => {
      if (!props.modelValue) return
      const again = target.getBoundingClientRect()
      rect.value = { top: again.top, left: again.left, width: again.width, height: again.height }
      placeCard(rect.value)
    }, 320)
    return
  }
  rect.value = { top: box.top, left: box.left, width: box.width, height: box.height }
  placeCard(rect.value)
}

function next(): void {
  if (isLast.value) {
    finish()
    return
  }
  index.value += 1
}

function prev(): void {
  if (index.value === 0) return
  index.value -= 1
}

function close(finished: boolean): void {
  emit('update:modelValue', false)
  if (finished) emit('finish')
}

function skip(): void {
  close(true)
}

function finish(): void {
  close(true)
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    skip()
    return
  }
  if (event.key === 'ArrowRight' || event.key === 'Enter') {
    event.preventDefault()
    next()
  }
  if (event.key === 'ArrowLeft') {
    event.preventDefault()
    prev()
  }
}

function onResize(): void {
  void measure()
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      isDark.value = Boolean(document.querySelector('.v-theme--dark'))
      index.value = 0
      window.addEventListener('resize', onResize)
      window.addEventListener('keydown', onKeydown)
      void measure()
    } else {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('keydown', onKeydown)
      rect.value = null
      cardStyle.value = {}
    }
  },
)

watch(index, () => {
  void measure()
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize)
  window.removeEventListener('keydown', onKeydown)
})
</script>

<style scoped>
.tutorial-root {
  position: fixed;
  inset: 0;
  z-index: 3200;
  pointer-events: none;
}

.tutorial-spotlight {
  position: absolute;
  border: 3px solid var(--brand-1, #ff8a1f);
  border-radius: 18px;
  box-shadow: 0 0 0 9999px rgba(15, 12, 10, 0.66);
  transition:
    top 0.25s ease,
    left 0.25s ease,
    width 0.25s ease,
    height 0.25s ease;
  pointer-events: none;
}

.tutorial-card {
  position: absolute;
  pointer-events: auto;
  padding: 18px 20px 16px;
  border-radius: 18px;
  background: var(--bg-card, #ffffff);
  border: 1px solid var(--border, #efeae4);
  box-shadow: 0 18px 48px rgba(15, 12, 10, 0.28);
  animation: tutorial-pop 0.22s ease;
}

.tutorial-card.is-centered {
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: min(460px, calc(100vw - 24px));
}

.tutorial-card.is-anchored {
  transform: none;
}

@keyframes tutorial-pop {
  from {
    opacity: 0;
    transform: scale(0.97);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

.tutorial-card.is-centered {
  animation: tutorial-pop-centered 0.22s ease;
}

@keyframes tutorial-pop-centered {
  from {
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.97);
  }
  to {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
  }
}

.tutorial-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.tutorial-icon {
  flex: none;
}

.tutorial-title {
  font-size: 17px;
  font-weight: 700;
  color: var(--text-1, #2b241f);
}

.tutorial-count {
  margin-left: auto;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--text-3, #9c9188);
}

.tutorial-body {
  margin: 10px 0 14px;
  font-size: 15px;
  line-height: 1.75;
  color: var(--text-2, #5b5049);
}

.tutorial-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

@media (max-width: 600px) {
  .tutorial-body {
    font-size: 14px;
  }
}

.tutorial-root.is-dark .tutorial-card {
  background: #241f1b;
  border-color: rgba(255, 255, 255, 0.12);
}

.tutorial-root.is-dark .tutorial-title {
  color: #f5efe9;
}

.tutorial-root.is-dark .tutorial-body {
  color: #cfc4ba;
}

.tutorial-root.is-dark .tutorial-count {
  color: #9a8d82;
}
</style>
