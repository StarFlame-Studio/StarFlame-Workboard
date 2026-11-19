<template>
  <v-dialog :model-value="modelValue" max-width="1200" scrollable @update:model-value="onModel">
    <v-card>
      <v-card-title class="d-flex align-center py-3 px-4">
        <v-icon class="mr-2" color="primary">mdi-calendar-check</v-icon>
        <span class="text-truncate">{{ exam?.title || '考试配置' }}</span>
        <v-spacer />
        <v-btn icon="mdi-close" variant="text" @click="close" />
      </v-card-title>

      <v-card-text class="pa-4">
        <exam-config-editor
          ref="editorRef"
          v-model="draft"
          :exam-id="exam?.id ?? ''"
          :saving="saving"
          :subjects="subjects"
          @delete="confirmDelete"
          @save="saveConfig"
        />
      </v-card-text>

      <v-card-actions class="px-4 pb-3">
        <span class="text-caption text-medium-emphasis">与「考试看板 → 编辑考试配置」是同一份数据，保存后首页考试卡会同步更新</span>
        <v-spacer />
        <v-btn variant="text" @click="close">关闭</v-btn>
      </v-card-actions>
    </v-card>

    <v-dialog v-model="deleteDialog" max-width="420">
      <v-card>
        <v-card-title>确认删除</v-card-title>
        <v-card-text>确定要删除「{{ draft.examName || '该配置' }}」吗？删除后无法恢复。</v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="deleteDialog = false">取消</v-btn>
          <v-btn :loading="deleting" color="error" variant="elevated" @click="doDelete">删除</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import type { ExamItem, SubjectInfo } from '@starflame/shared'
import { deleteData, getData, patchData } from '@/lib/api'
import ExamConfigEditor, { type ExamConfigDraft } from '@/components/ExamConfigEditor.vue'

const props = defineProps<{
  modelValue: boolean
  exam: ExamItem | null
  subjects: SubjectInfo[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  saved: []
  deleted: []
}>()

const editorRef = ref<InstanceType<typeof ExamConfigEditor> | null>(null)
const saving = ref(false)
const deleting = ref(false)
const deleteDialog = ref(false)
const draft = ref<ExamConfigDraft>({ examName: '', message: '', room: '', examInfos: [] })

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

/** 把看板的 ExamItem 转成编辑器使用的草稿（与「考试看板」页同一套映射） */
function toDraft(exam: ExamItem | null): ExamConfigDraft {
  if (!exam) return { examName: '', message: '', room: '', examInfos: [] }
  return {
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

/** 看板 bootstrap 的考试科目没有 name 字段，这里回查 /board/exams 拿到带科目名的那条 */
async function resolveExam(): Promise<ExamItem | null> {
  const current = props.exam
  if (!current) return null
  try {
    const result = await getData<{ items: ExamItem[] }>('/board/exams')
    const matched = (result.items ?? []).find((item) => item.id === current.id)
    return matched ?? current
  } catch {
    return current
  }
}

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    deleteDialog.value = false
    draft.value = toDraft(props.exam)
    void resolveExam().then((exam) => {
      if (!props.modelValue || !exam) return
      draft.value = toDraft(exam)
    })
  },
)

function onModel(value: boolean): void {
  emit('update:modelValue', value)
}

function close(): void {
  emit('update:modelValue', false)
}

async function saveConfig(value: ExamConfigDraft): Promise<void> {
  if (saving.value || !props.exam) return
  saving.value = true
  try {
    const payload = {
      title: value.examName,
      note: value.message || null,
      room: value.room || null,
      subjects: value.examInfos.map((item) => {
        const matched = props.subjects.find((s) => s.id === item.subjectId || s.name === item.subjectId)
        return {
          subjectId: matched ? matched.id : null,
          name: matched ? matched.name : item.subjectId,
          startAt: toIso(item.start),
          endAt: toIso(item.end),
        }
      }),
    }
    await patchData('/board/exams/' + props.exam.id, payload)
    emit('saved')
    emit('update:modelValue', false)
  } catch (e) {
    editorRef.value?.setError?.(e instanceof Error ? e.message : '保存失败')
  } finally {
    saving.value = false
  }
}

function confirmDelete(): void {
  deleteDialog.value = true
}

async function doDelete(): Promise<void> {
  if (deleting.value || !props.exam) return
  deleting.value = true
  try {
    await deleteData('/board/exams/' + props.exam.id)
    deleteDialog.value = false
    emit('deleted')
    emit('update:modelValue', false)
  } catch (e) {
    editorRef.value?.setError?.(e instanceof Error ? e.message : '删除失败')
  } finally {
    deleting.value = false
  }
}
</script>
