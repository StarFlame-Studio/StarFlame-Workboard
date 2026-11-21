<template>
  <teleport to="body">
    <div v-if="modelValue" :class="['tutorial-root', { 'is-dark': isDark }]" @keydown="onKeydown">
      <!-- 高亮遮罩：一个超大的 box-shadow 把四周压暗，中间留出被讲解的元素 -->
      <div v-if="rect" :class="['tutorial-spotlight', { 'is-soft': current.softMask }]" :style="spotlightStyle" />

      <div ref="cardEl" :class="['tutorial-card', rect ? 'is-anchored' : 'is-centered']" :style="cardStyle">
        <div class="tutorial-head">
          <v-icon class="tutorial-icon" color="primary" size="22">{{ current.icon }}</v-icon>
          <span class="tutorial-title">{{ current.title }}</span>
          <span class="tutorial-count">{{ index + 1 }} / {{ steps.length }}</span>
        </div>
        <p class="tutorial-body">{{ current.body }}</p>

        <!-- 需要动手的步骤：不给「下一步」，等用户真的做完动作再自动前进 -->
        <div v-if="current.action" class="tutorial-doing">
          <v-icon class="tutorial-doing-icon" color="primary" size="18">mdi-gesture-tap-button</v-icon>
          <span>{{ current.actionHint }}</span>
          <v-progress-circular class="ml-2" color="primary" indeterminate size="14" width="2" />
        </div>

        <div class="tutorial-actions">
          <v-btn class="text-medium-emphasis" size="small" variant="text" @click="skip">跳过教程</v-btn>
          <v-spacer />
          <template v-if="current.action">
            <v-btn class="text-medium-emphasis" size="small" variant="text" @click="skipStep">跳过这一步</v-btn>
          </template>
          <template v-else>
            <v-btn v-if="index > 0" variant="tonal" @click="prev">上一步</v-btn>
            <v-btn v-if="!isLast" color="primary" variant="elevated" @click="next">下一步</v-btn>
            <v-btn v-else color="primary" prepend-icon="mdi-check" variant="elevated" @click="finish">我知道了</v-btn>
          </template>
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
 * 说明卡片自动放在目标附近（空间不够时换位置）。
 *
 * 「跟着做」的步骤带 action：不给「下一步」按钮，而是由看板页在用户真的完成操作后
 * 调用 notifyAction() 推进，因此用户是先动手练一遍再进入下一步。
 *
 * 找不到目标元素时退化为居中卡片，教程依然能走完 —— 例如设备是只读模式、
 * 当天所有科目都还没作业、页面结构被精简时。
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { BASIC_TUTORIAL_STEPS, type TutorialActionId, type TutorialStep } from '@/lib/tutorial'

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
/** 说明卡片本身（真实的 DOM 高度比估算值准，用来避免卡片被挤到屏幕外） */
const cardEl = ref<HTMLElement | null>(null)
/**
 * 浮层被 teleport 到 body，脱离了 .v-theme--dark 的 DOM 作用域，
 * 所以卡片配色要自己判断当前是不是暗色主题。
 */
const isDark = ref(false)

const CARD_WIDTH = 460
const CARD_GAP = 18
/** 卡片估算高度：只用于判断目标下方放不放得下，宁大勿小 */
const CARD_ESTIMATED_HEIGHT = 220
/** 目标在可视区外时只自动滚动一次，避免轮询里反复滚动抖动 */
let scrolledFor = ''
/** 轮询测量：页面内容会变（打开编辑窗口、日历弹出），需要让高亮框跟着走 */
let pollTimer: number | null = null
let advanceTimer: number | null = null

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

/** 卡片实际高度（布局像素）；还没渲染出来时退回估算值 */
function cardHeight(): number {
  const el = cardEl.value
  const measured = el ? el.offsetHeight : 0
  return measured > 0 ? measured : CARD_ESTIMATED_HEIGHT
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
  if (current.value.cardPlacement === 'top') {
    // 目标下方会弹出面板（例如日历）时，卡片固定贴到屏幕顶部，别挡住面板
    cardStyle.value = { left: left + 'px', width: width + 'px', top: '12px' }
    return
  }
  const cardH = cardHeight()
  const spaceBelow = viewportH - target.top - target.height
  const spaceAbove = target.top
  const need = cardH + CARD_GAP
  if (spaceBelow >= need) {
    // 目标下方放得下
    cardStyle.value = {
      left: left + 'px',
      width: width + 'px',
      top: target.top + target.height + CARD_GAP + 'px',
    }
    return
  }
  if (spaceAbove >= need) {
    // 翻到目标上方
    cardStyle.value = {
      left: left + 'px',
      width: width + 'px',
      bottom: viewportH - target.top + CARD_GAP + 'px',
    }
    return
  }
  // 目标几乎占满整屏（例如编辑窗口里的输入区）：卡片压到屏幕底部，别跑出可视区
  cardStyle.value = {
    left: left + 'px',
    width: width + 'px',
    top: Math.max(12, viewportH - cardH - 12) + 'px',
  }
}

interface ResolvedTarget {
  el: HTMLElement
  closest?: string
}

/**
 * 找到这一步要高亮的元素。
 * 顺序：展开后的浮层（openSelector）→ targets 候选列表 → selector → fallbackSelector。
 * targets 是为了同一个操作在不同设置下形态不同（有作业的卡片 / 空科目按钮 / 空科目卡片 / 手机端按钮）时都能指对。
 */
function resolveTarget(): ResolvedTarget | null {
  const step = current.value
  if (step.openSelector) {
    const opened = document.querySelector<HTMLElement>(step.openSelector)
    if (opened) return { el: opened }
  }
  for (const target of step.targets ?? []) {
    const el = document.querySelector<HTMLElement>(target.selector)
    if (el) return { el, closest: target.closest ?? step.highlightClosest }
  }
  if (step.selector) {
    const el = document.querySelector<HTMLElement>(step.selector)
    if (el) return { el, closest: step.highlightClosest }
  }
  if (step.fallbackSelector) {
    const el = document.querySelector<HTMLElement>(step.fallbackSelector)
    if (el) return { el, closest: step.highlightClosest }
  }
  return null
}

async function measure(): Promise<void> {
  if (!props.modelValue) return
  const step = current.value
  const resolved = resolveTarget()
  if (!resolved) {
    rect.value = null
    cardStyle.value = {}
    return
  }
  const target = (resolved.closest ? resolved.el.closest<HTMLElement>(resolved.closest) : null) ?? resolved.el
  const box = target.getBoundingClientRect()
  if (box.width < 2 || box.height < 2) {
    rect.value = null
    cardStyle.value = {}
    return
  }
  // 目标可能在可视区外（例如下方空闲科目区），先滚进来再重新测量
  if ((box.top < 8 || box.bottom > window.innerHeight - 8) && scrolledFor !== step.id) {
    scrolledFor = step.id
    target.scrollIntoView({ block: 'center', behavior: 'smooth' })
    window.setTimeout(() => {
      if (props.modelValue) void measure()
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

/** 跳过当前这一步（只用于「跟着做」的步骤，避免只读设备上卡住） */
function skipStep(): void {
  next()
}

/**
 * 看板页在用户完成动作后调用；只有和当前步骤要求的动作一致才前进。
 * 稍微延迟一点，让用户先看到自己的操作确实生效了。
 */
function notifyAction(action: TutorialActionId): void {
  if (!props.modelValue) return
  if (current.value.action !== action) return
  if (advanceTimer !== null) return
  advanceTimer = window.setTimeout(() => {
    advanceTimer = null
    if (!props.modelValue) return
    if (current.value.action === action) next()
  }, 260)
}

defineExpose({ notifyAction })

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
  // 编辑窗口打开时键盘交给窗口自己（Esc 关窗口、回车换行），教程不抢键
  if (document.querySelector('[data-tutorial-anchor="hw-dialog"]')) return
  const target = event.target as HTMLElement | null
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
  if (event.key === 'Escape') {
    skip()
    return
  }
  if (current.value.action) return
  if (event.key === 'ArrowRight' || event.key === 'Enter') {
    event.preventDefault()
    next()
  }
  if (event.key === 'ArrowLeft') {
    event.preventDefault()
    prev()
  }
}

function startPolling(): void {
  stopPolling()
  pollTimer = window.setInterval(() => void measure(), 500)
}

function stopPolling(): void {
  if (pollTimer !== null) {
    window.clearInterval(pollTimer)
    pollTimer = null
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
      scrolledFor = ''
      window.addEventListener('resize', onResize)
      window.addEventListener('keydown', onKeydown)
      startPolling()
      void measure()
    } else {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('keydown', onKeydown)
      stopPolling()
      if (advanceTimer !== null) {
        window.clearTimeout(advanceTimer)
        advanceTimer = null
      }
      rect.value = null
      cardStyle.value = {}
    }
  },
)

watch(index, () => {
  void nextTick().then(() => measure())
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize)
  window.removeEventListener('keydown', onKeydown)
  stopPolling()
  if (advanceTimer !== null) window.clearTimeout(advanceTimer)
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

/* 编辑窗口里的步骤：遮罩淡一些，别把要操作的窗口压得看不清 */
.tutorial-spotlight.is-soft {
  box-shadow: 0 0 0 9999px rgba(15, 12, 10, 0.34);
  border-radius: 12px;
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
  margin: 10px 0 12px;
  font-size: 15px;
  line-height: 1.75;
  color: var(--text-2, #5b5049);
}

.tutorial-doing {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 12px;
  padding: 9px 12px;
  border-radius: 12px;
  background: var(--brand-soft, #fff1e4);
  color: var(--brand-2, #f4511e);
  font-size: 14px;
  font-weight: 600;
}

.tutorial-doing-icon {
  flex: none;
  animation: tutorial-nudge 1.6s ease-in-out infinite;
}

@keyframes tutorial-nudge {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-2px);
  }
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

.tutorial-root.is-dark .tutorial-doing {
  background: rgba(255, 138, 31, 0.16);
  color: #ffab5e;
}
</style>
