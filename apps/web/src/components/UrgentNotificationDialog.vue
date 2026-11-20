<template>
  <v-dialog v-model="visible" max-width="900" scrollable>
    <v-card class="rounded-xl">
      <v-card-title class="d-flex align-center">
        <v-icon class="mr-2" color="primary">mdi-chat</v-icon>
        {{ editingId ? '编辑通知' : '发送通知' }}
        <v-spacer />
        <v-btn icon="mdi-close" variant="text" @click="close" />
      </v-card-title>
      <v-card-subtitle>
        开启「弹窗提醒」后一体机大屏会立即弹窗，需点击「我已阅读」才会关闭；勾选「置顶」的通知会固定在首页通知区显示。弹窗提醒与置顶至少要开启一项
      </v-card-subtitle>
      <v-divider />
      <v-card-text class="pa-4">
        <v-text-field v-model="form.title" class="mb-2" counter="64" label="标题（可留空）" maxlength="64" placeholder="例如：明天体检" />
        <v-textarea v-model="form.content" auto-grow label="内容" maxlength="2000" placeholder="早上 7:30 到校，空腹" rows="3" />

        <div v-if="form.pinned" class="mt-2">
          <div class="text-caption text-medium-emphasis mb-1">有效时间</div>
          <div class="d-flex flex-wrap ga-2">
            <v-chip
              v-for="option in durationOptions"
              :key="option.value"
              :color="duration === option.value ? 'primary' : undefined"
              :variant="duration === option.value ? 'flat' : 'outlined'"
              size="small"
              @click="duration = option.value"
            >
              {{ option.title }}
            </v-chip>
          </div>
          <v-text-field
            v-if="duration === 'custom'"
            v-model="customExpire"
            class="mt-2"
            density="compact"
            label="自定义到期时间"
            type="datetime-local"
            variant="outlined"
          />
          <div class="text-caption text-medium-emphasis mt-1">{{ expirePreview }}</div>
        </div>
        <div v-else class="mt-2 text-caption text-medium-emphasis">
          未置顶通知只会在发布时弹窗提醒，不会显示在首页通知区，因此无需设置有效期。
        </div>

        <div class="d-flex align-center flex-wrap mt-1">
          <v-switch v-model="form.urgent" color="error" hide-details inset label="紧急（红色强调）" />
          <v-switch v-model="form.popup" class="ml-4" color="primary" hide-details inset label="弹窗提醒（大屏立即弹出）" />
          <v-switch v-model="form.pinned" class="ml-4" color="primary" hide-details inset label="置顶（首页常驻显示）" />
        </div>
        <div v-if="!form.popup && !form.pinned" class="text-caption text-error">弹窗提醒与置顶通知至少需要开启一项，否则家长和大屏都看不到这条通知</div>

        <v-alert v-if="error" class="mt-3" density="compact" type="error" variant="tonal">{{ error }}</v-alert>

        <v-divider class="my-4" />

        <div class="d-flex align-center mb-2">
          <div class="text-subtitle-2">已发布通知（{{ notices.length }}）</div>
          <v-spacer />
          <v-btn size="small" variant="text" prepend-icon="mdi-refresh" :loading="loadingList" @click="loadNotices">刷新</v-btn>
          <v-btn v-if="editingId" class="ml-2" size="small" variant="text" @click="resetForm">新建一条</v-btn>
        </div>

        <v-alert v-if="!loadingList && notices.length === 0" density="compact" type="info" variant="tonal">
          还没有已发布的通知
        </v-alert>

        <v-expansion-panels v-else flat tile>
          <v-expansion-panel v-for="item in notices" :key="item.id">
            <v-expansion-panel-title>
              <v-icon class="mr-2" :color="item.level === 'urgent' ? 'error' : 'primary'" size="small">
                {{ item.level === 'urgent' ? 'mdi-alert' : 'mdi-bullhorn-outline' }}
              </v-icon>
              <span class="text-truncate font-weight-medium">{{ item.title || '通知' }}</span>
              <v-chip v-if="!item.readAt" class="ml-2" color="error" size="x-small" variant="tonal">本机未读</v-chip>
              <v-chip v-if="!item.popup" class="ml-1" size="x-small" variant="text">不弹窗</v-chip>
              <v-chip v-if="!item.pinned" class="ml-1" size="x-small" variant="text">不置顶</v-chip>
              <v-spacer />
              <v-chip class="mr-1" size="x-small" variant="tonal">已读 {{ item.readCount ?? 0 }} / {{ deviceTotal }}</v-chip>
              <span class="text-caption text-medium-emphasis d-none d-sm-inline">{{ formatTime(item.publishAt) }}</span>
            </v-expansion-panel-title>
            <v-expansion-panel-text>
              <div class="text-body-2 mb-2" style="white-space: pre-wrap">{{ item.content || '（无正文）' }}</div>
              <div class="text-caption text-medium-emphasis mb-2">
                {{ item.level === 'urgent' ? '加急' : '普通' }} · {{ item.popup === false ? '不弹窗' : '弹窗提醒' }} · 发布 {{ formatTime(item.publishAt) }} · {{ expireText(item.expireAt) }}
              </div>
              <div class="read-grid mb-2">
                <v-chip
                  v-for="device in deviceList"
                  :key="device.id"
                  :color="readAtOf(item, device.id) ? 'success' : undefined"
                  :variant="readAtOf(item, device.id) ? 'flat' : 'outlined'"
                  size="x-small"
                >
                  <v-icon :icon="readAtOf(item, device.id) ? 'mdi-check-circle' : 'mdi-clock-outline'" start size="14" />
                  {{ device.name }} · {{ readAtOf(item, device.id) ? formatTime(readAtOf(item, device.id)) : '未读' }}
                </v-chip>
              </div>
              <div class="d-flex justify-end ga-2">
                <v-btn size="small" variant="text" prepend-icon="mdi-pencil-outline" @click.stop="startEdit(item)">编辑</v-btn>
                <v-btn color="error" size="small" variant="text" prepend-icon="mdi-delete-outline" @click.stop="removeNotice(item)">删除</v-btn>
              </div>
            </v-expansion-panel-text>
          </v-expansion-panel>
        </v-expansion-panels>
      </v-card-text>
      <v-divider />
      <v-card-actions class="pa-4">
        <v-btn variant="text" @click="close">取消</v-btn>
        <v-spacer />
        <v-btn v-if="!readOnly" :disabled="(!form.title.trim() && !form.content.trim()) || (!form.popup && !form.pinned)" :loading="sending" color="primary" variant="elevated" @click="submit">
          {{ editingId ? '保存修改' : '发送' }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { deleteData, getData, patchData, postData } from '@/lib/api'
import { useSessionStore } from '@/stores/session'

interface NoticeReadRow {
  deviceId: string
  readAt: string
}

interface NoticeRow {
  id: string
  title: string
  content: string
  level: 'info' | 'urgent'
  pinned: boolean
  popup: boolean
  publishAt: string
  expireAt: string | null
  readAt?: string | null
  readCount?: number
  reads?: NoticeReadRow[]
}

interface DeviceRow {
  id: string
  name: string
}

const session = useSessionStore()
/** 只读授权码设备不允许发送通知 */
const readOnly = computed(() => session.readOnly)

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; sent: [] }>()

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
})

const form = reactive({ title: '', content: '', urgent: false, pinned: true, popup: true })
const sending = ref(false)
const error = ref('')

const notices = ref<NoticeRow[]>([])
const deviceList = ref<DeviceRow[]>([])
const deviceTotal = ref(0)
const loadingList = ref(false)
const editingId = ref('')
const duration = ref('30')
const customExpire = ref('')

const durationOptions = [
  { title: '30 分钟', value: '30' },
  { title: '12 小时', value: '720' },
  { title: '24 小时', value: '1440' },
  { title: '3 天', value: '4320' },
  { title: '7 天', value: '10080' },
  { title: '长期', value: 'forever' },
  { title: '自定义', value: 'custom' },
]

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function formatTime(value: string | null | undefined): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return String(date.getMonth() + 1) + '-' + pad(date.getDate()) + ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes())
}

function expireText(expireAt: string | null): string {
  if (!expireAt) return '长期有效'
  return '有效至 ' + formatTime(expireAt)
}

function readAtOf(item: NoticeRow, deviceId: string): string {
  const hit = item.reads?.find((row) => row.deviceId === deviceId)
  return hit ? hit.readAt : ''
}

const expirePreview = computed(() => {
  if (duration.value === 'forever') return '到期时间：长期有效（不会自动消失）'
  if (duration.value === 'custom') {
    if (!customExpire.value) return '到期时间：请选择时间'
    return '到期时间：' + formatTime(new Date(customExpire.value).toISOString())
  }
  const minutes = Number(duration.value)
  const target = new Date(Date.now() + minutes * 60000)
  return '到期时间：' + formatTime(target.toISOString()) + '（' + (minutes < 60 ? minutes + ' 分钟后' : minutes < 1440 ? minutes / 60 + ' 小时后' : minutes / 1440 + ' 天后') + '）'
})

function resolveExpireAt(): string | null {
  if (duration.value === 'forever') return null
  if (duration.value === 'custom') {
    if (!customExpire.value) return null
    const date = new Date(customExpire.value)
    return Number.isNaN(date.getTime()) ? null : date.toISOString()
  }
  return new Date(Date.now() + Number(duration.value) * 60000).toISOString()
}

async function loadNotices(): Promise<void> {
  loadingList.value = true
  try {
    const result = await getData<{ items: NoticeRow[]; devices: DeviceRow[]; deviceCount: number }>('/board/notices')
    notices.value = result.items ?? []
    deviceList.value = result.devices ?? []
    deviceTotal.value = result.deviceCount ?? deviceList.value.length
  } catch {
    // 离线时保持旧数据
  } finally {
    loadingList.value = false
  }
}

function resetForm(): void {
  editingId.value = ''
  form.title = ''
  form.content = ''
  form.urgent = false
  form.pinned = true
  form.popup = true
  duration.value = '30'
  customExpire.value = ''
  error.value = ''
}

function startEdit(item: NoticeRow): void {
  editingId.value = item.id
  form.title = item.title
  form.content = item.content
  form.urgent = item.level === 'urgent'
  form.pinned = item.pinned
  form.popup = item.popup !== false
  if (item.expireAt) {
    const date = new Date(item.expireAt)
    duration.value = 'custom'
    customExpire.value = new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
  } else {
    duration.value = 'forever'
    customExpire.value = ''
  }
  error.value = ''
}

async function removeNotice(item: NoticeRow): Promise<void> {
  const okToGo = window.confirm('删除通知「' + item.title + '」？删除后大屏将不再显示。')
  if (!okToGo) return
  try {
    await deleteData('/board/notices/' + item.id)
    if (editingId.value === item.id) resetForm()
    await loadNotices()
    emit('sent')
  } catch (e) {
    error.value = e instanceof Error ? e.message : '删除失败'
  }
}

async function submit(): Promise<void> {
  if (readOnly.value) {
    error.value = '当前设备为只读授权，无法发送通知'
    return
  }
  if (sending.value || (!form.title.trim() && !form.content.trim())) return
  if (!form.popup && !form.pinned) {
    error.value = '弹窗提醒与置顶通知至少需要开启一项'
    return
  }
  sending.value = true
  error.value = ''
  try {
    const payload = {
      title: form.title.trim(),
      content: form.content.trim(),
      level: form.urgent ? 'urgent' : 'info',
      pinned: form.pinned,
      popup: form.popup,
      // 未置顶的通知只弹窗，不需要有效期
      expireAt: form.pinned ? resolveExpireAt() : null,
    }
    if (editingId.value) {
      await patchData('/board/notices/' + editingId.value, payload)
    } else {
      await postData('/board/notices', payload)
    }
    resetForm()
    await loadNotices()
    emit('sent')
  } catch (e) {
    error.value = e instanceof Error ? e.message : '发送失败'
  } finally {
    sending.value = false
  }
}

function close(): void {
  error.value = ''
  visible.value = false
}

watch(
  () => props.modelValue,
  (open: boolean) => {
    if (open) {
      resetForm()
      void loadNotices()
    }
  },
)
</script>

<style scoped>
.read-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.notice-list-title {
  font-size: 13px;
}

@media (max-width: 600px) {
  .read-grid {
    gap: 4px;
  }
}
</style>
