<template>
  <div>
    <div class="d-flex flex-wrap align-center ga-2 mb-4">
      <v-btn size="small" variant="tonal" prepend-icon="mdi-chevron-left" @click="shift(-1)">前一天</v-btn>
      <v-btn size="small" variant="tonal" @click="setDate(todayString())">今天</v-btn>
      <v-btn size="small" variant="tonal" append-icon="mdi-chevron-right" @click="shift(1)">后一天</v-btn>
      <v-text-field v-model="date" type="date" density="compact" variant="outlined" hide-details style="max-width: 168px" @update:model-value="reload" />
      <v-spacer />
      <v-btn size="small" variant="tonal" @click="markAll('present')">全部出勤</v-btn>
      <v-btn size="small" color="primary" variant="flat" prepend-icon="mdi-content-save" :loading="saving" :disabled="!dirtyCount" @click="save">保存{{ dirtyCount ? '（' + dirtyCount + '）' : '' }}</v-btn>
    </div>

    <v-alert v-if="error" type="error" variant="tonal" density="compact" class="mb-4" closable @click:close="error = ''">{{ error }}</v-alert>

    <!-- 骨架：姓名列 + 状态按钮组，对齐出勤表 -->
    <div v-if="loading" class="sf-skel-surface" style="padding: 10px 16px">
      <div v-for="n in 6" :key="'att-skel-' + n" class="sf-skel-row" style="gap: 14px; padding: 9px 0">
        <SfSkeleton w="16px" h="12px" radius="5px" />
        <SfSkeleton w="92px" h="13px" radius="6px" />
        <div class="sf-skel-row" style="gap: 6px; margin-left: auto">
          <SfSkeleton w="54px" h="28px" radius="8px" />
          <SfSkeleton w="54px" h="28px" radius="8px" />
          <SfSkeleton w="54px" h="28px" radius="8px" />
          <SfSkeleton w="54px" h="28px" radius="8px" />
        </div>
      </div>
    </div>
    <v-card v-else-if="!students.length" variant="outlined" class="pa-8 text-center">
      <v-icon size="40" color="medium-emphasis">mdi-account-group-outline</v-icon>
      <div class="text-body-2 text-medium-emphasis mt-2">默认名单里还没有学生。</div>
    </v-card>

    <v-card v-else variant="outlined">
      <v-table density="compact">
        <thead>
          <tr>
            <th style="width: 56px">#</th>
            <th class="text-no-wrap">姓名</th>
            <th class="col-status" style="width: 380px">状态</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(student, index) in students" :key="student.id">
            <td class="text-medium-emphasis">{{ index + 1 }}</td>
            <td class="font-weight-medium text-no-wrap">{{ student.name }}</td>
            <td>
              <v-btn-toggle :model-value="statusOf(student.id)" density="compact" variant="outlined" divided mandatory @update:model-value="(value: unknown) => setStatus(student.id, value as AttendanceStatus)">
                <v-btn v-for="option in statusOptions" :key="option.value" :value="option.value" size="small" :color="option.color">{{ option.title }}</v-btn>
              </v-btn-toggle>
            </td>
          </tr>
        </tbody>
      </v-table>
    </v-card>

    <ToastBar :toast="toast" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ApiError } from '../../lib/api'
import { getAttendance, getStudents, saveAttendance, shiftDate, todayString, type AttendanceStatus, type Student } from '../../lib/boardApi'
import { useToast } from '../../composables/useToast'
import SfSkeleton from '../skeleton/SfSkeleton.vue'
import ToastBar from './ToastBar.vue'

const props = defineProps<{ classId: string }>()

const statusOptions: Array<{ title: string; value: AttendanceStatus; color: string }> = [
  { title: '出勤', value: 'present', color: 'success' },
  { title: '请假', value: 'absent', color: 'warning' },
  { title: '迟到', value: 'late', color: 'info' },
  { title: '不参与', value: 'excluded', color: 'grey' },
]

const { toast, notify } = useToast()
const date = ref(todayString())
const students = ref<Student[]>([])
const status = reactive<Record<string, AttendanceStatus>>({})
const savedStatus = reactive<Record<string, AttendanceStatus>>({})
const loading = ref(true)
const saving = ref(false)
const error = ref('')

const dirtyCount = computed(() => Object.keys(status).filter((id) => status[id] !== savedStatus[id]).length)

function statusOf(studentId: string): AttendanceStatus {
  return status[studentId] ?? 'present'
}

function setStatus(studentId: string, value: AttendanceStatus) {
  if (!value) return
  status[studentId] = value
}

function markAll(value: AttendanceStatus) {
  for (const student of students.value) status[student.id] = value
}

async function loadAll() {
  loading.value = true
  error.value = ''
  try {
    students.value = await getStudents(props.classId)
    const records = await getAttendance(props.classId, date.value)
    const map = new Map(records.map((r) => [r.studentId, r.status]))
    for (const student of students.value) {
      const value = map.get(student.id) ?? 'present'
      status[student.id] = value
      savedStatus[student.id] = value
    }
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : '加载考勤失败'
  } finally {
    loading.value = false
  }
}

function reload() {
  void loadAll()
}

function setDate(value: string) {
  if (!value) return
  date.value = value
  void loadAll()
}

function shift(days: number) {
  setDate(shiftDate(date.value, days))
}

async function save() {
  const records = students.value
    .filter((student) => status[student.id] !== savedStatus[student.id])
    .map((student) => ({ studentId: student.id, status: status[student.id] }))
  if (!records.length) return
  saving.value = true
  try {
    await saveAttendance(props.classId, { date: date.value, records })
    for (const record of records) savedStatus[record.studentId] = record.status
    notify('已保存 ' + records.length + ' 条考勤')
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : '保存失败'
  } finally {
    saving.value = false
  }
}

onMounted(loadAll)
</script>
