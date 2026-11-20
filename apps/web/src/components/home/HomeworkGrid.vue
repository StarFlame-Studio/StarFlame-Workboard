<template>
  <div
    ref="gridContainer"
    :class="{
      'grid-masonry': true,
      'no-card-hover': !cardHoverEffect,
      'enhanced-touch': enhancedTouch,
      'fixed-rows': !dynamicSort,
    }"
  >
    <TransitionGroup name="grid">
      <div
        v-for="item in sortedItems"
        :key="item.key"
        ref="items"
        :data-key="item.key"
        :style="{ order: item.order }"
        class="grid-item"
      >
        <div v-if="item.type === 'time'" class="grid-item-inner">
          <time-card :bell="bell" :use12h="clock12h" :weekly="weekly" />
        </div>

        <div v-else-if="item.type === 'hitokoto'" class="grid-item-inner">
          <hitokoto-card />
        </div>

        <div v-else-if="item.type === 'exam' && examOf(item)" class="grid-item-inner">
          <concise-exam-card :content-style="contentStyle" :exam="examOf(item)!" :subjects="subjects" @open="$emit('open-exam', $event)" />
        </div>

        <v-card
          v-else-if="item.type === 'attendance'"
          :class="{
            'glow-highlight': highlightedCards[item.key],
            'cursor-not-allowed': isEditingDisabled,
            'cursor-pointer': !isEditingDisabled,
          }"
          border
          class="glow-track grid-item-inner"
          @click="handleCardClick('attendance')"
          @mousemove="handleMouseMove"
          @touchmove="handleTouchMove"
        >
          <v-card-title class="d-flex align-center">
            <v-icon class="mr-2" color="primary" icon="mdi-account-group" />
            出勤统计
          </v-card-title>
          <v-card-text v-if="item.data">
            <div class="d-flex justify-space-between align-center mb-2">
              <span>应到/实到</span>
              <span class="text-h6">{{ item.data.present }}/{{ item.data.total }}</span>
            </div>
            <v-divider class="mb-2" />
            <div v-if="item.data.absent > 0" class="mb-2">
              <div class="text-error text-caption mb-1">请假 ({{ item.data.absent }})</div>
            </div>
            <div v-if="item.data.late > 0" class="mb-2">
              <div class="text-warning text-caption mb-1">迟到 ({{ item.data.late }})</div>
            </div>
            <div v-if="item.data.absent === 0 && item.data.late === 0" class="text-success text-center mt-2">
              全勤
            </div>
          </v-card-text>
        </v-card>

        <v-card
          v-else
          :class="{
            'glow-highlight': highlightedCards[item.key],
            'cursor-not-allowed': isEditingDisabled,
            'cursor-pointer': !isEditingDisabled,
          }"
          border
          class="glow-track grid-item-inner"
          rounded="xl"
          @click="handleCardClick('dialog', item.key)"
          @mousemove="handleMouseMove"
          @touchmove="handleTouchMove"
        >
          <v-card-title class="sf-subject-title">{{ item.name }}</v-card-title>
          <v-card-text class="sf-body" :style="contentStyle">
            <div v-for="(text, lineIndex) in splitPoint(item.content)" :key="lineIndex" class="sf-body-line">
              {{ text }}
            </div>
            <div v-if="splitPoint(item.content).length === 0" class="sf-body-empty">暂无作业，点击添加</div>
          </v-card-text>
        </v-card>
      </div>
    </TransitionGroup>
  </div>

  <div class="empty-subjects mt-4">
    <div v-if="isMobile" class="d-flex flex-wrap justify-center">
      <v-chip
        v-for="subject in unusedSubjects"
        :key="subject.id"
        class="ma-1"
        color="primary"
        variant="tonal"
        @click="handleCardClick('dialog', subject.id)"
      >
        <v-icon start size="small">{{ isReadOnly ? 'mdi-cancel' : 'mdi-plus' }}</v-icon>
        {{ subject.name }}
      </v-chip>
      <v-chip
        v-for="card in unusedCustom"
        :key="card.id"
        class="ma-1"
        color="primary"
        variant="tonal"
        @click="handleCardClick('dialog', 'custom-' + card.id)"
      >
        <v-icon start size="small">{{ isReadOnly ? 'mdi-cancel' : 'mdi-plus' }}</v-icon>
        {{ card.title }}
      </v-chip>
    </div>

    <template v-else-if="emptySubjectDisplay === 'button'">
      <div class="empty-buttons">
        <v-btn
          v-for="subject in unusedSubjects"
          :key="subject.id"
          class="empty-btn"
          rounded="pill"
          variant="tonal"
          @click="handleCardClick('dialog', subject.id)"
        >
          <v-icon start size="18">{{ isReadOnly ? 'mdi-cancel' : 'mdi-plus' }}</v-icon>
          {{ subject.name }}
        </v-btn>
        <v-btn
          v-for="card in unusedCustom"
          :key="card.id"
          class="empty-btn"
          rounded="pill"
          variant="tonal"
          @click="handleCardClick('dialog', 'custom-' + card.id)"
        >
          <v-icon start size="18">{{ isReadOnly ? 'mdi-cancel' : 'mdi-plus' }}</v-icon>
          {{ card.title }}
        </v-btn>
      </div>
    </template>

    <div v-else class="empty-subjects-grid">
      <TransitionGroup name="v-list">
        <v-card
          v-for="card in unusedCustom"
          :key="card.id"
          border
          class="empty-subject-card"
          rounded="xl"
          @click="handleCardClick('dialog', 'custom-' + card.id)"
        >
          <v-card-title class="sf-subject-title sf-subject-title--empty">{{ card.title }}</v-card-title>
          <v-card-text class="text-center">
            <template v-if="isReadOnly">
              <v-icon color="grey" size="small">mdi-cancel</v-icon>
              <div class="text-caption text-grey">暂无内容</div>
            </template>
            <template v-else>
              <v-icon color="grey" size="small">mdi-plus</v-icon>
              <div class="text-caption text-grey">点击编辑内容</div>
            </template>
          </v-card-text>
        </v-card>
        <v-card
          v-for="subject in unusedSubjects"
          :key="subject.id"
          border
          class="empty-subject-card"
          rounded="xl"
          @click="handleCardClick('dialog', subject.id)"
        >
          <v-card-title class="sf-subject-title sf-subject-title--empty">{{ subject.name }}</v-card-title>
          <v-card-text class="text-center">
            <template v-if="isReadOnly">
              <v-icon color="grey" size="small">mdi-cancel</v-icon>
              <div class="text-caption text-grey">当日无作业</div>
            </template>
            <template v-else>
              <v-icon color="grey" size="small">mdi-plus</v-icon>
              <div class="text-caption text-grey">点击添加作业</div>
            </template>
          </v-card-text>
        </v-card>
      </TransitionGroup>
    </div>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { SubjectInfo } from '@starflame/shared'
import type { ExamItem } from '@starflame/shared'
import TimeCard from '@/components/TimeCard.vue'
import HitokotoCard from '@/components/HitokotoCard.vue'
import ConciseExamCard from '@/components/home/ConciseExamCard.vue'

import type { GridItem } from '@/types/board'
import type { BellOffsetConfig } from '@/lib/bellOffset'

const props = withDefaults(
  defineProps<{
    sortedItems: GridItem[]
    unusedSubjects: SubjectInfo[]
    emptySubjectDisplay?: string
    isMobile?: boolean
    isEditingDisabled?: boolean
    isReadOnly?: boolean
    contentStyle?: Record<string, string>
    highlightedCards?: Record<string, boolean>
    fontScale?: number
    clock12h?: boolean
    weekly?: Record<string, { start: string; end: string; endBoarding?: string | null } | null>
    exams?: ExamItem[]
    subjects?: SubjectInfo[]
    unusedCustom?: Array<{ id: string; title: string }>
    /** 鼠标悬停时卡片上浮 */
    cardHoverEffect?: boolean
    /** 为触摸屏放大点击区域 */
    enhancedTouch?: boolean
    /** 按内容高度自动调整卡片（关闭后按固定行高排列） */
    dynamicSort?: boolean
    /** 课铃偏移：只影响时间卡的放学倒计时 */
    bell?: BellOffsetConfig
  }>(),
  {
    emptySubjectDisplay: 'card',
    isMobile: false,
    isEditingDisabled: false,
    isReadOnly: false,
    contentStyle: () => ({}),
    highlightedCards: () => ({}),
    fontScale: 1,
    clock12h: false,
    weekly: () => ({}),
    exams: () => [],
    subjects: () => [],
    unusedCustom: () => [],
    cardHoverEffect: true,
    enhancedTouch: true,
    dynamicSort: true,
    bell: () => ({ seconds: 0 }),
  },
)

function examOf(item: GridItem): ExamItem | undefined {
  if (!item.examId) return undefined
  return props.exams.find((exam) => exam.id === item.examId)
}

const emit = defineEmits<{
  'open-dialog': [key: string]
  'open-attendance': []
  'open-exam': [id: string]
}>()

const gridContainer = ref<HTMLElement | null>(null)
const items = ref<HTMLElement[]>([])
let observer: ResizeObserver | null = null

/**
 * 每行最大学科作业卡数
 * 需求：根据屏幕宽度自动计算，最多 3 列
 */
const MAX_COLUMNS = 3
/** 单卡最小可读宽度（再窄就挤了） */
const MIN_CARD_WIDTH = 300
/** 网格容器左右内边距之和（.grid-masonry padding: 8px * 2） */
const GRID_GUTTER = 16

const columns = ref(MAX_COLUMNS)

/** 根据容器可用宽度算出列数，夹在 1~3 之间 */
function computeColumns(): number {
  const grid = gridContainer.value
  if (!grid) return MAX_COLUMNS
  const width = grid.clientWidth - GRID_GUTTER
  if (width <= 0) return MAX_COLUMNS
  const fitted = Math.floor((width + 16) / (MIN_CARD_WIDTH + 16))
  return Math.min(MAX_COLUMNS, Math.max(1, fitted))
}

/** 把列数写进内联样式，覆盖 CSS 里的固定 3 列 */
function applyColumns(): void {
  const grid = gridContainer.value
  if (!grid) return
  const next = computeColumns()
  if (next !== columns.value) columns.value = next
  grid.style.gridTemplateColumns = 'repeat(' + next + ', minmax(0, 1fr))'
}

/** 缓存上一次的跨度，避免浮点误差造成反复重排 */
const lastSpan = new WeakMap<HTMLElement, number>()

/** 卡片之间的垂直间距（由行跨度补出来，所以 .grid-masonry 的 row-gap 是 0） */
const GRID_ROW_GAP = 16

function resizeGridItem(item: HTMLElement): void {
  const grid = gridContainer.value
  if (!grid) return

  // 关闭「按内容高度自动调整卡片顺序」时按固定行高排列，不做跨度测量
  if (!props.dynamicSort) {
    if (item.style.gridRowEnd) item.style.gridRowEnd = ''
    return
  }

  const style = window.getComputedStyle(grid)
  const rowHeight = parseFloat(style.getPropertyValue('grid-auto-rows')) || 1

  const content = item.firstElementChild as HTMLElement | null
  if (!content) return

  // 桌面端（>=960px）整站有 zoom: 1.15，此时 getBoundingClientRect() 返回的是
  // 缩放后的尺寸，而网格的 grid-auto-rows（1px）与 offsetHeight 都是未缩放的布局
  // 尺寸。两者混用会让跨度凭空多出 15%，表现为卡片下方多出一段空隙。
  // 这里先用「矩形宽度 / 布局宽度」求出缩放系数，把所有测量值折算回布局像素。
  const layoutWidth = grid.offsetWidth
  const rectWidth = grid.getBoundingClientRect().width
  const zoomScale = layoutWidth > 0 && rectWidth > 0 ? rectWidth / layoutWidth : 1

  // 用自然内容高度测量，而不是被网格行跨度反向约束后的高度
  const height = Math.max(
    content.scrollHeight,
    content.offsetHeight,
    content.getBoundingClientRect().height / zoomScale,
  )
  if (height <= 0) return

  // 行高 1px 且 row-gap 为 0：卡片自身占 ceil(height / rowHeight) 行，
  // 再额外多占 GRID_ROW_GAP 行作为与下一张卡的间距。
  // 这样卡片之间的空隙恒为 16px，不会像「按 row-gap 反解 span」那样
  // 每张卡下面最多多出 16px 累积余量（表现为卡片间距忽大忽小）。
  const gapRows = Math.max(1, Math.round(GRID_ROW_GAP / rowHeight))
  const span = Math.max(gapRows, Math.ceil(height / rowHeight) + gapRows)

  if (lastSpan.get(item) === span) return
  lastSpan.set(item, span)

  item.style.gridRowEnd = 'span ' + span
}

function resizeAll(): void {
  items.value.forEach((item) => resizeGridItem(item))
}

function observeItems(): void {
  if (!observer) return
  items.value.forEach((item) => {
    const content = item.firstElementChild
    if (content) observer?.observe(content)
  })
}

/** 字体、图片等异步资源就绪后再测一次，避免首屏高度偏差 */
function remeasureLater(): void {
  nextTick(() => {
    resizeAll()
  })
  window.setTimeout(resizeAll, 120)
  window.setTimeout(resizeAll, 400)
  if (document.fonts?.ready) {
    void document.fonts.ready.then(() => resizeAll())
  }
  // 卡片内图片加载完成后高度会变
  for (const item of items.value) {
    for (const img of Array.from(item.querySelectorAll('img'))) {
      if (!img.complete) {
        img.addEventListener('load', () => resizeAll(), { once: true })
        img.addEventListener('error', () => resizeAll(), { once: true })
      }
    }
  }
}

/** 窗口尺寸变化会改变列宽与缩放系数，需要同时重算列数与跨度 */
function handleWindowResize(): void {
  applyColumns()
  resizeAll()
  remeasureLater()
}

onMounted(() => {
  observer = new ResizeObserver(() => {
    applyColumns()
    resizeAll()
  })
  if (gridContainer.value) observer.observe(gridContainer.value)
  nextTick(() => {
    applyColumns()
    resizeAll()
    observeItems()
    remeasureLater()
  })
  window.addEventListener('resize', handleWindowResize)
})

onBeforeUnmount(() => {
  observer?.disconnect()
  window.removeEventListener('resize', handleWindowResize)
})

watch(
  () => props.sortedItems,
  () =>
    nextTick(() => {
      applyColumns()
      resizeAll()
      observeItems()
      remeasureLater()
    }),
  { deep: true },
)

function handleCardClick(type: 'attendance' | 'dialog', key?: string): void {
  if (props.isEditingDisabled) return
  if (type === 'attendance') {
    emit('open-attendance')
    return
  }
  if (key) emit('open-dialog', key)
}

function splitPoint(content?: string): string[] {
  return (content || '').split('\n').filter((text) => text.trim())
}

function handleMouseMove(event: MouseEvent): void {
  const card = event.currentTarget as HTMLElement
  const rect = card.getBoundingClientRect()
  const x = ((event.clientX - rect.left) / rect.width) * 100
  const y = ((event.clientY - rect.top) / rect.height) * 100
  card.style.setProperty('--x', x + '%')
  card.style.setProperty('--y', y + '%')
}

function handleTouchMove(event: TouchEvent): void {
  if (event.touches.length !== 1) return
  const touch = event.touches[0]
  if (!touch) return
  const card = event.currentTarget as HTMLElement
  const rect = card.getBoundingClientRect()
  const x = ((touch.clientX - rect.left) / rect.width) * 100
  const y = ((touch.clientY - rect.top) / rect.height) * 100
  card.style.setProperty('--x', x + '%')
  card.style.setProperty('--y', y + '%')
}
</script>

<style scoped>
/* ===== 作业卡片科目名：两端都放大，作为卡片的主视觉信息 ===== */
.sf-subject-title {
  font-size: 26px !important;
  font-weight: 700;
  line-height: 1.3 !important;
  letter-spacing: 0.02em;
  padding: 14px 16px 6px !important;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 没有作业的科目卡：标题同样放大，但下方还有大图标，留白略小 */
.sf-subject-title--empty {
  font-size: 22px !important;
  padding: 12px 16px 2px !important;
}

@media (max-width: 960px) {
  .sf-subject-title {
    font-size: 22px !important;
    padding: 12px 14px 4px !important;
  }

  .sf-subject-title--empty {
    font-size: 19px !important;
  }
}

.grid-enter-active,
.grid-leave-active {
  transition: all 0.3s ease;
}

.grid-enter-from,
.grid-leave-to {
  opacity: 0;
  transform: scale(0.9);
}

.grid-move {
  transition: transform 0.3s ease;
}

.cursor-not-allowed {
  cursor: not-allowed !important;
}

.cursor-pointer {
  cursor: pointer;
}

.v-card.cursor-not-allowed:hover {
  transform: none !important;
}

/* ===== 作业卡片正文：靠左对齐 ===== */
.sf-body {
  padding: 6px 16px 18px !important;
  text-align: left !important;
}

.sf-body-line {
  white-space: pre-wrap;
  text-align: left;
  line-height: 1.6;
}

.sf-body-line + .sf-body-line {
  margin-top: 8px;
}

.sf-body-empty {
  color: var(--text-3, #8a8078);
  font-size: 14px;
}

/* ===== 空科目按钮：更扁、更松 ===== */
.empty-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  padding: 2px 0;
}

.empty-buttons .empty-btn {
  height: 40px !important;
  min-height: 40px !important;
  padding-inline: 20px !important;
  /* 科目名在默认 button 布局下就是这些胶囊按钮的文字，一并放大 */
  font-size: 16px;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: none;
  box-shadow: none !important;
  transition: transform 0.18s ease, filter 0.18s ease;
}

.empty-buttons .empty-btn:hover {
  transform: translateY(-2px);
  filter: brightness(1.05);
}

/* 移动端空科目是 chip，同样放大科目名 */
.empty-subjects :deep(.v-chip) {
  font-size: 15px;
  font-weight: 600;
}

</style>
