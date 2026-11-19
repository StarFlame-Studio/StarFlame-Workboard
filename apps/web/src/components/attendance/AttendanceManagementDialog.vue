<template>
  <v-dialog v-model="visible" max-width="860" scrollable>
    <v-card>
      <v-card-title class="d-flex align-center">
        出勤管理 · {{ dateText }}
        <v-spacer />
        <v-btn icon="mdi-close" variant="text" @click="visible = false" />
      </v-card-title>
      <v-divider />
      <v-card-text class="pa-4">
        <div class="d-flex flex-wrap align-center mb-4" style="gap: 8px">
          <v-chip color="success" variant="tonal">实到 {{ stats.present }}</v-chip>
          <v-chip color="error" variant="tonal">请假 {{ stats.absent }}</v-chip>
          <v-chip color="warning" variant="tonal">迟到 {{ stats.late }}</v-chip>
          <v-chip color="grey" variant="tonal">不参与 {{ stats.excluded }}</v-chip>
          <v-spacer />
          <v-text-field v-model="keyword" clearable density="compact" hide-details placeholder="搜索姓名" prepend-inner-icon="mdi-magnify" style="max-width: 180px" />
        </div>

        <div v-if="students.length === 0" class="py-10 text-center text-medium-emphasis">
          <v-icon class="mb-2" icon="mdi-account-off-outline" size="36" />
          <div>还没有学生，请先添加花名册</div>
        </div>

        <div v-else class="student-grid">
          <v-card
            v-for="student in filtered"
            :key="student.id"
            class="pa-3 student-card"
            :class="statusClass(student.id)"
            variant="flat"
            @click="cycleStatus(student.id)"
          >
            <div class="d-flex align-center justify-space-between">
              <span class="font-weight-medium">{{ student.name }}</span>
              <v-chip :color="statusColor(student.id)" size="x-small" variant="flat">
                {{ statusLabel(student.id) }}
              </v-chip>
            </div>
          </v-card>
        </div>
      </v-card-text>
      <v-divider />
      <v-card-actions class="pa-4">
        <v-btn variant="text" @click="resetAll">全部出勤</v-btn>
        <v-spacer />
        <v-btn variant="text" @click="visible = false">取消</v-btn>
        <v-btn :loading="saving" color="primary" variant="elevated" @click="save">保存</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { AttendanceStatus, StudentItem } from '@starflame/shared'
import { getData, putData } from '@/lib/api'

const props = defineProps<{
  modelValue: boolean
  students: StudentItem[]
  date: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  saved: []
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
})

const STATUS_ORDER: AttendanceStatus[] = ['present', 'absent', 'late', 'excluded']
const LABELS: Record<AttendanceStatus, string> = {
  present: '出勤',
  absent: '请假',
  late: '迟到',
  excluded: '不参与',
}
const COLORS: Record<AttendanceStatus, string> = {
  present: 'success',
  absent: 'error',
  late: 'warning',
  excluded: 'grey',
}

const statuses = ref<Record<string, AttendanceStatus>>({})
const saving = ref(false)
const keyword = ref('')

const dateText = computed(() => props.date)

const filtered = computed(() => {
  const key = keyword.value.trim()
  if (!key) return props.students
  return props.students.filter((item) => item.name.includes(key))
})

const stats = computed(() => {
  const counters = { present: 0, absent: 0, late: 0, excluded: 0 }
  for (const student of props.students) {
    const status = statuses.value[student.id] ?? 'present'
    counters[status] += 1
  }
  return counters
})

function statusOf(id: string): AttendanceStatus {
  return statuses.value[id] ?? 'present'
}

function statusLabel(id: string): string {
  return LABELS[statusOf(id)]
}

function statusColor(id: string): string {
  return COLORS[statusOf(id)]
}

function statusClass(id: string): string {
  return 'is-' + statusOf(id)
}

function cycleStatus(id: string): void {
  const current = statusOf(id)
  const index = STATUS_ORDER.indexOf(current)
  const next = STATUS_ORDER[(index + 1) % STATUS_ORDER.length] ?? 'present'
  statuses.value = { ...statuses.value, [id]: next }
}

function resetAll(): void {
  const next: Record<string, AttendanceStatus> = {}
  for (const student of props.students) next[student.id] = 'present'
  statuses.value = next
}

async function loadAttendance(): Promise<void> {
  try {
    const result = await getData<{ records: Array<{ studentId: string; status: AttendanceStatus }> }>(
      '/board/attendance',
      { date: props.date },
    )
    const next: Record<string, AttendanceStatus> = {}
    for (const student of props.students) next[student.id] = 'present'
    for (const record of result.records) next[record.studentId] = record.status
    statuses.value = next
  } catch {
    resetAll()
  }
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) void loadAttendance()
  },
)

async function save(): Promise<void> {
  if (saving.value) return
  saving.value = true
  try {
    await putData('/board/attendance', {
      date: props.date,
      records: props.students.map((student) => ({
        studentId: student.id,
        status: statusOf(student.id),
      })),
    })
    emit('saved')
    visible.value = false
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.student-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 10px;
}

.student-card {
  cursor: pointer;
  transition: all 0.15s ease;
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.student-card:hover {
  transform: translateY(-2px);
}

.is-present {
  background: rgba(47, 191, 113, 0.12);
}

.is-absent {
  background: rgba(229, 72, 77, 0.12);
}

.is-late {
  background: rgba(255, 176, 58, 0.12);
}

.is-excluded {
  background: rgba(138, 147, 166, 0.12);
}
</style>
