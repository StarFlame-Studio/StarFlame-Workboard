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

          <div class="d-flex justify-center mb-6">
            <v-btn-toggle v-model="mode" color="primary" divided mandatory variant="outlined">
              <v-btn prepend-icon="mdi-account" value="name" size="small">姓名模式</v-btn>
              <v-btn prepend-icon="mdi-card-account-details" value="number" size="small">学号模式</v-btn>
            </v-btn-toggle>
          </div>

          <v-btn
            :disabled="pool.length === 0 || spinning"
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
            当前可抽取学生: {{ pool.length }}人
            <v-btn class="ml-1" icon="mdi-information-outline" size="x-small" variant="text" @click="showPool = !showPool" />
          </div>

          <div v-if="showPool" class="text-caption text-medium-emphasis mb-4" style="line-height: 1.8">
            {{ pool.map((item) => item.name).join('、') || '无' }}
          </div>

          <div class="d-flex justify-center flex-wrap" style="gap: 8px">
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
          <div class="d-flex flex-wrap justify-center mb-6" style="gap: 12px">
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
    defaultNameMode?: boolean
    defaultExcludeAbsent?: boolean
  }>(),
  { attendance: () => ({}), defaultNameMode: true, defaultExcludeAbsent: true },
)

const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
})

const count = ref(1)
const mode = ref<'name' | 'number'>(props.defaultNameMode ? 'name' : 'number')
const includeLate = ref(false)
const excludeAbsent = ref(props.defaultExcludeAbsent)
const excludeExcluded = ref(true)
const spinning = ref(false)
const results = ref<PickerStudent[]>([])
const showPool = ref(false)

const pool = computed(() => {
  return props.students.filter((student) => {
    const status = props.attendance[student.id] ?? 'present'
    if (status === 'absent' && excludeAbsent.value) return false
    if (status === 'excluded' && excludeExcluded.value) return false
    if (status === 'late' && !includeLate.value) return false
    return true
  })
})

const maxCount = computed(() => Math.max(1, pool.value.length))

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      results.value = []
      count.value = 1
      spinning.value = false
      mode.value = props.defaultNameMode ? 'name' : 'number'
      excludeAbsent.value = props.defaultExcludeAbsent
    }
  },
)

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
