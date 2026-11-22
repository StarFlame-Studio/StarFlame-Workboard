<template>
  <div>
    <div class="d-flex align-center ga-2 mb-4">
      <div class="text-subtitle-2">共 {{ notices.length }} 条通知</div>
      <v-spacer />
      <v-btn size="small" variant="tonal" prepend-icon="mdi-refresh" :loading="loading" @click="load">刷新</v-btn>
      <v-btn size="small" color="primary" variant="flat" prepend-icon="mdi-plus" @click="openCreate">新建通知</v-btn>
    </div>

    <v-alert v-if="error" type="error" variant="tonal" density="compact" class="mb-4" closable @click:close="error = ''">{{ error }}</v-alert>

    <!-- 骨架：通知卡片网格（图标 + 标题 + 两行正文） -->
    <SfCardGridSkeleton v-if="loading" :count="4" :cols="{ xs: 12, sm: 12, md: 6, lg: 6 }" />
    <v-card v-else-if="!notices.length" variant="outlined" class="pa-8 text-center">
      <v-icon size="40" color="medium-emphasis">mdi-bullhorn-outline</v-icon>
      <div class="text-body-2 text-medium-emphasis mt-2">还没有通知。</div>
    </v-card>

    <v-row v-else dense>
      <v-col v-for="notice in notices" :key="notice.id" cols="12" md="6">
        <v-card variant="outlined" class="pa-4 h-100">
          <div class="d-flex align-center ga-2 mb-2">
            <v-icon :color="notice.level === 'urgent' ? 'error' : 'info'" size="18">{{ notice.level === 'urgent' ? 'mdi-alert-circle-outline' : 'mdi-information-outline' }}</v-icon>
            <span class="text-subtitle-2 font-weight-medium">{{ notice.title || '通知' }}</span>
            <v-chip v-if="notice.pinned" size="x-small" variant="tonal" color="warning">置顶</v-chip>
            <v-chip v-if="notice.popup" size="x-small" variant="tonal" color="primary">弹窗</v-chip>
            <v-chip size="x-small" variant="tonal">已读 {{ notice.readCount ?? 0 }}</v-chip>
            <v-spacer />
            <v-btn size="x-small" variant="text" @click="openEdit(notice)">编辑</v-btn>
            <v-btn size="x-small" variant="text" color="error" @click="remove(notice)">删除</v-btn>
          </div>
          <div class="text-body-2 notice-content">{{ notice.content }}</div>
          <div class="text-caption text-medium-emphasis mt-2">
            {{ notice.level === 'urgent' ? '紧急' : '普通' }} · {{ notice.popup ? '弹窗提醒' : '不弹窗' }} · 发布 {{ formatDate(notice.publishAt) }}<span v-if="notice.expireAt"> · 过期 {{ formatDate(notice.expireAt) }}</span>
          </div>
        </v-card>
      </v-col>
    </v-row>

    <v-dialog v-model="dialog" max-width="620" persistent>
      <v-card>
        <v-card-title class="text-subtitle-1">{{ form.id ? '编辑通知' : '新建通知' }}</v-card-title>
        <v-card-text>
          <v-alert v-if="formError" type="error" variant="tonal" density="compact" class="mb-3">{{ formError }}</v-alert>
          <v-text-field v-model="form.title" label="标题" density="compact" variant="outlined" maxlength="64" counter class="mb-3" />
          <v-textarea v-model="form.content" label="内容" rows="5" density="compact" variant="outlined" maxlength="2000" counter class="mb-3" />
          <v-row dense>
            <v-col cols="12" md="4">
              <v-select v-model="form.level" :items="levelOptions" label="级别" density="compact" variant="outlined" hide-details />
            </v-col>
            <v-col cols="12" md="4">
              <v-text-field v-model="form.expireAt" type="date" label="过期日期（可选）" density="compact" variant="outlined" hide-details />
            </v-col>
            <v-col cols="12" md="4" class="d-flex flex-column align-start">
              <v-switch v-model="form.pinned" label="置顶" color="primary" density="compact" hide-details />
              <v-switch v-model="form.popup" label="弹窗提醒" color="primary" density="compact" hide-details />
            </v-col>
          </v-row>
          <div v-if="!form.popup && !form.pinned" class="text-caption text-error mt-2">弹窗提醒与置顶通知至少需要开启一项</div>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="dialog = false">取消</v-btn>
          <v-btn color="primary" variant="flat" :loading="saving" @click="submit">保存</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <ToastBar :toast="toast" />
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ApiError } from '../../lib/api'
import { createNotice, deleteNotice, getNotices, updateNotice, type Notice } from '../../lib/boardApi'
import { useToast } from '../../composables/useToast'
import SfCardGridSkeleton from '../skeleton/SfCardGridSkeleton.vue'
import ToastBar from './ToastBar.vue'

const props = defineProps<{ classId: string }>()

const { toast, notify } = useToast()
const notices = ref<Notice[]>([])
const loading = ref(true)
const saving = ref(false)
const error = ref('')
const formError = ref('')
const dialog = ref(false)
const form = reactive({ id: '', title: '', content: '', level: 'info' as 'info' | 'urgent', pinned: false, popup: true, expireAt: '' })

const levelOptions = [
  { title: '普通', value: 'info' },
  { title: '紧急', value: 'urgent' },
]

function formatDate(value?: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  const pad = (n: number) => String(n).padStart(2, '0')
  return date.getFullYear() + '/' + pad(date.getMonth() + 1) + '/' + pad(date.getDate())
}

function toDateInput(value?: string | null): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const offset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offset).toISOString().slice(0, 10)
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    notices.value = await getNotices(props.classId)
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : '加载通知失败'
  } finally {
    loading.value = false
  }
}

function openCreate() {
  form.id = ''
  form.title = ''
  form.content = ''
  form.level = 'info'
  form.pinned = false
  form.popup = true
  form.expireAt = ''
  formError.value = ''
  dialog.value = true
}

function openEdit(notice: Notice) {
  form.id = notice.id
  form.title = notice.title
  form.content = notice.content
  form.level = notice.level
  form.pinned = notice.pinned
  form.popup = notice.popup !== false
  form.expireAt = toDateInput(notice.expireAt)
  formError.value = ''
  dialog.value = true
}

async function submit() {
  if (!form.title.trim()) {
    formError.value = '请填写标题'
    return
  }
  if (!form.content.trim()) {
    formError.value = '请填写内容'
    return
  }
  if (!form.popup && !form.pinned) {
    formError.value = '弹窗提醒与置顶通知至少需要开启一项'
    return
  }
  saving.value = true
  formError.value = ''
  const payload = {
    title: form.title.trim(),
    content: form.content.trim(),
    level: form.level,
    pinned: form.pinned,
    popup: form.popup,
    expireAt: form.expireAt ? new Date(form.expireAt + 'T23:59:59').toISOString() : null,
  }
  try {
    if (form.id) {
      await updateNotice(props.classId, form.id, payload)
      notify('通知已更新')
    } else {
      await createNotice(props.classId, payload)
      notify('通知已发布')
    }
    dialog.value = false
    await load()
  } catch (e) {
    formError.value = e instanceof ApiError ? e.message : '保存失败'
  } finally {
    saving.value = false
  }
}

async function remove(notice: Notice) {
  try {
    await deleteNotice(props.classId, notice.id)
    notify('通知已删除')
    await load()
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : '删除失败'
  }
}

onMounted(load)
</script>

<style scoped>
.notice-content {
  white-space: pre-wrap;
}
</style>
