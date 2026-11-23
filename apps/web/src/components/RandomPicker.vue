<template>
  <v-dialog v-model="visible" max-width="640" persistent>
    <v-card>
      <v-card-title class="d-flex align-center py-3 px-4">
        <v-icon class="mr-2" color="primary">mdi-account-question</v-icon>
        随机点名
        <v-spacer />
        <v-btn icon="mdi-close" variant="text" @click="close" />
      </v-card-title>

      <v-card-text class="pa-6 text-center">
        <template v-if="results.length === 0">
          <div class="text-h6 mb-6">请选择抽取人数</div>

          <div class="d-flex align-center justify-center mb-8">
            <v-btn :disabled="count <= 1" color="primary" icon="mdi-minus" size="large" variant="tonal" @click="count > 1 && count--" />
            <div class="mx-8" style="min-width: 90px">
              <span class="num" style="font-size: 56px; font-weight: 700; line-height: 1">{{ count }}</span>
              <span class="ml-1 text-body-1">人</span>
            </div>
            <v-btn :disabled="count >= maxCount" color="primary" icon="mdi-plus" size="large" variant="tonal" @click="count < maxCount && count++" />
          </div>

          <div class="d-flex justify-center mb-4">
            <v-btn-toggle v-model="mode" color="primary" divided mandatory variant="outlined">
              <v-btn :disabled="!hasRoster" prepend-icon="mdi-account" value="name" size="small">姓名模式</v-btn>
              <v-btn prepend-icon="mdi-card-account-details" value="number" size="small">学号模式</v-btn>
            </v-btn-toggle>
          </div>

          <div v-if="!hasRoster" class="text-body-2 text-medium-emphasis mb-4">
            还没有录入学生名单，已自动切换到学号模式，直接按学号范围抽取。
          </div>

          <v-btn
            :disabled="pool.length === 0 || spinning"
            data-tutorial-anchor="random-spin"
            :loading="spinning"
            block
            class="mb-4"
            color="primary"
            prepend-icon="mdi-dice-multiple"
            size="x-large"
            variant="elevated"
            @click="spin"
          >
            {{ spinning ? '抽取中…' : '开始抽取' }}
          </v-btn>

          <div v-if="pool.length === 0" class="text-body-2 text-error mb-2">没有可抽取的学生，请调整过滤选项</div>

          <div class="d-flex align-center justify-center text-caption text-medium-emphasis mb-4">
            <template v-if="mode === 'number'">当前学号范围: {{ numberRangeLabel }}</template>
            <template v-else>当前可抽取学生: {{ pool.length }}人</template>
            <v-btn class="ml-1" icon="mdi-information-outline" size="x-small" variant="text" @click="showPool = !showPool" />
          </div>

          <div v-if="showPool" class="text-caption text-medium-emphasis mb-4" style="line-height: 1.8">
            {{ pool.map((item) => item.name).join('、') || '无' }}
          </div>

          <div v-if="mode === 'name'" class="d-flex justify-center flex-wrap" style="gap: 8px">
            <v-chip :color="includeLate ? 'secondary' : 'default'" :variant="includeLate ? 'flat' : 'outlined'" size="small" @click="includeLate = !includeLate">
              <v-icon start size="small">mdi-clock-alert-outline</v-icon>
              包含迟到学生
            </v-chip>
            <v-chip :color="excludeAbsent ? 'error' : 'default'" :variant="excludeAbsent ? 'flat' : 'outlined'" size="small" @click="excludeAbsent = !excludeAbsent">
              <v-icon start size="small">mdi-account-off-outline</v-icon>
              排除请假学生
            </v-chip>
            <v-chip :color="excludeExcluded ? 'grey' : 'default'" :variant="excludeExcluded ? 'flat' : 'outlined'" size="small" @click="excludeExcluded = !excludeExcluded">
              <v-icon start size="small">mdi-account-cancel-outline</v-icon>
              排除不参与学生
            </v-chip>
          </div>
        </template>

        <template v-else>
          <div class="text-overline text-medium-emphasis mb-4">抽取结果</div>
          <div class="d-flex flex-wrap justify-center mb-6" style="gap: 12px" data-tutorial-anchor="random-result">
            <v-chip
              v-for="(item, index) in results"
              :key="item.id"
              class="result-chip"
              color="primary"
              size="x-large"
              variant="elevated"
            >
              <span class="num">{{ mode === 'number' ? item.studentNo || '无学号' : item.name }}</span>
              <span class="ml-2 text-caption" style="opacity: 0.7">{{ index + 1 }}</span>
            </v-chip>
          </div>

          <div class="d-flex justify-center" style="gap: 8px">
            <v-btn color="primary" prepend-icon="mdi-refresh" variant="elevated" @click="spin">再抽一次</v-btn>
            <v-btn variant="outlined" @click="results = []">返回设置</v-btn>
          </div>
        </template>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'

export interface PickerStudent {
  id: string
  name: string
  studentNo?: string | null
}

const props = withDefaults(
  defineProps<{
    modelValue: boolean
    students: PickerStudent[]
    attendance?: Record<string, string>
    /** 默认抽取人数（randomPicker.defaultCount） */
    defaultCount?: number
    /** 默认模式：姓名 / 学号（randomPicker.mode） */
    defaultMode?: 'name' | 'number'
    defaultExcludeAbsent?: boolean
    defaultExcludeExcluded?: boolean
    /** 默认排除迟到学生（randomPicker.excludeLate） */
    defaultExcludeLate?: boolean
    /** 学号模式下的号码范围（randomPicker.minNumber / maxNumber） */
    minNumber?: number
    maxNumber?: number
    /** 是否播放滚动动画（randomPicker.animation） */
    spinAnimation?: boolean
  }>(),
  {
    attendance: () => ({}),
    defaultCount: 1,
    defaultMode: 'name',
    defaultExcludeAbsent: true,
    defaultExcludeExcluded: true,
    defaultExcludeLate: false,
    minNumber: 1,
    maxNumber: 60,
    spinAnimation: true,
  },
)

const emit = defineEmits<{ 'update:modelValue': [value: boolean]; picked: [] }>()

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
})

const count = ref(clampCount(props.defaultCount))
const mode = ref<'name' | 'number'>(resolveInitialMode())
const includeLate = ref(!props.defaultExcludeLate)
const excludeAbsent = ref(props.defaultExcludeAbsent)
const excludeExcluded = ref(props.defaultExcludeExcluded)
const spinning = ref(false)
const results = ref<PickerStudent[]>([])
const showPool = ref(false)

/** 学号模式：按设置里的学号范围生成号码池 */
const numberPool = computed<PickerStudent[]>(() => {
  const min = Math.min(props.minNumber, props.maxNumber)
  const max = Math.max(props.minNumber, props.maxNumber)
  const list: PickerStudent[] = []
  for (let no = min; no <= max; no += 1) {
    list.push({ id: 'no-' + no, name: String(no), studentNo: String(no) })
  }
  return list
})

const namePool = computed(() => {
  return props.students.filter((student) => {
    const status = props.attendance[student.id] ?? 'present'
    if (status === 'absent' && excludeAbsent.value) return false
    if (status === 'excluded' && excludeExcluded.value) return false
    if (status === 'late' && !includeLate.value) return false
    return true
  })
})

/** 是否已录入学生名单：没有名单时姓名池为空，只能按学号范围抽 */
const hasRoster = computed(() => props.students.length > 0)

/** 没有名单时强制学号模式，有名单时按设置里的默认模式 */
function resolveInitialMode(): 'name' | 'number' {
  if (props.students.length === 0) return 'number'
  return props.defaultMode === 'number' ? 'number' : 'name'
}

/** 学号模式的区间文案，例如「1 - 60」 */
const numberRangeLabel = computed(() => {
  const min = Math.min(props.minNumber, props.maxNumber)
  const max = Math.max(props.minNumber, props.maxNumber)
  return min + ' - ' + max
})

const pool = computed(() => (mode.value === 'number' ? numberPool.value : namePool.value))

const maxCount = computed(() => Math.max(1, pool.value.length))

function clampCount(value: number, max = Number.POSITIVE_INFINITY): number {
  const numeric = Number(value)
  const safe = Number.isFinite(numeric) ? Math.round(numeric) : 1
  return Math.min(Math.max(1, safe), Math.max(1, max))
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      results.value = []
      spinning.value = false
      mode.value = resolveInitialMode()
      excludeAbsent.value = props.defaultExcludeAbsent
      excludeExcluded.value = props.defaultExcludeExcluded
      includeLate.value = !props.defaultExcludeLate
      count.value = clampCount(props.defaultCount, maxCount.value)
    }
  },
)

// 切换模式 / 池子变化后，人数不能超过池子容量
watch([mode, maxCount], () => {
  count.value = clampCount(count.value, maxCount.value)
})

// 名单被清空或还没同步进来时，自动切到学号模式，避免姓名池为 0 无法抽取
watch(hasRoster, (has) => {
  if (!has) {
    mode.value = 'number'
    return
  }
  if (mode.value === 'number' && props.defaultMode !== 'number') {
    // 名单恢复后回到设置里的默认模式
    mode.value = 'name'
  }
})

function pick(): PickerStudent[] {
  const source = [...pool.value]
  const n = Math.min(count.value, source.length)
  const picked: PickerStudent[] = []
  for (let i = 0; i < n; i += 1) {
    const index = Math.floor(Math.random() * source.length)
    const [item] = source.splice(index, 1)
    if (item) picked.push(item)
  }
  return picked
}

function spin(): void {
  if (spinning.value || pool.value.length === 0) return
  // 关闭滚动动画后直接出结果
  if (!props.spinAnimation) {
    results.value = pick()
    emit('picked')
    return
  }
  spinning.value = true
  let ticks = 0
  const timer = window.setInterval(() => {
    ticks += 1
    if (ticks % 3 === 0) {
      results.value = pick()
    }
    if (ticks > 24) {
      window.clearInterval(timer)
      results.value = pick()
      spinning.value = false
      emit('picked')
    }
  }, 60)
}

function close(): void {
  visible.value = false
}
</script>

<style scoped>
.result-chip {
  font-size: 22px;
  padding: 0 20px;
  height: 56px;
}
</style>
