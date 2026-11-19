<template>
  <div>
    <div class="d-flex align-center ga-2 mb-4">
      <div class="text-subtitle-2">共 {{ subjects.length }} 个科目</div>
      <v-spacer />
      <v-btn size="small" variant="tonal" prepend-icon="mdi-refresh" :loading="loading" @click="load">刷新</v-btn>
      <v-btn size="small" color="primary" variant="flat" prepend-icon="mdi-plus" @click="openCreate">新增科目</v-btn>
    </div>

    <v-alert v-if="error" type="error" variant="tonal" density="compact" class="mb-4" closable @click:close="error = ''">{{ error }}</v-alert>

    <!-- 骨架：科目列表是表格形态（排序 / 图标 / 名称 / 标识 / 状态 / 操作） -->
    <div v-if="loading" class="sf-skel-surface" style="padding: 6px 8px">
      <SfTableSkeleton :cols="6" :rows="6" />
    </div>

    <v-card v-else variant="outlined">
      <v-table density="comfortable">
        <thead>
          <tr>
            <th style="width: 72px">排序</th>
            <th style="width: 64px">图标</th>
            <th>科目名</th>
            <th style="width: 120px">标识</th>
            <th style="width: 120px">状态</th>
            <th style="width: 190px">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(subject, index) in subjects" :key="subject.id">
            <td>
              <v-btn size="x-small" variant="text" icon="mdi-arrow-up" :disabled="index === 0" @click="move(index, -1)" />
              <v-btn size="x-small" variant="text" icon="mdi-arrow-down" :disabled="index === subjects.length - 1" @click="move(index, 1)" />
            </td>
            <td><v-icon :color="subject.color">{{ subject.icon }}</v-icon></td>
            <td class="font-weight-medium">{{ subject.name }}</td>
            <td class="text-caption text-medium-emphasis">{{ subject.code }}</td>
            <td>
              <v-chip size="x-small" variant="tonal" :color="subject.enabled ? 'success' : 'default'">{{ subject.enabled ? '启用' : '停用' }}</v-chip>
            </td>
            <td>
              <v-btn size="x-small" variant="text" @click="openEdit(subject)">编辑</v-btn>
              <v-btn size="x-small" variant="text" @click="toggleEnabled(subject)">{{ subject.enabled ? '停用' : '启用' }}</v-btn>
              <v-btn size="x-small" variant="text" color="error" @click="requestDelete(subject)">删除</v-btn>
            </td>
          </tr>
        </tbody>
      </v-table>
    </v-card>

    <v-dialog v-model="dialog" max-width="460" persistent>
      <v-card>
        <v-card-title class="text-subtitle-1">{{ form.id ? '编辑科目' : '新增科目' }}</v-card-title>
        <v-card-text>
          <v-alert v-if="formError" type="error" variant="tonal" density="compact" class="mb-3">{{ formError }}</v-alert>
          <v-text-field v-model="form.name" label="科目名称" density="compact" variant="outlined" maxlength="32" counter class="mb-3" />
          <div class="d-flex ga-3 align-center">
            <v-text-field v-model="form.color" label="颜色" density="compact" variant="outlined" hide-details placeholder="#8A93A6" />
            <div class="subject-swatch" :style="{ background: form.color || '#8A93A6' }" />
          </div>
          <v-text-field v-model="form.icon" label="图标（mdi 名称）" density="compact" variant="outlined" class="mt-3" hide-details />
          <div class="text-caption text-medium-emphasis mt-2 d-flex align-center ga-2">
            <v-icon :color="form.color || '#8A93A6'" size="18">{{ form.icon || 'mdi-book-outline' }}</v-icon>
            预览效果
          </div>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="dialog = false">取消</v-btn>
          <v-btn color="primary" variant="flat" :loading="saving" @click="submit">保存</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog :model-value="!!deleting" max-width="420">
      <v-card>
        <v-card-title class="text-subtitle-1">删除科目</v-card-title>
        <v-card-text>确定删除「{{ deleting?.name }}」？该科目的作业记录会一并移除。</v-card-text>
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
import { onMounted, reactive, ref } from 'vue'
import { ApiError } from '../../lib/api'
import { createSubject, deleteSubject, getBootstrap, reorderSubjects, updateSubject, type Subject } from '../../lib/boardApi'
import { useToast } from '../../composables/useToast'
import SfTableSkeleton from '../skeleton/SfTableSkeleton.vue'
import ToastBar from './ToastBar.vue'

const props = defineProps<{ classId: string }>()

const { toast, notify } = useToast()
const subjects = ref<Subject[]>([])
const loading = ref(true)
const saving = ref(false)
const error = ref('')
const formError = ref('')
const dialog = ref(false)
const deleting = ref<Subject | null>(null)
const form = reactive({ id: '', name: '', color: '#8A93A6', icon: 'mdi-book-outline' })

async function load() {
  loading.value = true
  error.value = ''
  try {
    const data = await getBootstrap(props.classId, '', true)
    subjects.value = data.subjects
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : '加载科目失败'
  } finally {
    loading.value = false
  }
}

function openCreate() {
  form.id = ''
  form.name = ''
  form.color = '#8A93A6'
  form.icon = 'mdi-book-outline'
  formError.value = ''
  dialog.value = true
}

function openEdit(subject: Subject) {
  form.id = subject.id
  form.name = subject.name
  form.color = subject.color || '#8A93A6'
  form.icon = subject.icon || 'mdi-book-outline'
  formError.value = ''
  dialog.value = true
}

async function submit() {
  if (!form.name.trim()) {
    formError.value = '请填写科目名称'
    return
  }
  saving.value = true
  formError.value = ''
  try {
    if (form.id) {
      await updateSubject(props.classId, form.id, {
        name: form.name.trim(),
        color: form.color.trim() || '#8A93A6',
        icon: form.icon.trim() || 'mdi-book-outline',
      })
      notify('科目已更新')
    } else {
      await createSubject(props.classId, form.name.trim())
      notify('科目已创建')
    }
    dialog.value = false
    await load()
  } catch (e) {
    formError.value = e instanceof ApiError ? e.message : '保存失败'
  } finally {
    saving.value = false
  }
}

async function toggleEnabled(subject: Subject) {
  try {
    await updateSubject(props.classId, subject.id, { enabled: !subject.enabled })
    await load()
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : '更新失败'
  }
}

async function move(index: number, delta: number) {
  const target = index + delta
  if (target < 0 || target >= subjects.value.length) return
  const next = [...subjects.value]
  const [item] = next.splice(index, 1)
  next.splice(target, 0, item)
  subjects.value = next
  try {
    await reorderSubjects(props.classId, next.map((s) => s.id))
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : '排序保存失败'
  }
}

function requestDelete(subject: Subject) {
  deleting.value = subject
}

async function confirmDelete() {
  if (!deleting.value) return
  saving.value = true
  try {
    await deleteSubject(props.classId, deleting.value.id)
    notify('科目已删除')
    deleting.value = null
    await load()
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : '删除失败'
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.subject-swatch {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  flex: 0 0 auto;
  border: 1px solid rgba(0, 0, 0, 0.12);
}
</style>
