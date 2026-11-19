<template>
  <settings-card icon="mdi-swap-vertical-bold" subtitle="导出当日作业为图片或 UAF 文件，也可以从 UAF / JSON 备份导入作业内容" title="作业导入导出">
    <div class="d-flex flex-wrap align-center ga-3 mb-3">
      <v-text-field
        v-model="date"
        class="date-field"
        density="compact"
        hide-details
        label="作业日期"
        prepend-inner-icon="mdi-calendar"
        type="date"
        variant="outlined"
        @update:model-value="load"
      />
      <v-btn :loading="loading" prepend-icon="mdi-refresh" variant="text" @click="load">刷新</v-btn>
      <v-spacer />
      <v-chip size="small" variant="tonal">{{ rows.length }} 项作业</v-chip>
    </div>

    <div v-if="rows.length === 0" class="text-body-2 text-medium-emphasis mb-3">
      这一天还没有作业内容，可以先导出空模板，或直接从 UAF / JSON 文件导入。
    </div>

    <v-row dense>
      <v-col cols="12" sm="4">
        <v-btn block :loading="busy === 'png'" color="primary" prepend-icon="mdi-image-outline" variant="elevated" @click="exportImage">
          导出作业图片
        </v-btn>
        <div class="text-caption text-medium-emphasis mt-1">PNG 图片，适合发群或打印</div>
      </v-col>
      <v-col cols="12" sm="4">
        <v-btn block :loading="busy === 'uaf'" color="secondary" prepend-icon="mdi-file-pdf-box" variant="elevated" @click="exportUaf">
          导出 UAF
        </v-btn>
        <div class="text-caption text-medium-emphasis mt-1">PDF 内嵌作业数据，可再次导入</div>
      </v-col>
      <v-col cols="12" sm="4">
        <v-btn block :disabled="readOnly" :loading="busy === 'import'" prepend-icon="mdi-file-import-outline" variant="tonal" @click="pickFile">
          导入 UAF / JSON
        </v-btn>
        <div class="text-caption text-medium-emphasis mt-1">支持 UAF PDF 与作业 JSON 备份</div>
      </v-col>
    </v-row>

    <input ref="fileInput" accept=".pdf,.json,application/pdf,application/json" class="d-none" type="file" @change="onFileChange" />

    <v-btn class="mt-3" prepend-icon="mdi-file-download-outline" size="small" variant="text" @click="exportJson">
      导出作业 JSON 备份
    </v-btn>

    <v-alert v-if="readOnly" class="mt-3" density="compact" type="warning" variant="tonal">
      当前设备为只读授权，只能导出，不能导入作业。
    </v-alert>

    <v-alert v-if="error" class="mt-3" closable density="compact" type="error" variant="tonal" @click:close="error = ''">
      {{ error }}
    </v-alert>

    <v-divider class="my-3" />

    <v-list class="preview-list" density="compact" lines="two">
      <v-list-item v-for="row in rows" :key="row.subject">
        <template #prepend>
          <span class="dot" :style="{ background: row.color || '#f4511e' }" />
        </template>
        <v-list-item-title class="text-body-2 font-weight-medium">{{ row.subject }}</v-list-item-title>
        <v-list-item-subtitle class="preview-text">{{ row.content || '（空）' }}</v-list-item-subtitle>
      </v-list-item>
    </v-list>

    <v-dialog v-model="plan.open" max-width="620" scrollable>
      <v-card>
        <v-card-title class="d-flex align-center">
          <v-icon class="mr-2" color="secondary">mdi-file-import-outline</v-icon>
          确认导入作业
          <v-spacer />
          <v-btn icon="mdi-close" variant="text" @click="plan.open = false" />
        </v-card-title>
        <v-card-subtitle class="pb-2">{{ plan.fileName }}</v-card-subtitle>
        <v-card-text>
          <div class="text-body-2 mb-2">
            共 {{ plan.rows.length }} 项作业，分布在 {{ groups.length }} 个日期。
            <span v-if="plan.skipped">已忽略 {{ plan.skipped }} 行无效数据。</span>
          </div>
          <v-switch
            v-model="plan.overwrite"
            color="secondary"
            density="compact"
            hide-details
            label="覆盖该日期已存在的同名作业"
          />
          <v-expansion-panels class="mt-3" multiple variant="accordion">
            <v-expansion-panel v-for="group in groups" :key="group.date">
              <v-expansion-panel-title>
                {{ displayDate(group.date) }}
                <v-chip class="ml-2" size="x-small" variant="tonal">{{ group.rows.length }} 项</v-chip>
              </v-expansion-panel-title>
              <v-expansion-panel-text>
                <div v-for="row in group.rows" :key="row.key" class="plan-row">
                  <div class="d-flex align-center">
                    <span class="dot mr-2" :style="{ background: row.color || '#f4511e' }" />
                    <span class="text-body-2 font-weight-medium">{{ row.subject }}</span>
                    <v-chip v-if="row.conflict" class="ml-2" color="warning" size="x-small" variant="tonal">已有作业</v-chip>
                    <v-chip v-if="row.unknown" class="ml-2" color="error" size="x-small" variant="tonal">班级无此科目</v-chip>
                  </div>
                  <div class="text-caption text-medium-emphasis preview-text">{{ row.content }}</div>
                </div>
              </v-expansion-panel-text>
            </v-expansion-panel>
          </v-expansion-panels>
        </v-card-text>
        <v-card-actions>
          <v-btn variant="text" @click="plan.open = false">取消</v-btn>
          <v-spacer />
          <v-btn :disabled="importable === 0" :loading="busy === 'import'" color="secondary" variant="elevated" @click="applyImport">
            导入 {{ importable }} 项
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-snackbar v-model="snack.show" :color="snack.color" timeout="2800">{{ snack.text }}</v-snackbar>
  </settings-card>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { getData, putData } from '@/lib/api'
import { useSessionStore } from '@/stores/session'
import SettingsCard from '@/components/settings/SettingsCard.vue'
import {
  buildUafCsv,
  buildUafPdf,
  displayDate,
  downloadBlob,
  extractUafCsv,
  normalizeDate,
  renderHomeworkSheet,
  rowsFromUafCsv,
  safeName,
  todayString,
  type HomeworkSheetRow,
} from '@/lib/homeworkTransfer'

interface SubjectInfo {
  id: string
  name: string
  color?: string | null
}

interface PlanRow extends HomeworkSheetRow {
  key: string
  subjectId: string
  conflict: boolean
  unknown: boolean
  color?: string
}

const JSON_FORMAT = 'starflame-homework'
const JSON_VERSION = 1

const session = useSessionStore()
const readOnly = computed(() => session.readOnly)

const date = ref(todayString())
const subjects = ref<SubjectInfo[]>([])
const rows = ref<HomeworkSheetRow[]>([])
const loading = ref(false)
const busy = ref<'' | 'png' | 'uaf' | 'import'>('')
const error = ref('')
const snack = reactive({ show: false, text: '', color: 'success' })
const fileInput = ref<HTMLInputElement | null>(null)
const plan = reactive({
  open: false,
  fileName: '',
  skipped: 0,
  overwrite: false,
  rows: [] as PlanRow[],
})

const className = computed(() => session.classInfo?.name ?? '')

const groups = computed(() => {
  const map = new Map<string, PlanRow[]>()
  for (const row of plan.rows) {
    if (!map.has(row.date)) map.set(row.date, [])
    map.get(row.date)!.push(row)
  }
  return [...map].map(([groupDate, groupRows]) => ({ date: groupDate, rows: groupRows }))
})

const importable = computed(
  () => plan.rows.filter((row) => !row.unknown && (plan.overwrite || !row.conflict)).length,
)

function notify(text: string, color = 'success'): void {
  snack.text = text
  snack.color = color
  snack.show = true
}

function colorOf(name: string): string {
  return subjects.value.find((item) => item.name === name)?.color ?? ''
}

async function loadSubjects(): Promise<void> {
  if (subjects.value.length > 0) return
  try {
    const data = await getData<{ subjects?: SubjectInfo[] }>('/board/bootstrap')
    subjects.value = (data.subjects ?? []).map((item) => ({ id: item.id, name: item.name, color: item.color ?? '' }))
  } catch {
    subjects.value = []
  }
}

async function loadHomeworkItems(day: string): Promise<Array<{ subjectId: string; content: string }>> {
  const data = await getData<{ items?: Array<{ subjectId: string; content: string }> }>('/board/homework', { date: day })
  return data.items ?? []
}

async function load(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    await loadSubjects()
    const day = normalizeDate(date.value)
    const items = await loadHomeworkItems(day)
    rows.value = items
      .filter((item) => (item.content ?? '').trim().length > 0)
      .map((item) => {
        const subject = subjects.value.find((entry) => entry.id === item.subjectId)
        return {
          date: day,
          subject: subject?.name ?? item.subjectId,
          content: item.content,
          color: subject?.color ?? '',
        }
      })
      .sort((a, b) => a.subject.localeCompare(b.subject, 'zh-Hans-CN'))
  } catch (e) {
    error.value = e instanceof Error ? e.message : '读取作业失败'
    rows.value = []
  } finally {
    loading.value = false
  }
}

function baseName(extension: string): string {
  const day = normalizeDate(date.value).replace(/-/g, '')
  return '星焰作业-' + safeName(className.value) + '-' + day + extension
}

async function exportImage(): Promise<void> {
  busy.value = 'png'
  error.value = ''
  try {
    const image = await renderHomeworkSheet(rows.value, { className: className.value, date: date.value })
    downloadBlob(image.png, baseName('.png'))
    notify('已导出作业图片')
  } catch (e) {
    error.value = e instanceof Error ? e.message : '导出图片失败'
  } finally {
    busy.value = ''
  }
}

async function exportUaf(): Promise<void> {
  busy.value = 'uaf'
  error.value = ''
  try {
    const day = normalizeDate(date.value)
    const sheet = rows.value.map((row) => ({ ...row, date: day }))
    const image = await renderHomeworkSheet(sheet, { className: className.value, date: day })
    const pdf = buildUafPdf(image, buildUafCsv(sheet))
    downloadBlob(pdf, baseName('.uaf.pdf'))
    notify('已导出 UAF 文件')
  } catch (e) {
    error.value = e instanceof Error ? e.message : '导出 UAF 失败'
  } finally {
    busy.value = ''
  }
}

function exportJson(): void {
  const day = normalizeDate(date.value)
  const payload = {
    format: JSON_FORMAT,
    version: JSON_VERSION,
    exportedAt: new Date().toISOString(),
    class: { id: session.classId, name: className.value },
    rows: rows.value.map((row) => ({ date: day, subject: row.subject, content: row.content })),
  }
  downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }), baseName('.json'))
  notify('已导出作业 JSON')
}

function pickFile(): void {
  if (readOnly.value) {
    notify('当前设备为只读授权，无法导入作业', 'warning')
    return
  }
  fileInput.value?.click()
}

async function onFileChange(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  busy.value = 'import'
  error.value = ''
  try {
    await loadSubjects()
    let parsed: HomeworkSheetRow[] = []
    let skipped = 0
    if (/\.pdf$/i.test(file.name) || file.type === 'application/pdf') {
      const csv = await extractUafCsv(await file.arrayBuffer())
      const result = rowsFromUafCsv(csv)
      parsed = result.rows
      skipped = result.skipped
    } else {
      const payload = JSON.parse(await file.text()) as { format?: string; version?: number; rows?: HomeworkSheetRow[] }
      if (payload.format && payload.format !== JSON_FORMAT && payload.format !== 'uaf') {
        throw new Error('文件格式不匹配：请选择 UAF 或本系统导出的作业 JSON')
      }
      parsed = (payload.rows ?? [])
        .filter((row) => row && row.subject && String(row.content ?? '').trim())
        .map((row) => ({ date: normalizeDate(row.date ?? date.value), subject: String(row.subject), content: String(row.content) }))
    }
    if (parsed.length === 0) throw new Error('文件里没有可导入的作业内容')

    // 冲突检测：逐日期读取现有作业
    const days = [...new Set(parsed.map((row) => normalizeDate(row.date)))]
    const existing = new Map<string, Set<string>>()
    for (const day of days) {
      try {
        const items = await loadHomeworkItems(day)
        existing.set(day, new Set(items.filter((item) => (item.content ?? '').trim().length > 0).map((item) => item.subjectId)))
      } catch {
        existing.set(day, new Set())
      }
    }

    plan.rows = parsed.map((row, index) => {
      const day = normalizeDate(row.date)
      const subject = subjects.value.find((entry) => entry.name === row.subject)
      return {
        date: day,
        subject: row.subject,
        content: row.content,
        color: subject?.color ?? '',
        subjectId: subject?.id ?? '',
        unknown: !subject,
        conflict: subject ? Boolean(existing.get(day)?.has(subject.id)) : false,
        key: day + '-' + row.subject + '-' + index,
      }
    })
    plan.skipped = skipped
    plan.fileName = file.name
    plan.overwrite = false
    plan.open = true
  } catch (e) {
    error.value = e instanceof Error ? e.message : '读取文件失败'
  } finally {
    busy.value = ''
  }
}

async function applyImport(): Promise<void> {
  if (busy.value === 'import') return
  busy.value = 'import'
  error.value = ''
  try {
    let imported = 0
    const failed: string[] = []
    for (const group of groups.value) {
      const items = group.rows
        .filter((row) => !row.unknown && (plan.overwrite || !row.conflict))
        .map((row) => ({ subjectId: row.subjectId, content: row.content }))
      if (items.length === 0) continue
      try {
        await putData('/board/homework/batch', { date: group.date, items })
        imported += items.length
      } catch {
        failed.push(group.date)
      }
    }
    plan.open = false
    if (failed.length > 0) {
      notify('部分日期导入失败：' + failed.join('、'), 'error')
    } else {
      notify('已导入 ' + imported + ' 项作业')
    }
    await load()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '导入失败'
  } finally {
    busy.value = ''
  }
}

onMounted(load)
</script>

<style scoped>
.date-field {
  max-width: 200px;
  min-width: 160px;
}

.dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.preview-list {
  max-height: 260px;
  overflow-y: auto;
}

.preview-text {
  display: -webkit-box;
  overflow: hidden;
  white-space: normal;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.plan-row + .plan-row {
  margin-top: 10px;
}
</style>
