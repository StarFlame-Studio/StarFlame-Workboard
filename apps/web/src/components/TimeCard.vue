<template>
  <v-card border class="time-card glow-track" elevation="2" rounded="xl" style="cursor: pointer" @click="showFullscreen = true">
    <v-card-text class="card-body d-flex align-center">
      <!-- 左侧：时间 -->
      <div class="time-left">
        <div ref="clockRef" class="time-display" :style="clockStyle">
          {{ timeString }}<span class="seconds-text">{{ secondsString }}</span>
          <span v-if="use12hClock" class="ampm-text">{{ amPmString }}</span>
        </div>
        <div class="date-line">{{ dateString }} {{ weekdayString }} {{ periodOfDay }}</div>
      </div>

      <!-- 右侧：距离放学（走读 / 住宿两阶段） -->
      <div class="school-block">
          <template v-if="school.enabled">
          <div class="school-label">{{ school.label }}</div>
          <div class="school-countdown num" :class="school.color">{{ school.countdown }}</div>

          <div class="school-progress mt-2">
            <v-progress-linear
              :color="school.color"
              height="6"
              :model-value="school.percent"
              rounded
            />
          </div>
          <div class="school-meta mt-1">
            <span>{{ school.startText }}</span>
            <span class="font-weight-bold">{{ school.percent }}%</span>
            <span>{{ school.endText }}</span>
          </div>
          <!-- 课铃偏移提示：时间文字仍是作息原值，倒计时已按课铃提前/延后 -->
          <div v-if="school.bellHint" class="school-bell-hint">
            <v-icon size="12">mdi-bell-ring</v-icon>
            <span>课铃{{ school.bellHint }}</span>
          </div>

        </template>

        <template v-else>
          <v-icon color="grey" size="28">mdi-calendar-remove-outline</v-icon>
          <div class="text-caption text-medium-emphasis mt-2">今天不上学</div>
        </template>
        <!-- 运行中的倒计时 / 秒表角标 -->
        <div v-if="runningTools.length" class="tool-badges">
          <button
            v-for="tool in runningTools"
            :key="tool.key"
            :title="tool.title"
            class="tool-badge"
            :class="tool.tone"
            type="button"
            @click.stop="openTool(tool.key)"
          >
            <v-icon size="13">{{ tool.icon }}</v-icon>
            <span class="tool-badge-time num">{{ tool.text }}</span>
          </button>
        </div>

      </div>
    </v-card-text>

    <time-card-fullscreen v-model="showFullscreen" :clock12h="use12hClock" :initial-mode="openMode" />
  </v-card>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import TimeCardFullscreen from '@/components/TimeCardFullscreen.vue'
import { serverNow, startTimeSync } from '@/lib/serverTime'
import { bellOffsetForDate, describeBellOffset, type BellOffsetConfig } from '@/lib/bellOffset'
import {
  formatBadge,
  formatClock,
  stopwatchElapsedMs,
  timeTools,
  timerRemainingMs,
} from '@/lib/timeTools'

interface DaySchedule {
  start: string
  end: string
  /** 住宿生放学时间；为空或不晚于走读放学时不显示第二段 */
  endBoarding?: string | null
}

const props = withDefaults(
  defineProps<{
    use12h?: boolean
    weekly?: Record<string, DaySchedule | null>
    /** 课铃偏移：只调整「距离放学」倒计时，时钟与作息时间文字保持原样 */
    bell?: BellOffsetConfig
  }>(),
  { use12h: false, weekly: () => ({}), bell: () => ({ auto: false, global: 0, days: {} }) },
)

const now = ref(new Date())
const showFullscreen = ref(false)
const openMode = ref<'clock' | 'timer' | 'stopwatch'>('clock')
let clockTimer: number | undefined

/** 顶栏角标：仅展示正在运行的倒计时与秒表 */
const runningTools = computed(() => {
  const list: { key: 'timer' | 'stopwatch'; icon: string; text: string; tone: string; title: string }[] = []
  if (timeTools.timer.running) {
    const remain = timerRemainingMs()
    list.push({
      key: 'timer',
      icon: 'mdi-timer-outline',
      text: formatBadge(remain),
      tone: remain <= 60000 ? 'is-timer is-urgent' : 'is-timer',
      title: '倒计时剩余 ' + formatClock(remain),
    })
  }
  if (timeTools.stopwatch.running) {
    const elapsed = stopwatchElapsedMs()
    list.push({
      key: 'stopwatch',
      icon: 'mdi-timer-sand',
      text: formatBadge(elapsed),
      tone: 'is-stopwatch',
      title: '秒表已计时 ' + formatClock(elapsed),
    })
  }
  return list
})

function openTool(key: 'timer' | 'stopwatch'): void {
  openMode.value = key
  showFullscreen.value = true
}

const use12hClock = computed(() => props.use12h)

const timeString = computed(() => {
  const d = now.value
  const h24 = d.getHours()
  const m = String(d.getMinutes()).padStart(2, '0')
  if (use12hClock.value) {
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12
    return String(h12).padStart(2, '0') + ':' + m
  }
  return String(h24).padStart(2, '0') + ':' + m
})

const secondsString = computed(() => ':' + String(now.value.getSeconds()).padStart(2, '0'))
const amPmString = computed(() => (now.value.getHours() < 12 ? 'AM' : 'PM'))

const dateString = computed(() => {
  const d = now.value
  return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日'
})

const weekdayString = computed(() => {
  const names = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']
  return names[now.value.getDay()] ?? ''
})

const periodOfDay = computed(() => {
  const h = now.value.getHours()
  if (h < 6) return '凌晨'
  if (h < 12) return '上午'
  if (h < 14) return '中午'
  if (h < 18) return '下午'
  return '晚上'
})

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const

function parseTime(value: string): { h: number; m: number } | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec((value || '').trim())
  if (!match) return null
  const h = Number(match[1])
  const m = Number(match[2])
  if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || h > 23 || m < 0 || m > 59) return null
  return { h, m }
}


// 卡片右侧只保留「当前阶段倒计时」，不再列出走读 / 住宿两段的具体时间段
const school = computed(() => {
  const disabled = {
    enabled: false,
    label: '',
    countdown: '',
    percent: 0,
    startText: '',
    endText: '',
    color: 'primary',
    hasBoarding: false,
    bellHint: '',
  }

  const dayKey = DAY_KEYS[now.value.getDay()] ?? 'mon'
  const day = props.weekly?.[dayKey]
  if (!day || !day.start || !day.end) return disabled

  const startT = parseTime(day.start)
  const endT = parseTime(day.end)
  if (!startT || !endT) return disabled

  const d = now.value
  const startAt = new Date(d.getFullYear(), d.getMonth(), d.getDate(), startT.h, startT.m, 0, 0)

  /** 课铃偏移（分钟）：正数提前，负数延后；只影响倒计时的终点，时间文字仍显示作息原值 */
  const bellOffset = bellOffsetForDate(props.bell, d)
  const dayEndAt = new Date(d.getFullYear(), d.getMonth(), d.getDate(), endT.h, endT.m, 0, 0)
  dayEndAt.setMinutes(dayEndAt.getMinutes() - bellOffset)

  // 住宿生放学：只有晚于走读放学时间时才作为第二阶段
  const boardingT = day.endBoarding ? parseTime(day.endBoarding) : null
  const hasBoarding =
    Boolean(boardingT) && endT.h * 60 + endT.m < (boardingT as { h: number; m: number }).h * 60 + (boardingT as { h: number; m: number }).m
  const boardEndAt = hasBoarding
    ? new Date(
        d.getFullYear(),
        d.getMonth(),
        d.getDate(),
        (boardingT as { h: number }).h,
        (boardingT as { m: number }).m,
        0,
        0,
      )
    : null
  // 住宿生放学同样跟随课铃偏移
  if (boardEndAt) boardEndAt.setMinutes(boardEndAt.getMinutes() - bellOffset)

  const t = d.getTime()
  const startMs = startAt.getTime()
  const dayEndMs = dayEndAt.getTime()
  const boardEndMs = boardEndAt ? boardEndAt.getTime() : dayEndMs

  const stagePercent = (from: number, to: number): number => {
    if (to <= from) return 100
    return Math.min(100, Math.max(0, Math.round(((t - from) / (to - from)) * 100)))
  }

  // 当前阶段：上学前 → 走读 → 住宿 → 全部结束
  let label = '距离放学'
  let countdown = ''
  let color = 'primary'
  let percent = 0
  let startText = day.start
  let endText = day.end

  if (t < startMs) {
    label = '距离上学'
    color = 'info'
    countdown = formatDuration(startMs - t)
    percent = stagePercent(startMs, dayEndMs)
  } else if (t < dayEndMs) {
    label = hasBoarding ? '距离走读生放学还有' : '距离放学'
    countdown = formatDuration(dayEndMs - t)
    percent = stagePercent(startMs, dayEndMs)
    color = percent >= 85 ? 'warning' : 'primary'
  } else if (hasBoarding && t < boardEndMs) {
    label = '距离住宿生放学还有'
    countdown = formatDuration(boardEndMs - t)
    percent = stagePercent(dayEndMs, boardEndMs)
    startText = day.end
    endText = String(day.endBoarding)
    color = percent >= 85 ? 'warning' : 'primary'
  } else {
    label = '已放学'
    color = 'success'
    countdown = '今天已结束'
    percent = 100
    if (hasBoarding) {
      startText = day.end
      endText = String(day.endBoarding)
    }
  }

  // 「提前 5 分钟」这类提示，无偏移时不显示
  const bellHint = bellOffset ? describeBellOffset(bellOffset) : ''
  return { enabled: true, label, countdown, percent, startText, endText, color, hasBoarding, bellHint }
})

function formatDuration(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) return h + ' 时 ' + String(m).padStart(2, '0') + ' 分'
  if (m > 0) return m + ' 分 ' + String(s).padStart(2, '0') + ' 秒'
  return s + ' 秒'
}

/* 数字 1 之类的字形左侧有留白，直接左对齐会和下面一行日期看着不齐，
   这里用 canvas 量出首个字符的墨迹左偏移，再把整行左移相同距离做视觉对齐 */
const clockRef = ref<HTMLElement | null>(null)
const inkShift = ref(0)
const clockStyle = computed(() => ({ marginLeft: inkShift.value ? '-' + inkShift.value + 'px' : '0' }))

function measureInkShift() {
  const el = clockRef.value
  if (!el) return
  const cs = getComputedStyle(el)
  const text = (el.textContent || '').trim()
  const fontSize = parseFloat(cs.fontSize)
  if (!text || !fontSize) return
  const font = cs.fontStyle + ' ' + cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily
  const cv = document.createElement('canvas')
  const ctx = cv.getContext('2d')
  if (!ctx) return
  ctx.font = font
  const advance = ctx.measureText(text[0]).width
  const pad = 4
  cv.width = Math.ceil(advance) + pad * 2
  cv.height = Math.ceil(fontSize * 1.6)
  ctx.font = font
  ctx.fillStyle = '#fff'
  ctx.textBaseline = 'middle'
  ctx.fillText(text[0], pad, cv.height / 2)
  const data = ctx.getImageData(0, 0, cv.width, cv.height).data
  let first = -1
  for (let x = 0; x < cv.width && first < 0; x++) {
    for (let y = 0; y < cv.height; y++) {
      if (data[(y * cv.width + x) * 4 + 3] > 40) { first = x; break }
    }
  }
  inkShift.value = first < 0 ? 0 : Math.max(0, first - pad)
}

let clockResizeObserver: ResizeObserver | null = null

onMounted(() => {
  // 时钟对齐阿里云 NTP（经 /api/public/time 校准），避免本机时间不准
  startTimeSync()
  now.value = serverNow()
  clockTimer = window.setInterval(() => {
    now.value = serverNow()
  }, 1000)
  nextTick(measureInkShift)
  if (typeof ResizeObserver !== 'undefined' && clockRef.value) {
    clockResizeObserver = new ResizeObserver(() => measureInkShift())
    clockResizeObserver.observe(clockRef.value)
  }
})

watch([timeString, use12hClock], () => nextTick(measureInkShift))

onBeforeUnmount(() => {
  if (clockTimer) window.clearInterval(clockTimer)
  clockResizeObserver?.disconnect()
  clockResizeObserver = null
})
</script>

<style scoped>
/* 以卡片自身宽度为基准做自适应，而不是视口宽度 */
.time-card {
  container-type: inline-size;
  overflow: hidden;
}

.card-body {
  padding: 20px 22px;
  /* 左右两个板块分别贴合卡片两侧；间距由时钟字号自适应吸收 */
  gap: clamp(16px, 3cqw, 32px);
  justify-content: space-between;
  min-width: 0;
}

.time-left {
  /* 时间与日期不压缩：空间不够时让右侧进度条缩短，而不是把日期挤成省略号 */
  flex: 0 0 auto;
  min-width: 0;
}

.time-display {
  /* 以卡片宽度等比缩放，宽屏时尽量撑满左侧空间，窄时自动缩小，永不溢出 */
  font-size: clamp(1.5rem, 15cqw, 4.6rem);
  font-weight: 500;
  line-height: 1.05;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.seconds-text {
  font-size: 0.5em;
  margin-left: 3px;
  opacity: 0.7;
  font-variant-numeric: tabular-nums;
}

.ampm-text {
  font-size: 0.36em;
  margin-left: 5px;
  opacity: 0.7;
}

.date-line {
  font-size: clamp(0.66rem, 3.4cqw, 0.95rem);
  opacity: 0.75;
  margin-top: 10px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 小圆形角标：上方图标、下方时间 */
.tool-badges {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: flex-end;
  margin-top: 8px;
}

.tool-badge {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  padding: 0;
  cursor: pointer;
  color: rgb(var(--v-theme-primary));
  border: 1px solid rgba(var(--v-theme-primary), 0.45);
  background: rgba(var(--v-theme-primary), 0.12);
  transition:
    transform 0.2s ease,
    background-color 0.2s ease;
}

.tool-badge:hover {
  transform: scale(1.08);
  background: rgba(var(--v-theme-primary), 0.2);
}

.tool-badge.is-urgent {
  color: rgb(var(--v-theme-warning));
  border-color: rgba(var(--v-theme-warning), 0.5);
  background: rgba(var(--v-theme-warning), 0.14);
}

.tool-badge.is-stopwatch {
  color: rgb(var(--v-theme-info));
  border-color: rgba(var(--v-theme-info), 0.45);
  background: rgba(var(--v-theme-info), 0.12);
}

.tool-badge-time {
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
  letter-spacing: 0.01em;
}

.school-block {
  /* 仍是弹性列：宽屏铺满，窄屏时被压缩（进度条随之变短） */
  flex: 1 1 auto;
  width: 40cqw;
  max-width: 60%;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  min-width: 0;
}

.school-label {
  font-size: clamp(0.6rem, 2.8cqw, 0.78rem);
  opacity: 0.65;
  white-space: nowrap;
}

.school-countdown {
  font-size: clamp(0.9rem, 4.6cqw, 1.4rem);
  font-weight: 700;
  line-height: 1.2;
  white-space: nowrap;
  margin-top: 2px;
}

.school-progress {
  width: 100%;
  margin-top: 8px;
}

.school-meta {
  display: flex;
  justify-content: space-between;
  width: 100%;
  margin-top: 4px;
  font-size: clamp(0.56rem, 2.4cqw, 0.7rem);
  opacity: 0.6;
  font-variant-numeric: tabular-nums;
}

.school-meta span {
  white-space: nowrap;
}

.school-bell-hint {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: clamp(0.52rem, 2.1cqw, 0.66rem);
  color: rgba(var(--v-theme-warning), 0.9);
  opacity: 0.9;
}


/* 卡片偏窄时改为上下堆叠：
   第一板块（时间 / 日期）放大，第二板块（距离放学）缩小，突出主体信息 */
@container (max-width: 360px) {
  .card-body {
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
    padding: 18px 20px;
  }

  /* —— 第一板块：放大 —— */
  .time-display {
    font-size: clamp(2.2rem, 26cqw, 3.6rem);
    line-height: 1;
  }

  .date-line {
    margin-top: 6px;
    font-size: clamp(0.8rem, 4cqw, 1rem);
    font-weight: 500;
    opacity: 0.82;
  }

  .tool-badges {
    justify-content: flex-end;
    margin-top: 6px;
  }

  .time-left {
    flex: 1 1 auto;
  }

  /* —— 第二板块：缩小 —— */
  .school-block {
    width: 100%;
    max-width: none;
    align-items: stretch;
  }

  .school-label {
    font-size: 0.6rem;
    letter-spacing: 0.02em;
  }

  .school-countdown {
    font-size: 0.95rem;
    font-weight: 600;
    margin-top: 0;
  }

  .school-progress {
    margin-top: 5px;
  }

  .school-meta {
    font-size: 0.56rem;
    margin-top: 2px;
  }

}
</style>
