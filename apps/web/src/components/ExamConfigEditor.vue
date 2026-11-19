<template>
  <div>
    <v-alert v-if="error" border="start" class="mb-4" closable type="error" variant="tonal" @click:close="error = ''">
      <div class="d-flex align-center">
        <v-icon class="mr-2">mdi-alert-circle</v-icon>
        {{ error }}
      </div>
    </v-alert>
    <v-alert v-if="success" border="start" class="mb-4" closable type="success" variant="tonal" @click:close="success = ''">
      <div class="d-flex align-center">
        <v-icon class="mr-2">mdi-check-circle</v-icon>
        {{ success }}
      </div>
    </v-alert>

    <v-alert v-if="isEditMode && validationErrors.length > 0" border="start" class="mb-4" type="warning" variant="tonal">
      <div class="font-weight-bold">配置验证失败，请检查以下问题：</div>
      <v-list class="bg-transparent" density="compact">
        <v-list-item v-for="(item, index) in validationErrors" :key="index" class="px-0 py-0">
          <template #prepend>
            <v-icon color="warning" size="small">mdi-circle-small</v-icon>
          </template>
          <v-list-item-title class="text-body-2">{{ item }}</v-list-item-title>
        </v-list-item>
      </v-list>
    </v-alert>

    <!-- 操作按钮行 -->
    <div class="d-flex flex-wrap align-center mb-4" style="gap: 8px">
      <v-btn
        :disabled="!isValidConfig"
        color="success"
        prepend-icon="mdi-open-in-new"
        size="small"
        variant="elevated"
        @click="openConfig"
      >
        打开 ExamSchedule
      </v-btn>
      <v-btn :disabled="!isValidConfig" color="primary" prepend-icon="mdi-link-variant" size="small" variant="elevated" @click="copyConfigUrl">
        复制远程链接
      </v-btn>
      <v-btn :disabled="!isValidConfig" color="primary" prepend-icon="mdi-download" size="small" variant="elevated" @click="downloadAsJson">
        JSON 文件
      </v-btn>
      <v-btn :disabled="!isValidConfig" color="primary" prepend-icon="mdi-download" size="small" variant="elevated" @click="downloadAsEa2">
        .ea2 文件
      </v-btn>
      <v-btn :disabled="!isValidConfig" color="secondary" prepend-icon="mdi-play-circle" size="small" variant="elevated" @click="openInEa2Player">
        拉起EA2播放器
      </v-btn>
      <v-spacer />
      <v-btn-toggle v-model="isEditMode" color="primary" divided variant="outlined">
        <v-btn :value="false" prepend-icon="mdi-eye" size="small">查看</v-btn>
        <v-btn :value="true" prepend-icon="mdi-pencil" size="small">编辑</v-btn>
      </v-btn-toggle>
    </div>

    <!-- 查看模式 -->
    <div v-if="!isEditMode">
      <div class="mb-2">
        <div class="text-h4 font-weight-bold" style="line-height: 1.35">{{ draft.examName || '未命名考试' }}</div>
        <div class="text-body-1 text-medium-emphasis mt-2">{{ draft.message }}</div>
        <v-chip v-if="draft.room" class="mt-3" prepend-icon="mdi-home-city" size="small" variant="tonal">
          考场: {{ draft.room }}
        </v-chip>
      </div>

      <v-row class="mt-2">
        <v-col v-for="(info, index) in draft.examInfos" :key="index" cols="12" md="6">
          <v-card border class="h-100" variant="flat">
            <v-card-title class="d-flex align-center py-3">
              <v-icon class="mr-2" color="primary" size="small">mdi-book-open-page-variant</v-icon>
              <span class="text-h6 font-weight-bold">{{ subjectName(info.subjectId) }}</span>
            </v-card-title>
            <v-card-text>
              <div class="d-flex align-center mb-2">
                <v-icon class="mr-2" color="success" size="small">mdi-clock-start</v-icon>
                <div>
                  <div class="text-caption text-medium-emphasis">开始时间</div>
                  <div class="text-body-1 font-weight-medium text-success">{{ formatDisplay(info.start) }}</div>
                </div>
              </div>
              <div class="d-flex align-center">
                <v-icon class="mr-2" color="error" size="small">mdi-clock-end</v-icon>
                <div>
                  <div class="text-caption text-medium-emphasis">结束时间</div>
                  <div class="text-body-1 font-weight-medium text-error">{{ formatDisplay(info.end) }}</div>
                </div>
              </div>
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>

      <v-card class="mt-4" variant="outlined">
        <v-card-title class="d-flex align-center py-2 px-4">
          <v-icon class="mr-2" size="small">mdi-code-json</v-icon>
          <span class="text-body-2">配置预览</span>
          <v-spacer />
          <v-btn prepend-icon="mdi-content-copy" size="small" variant="text" @click="copyStorageJson">复制</v-btn>
          <v-btn :icon="showPreview ? 'mdi-chevron-up' : 'mdi-chevron-down'" size="small" variant="text" @click="showPreview = !showPreview" />
        </v-card-title>
        <v-expand-transition>
          <div v-if="showPreview">
            <v-divider />
            <v-card-text>
              <pre class="json-preview">{{ storageJson }}</pre>
            </v-card-text>
          </div>
        </v-expand-transition>
      </v-card>
    </div>

    <!-- 编辑模式 -->
    <div v-else>
      <v-row dense>
        <v-col cols="12" md="5">
          <v-text-field v-model="draft.examName" label="考试名称" prepend-inner-icon="mdi-calendar-text" variant="outlined" />
        </v-col>
        <v-col cols="12" md="5">
          <v-text-field v-model="draft.message" label="描述" prepend-inner-icon="mdi-information-outline" variant="outlined" />
        </v-col>
        <v-col cols="12" md="2">
          <v-text-field v-model="draft.room" label="考场" prepend-inner-icon="mdi-home-city" variant="outlined" />
        </v-col>
      </v-row>

      <div class="d-flex align-center mb-3">
        <div class="text-subtitle-1 font-weight-bold">
          <v-icon class="mr-1" size="small">mdi-book-multiple</v-icon>
          考试安排（{{ draft.examInfos.length }} 堂）
        </div>
        <v-spacer />
        <v-btn color="primary" prepend-icon="mdi-plus" size="small" variant="tonal" @click="addRow">添加科目</v-btn>
      </div>

      <v-card border variant="flat">
        <v-table density="comfortable">
          <thead>
            <tr>
              <th style="width: 180px">科目</th>
              <th>开始时间</th>
              <th>结束时间</th>
              <th style="width: 64px"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(info, index) in draft.examInfos" :key="index">
              <td>
                <v-combobox
                  v-model="info.subjectId"
                  density="compact"
                  hide-details
                  :items="subjectNames"
                  placeholder="选择或输入科目"
                  variant="outlined"
                />
              </td>
              <td><v-text-field v-model="info.start" density="compact" hide-details type="datetime-local" variant="outlined" /></td>
              <td><v-text-field v-model="info.end" density="compact" hide-details type="datetime-local" variant="outlined" /></td>
              <td><v-btn color="error" icon="mdi-delete" size="small" variant="text" @click="removeRow(index)" /></td>
            </tr>
            <tr v-if="draft.examInfos.length === 0">
              <td class="text-center text-medium-emphasis py-6" colspan="4">还没有考试安排，点击「添加科目」开始</td>
            </tr>
          </tbody>
        </v-table>
      </v-card>
    </div>

    <div class="d-flex justify-space-between align-center mt-4">
      <v-btn color="error" prepend-icon="mdi-delete" variant="outlined" @click="$emit('delete')">删除配置</v-btn>
      <v-btn :disabled="validationErrors.length > 0" :loading="saving" color="success" prepend-icon="mdi-content-save" variant="elevated" @click="save">
        保存配置
      </v-btn>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import type { SubjectInfo } from '@starflame/shared'
import { apiBase } from '@/lib/api'

export interface ExamInfoRow {
  subjectId: string
  start: string
  end: string
}

export interface ExamConfigDraft {
  examName: string
  message: string
  room: string
  examInfos: ExamInfoRow[]
}

const props = withDefaults(
  defineProps<{
    modelValue: ExamConfigDraft
    subjects: SubjectInfo[]
    saving?: boolean
    examId?: string
  }>(),
  { saving: false, examId: '' },
)

const emit = defineEmits<{
  'update:modelValue': [value: ExamConfigDraft]
  save: [value: ExamConfigDraft]
  delete: []
}>()

const error = ref('')
const success = ref('')
const isEditMode = ref(false)
const showPreview = ref(false)

const draft = reactive<ExamConfigDraft>({
  examName: props.modelValue.examName,
  message: props.modelValue.message,
  room: props.modelValue.room ?? '',
  examInfos: props.modelValue.examInfos.map((item) => ({ ...item })),
})

const subjectNames = computed(() => props.subjects.map((item) => item.name))

watch(
  () => props.modelValue,
  (value) => {
    draft.examName = value.examName
    draft.message = value.message
    draft.room = value.room ?? ''
    draft.examInfos = value.examInfos.map((item) => ({ ...item }))
  },
  { deep: true },
)

function subjectName(id: string): string {
  if (!id) return '未命名科目'
  const hit = props.subjects.find((item) => item.id === id || item.name === id)
  return hit?.name ?? id
}

// 原项目展示格式 YYYY/MM/DD HH:mm
function formatDisplay(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value || '—'
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    date.getFullYear() + '/' + pad(date.getMonth() + 1) + '/' + pad(date.getDate()) +
    ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes())
  )
}

// 存储格式（与 .json / .ea2 / 公开接口一致）
const storageObject = computed(() => ({
  examName: draft.examName,
  message: draft.message,
  room: draft.room,
  examInfos: draft.examInfos.map((info) => ({
    name: subjectName(info.subjectId),
    start: formatDisplay(info.start),
    end: formatDisplay(info.end),
    alertTime: 15,
  })),
}))

const storageJson = computed(() => JSON.stringify(storageObject.value, null, 2))

const configUrl = computed(() => (props.examId ? apiBase + '/public/exams/' + props.examId : ''))

const isValidConfig = computed(
  () =>
    Boolean(draft.examName?.trim()) &&
    draft.examInfos.length > 0 &&
    draft.examInfos.every((info) => info.subjectId && info.start && info.end),
)

const validationErrors = computed(() => {
  const errors: string[] = []
  if (!draft.examName.trim()) errors.push('考试名称不能为空')
  if (draft.examInfos.length === 0) errors.push('至少需要安排一堂考试')
  draft.examInfos.forEach((info, index) => {
    if (!info.subjectId) errors.push('第 ' + (index + 1) + ' 行未选择科目')
    if (!info.start) errors.push('第 ' + (index + 1) + ' 行缺少开始时间')
    if (!info.end) errors.push('第 ' + (index + 1) + ' 行缺少结束时间')
    if (info.start && info.end && new Date(info.start) >= new Date(info.end)) {
      errors.push('第 ' + (index + 1) + ' 行结束时间必须晚于开始时间')
    }
  })
  return errors
})

function addRow(): void {
  draft.examInfos.push({ subjectId: props.subjects[0]?.id ?? '', start: '', end: '' })
}

function removeRow(index: number): void {
  draft.examInfos.splice(index, 1)
}

async function openConfig(): Promise<void> {
  if (!configUrl.value) {
    error.value = '请先保存配置再打开'
    return
  }
  const url = 'https://es.examaware.cn/exam/?configUrl=' + encodeURIComponent(configUrl.value)
  window.open(url, '_blank')
  success.value = '已在新窗口打开 ExamSchedule'
}

async function copyConfigUrl(): Promise<void> {
  if (!configUrl.value) {
    error.value = '请先保存配置再复制链接'
    return
  }
  try {
    await navigator.clipboard.writeText(configUrl.value)
    success.value = '云端地址已复制到剪贴板'
  } catch {
    error.value = '复制失败，请手动复制：' + configUrl.value
  }
}

async function copyStorageJson(): Promise<void> {
  try {
    await navigator.clipboard.writeText(storageJson.value)
    success.value = '配置已复制到剪贴板'
  } catch {
    error.value = '复制失败'
  }
}

function download(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function downloadAsJson(): void {
  download((draft.examName || 'exam-config') + '.json', storageJson.value)
  success.value = '已下载 JSON 文件'
}

function downloadAsEa2(): void {
  download((draft.examName || 'exam-config') + '.ea2', storageJson.value)
  success.value = '已下载 ExamAware2 知试（.ea2）文件'
}

function openInEa2Player(): void {
  try {
    const base64Data = btoa(unescape(encodeURIComponent(JSON.stringify(storageObject.value))))
    window.location.href = 'examaware://player?data=' + encodeURIComponent(base64Data)
    success.value = '正在拉起 EA2 播放器'
  } catch {
    error.value = '拉起 EA2 播放器失败'
  }
}

function save(): void {
  if (validationErrors.value.length > 0) return
  emit('save', {
    examName: draft.examName.trim(),
    message: draft.message.trim(),
    room: draft.room.trim(),
    examInfos: draft.examInfos.map((item) => ({ ...item })),
  })
}

function setError(message: string): void {
  error.value = message
}

function setSuccess(message: string): void {
  success.value = message
}

defineExpose({ setError, setSuccess })
</script>

<style scoped>
.json-preview {
  max-height: 320px;
  overflow: auto;
  font-size: 12px;
  line-height: 1.6;
  margin: 0;
  white-space: pre-wrap;
  word-break: break-all;
}

.h-100 {
  height: 100%;
}
</style>
