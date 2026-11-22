<template>
  <v-card border class="settings-card rounded-lg mb-4" elevation="2">
    <v-card-item>
      <template #prepend>
        <v-icon class="mr-2" icon="mdi-school" size="large" />
      </template>
      <v-card-title class="text-h6">作息时间</v-card-title>
      <v-card-subtitle>配置每周上放学时间与每天的课程节次；上课时段内可暂停桌面端静默更新</v-card-subtitle>
    </v-card-item>

    <v-card-text>
      <v-alert class="mb-4" density="compact" type="info" variant="tonal">
        关闭某一天（右侧开关）表示当天不上学，时间卡会显示「今天不上学」。住宿放学时间晚于走读放学时间时，时间卡会分「走读 → 住宿」两阶段倒计时。
      </v-alert>

      <div class="pause-row">
        <v-icon class="mr-2" icon="mdi-update" size="22" />
        <div class="pause-text">
          <div class="font-weight-medium">上课时段暂停静默更新</div>
          <div class="text-caption text-medium-emphasis">
            开启后，桌面端在上课时间内不下载、不安装新版本；下课后 5 分钟自动继续。默认开启（仅桌面端生效）。
          </div>
        </div>
        <v-switch
          :model-value="pauseDuringClass"
          color="primary"
          density="compact"
          hide-details
          inset
          @update:model-value="(v) => setPause(Boolean(v))"
        />
      </div>

      <v-divider class="my-3" />

      <!-- 课铃偏移：只调整时间卡的倒计时，时钟与作息时间文字保持原样 -->
      <div class="pause-row">
        <v-icon class="mr-2" icon="mdi-bell-ring" size="22" />
        <div class="pause-text">
          <div class="font-weight-medium">课铃偏移时间</div>
          <div class="text-caption text-medium-emphasis">
            正数表示提前响铃、负数表示延后响铃，单位秒。时间卡的时钟与作息时间文字不变，只有「距离放学」倒计时随课铃提前或延后归零。
            <span class="text-medium-emphasis">当前：{{ describeBellOffset(bellOffset) }}</span>
          </div>
        </div>
        <div class="d-flex align-center flex-wrap" style="gap: 8px">
          <v-text-field
            :model-value="bellOffset"
            class="bell-field"
            density="compact"
            hide-details
            label="偏移秒数"
            suffix="秒"
            type="number"
            variant="outlined"
            @update:model-value="(v) => setBellOffset(v)"
          />
        </div>
      </div>

      <v-divider class="my-3" />

      <v-list>
        <template v-for="(day, index) in dayList" :key="day.key">
          <v-list-item>
            <template #prepend>
              <v-icon class="mr-3" :color="isEnabled(day.key) ? 'primary' : 'grey'" icon="mdi-calendar-today" />
            </template>

            <v-list-item-title class="font-weight-medium">{{ day.label }}</v-list-item-title>

            <template #append>
              <div class="d-flex align-center flex-wrap" style="gap: 8px">
                <v-text-field
                  :disabled="!isEnabled(day.key)"
                  :model-value="valueOf(day.key).start"
                  class="time-field"
                  density="compact"
                  hide-details
                  label="上学"
                  type="time"
                  variant="outlined"
                  @update:model-value="(v) => setTime(day.key, 'start', String(v ?? ''))"
                />
                <span class="text-medium-emphasis">→</span>
                <v-text-field
                  :disabled="!isEnabled(day.key)"
                  :model-value="valueOf(day.key).end"
                  class="time-field"
                  density="compact"
                  hide-details
                  label="走读放学"
                  type="time"
                  variant="outlined"
                  @update:model-value="(v) => setTime(day.key, 'end', String(v ?? ''))"
                />
                <v-text-field
                  :disabled="!isEnabled(day.key)"
                  :model-value="valueOf(day.key).endBoarding ?? ''"
                  class="time-field"
                  clearable
                  density="compact"
                  hide-details
                  label="住宿放学"
                  type="time"
                  variant="outlined"
                  @update:model-value="(v) => setTime(day.key, 'endBoarding', String(v ?? ''))"
                />
                <v-switch
                  :model-value="isEnabled(day.key)"
                  color="primary"
                  density="comfortable"
                  hide-details
                  inset
                  @update:model-value="(v) => toggleDay(day.key, Boolean(v))"
                />
              </div>
            </template>
          </v-list-item>

          <div class="day-periods">
            <v-icon class="mr-2" :color="isEnabled(day.key) ? 'primary' : 'grey'" icon="mdi-timetable" size="small" />
            <span class="text-body-2 text-medium-emphasis">{{ periodsSummary(day.key) }}</span>
            <v-spacer />
            <v-btn
              :disabled="!isEnabled(day.key)"
              density="comfortable"
              prepend-icon="mdi-pencil-outline"
              size="small"
              variant="tonal"
              @click="openPeriods(day.key)"
            >
              编辑课程
            </v-btn>
          </div>

          <v-divider v-if="index < dayList.length - 1" class="my-1" />
        </template>
      </v-list>
    </v-card-text>

    <v-card-actions class="pa-4">
      <v-btn prepend-icon="mdi-restore" variant="text" @click="applyWorkdayPreset">套用「周一至周五」常用作息</v-btn>
      <v-spacer />
      <v-btn color="primary" prepend-icon="mdi-content-save" variant="elevated" @click="$emit('save')">保存设置</v-btn>
    </v-card-actions>

    <v-dialog v-model="editorOpen" max-width="660" scrollable>
      <v-card>
        <v-card-item>
          <template #prepend>
            <v-icon class="mr-2" icon="mdi-timetable" size="large" />
          </template>
          <v-card-title class="text-h6">{{ editorDayLabel }} 课程时间段</v-card-title>
          <v-card-subtitle>按节次填写起止时间；这些时段内桌面端不会静默更新</v-card-subtitle>
        </v-card-item>
        <v-divider />
        <v-card-text>
          <v-alert v-if="!editorRows.length" class="mb-3" density="compact" type="info" variant="tonal">
            还没有节次。可以「套用常用课表」，也可以手动添加；留空时按当天的上学 → 走读放学整段视为上课时间。
          </v-alert>

          <div v-for="(row, i) in editorRows" :key="i" class="period-row">
            <v-text-field
              :model-value="row.name"
              density="compact"
              hide-details
              placeholder="第1节"
              variant="outlined"
              @update:model-value="(v) => (editorRows[i].name = String(v ?? ''))"
            />
            <v-text-field
              :model-value="row.start"
              density="compact"
              hide-details
              label="开始"
              type="time"
              variant="outlined"
              @update:model-value="(v) => (editorRows[i].start = String(v ?? ''))"
            />
            <v-text-field
              :model-value="row.end"
              density="compact"
              hide-details
              label="结束"
              type="time"
              variant="outlined"
              @update:model-value="(v) => (editorRows[i].end = String(v ?? ''))"
            />
            <v-btn density="comfortable" icon="mdi-delete-outline" title="删除这一节" variant="text" @click="removePeriod(i)" />
          </div>

          <div class="d-flex flex-wrap mt-3" style="gap: 8px">
            <v-btn prepend-icon="mdi-plus" size="small" variant="tonal" @click="addPeriod">添加一节</v-btn>
            <v-btn prepend-icon="mdi-calendar-check" size="small" variant="tonal" @click="applyPeriodPreset">套用常用课表</v-btn>
            <v-btn v-if="prevDayPeriods.length" prepend-icon="mdi-content-copy" size="small" variant="tonal" @click="copyPrevDay">
              复制{{ prevDayLabel }}的课程
            </v-btn>
            <v-btn v-if="editorRows.length" prepend-icon="mdi-close" size="small" variant="text" @click="editorRows = []">清空</v-btn>
          </div>

          <v-alert v-if="editorError" class="mt-3" density="compact" type="warning" variant="tonal">{{ editorError }}</v-alert>
        </v-card-text>
        <v-divider />
        <v-card-actions class="pa-4">
          <v-btn variant="text" @click="editorOpen = false">取消</v-btn>
          <v-spacer />
          <v-btn color="primary" prepend-icon="mdi-content-save" variant="elevated" @click="savePeriods">保存课程时间段</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-card>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { describeBellOffset, normalizeBellOffset } from '@/lib/bellOffset'

interface DaySchedule {
  start: string
  end: string
  /** 住宿生放学时间，可空 */
  endBoarding?: string | null
}

interface ClassPeriod {
  name: string
  start: string
  end: string
}

const props = defineProps<{ model: Record<string, unknown> }>()
const emit = defineEmits<{
  update: [key: string, value: unknown]
  save: []
}>()

const dayList = [
  { key: 'mon', label: '周一' },
  { key: 'tue', label: '周二' },
  { key: 'wed', label: '周三' },
  { key: 'thu', label: '周四' },
  { key: 'fri', label: '周五' },
  { key: 'sat', label: '周六' },
  { key: 'sun', label: '周日' },
]

const weekly = computed<Record<string, DaySchedule | null>>(() => {
  const raw = props.model['schedule.weekly']
  return (raw && typeof raw === 'object' ? raw : {}) as Record<string, DaySchedule | null>
})

const periods = computed<Record<string, ClassPeriod[]>>(() => {
  const raw = props.model['schedule.periods']
  return (raw && typeof raw === 'object' ? raw : {}) as Record<string, ClassPeriod[]>
})

const pauseDuringClass = computed(() => props.model['update.pauseDuringClass'] !== false)

function setPause(value: boolean): void {
  emit('update', 'update.pauseDuringClass', value)
}

// ---------- 课铃偏移 ----------

const bellOffset = computed(() => normalizeBellOffset(props.model['schedule.bellOffset']))

function setBellOffset(value: unknown): void {
  if (value === '' || value === null || value === undefined) {
    emit('update', 'schedule.bellOffset', 0)
    return
  }
  emit('update', 'schedule.bellOffset', normalizeBellOffset(value))
}

function valueOf(key: string): DaySchedule {
  return weekly.value[key] ?? { start: '07:30', end: '17:30', endBoarding: null }
}

function isEnabled(key: string): boolean {
  return Boolean(weekly.value[key])
}

function setTime(key: string, field: 'start' | 'end' | 'endBoarding', value: string): void {
  const current = valueOf(key)
  let nextValue: string | null = value
  if (field === 'endBoarding') {
    nextValue = value ? value : null
  } else if (!value) {
    // 上学 / 走读放学是必填项，清空时保留原值
    nextValue = current[field]
  }
  const next = { ...weekly.value, [key]: { ...current, [field]: nextValue } }
  emit('update', 'schedule.weekly', next)
}

function toggleDay(key: string, enabled: boolean): void {
  if (enabled) {
    emit('update', 'schedule.weekly', { ...weekly.value, [key]: { start: '07:30', end: '17:30', endBoarding: null } })
  } else {
    emit('update', 'schedule.weekly', { ...weekly.value, [key]: null })
  }
}

function applyWorkdayPreset(): void {
  const next: Record<string, DaySchedule | null> = {}
  for (const day of dayList) {
    next[day.key] = day.key === 'sat' || day.key === 'sun' ? null : { start: '07:30', end: '17:30', endBoarding: null }
  }
  emit('update', 'schedule.weekly', next)
}

// ---------- 课程时间段编辑 ----------

/** 常用课表：40/45 分钟一节 + 课间，覆盖白天八节 */
const PERIOD_PRESET: ClassPeriod[] = [
  { name: '第1节', start: '08:00', end: '08:45' },
  { name: '第2节', start: '08:55', end: '09:40' },
  { name: '第3节', start: '10:00', end: '10:45' },
  { name: '第4节', start: '10:55', end: '11:40' },
  { name: '第5节', start: '14:00', end: '14:45' },
  { name: '第6节', start: '14:55', end: '15:40' },
  { name: '第7节', start: '15:50', end: '16:35' },
  { name: '第8节', start: '16:45', end: '17:30' },
]

const editorOpen = ref(false)
const editorDay = ref('mon')
const editorRows = ref<ClassPeriod[]>([])
const editorError = ref('')

const editorDayLabel = computed(() => dayList.find((day) => day.key === editorDay.value)?.label ?? '')

const editorIndex = computed(() => dayList.findIndex((day) => day.key === editorDay.value))

const prevDayLabel = computed(() =>
  editorIndex.value > 0 ? dayList[editorIndex.value - 1].label : ''
)

const prevDayPeriods = computed<ClassPeriod[]>(() => {
  if (editorIndex.value <= 0) return []
  const key = dayList[editorIndex.value - 1].key
  return periods.value[key] ?? []
})

function toMinutes(time: string): number {
  const [hour, minute] = time.split(':')
  return Number(hour) * 60 + Number(minute)
}

function fromMinutes(minutes: number): string {
  const normalized = Math.max(0, Math.min(23 * 60 + 59, minutes))
  return String(Math.floor(normalized / 60)).padStart(2, '0') + ':' + String(normalized % 60).padStart(2, '0')
}

function periodsSummary(key: string): string {
  if (!isEnabled(key)) return '当天不上学，课程时段不生效'
  const list = periods.value[key] ?? []
  if (!list.length) return '未配置节次：按上学 → 走读放学整段暂停更新'
  return String(list.length) + ' 节 · ' + list[0].start + ' - ' + list[list.length - 1].end
}

function openPeriods(key: string): void {
  editorDay.value = key
  editorError.value = ''
  editorRows.value = (periods.value[key] ?? []).map((item) => ({ name: item.name, start: item.start, end: item.end }))
  editorOpen.value = true
}

function addPeriod(): void {
  const last = editorRows.value[editorRows.value.length - 1]
  const start = last ? Math.min(23 * 60, toMinutes(last.end) + 10) : 8 * 60
  const end = Math.min(23 * 60 + 59, start + 45)
  editorRows.value = [
    ...editorRows.value,
    { name: '第' + String(editorRows.value.length + 1) + '节', start: fromMinutes(start), end: fromMinutes(end) },
  ]
}

function removePeriod(index: number): void {
  editorRows.value = editorRows.value.filter((_, i) => i !== index)
}

function applyPeriodPreset(): void {
  editorRows.value = PERIOD_PRESET.map((item) => ({ ...item }))
}

function copyPrevDay(): void {
  editorRows.value = prevDayPeriods.value.map((item) => ({ ...item }))
}

function savePeriods(): void {
  const cleaned: ClassPeriod[] = []
  for (const row of editorRows.value) {
    const start = row.start
    const end = row.end
    if (!start || !end) {
      editorError.value = '每一节都需要填写开始与结束时间'
      return
    }
    if (toMinutes(end) <= toMinutes(start)) {
      editorError.value = '「' + (row.name || '未命名') + '」的结束时间要晚于开始时间'
      return
    }
    cleaned.push({ name: row.name.trim().slice(0, 12), start, end })
  }
  cleaned.sort((a, b) => toMinutes(a.start) - toMinutes(b.start))
  const next: Record<string, ClassPeriod[]> = { ...periods.value }
  if (cleaned.length) next[editorDay.value] = cleaned
  else delete next[editorDay.value]
  emit('update', 'schedule.periods', next)
  editorOpen.value = false
}
</script>

<style scoped>
.time-field {
  max-width: 130px;
}

.bell-field {
  max-width: 130px;
}

.bell-field :deep(input) {
  text-align: center;
}

.pause-row {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 4px;
}

.pause-text {
  flex: 1 1 auto;
  min-width: 0;
}

.day-periods {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 16px 8px 56px;
}

.period-row {
  display: grid;
  grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr) minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

@media (max-width: 600px) {
  .day-periods {
    padding-left: 16px;
  }

  .period-row {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto;
  }

  .period-row > :first-child {
    grid-column: 1 / -1;
  }
}
</style>
