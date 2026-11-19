<template>
  <v-container class="fill-height sf-page-scroll">
    <v-row>
      <v-col cols="12">
        <v-card border class="elevation-12">
          <v-card-title class="d-flex align-center py-3 px-4" color="primary">
            <v-icon class="mr-2">mdi-calendar-check</v-icon>
            考试看板
          </v-card-title>
          <v-card-subtitle>不只是考试看板。</v-card-subtitle>
          <v-card-text>
            <v-alert v-if="error" border="start" class="mb-4 mt-3 mx-2" closable type="error" variant="tonal" @click:close="error = ''">
              <div class="d-flex align-center">
                <v-icon class="mr-2">mdi-alert-circle</v-icon>
                {{ error }}
              </div>
            </v-alert>

            <v-alert v-if="success" border="start" class="mb-4 mt-3 mx-2" closable type="success" variant="tonal" @click:close="success = ''">
              <div class="d-flex align-center">
                <v-icon class="mr-2">mdi-check-circle</v-icon>
                {{ success }}
              </div>
            </v-alert>

            <div class="d-flex justify-space-between align-center mb-4">
              <div class="d-flex align-center flex-wrap" style="gap: 8px">
                <v-btn color="primary" prepend-icon="mdi-plus" @click="createNewConfig">新建配置</v-btn>
                <v-btn color="success" prepend-icon="mdi-import" variant="outlined" @click="showImportDialog">导入配置</v-btn>
                <v-btn :loading="loading" color="info" prepend-icon="mdi-refresh" variant="outlined" @click="loadConfigs">刷新</v-btn>
                <v-btn color="grey" prepend-icon="mdi-arrow-left" variant="text" @click="go('board')">返回看板</v-btn>
              </div>
              <v-chip v-if="configs.length > 0" color="primary" prepend-icon="mdi-format-list-numbered">
                {{ configs.length }} 个配置
              </v-chip>
            </div>

            <v-card v-if="loading" class="my-4" variant="outlined">
              <v-card-text>
                <list-skeleton :rows="3" two-line />
              </v-card-text>
            </v-card>

            <v-card v-if="!loading && configs.length > 0" class="my-4" elevation="1">
              <v-card-title class="d-flex align-center pa-4">
                <v-icon class="mr-2">mdi-format-list-bulleted</v-icon>
                <span class="font-weight-bold">配置列表</span>
              </v-card-title>
              <v-list>
                <v-list-item
                  v-for="config in configs"
                  :key="config.id"
                  style="cursor: pointer"
                  @click="showEditDialog(config)"
                >
                  <template #prepend>
                    <v-avatar class="mr-2" color="primary">
                      <v-icon color="white">mdi-calendar-text</v-icon>
                    </v-avatar>
                  </template>

                  <v-list-item-title class="font-weight-medium">
                    {{ config.examName || '配置 ' + config.id }}
                  </v-list-item-title>
                  <v-list-item-subtitle class="text-caption mt-1">
                    <div class="d-flex align-center">
                      <v-icon class="mr-1" size="small">mdi-information-outline</v-icon>
                      {{ config.message || '无描述' }}
                    </div>
                    <div class="d-flex align-center mt-1">
                      <v-icon class="mr-1" size="small">mdi-book-multiple</v-icon>
                      {{ config.examInfos.length }} 堂考试
                    </div>
                  </v-list-item-subtitle>

                  <template #append>
                    <div class="d-flex align-center">
                      <v-btn class="mr-1" color="primary" icon="mdi-pencil" size="small" variant="text" @click.stop="showEditDialog(config)" />
                      <v-btn class="mr-1" color="info" icon="mdi-eye" size="small" variant="text" @click.stop="showEditDialog(config)" />
                    </div>
                  </template>
                </v-list-item>
              </v-list>
            </v-card>

            <v-card v-if="!loading && configs.length === 0" class="my-4" elevation="1">
              <v-card-text class="text-center py-8">
                <v-icon class="mb-4" color="grey-lighten-1" size="64">mdi-calendar-blank</v-icon>
                <h3 class="text-h6 mb-2 text-grey-darken-1">暂无配置</h3>
                <p class="text-body-2 text-grey-darken-1 mb-4">点击「新建配置」按钮创建您的第一个考试配置</p>
                <v-btn color="primary" prepend-icon="mdi-plus" @click="createNewConfig">新建配置</v-btn>
              </v-card-text>
            </v-card>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <v-dialog v-model="editDialog" max-width="1200" persistent>
      <v-card>
        <v-card-title class="d-flex align-center py-3 px-4">
          <v-icon class="mr-2">mdi-pencil</v-icon>
          编辑考试配置
          <v-spacer />
          <v-btn icon="mdi-close" variant="text" @click="closeEditDialog" />
        </v-card-title>
        <v-card-text class="pa-4" style="max-height: 70vh; overflow-y: auto">
          <exam-config-editor
            ref="editorRef"
            v-model="editingDraft"
            :exam-id="editingId"
            :saving="saving"
            :subjects="subjects"
            @delete="confirmDelete"
            @save="saveConfig"
          />
        </v-card-text>
        <v-card-actions class="pa-4">
          <v-btn color="grey" prepend-icon="mdi-close" variant="outlined" @click="closeEditDialog">关闭</v-btn>
          <v-spacer />
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="importDialog" max-width="800" persistent>
      <v-card>
        <v-card-title class="d-flex align-center py-3 px-4">
          <v-icon class="mr-2">mdi-import</v-icon>
          导入考试配置
          <v-spacer />
          <v-btn icon="mdi-close" variant="text" @click="closeImportDialog" />
        </v-card-title>
        <v-card-text class="pa-4">
          <v-alert v-if="importError" border="start" class="mb-4" closable type="error" variant="tonal" @click:close="importError = ''">
            {{ importError }}
          </v-alert>
          <v-textarea
            v-model="importJson"
            label="请输入 JSON 配置"
            :placeholder="importPlaceholder"
            prepend-inner-icon="mdi-code-json"
            rows="14"
            variant="outlined"
          />
          <v-alert border="start" class="mt-2" density="compact" type="info" variant="tonal">
            支持字段：examName（考试名称）、message（描述）、examInfos（科目 / 开始 / 结束）。
            科目名称需与班级科目一致（语文、数学……），否则会自动归到「其他」。
          </v-alert>
        </v-card-text>
        <v-card-actions class="pa-4">
          <v-btn color="grey" prepend-icon="mdi-close" variant="outlined" @click="closeImportDialog">取消</v-btn>
          <v-spacer />
          <v-btn :loading="importing" color="primary" prepend-icon="mdi-check" variant="outlined" @click="doImport">开始导入</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="deleteDialog" max-width="420">
      <v-card>
        <v-card-title>确认删除</v-card-title>
        <v-card-text>确定要删除「{{ editingDraft.examName || '该配置' }}」吗？删除后无法恢复。</v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="deleteDialog = false">取消</v-btn>
          <v-btn :loading="deleting" color="error" variant="elevated" @click="doDelete">删除</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import type { ExamItem, SubjectInfo } from '@starflame/shared'
import { deleteData, getData, patchData, postData } from '@/lib/api'
import { navigate, type PageName } from '@/lib/nav'

function go(page: PageName): void {
  navigate(page)
}
import ExamConfigEditor, { type ExamConfigDraft } from '@/components/ExamConfigEditor.vue'
import ListSkeleton from '@/components/skeleton/ListSkeleton.vue'

interface ExamConfig {
  id: string
  examName: string
  message: string
  room: string
  examInfos: Array<{ subjectId: string; start: string; end: string }>
}

const configs = ref<ExamConfig[]>([])
const subjects = ref<SubjectInfo[]>([])
const loading = ref(false)
const saving = ref(false)
const deleting = ref(false)
const importing = ref(false)
const error = ref('')
const success = ref('')
const editDialog = ref(false)
const importDialog = ref(false)
const deleteDialog = ref(false)
const importError = ref('')
const importJson = ref('')
const editingId = ref('')
const editorRef = ref<InstanceType<typeof ExamConfigEditor> | null>(null)

const importPlaceholder = '{\n  "examName": "期末考试",\n  "message": "考试信息",\n  "examInfos": [\n    { "name": "语文", "start": "2025/12/14 09:00", "end": "2025/12/14 11:00" }\n  ]\n}'

const emptyDraft = (): ExamConfigDraft => ({ examName: '', message: '', room: '', examInfos: [] })
const editingDraft = ref<ExamConfigDraft>(emptyDraft())

function toLocalInput(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) +
    'T' + pad(date.getHours()) + ':' + pad(date.getMinutes())
  )
}

function toIso(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString()
}

function subjectName(id: string): string {
  return subjects.value.find((item) => item.id === id)?.name ?? '其他'
}

function toConfig(exam: ExamItem): ExamConfig {
  return {
    id: exam.id,
    examName: exam.title,
    message: exam.note ?? '',
    room: (exam as unknown as { room?: string }).room ?? '',
    examInfos: (exam.subjects ?? []).map((item) => ({
      subjectId: item.subjectId ?? (item as unknown as { name?: string }).name ?? '',
      start: toLocalInput(String(item.startAt)),
      end: toLocalInput(String(item.endAt)),
    })),
  }
}

async function loadConfigs(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    const [examResult, boardResult] = await Promise.all([
      getData<{ items: ExamItem[] }>('/board/exams'),
      subjects.value.length > 0
        ? Promise.resolve({ subjects: subjects.value })
        : getData<{ subjects: SubjectInfo[] }>('/board/bootstrap'),
    ])
    if (subjects.value.length === 0) subjects.value = boardResult.subjects
    configs.value = (examResult.items ?? []).map(toConfig)
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败'
  } finally {
    loading.value = false
  }
}

function createNewConfig(): void {
  editingId.value = ''
  editingDraft.value = emptyDraft()
  editDialog.value = true
}

function showEditDialog(config: ExamConfig): void {
  editingId.value = config.id
  editingDraft.value = {
    examName: config.examName,
    message: config.message,
    room: config.room ?? '',
    examInfos: config.examInfos.map((item) => ({ ...item })),
  }
  editDialog.value = true
}

function closeEditDialog(): void {
  editDialog.value = false
}

async function saveConfig(value: ExamConfigDraft): Promise<void> {
  if (saving.value) return
  saving.value = true
  error.value = ''
  try {
    const payload = {
      title: value.examName,
      note: value.message || null,
      room: value.room || null,
      subjects: value.examInfos.map((item) => {
        const matched = subjects.value.find((s) => s.id === item.subjectId)
        return {
          subjectId: matched ? matched.id : null,
          name: matched ? matched.name : item.subjectId,
          startAt: toIso(item.start),
          endAt: toIso(item.end),
        }
      }),
    }
    if (editingId.value) {
      await patchData('/board/exams/' + editingId.value, payload)
      success.value = '配置已更新'
    } else {
      await postData('/board/exams', payload)
      success.value = '配置已创建'
    }
    editDialog.value = false
    await loadConfigs()
  } catch (e) {
    editorRef.value?.setError(e instanceof Error ? e.message : '保存失败')
  } finally {
    saving.value = false
  }
}

function confirmDelete(): void {
  deleteDialog.value = true
}

async function doDelete(): Promise<void> {
  if (deleting.value || !editingId.value) return
  deleting.value = true
  try {
    await deleteData('/board/exams/' + editingId.value)
    deleteDialog.value = false
    editDialog.value = false
    success.value = '配置已删除'
    await loadConfigs()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '删除失败'
  } finally {
    deleting.value = false
  }
}

function showImportDialog(): void {
  importJson.value = ''
  importError.value = ''
  importDialog.value = true
}

function closeImportDialog(): void {
  importDialog.value = false
}

function matchSubjectId(name: string): string {
  const hit = subjects.value.find((item) => item.name === name)
  if (hit) return hit.id
  const other = subjects.value.find((item) => item.code === 'other')
  return other?.id ?? subjects.value[0]?.id ?? ''
}

async function doImport(): Promise<void> {
  if (importing.value) return
  importError.value = ''
  let parsed: unknown
  try {
    parsed = JSON.parse(importJson.value)
  } catch {
    importError.value = 'JSON 格式错误，请检查后重试'
    return
  }
  const data = parsed as { examName?: string; message?: string; examInfos?: Array<{ name?: string; start?: string; end?: string }> }
  if (!data.examName || !Array.isArray(data.examInfos) || data.examInfos.length === 0) {
    importError.value = '缺少 examName 或 examInfos 为空'
    return
  }
  const infos = data.examInfos
    .map((item) => {
      const start = new Date(String(item.start).replace(/\//g, '-'))
      const end = new Date(String(item.end).replace(/\//g, '-'))
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null
      return { subjectId: matchSubjectId(item.name ?? ''), startAt: start.toISOString(), endAt: end.toISOString() }
    })
    .filter((item): item is { subjectId: string; startAt: string; endAt: string } => item !== null)

  if (infos.length === 0) {
    importError.value = '所有时间格式都无法解析，请使用 2025/12/14 09:00 格式'
    return
  }

  importing.value = true
  try {
    await postData('/board/exams', { title: data.examName, note: data.message ?? null, subjects: infos })
    importDialog.value = false
    success.value = '导入成功，共 ' + infos.length + ' 堂考试'
    await loadConfigs()
  } catch (e) {
    importError.value = e instanceof Error ? e.message : '导入失败'
  } finally {
    importing.value = false
  }
}

onMounted(loadConfigs)
</script>
