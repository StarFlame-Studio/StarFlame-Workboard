<template>
  <v-dialog v-model="visible" fullscreen>
    <div class="fs-root" @click.self="visible = false">
      <div class="fs-tabs">
        <v-btn
          v-for="tab in tabs"
          :key="tab.value"
          :color="mode === tab.value ? 'primary' : 'default'"
          :prepend-icon="tab.icon"
          variant="text"
          @click="mode = tab.value"
        >
          {{ tab.label }}
          <v-icon v-if="tabDot[tab.value]" class="ml-1" color="success" size="10">mdi-circle</v-icon>
        </v-btn>
      </div>

      <!-- 时钟 -->
      <div v-if="mode === 'clock'" class="fs-center">
        <div class="fs-clock">
          {{ clock.hour }}<span class="fs-colon">:</span>{{ clock.minute
          }}<span class="fs-seconds">{{ clock.second }}</span>
        </div>
        <div class="fs-date">{{ clock.dateText }}</div>
        <div class="fs-progress">
          <div class="text-caption text-medium-emphasis mb-1">今日已过 {{ clock.percent }}%</div>
          <v-progress-linear :model-value="clock.percent" color="primary" height="6" rounded />
        </div>
      </div>

      <!-- 倒计时 -->
      <div v-else-if="mode === 'timer'" class="fs-center">
        <div class="fs-timer">
          <div v-for="unit in timerUnits" :key="unit.key" class="fs-unit">
            <v-btn :disabled="timerLocked" icon="mdi-chevron-up" variant="text" @click="adjust(unit.key, 1)" />
            <div class="num fs-unit-value">{{ unit.display }}</div>
            <v-btn :disabled="timerLocked" icon="mdi-chevron-down" variant="text" @click="adjust(unit.key, -1)" />
            <div class="text-caption text-medium-emphasis">{{ unit.label }}</div>
          </div>
        </div>

        <div v-if="!timerLocked" class="fs-presets">
          <v-btn
            v-for="preset in presets"
            :key="preset.seconds"
            size="small"
            variant="tonal"
            @click="applyPreset(preset.seconds)"
          >
            {{ preset.label }}
          </v-btn>
        </div>

        <div class="fs-controls">
          <v-btn
            :color="timerRunning ? 'error' : 'primary'"
            :prepend-icon="timerRunning ? 'mdi-pause' : 'mdi-play'"
            size="x-large"
            variant="elevated"
            @click="toggleTimer"
          >
            {{ timerRunning ? '暂停' : timerArmed ? '继续' : '开始' }}
          </v-btn>
          <v-btn class="ml-3" icon="mdi-restart" size="large" variant="tonal" @click="resetTimerClick" />
        </div>

        <div v-if="timerFinished" class="text-h5 text-error mt-6">时间到</div>
        <div v-else-if="timerRunning" class="text-caption text-medium-emphasis mt-4">
          关闭页面后仍在后台继续计时
        </div>
      </div>

      <!-- 秒表 -->
      <div v-else class="fs-center">
        <div class="fs-stopwatch num">{{ stopwatchText }}</div>
        <div class="text-h6 text-medium-emphasis mt-2">秒表</div>
        <div class="fs-controls">
          <v-btn
            :color="stopwatchRunning ? 'error' : 'primary'"
            :icon="stopwatchRunning ? 'mdi-pause' : 'mdi-play'"
            size="x-large"
            variant="elevated"
            @click="toggleStopwatch"
          />
          <v-btn class="ml-3" :disabled="stopwatchRunning" icon="mdi-restart" size="large" variant="tonal" @click="resetStopwatch" />
        </div>
        <div v-if="stopwatchRunning" class="text-caption text-medium-emphasis mt-4">
          关闭页面后仍在后台继续计时
        </div>
      </div>

      <div class="fs-actions">
        <v-btn icon="mdi-cog" variant="text" @click="showSettings = !showSettings" />
        <v-btn icon="mdi-close" variant="text" @click="visible = false" />
      </div>

      <v-card v-if="showSettings" class="fs-settings pa-4">
        <div class="d-flex align-center mb-2">
          <span class="text-subtitle-2">使用 12 小时制</span>
          <v-spacer />
          <v-switch v-model="use12h" color="primary" hide-details inset />
        </div>
        <div class="text-caption text-medium-emphasis">设置仅影响本次显示</div>
      </v-card>
    </div>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { serverNow, startTimeSync } from '@/lib/serverTime'
import {
  formatClock,
  pauseStopwatch,
  pauseTimer,
  resetStopwatch,
  resetTimer,
  startStopwatch,
  startTimer,
  stopwatchElapsedMs,
  timeTools,
  timerRemainingMs,
} from '@/lib/timeTools'

type Mode = 'clock' | 'timer' | 'stopwatch'

const props = withDefaults(defineProps<{ modelValue: boolean; clock12h?: boolean; initialMode?: Mode }>(), {
  clock12h: false,
  initialMode: 'clock',
})

const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
})

const mode = ref<Mode>(props.initialMode)
const use12h = ref(props.clock12h)
const showSettings = ref(false)

const tabs = [
  { value: 'clock' as const, label: '时钟', icon: 'mdi-clock-outline' },
  { value: 'timer' as const, label: '倒计时', icon: 'mdi-timer-outline' },
  { value: 'stopwatch' as const, label: '秒表', icon: 'mdi-timer-sand' },
]

// ---------- 时钟 ----------
const now = ref(new Date())
const clock = computed(() => {
  const d = now.value
  const pad = (n: number) => String(n).padStart(2, '0')
  let hour = d.getHours()
  if (use12h.value) hour = hour % 12 === 0 ? 12 : hour % 12
  const passed = d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds()
  return {
    hour: pad(hour),
    minute: pad(d.getMinutes()),
    second: pad(d.getSeconds()),
    dateText:
      d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日 ' +
      ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'][d.getDay()],
    percent: Math.floor((passed / 86400) * 1000) / 10,
  }
})

// ---------- 倒计时 ----------
const timer = reactive({ hours: 0, minutes: 5, seconds: 0 })

const timerRunning = computed(() => timeTools.timer.running)
/** 已开始（运行中或暂停）后禁止直接改数字，需先重置 */
const timerArmed = computed(() => timeTools.timer.armed)
const timerLocked = computed(() => timerRunning.value || timerArmed.value)
const timerFinished = computed(() => timeTools.timer.finishedAt !== null)

const inputMs = (): number => (timer.hours * 3600 + timer.minutes * 60 + timer.seconds) * 1000

const timerUnits = computed(() => {
  const seconds = Math.round((timerArmed.value ? timerRemainingMs() : inputMs()) / 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return [
    { key: 'hours' as const, label: '时', display: pad(Math.floor(seconds / 3600)) },
    { key: 'minutes' as const, label: '分', display: pad(Math.floor((seconds % 3600) / 60)) },
    { key: 'seconds' as const, label: '秒', display: pad(seconds % 60) },
  ]
})

const presets = [
  { label: '1 分钟', seconds: 60 },
  { label: '3 分钟', seconds: 180 },
  { label: '5 分钟', seconds: 300 },
  { label: '10 分钟', seconds: 600 },
  { label: '15 分钟', seconds: 900 },
  { label: '30 分钟', seconds: 1800 },
  { label: '1 小时', seconds: 3600 },
]

function applyPreset(seconds: number): void {
  timer.hours = Math.floor(seconds / 3600)
  timer.minutes = Math.floor((seconds % 3600) / 60)
  timer.seconds = seconds % 60
}

function adjust(key: 'hours' | 'minutes' | 'seconds', delta: number): void {
  if (timerLocked.value) return
  const max = key === 'hours' ? 23 : 59
  const value = timer[key] + delta
  timer[key] = value < 0 ? max : value > max ? 0 : value
}

function toggleTimer(): void {
  if (timerRunning.value) {
    pauseTimer()
    return
  }
  if (timerArmed.value) {
    startTimer()
    return
  }
  if (inputMs() > 0) startTimer(inputMs())
}

function resetTimerClick(): void {
  timer.hours = 0
  timer.minutes = 5
  timer.seconds = 0
  resetTimer(5 * 60 * 1000)
}

// ---------- 秒表 ----------
const stopwatchRunning = computed(() => timeTools.stopwatch.running)
const stopwatchText = computed(() => formatClock(stopwatchElapsedMs(), true))

function toggleStopwatch(): void {
  if (stopwatchRunning.value) pauseStopwatch()
  else startStopwatch()
}

// ---------- 标签上的运行指示 ----------
const tabDot = computed<Record<Mode, boolean>>(() => ({
  clock: false,
  timer: timeTools.timer.running,
  stopwatch: timeTools.stopwatch.running,
}))

// ---------- 生命周期 ----------
let clockHandle: number | undefined

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      mode.value = props.initialMode
      startTimeSync()
      now.value = serverNow()
      if (!clockHandle) clockHandle = window.setInterval(() => { now.value = serverNow() }, 1000)
      return
    }
    // 关闭全屏只停时钟渲染，倒计时与秒表继续在后台走
    window.clearInterval(clockHandle)
    clockHandle = undefined
  },
)

watch(
  () => props.initialMode,
  (value) => {
    if (props.modelValue) mode.value = value
  },
)

onBeforeUnmount(() => {
  window.clearInterval(clockHandle)
})
</script>

<style scoped>
.fs-root {
  position: fixed;
  inset: 0;
  background: #0b0e13;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #fff;
}

.fs-tabs {
  position: absolute;
  top: 24px;
  display: flex;
  gap: 8px;
}

.fs-center {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.fs-clock {
  font-size: 16vw;
  font-weight: 300;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
}

.fs-colon {
  opacity: 0.6;
  margin: 0 1vw;
}

.fs-seconds {
  font-size: 7vw;
  opacity: 0.55;
  margin-left: 1vw;
}

.fs-date {
  font-size: 2.2vw;
  opacity: 0.75;
  margin-top: 2vh;
}

.fs-progress {
  width: 42vw;
  margin-top: 4vh;
}

.fs-timer {
  display: flex;
  gap: 3vw;
}

.fs-unit {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.fs-unit-value {
  font-size: 9vw;
  font-weight: 300;
  line-height: 1;
}

.fs-presets {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  margin-top: 4vh;
}

.fs-controls {
  margin-top: 5vh;
  display: flex;
  align-items: center;
}

.fs-stopwatch {
  font-size: 12vw;
  font-weight: 300;
  line-height: 1;
  letter-spacing: -0.02em;
}

.fs-actions {
  position: absolute;
  right: 24px;
  bottom: 24px;
  display: flex;
  gap: 8px;
}

.fs-settings {
  position: absolute;
  right: 24px;
  bottom: 84px;
  width: 240px;
}
</style>
