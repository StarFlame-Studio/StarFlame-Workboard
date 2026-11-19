<template>
  <div>
    <div class="d-flex align-center ga-2 mb-4">
      <div class="text-subtitle-2">共 {{ exams.length }} 场考试</div>
      <v-spacer />
      <v-btn size="small" variant="tonal" prepend-icon="mdi-refresh" :loading="loading" @click="load">刷新</v-btn>
      <v-btn size="small" color="primary" variant="flat" prepend-icon="mdi-plus" @click="openCreate">新建考试</v-btn>
    </div>

    <v-alert v-if="error" type="error" variant="tonal" density="compact" class="mb-4" closable @click:close="error = ''">{{ error }}</v-alert>

    <!-- 骨架：考试列表本身是表格形态，用表格骨架 -->
    <div v-if="loading" class="sf-skel-surface" style="padding: 6px 8px">
      <SfTableSkeleton :cols="5" :rows="6" />
    </div>

    <v-card v-else-if="!exams.length" variant="outlined" class="pa-8 text-center">
      <v-icon size="40" color="medium-emphasis">mdi-calendar-blank-outline</v-icon>
      <div class="text-body-2 text-medium-emphasis mt-2">还没有考试安排，点击右上角「新建考试」。</div>
    </v-card>

    <v-card v-else variant="outlined">
      <v-table density="comfortable">
        <thead>
          <tr>
            <th>名称</th>
            <th class="col-hide-sm" style="width: 110px">状态</th>
            <th class="col-hide-sm" style="width: 90px">科目数</th>
            <th style="width: 210px">首场时间</th>
            <th style="width: 200px">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="exam in exams" :key="exam.id">
            <td>
              <div class="font-weight-medium text-no-wrap">{{ exam.title }}</div>
              <div v-if="mobile" class="cell-sub">
                {{ exam.status === 'finished' ? '已结束' : '待进行' }} · {{ exam.subjects.length }} 个科目
              </div>
              <div v-if="exam.note" class="text-caption text-medium-emphasis">{{ exam.note }}</div>
            </td>
            <td class="col-hide-sm">
              <v-chip size="x-small" variant="tonal" :color="exam.status === 'finished' ? 'success' : 'info'">
                {{ exam.status === 'finished' ? '已结束' : '待进行' }}
              </v-chip>
            </td>
            <td class="col-hide-sm">{{ exam.subjects.length }}</td>
            <td class="text-caption">{{ formatTime(firstTime(exam)) }}</td>
            <td>
              <div class="row-actions">
                <v-btn size="x-small" variant="text" @click="openEdit(exam)">编辑</v-btn>
                <v-btn size="x-small" variant="text" @click="toggleStatus(exam)">{{ exam.status === 'finished' ? '标记待进行' : '标记已结束' }}</v-btn>
                <v-btn size="x-small" variant="text" color="error" @click="requestDelete(exam)">删除</v-btn>
              </div>
            </td>
          </tr>
        </tbody>
      </v-table>
    </v-card>

    <v-dialog v-model="dialog" max-width="760" persistent scrollable>
      <v-card>
        <v-card-title class="text-subtitle-1">{{ form.id ? '编辑考试' : '新建考试' }}</v-card-title>
        <v-card-text>
          <v-alert v-if="formError" type="error" variant="tonal" density="compact" class="mb-3">{{ formError }}</v-alert>
          <v-row dense>
            <v-col cols="12" md="8">
              <v-text-field v-model="form.title" label="考试名称" density="compact" variant="outlined" maxlength="64" counter />
            </v-col>
            <v-col cols="12" md="4">
              <v-text-field v-model="form.room" label="总考场（可选）" density="compact" variant="outlined" maxlength="64" />
            </v-col>
            <v-col cols="12">
              <v-text-field v-model="form.note" label="备注（可选）" density="compact" variant="outlined" maxlength="255" />
            </v-col>
          </v-row>

          <div class="d-flex align-center mt-3 mb-1">
            <div class="text-subtitle-2">考试科目</div>
            <v-spacer />
            <v-btn size="x-small" variant="text" prepend-icon="mdi-plus" @click="addRow">添加科目</v-btn>
          </div>

          <v-card v-for="(row, index) in form.subjects" :key="index" variant="tonal" class="pa-3 mb-2">
            <v-row dense>
              <v-col cols="12" md="4">
                <v-select v-model="row.subjectId" :items="subjectOptions" label="关联科目" density="compact" variant="outlined" hide-details clearable />
              </v-col>
              <v-col cols="12" md="4">
                <v-text-field v-model="row.name" label="显示名称" density="compact" variant="outlined" hide-details maxlength="32" :disabled="!!row.subjectId" />
              </v-col>
              <v-col cols="12" md="4">
                <v-text-field v-model="row.room" label="考场（可选）" density="compact" variant="outlined" hide-details maxlength="64" />
              </v-col>
              <v-col cols="12" md="5">
                <v-text-field v-model="row.startAt" type="datetime-local" label="开始" density="compact" variant="outlined" hide-details />
              </v-col>
              <v-col cols="12" md="5">
                <v-text-field v-model="row.endAt" type="datetime-local" label="结束" density="compact" variant="outlined" hide-details />
              </v-col>
              <v-col cols="12" md="2" class="d-flex align-center justify-end">
                <v-btn size="x-small" variant="text" color="error" icon="mdi-delete-outline" @click="form.subjects.splice(index, 1)" />
              </v-col>
            </v-row>
          </v-card>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="dialog = false">取消</v-btn>
          <v-btn color="primary" variant="flat" :loading="saving" @click="submit">保存</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog :model-value="!!deleting" max-width="380">
      <v-card>
        <v-card-title class="text-subtitle-1">删除考试</v-card-title>
        <v-card-text>确定删除「{{ deleting?.title }}」？该操作不可撤销。</v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="deleting = null">取消</v-btn>
          <v-btn color="error" variant="flat" :loading="saving" @click="confirmDelete">删除</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <ToastBar :toast="toast" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useDisplay } from 'vuetify'
import { ApiError } from '../../lib/api'
import { createExam, deleteExam, getExams, getBootstrap, updateExam, type Exam, type Subject } from '../../lib/boardApi'
import { useToast } from '../../composables/useToast'
import SfTableSkeleton from '../skeleton/SfTableSkeleton.vue'
import ToastBar from './ToastBar.vue'

const props = defineProps<{ classId: string }>()

const { mobile } = useDisplay()

interface Row {
  subjectId: string | null
  name: string
  startAt: string
  endAt: string
  room: string
}
interface FormState {
  id: string
  title: string
  note: string
  room: string
  subjects: Row[]
}

const { toast, notify } = useToast()
const exams = ref<Exam[]>([])
const subjects = ref<Subject[]>([])
const loading = ref(true)
const saving = ref(false)
const error = ref('')
const formError = ref('')
const dialog = ref(false)
const deleting = ref<Exam | null>(null)
const form = reactive<FormState>({ id: '', title: '', note: '', room: '', subjects: [] })

const subjectOptions = computed(() => subjects.value.map((s) => ({ title: s.name, value: s.id })))

function toLocalInput(value: string): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const offset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

function toIso(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString()
}

function formatTime(value: string): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  const pad = (n: number) => String(n).padStart(2, '0')
  return date.getFullYear() + '/' + pad(date.getMonth() + 1) + '/' + pad(date.getDate()) + ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes())
}

function firstTime(exam: Exam): string {
  const times = exam.subjects.map((s) => s.startAt).filter(Boolean).sort()
  return times[0] ?? ''
}

function emptyRow(): Row {
  const now = new Date()
  now.setMinutes(0, 0, 0)
  const later = new Date(now.getTime() + 90 * 60000)
  return { subjectId: null, name: '', startAt: toLocalInput(now.toISOString()), endAt: toLocalInput(later.toISOString()), room: '' }
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    exams.value = await getExams(props.classId)
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : '加载考试失败'
  } finally {
    loading.value = false
  }
}

function openCreate() {
  form.id = ''
  form.title = ''
  form.note = ''
  form.room = ''
  form.subjects = [emptyRow()]
  formError.value = ''
  dialog.value = true
}

function openEdit(exam: Exam) {
  form.id = exam.id
  form.title = exam.title
  form.note = exam.note ?? ''
  form.room = exam.room ?? ''
  form.subjects = exam.subjects.map((s) => ({
    subjectId: s.subjectId ?? null,
    name: s.name ?? '',
    startAt: toLocalInput(s.startAt),
    endAt: toLocalInput(s.endAt),
    room: s.room ?? '',
  }))
  formError.value = ''
  dialog.value = true
}

function addRow() {
  form.subjects.push(emptyRow())
}

function validate(): string {
  if (!form.title.trim()) return '请填写考试名称'
  if (!form.subjects.length) return '至少需要一个考试科目'
  for (const row of form.subjects) {
    if (!row.subjectId && !row.name.trim()) return '每个科目需要选择关联科目或填写名称'
    if (!row.startAt || !row.endAt) return '每个科目都需要开始与结束时间'
    const start = new Date(row.startAt).getTime()
    const end = new Date(row.endAt).getTime()
    if (end <= start) return '结束时间必须晚于开始时间'
  }
  return ''
}

async function submit() {
  const message = validate()
  if (message) {
    formError.value = message
    return
  }
  saving.value = true
  formError.value = ''
  const payload = {
    title: form.title.trim(),
    note: form.note.trim() || null,
    room: form.room.trim() || null,
    subjects: form.subjects.map((row) => {
      return {
        subjectId: row.subjectId || null,
        name: row.subjectId ? null : row.name.trim() || null,
        startAt: toIso(row.startAt),
        endAt: toIso(row.endAt),
        room: row.room.trim() || null,
      }
    }),
  }
  try {
    if (form.id) {
      await updateExam(props.classId, form.id, payload)
      notify('考试已更新')
    } else {
      await createExam(props.classId, payload)
      notify('考试已创建')
    }
    dialog.value = false
    await load()
  } catch (e) {
    formError.value = e instanceof ApiError ? e.message : '保存失败'
  } finally {
    saving.value = false
  }
}

async function toggleStatus(exam: Exam) {
  try {
    await updateExam(props.classId, exam.id, { status: exam.status === 'finished' ? 'planned' : 'finished' })
    notify('状态已更新')
    await load()
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : '更新失败'
  }
}

function requestDelete(exam: Exam) {
  deleting.value = exam
}

async function confirmDelete() {
  if (!deleting.value) return
  saving.value = true
  try {
    await deleteExam(props.classId, deleting.value.id)
    notify('考试已删除')
    deleting.value = null
    await load()
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : '删除失败'
  } finally {
    saving.value = false
  }
}

onMounted(async () => {
  await load()
  try {
    const data = await getBootstrap(props.classId)
    subjects.value = data.subjects
  } catch {
    subjects.value = []
  }
})
</script>
