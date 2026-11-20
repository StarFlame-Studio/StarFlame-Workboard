<template>
  <div>
    <v-card class="pa-4" variant="flat">
      <div class="list-toolbar">
        <div>
          <div class="text-subtitle-1 font-weight-bold">通知管理</div>
          <div class="text-caption text-medium-emphasis">跨班级查看通知、群发同一份内容，或为每个班级单独发送内容</div>
        </div>
        <v-spacer />
        <v-btn prepend-icon="mdi-refresh" variant="tonal" :loading="loading" @click="load">刷新</v-btn>
      </div>

      <v-tabs v-model="tab" color="primary" density="comfortable" class="mb-4">
        <v-tab value="list">通知列表</v-tab>
        <v-tab value="broadcast">群发通知</v-tab>
        <v-tab value="batch">批量发送</v-tab>
      </v-tabs>

      <!-- 列表 -->
      <div v-show="tab === 'list'">
        <div class="notice-filters">
          <v-text-field
            v-model="keyword"
            density="compact"
            hide-details
            label="搜索标题 / 内容 / 班级"
            prepend-inner-icon="mdi-magnify"
            variant="outlined"
            @update:model-value="onFilterChange"
          />
          <v-select
            v-model="filterClassId"
            :items="classOptions"
            clearable
            density="compact"
            hide-details
            item-title="name"
            item-value="id"
            label="按班级筛选"
            variant="outlined"
            @update:model-value="onFilterChange"
          />
        </div>

        <v-data-table-server
          :headers="headers"
          :items="items"
          :items-length="total"
          :items-per-page="pageSize"
          :loading="loading"
          :page="page"
          item-value="id"
          @update:options="onOptionsChange"
        >
          <template #loading>
            <SfTableSkeleton :cols="headers.length" :rows="6" />
          </template>
          <template #item.className="{ item }">
            <div class="cell-title cell-nowrap">{{ item.className || '（已删除班级）' }}</div>
          </template>
          <template #item.title="{ item }">
            <div class="cell-title">{{ item.title || '（无标题）' }}</div>
            <div class="cell-sub notice-preview">{{ item.content }}</div>
          </template>
          <template #item.level="{ item }">
            <v-chip :color="item.level === 'urgent' ? 'error' : 'info'" size="small" variant="tonal">
              {{ item.level === 'urgent' ? '紧急' : '普通' }}
            </v-chip>
          </template>
          <template #item.pinned="{ item }">
            <v-chip v-if="item.pinned" color="warning" size="small" variant="tonal">置顶</v-chip>
            <span v-else class="text-medium-emphasis">—</span>
          </template>
          <template #item.publishAt="{ item }">{{ formatDate(item.publishAt) }}</template>
          <template #item.expireAt="{ item }">{{ item.expireAt ? formatDate(item.expireAt) : '不过期' }}</template>
          <template #item.actions="{ item }">
            <v-btn color="error" size="small" variant="text" @click="askRemove(item)">删除</v-btn>
          </template>
          <template #no-data>
            <div class="py-8 text-medium-emphasis">暂无通知</div>
          </template>
        </v-data-table-server>
      </div>

      <!-- 群发 -->
      <div v-show="tab === 'broadcast'">
        <v-alert class="mb-4" density="compact" type="info" variant="tonal">
          同一份通知内容将一次性发布到所选的全部班级。
        </v-alert>
        <v-select
          v-model="broadcast.classIds"
          :items="classOptions"
          chips
          closable-chips
          density="compact"
          item-title="name"
          item-value="id"
          label="选择目标班级（可多选）"
          multiple
          variant="outlined"
        />
        <v-text-field v-model="broadcast.title" class="mt-3" counter maxlength="64" label="标题" variant="outlined" />
        <v-textarea v-model="broadcast.content" class="mt-3" counter maxlength="2000" label="内容" rows="6" variant="outlined" />
        <div class="form-grid form-grid--broadcast">
          <v-select v-model="broadcast.level" :items="levelOptions" density="compact" hide-details label="级别" variant="outlined" />
          <v-text-field v-model="broadcast.expireAt" density="compact" hide-details label="过期日期（可选）" type="date" variant="outlined" />
          <v-switch v-model="broadcast.pinned" color="primary" density="compact" hide-details label="置顶" />
          <v-btn
            :loading="broadcasting"
            color="primary"
            prepend-icon="mdi-send"
            variant="flat"
            @click="submitBroadcast"
          >发布到所选班级</v-btn>
        </div>
      </div>

      <!-- 批量 -->
      <div v-show="tab === 'batch'">
        <v-alert class="mb-4" density="compact" type="info" variant="tonal">
          每一行对应一个班级和一条独立通知，可一次提交多条。
        </v-alert>
        <div class="batch-list">
          <v-card v-for="(row, index) in batchRows" :key="index" class="pa-3 mb-3" variant="outlined">
            <div class="d-flex align-center ga-2 mb-2">
              <div class="text-subtitle-2">第 {{ index + 1 }} 条</div>
              <v-spacer />
              <v-btn color="error" density="compact" icon="mdi-delete-outline" variant="text" @click="removeBatchRow(index)" />
            </div>
            <div class="form-grid form-grid--batch-top">
              <v-select v-model="row.classId" :items="classOptions" density="compact" hide-details item-title="name" item-value="id" label="班级" variant="outlined" />
              <v-text-field v-model="row.title" counter density="compact" maxlength="64" label="标题" variant="outlined" />
            </div>
            <v-textarea v-model="row.content" class="mt-2" counter density="compact" maxlength="2000" label="内容" rows="3" variant="outlined" />
            <div class="form-grid form-grid--batch-bottom">
              <v-select v-model="row.level" :items="levelOptions" density="compact" hide-details label="级别" variant="outlined" />
              <v-text-field v-model="row.expireAt" density="compact" hide-details label="过期日期（可选）" type="date" variant="outlined" />
              <v-switch v-model="row.pinned" color="primary" density="compact" hide-details label="置顶" />
            </div>
          </v-card>
        </div>
        <div class="d-flex ga-2">
          <v-btn prepend-icon="mdi-plus" variant="tonal" @click="addBatchRow">添加一条</v-btn>
          <v-spacer />
          <v-btn :loading="batching" color="primary" prepend-icon="mdi-send" variant="flat" @click="submitBatch">批量发送</v-btn>
        </div>
      </div>
    </v-card>

    <v-dialog v-model="confirmOpen" max-width="420">
      <v-card>
        <v-card-title>删除通知</v-card-title>
        <v-card-text class="text-body-2">
          确定删除「{{ confirmTarget?.className || '' }}」班级的通知「{{ confirmTarget?.title || confirmTarget?.content?.slice(0, 12) || '无标题' }}」吗？删除后不可恢复。
        </v-card-text>
        <v-card-actions>
          <v-btn variant="text" @click="confirmOpen = false">取消</v-btn>
          <v-spacer />
          <v-btn :loading="removing" color="error" variant="flat" @click="doRemove">确认删除</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-snackbar v-model="snack.show" :color="snack.color" timeout="2600">{{ snack.text }}</v-snackbar>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { getData } from '@/lib/api'
import SfTableSkeleton from '@/components/skeleton/SfTableSkeleton.vue'
import {
  deleteAdminNotice,
  listAdminNotices,
  broadcastNotice,
  batchSendNotices,
  type AdminNotice,
} from '@/lib/noticesApi'

interface ClassOption {
  id: string
  name: string
}

interface BatchRow {
  classId: string
  title: string
  content: string
  level: 'info' | 'urgent'
  pinned: boolean
  expireAt: string
}

const levelOptions = [
  { title: '普通', value: 'info' },
  { title: '紧急', value: 'urgent' },
]

const tab = ref<'list' | 'broadcast' | 'batch'>('list')

const headers = [
  { title: '班级', key: 'className' },
  { title: '通知', key: 'title' },
  { title: '级别', key: 'level', sortable: false },
  { title: '置顶', key: 'pinned', sortable: false },
  { title: '发布时间', key: 'publishAt' },
  { title: '过期时间', key: 'expireAt' },
  { title: '操作', key: 'actions', sortable: false, align: 'end' as const },
]

// ---- 班级选项 ----
const classes = ref<ClassOption[]>([])
const classOptions = computed(() => classes.value.map((item) => ({ id: item.id, name: item.name })))

async function loadClasses(): Promise<void> {
  try {
    const response = await getData<{ items: ClassOption[] }>('/admin/classes', { page: 1, pageSize: 100 })
    classes.value = response.items
  } catch (error) {
    notify(error instanceof Error ? error.message : '加载班级失败', 'error')
  }
}

// ---- 列表 ----
const items = ref<AdminNotice[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const loading = ref(false)
const keyword = ref('')
const filterClassId = ref<string | null>(null)
let searchTimer: number | undefined

async function load(): Promise<void> {
  loading.value = true
  try {
    const response = await listAdminNotices({
      page: page.value,
      pageSize: pageSize.value,
      keyword: keyword.value.trim() || undefined,
      classId: filterClassId.value || undefined,
    })
    items.value = response.items
    total.value = response.total
  } catch (error) {
    notify(error instanceof Error ? error.message : '加载通知失败', 'error')
  } finally {
    loading.value = false
  }
}

function onOptionsChange(options: { page: number; itemsPerPage: number }): void {
  page.value = options.page
  pageSize.value = options.itemsPerPage
  void load()
}

function onFilterChange(): void {
  window.clearTimeout(searchTimer)
  searchTimer = window.setTimeout(() => {
    page.value = 1
    void load()
  }, 300)
}

// ---- 群发 ----
const broadcast = reactive({
  classIds: [] as string[],
  title: '',
  content: '',
  level: 'info' as 'info' | 'urgent',
  pinned: false,
  expireAt: '',
})
const broadcasting = ref(false)

async function submitBroadcast(): Promise<void> {
  if (broadcasting.value) return
  if (broadcast.classIds.length === 0) {
    notify('请至少选择一个班级', 'warning')
    return
  }
  if (!broadcast.title.trim() && !broadcast.content.trim()) {
    notify('标题与内容不能同时为空', 'warning')
    return
  }
  broadcasting.value = true
  try {
    const result = await broadcastNotice(broadcast.classIds, {
      title: broadcast.title.trim(),
      content: broadcast.content.trim(),
      level: broadcast.level,
      pinned: broadcast.pinned,
      expireAt: broadcast.expireAt ? new Date(broadcast.expireAt + 'T23:59:59').toISOString() : null,
    })
    notify('已发布到 ' + result.created + ' 个班级')
    broadcast.classIds = []
    broadcast.title = ''
    broadcast.content = ''
    broadcast.level = 'info'
    broadcast.pinned = false
    broadcast.expireAt = ''
    page.value = 1
    await load()
    tab.value = 'list'
  } catch (error) {
    notify(error instanceof Error ? error.message : '发布失败', 'error')
  } finally {
    broadcasting.value = false
  }
}

// ---- 批量 ----
const batchRows = ref<BatchRow[]>([])
const batching = ref(false)

function emptyRow(): BatchRow {
  return { classId: '', title: '', content: '', level: 'info', pinned: false, expireAt: '' }
}

function addBatchRow(): void {
  batchRows.value.push(emptyRow())
}

function removeBatchRow(index: number): void {
  batchRows.value.splice(index, 1)
}

async function submitBatch(): Promise<void> {
  if (batching.value) return
  const filled = batchRows.value.filter((row) => row.title.trim() || row.content.trim())
  if (filled.length === 0) {
    notify('请至少填写一条通知内容', 'warning')
    return
  }
  if (filled.some((row) => !row.classId)) {
    notify('每条通知都需要选择一个班级', 'warning')
    return
  }
  batching.value = true
  try {
    const result = await batchSendNotices(
      filled.map((row) => ({
        classId: row.classId,
        title: row.title.trim(),
        content: row.content.trim(),
        level: row.level,
        pinned: row.pinned,
        expireAt: row.expireAt ? new Date(row.expireAt + 'T23:59:59').toISOString() : null,
      })),
    )
    notify('已发送 ' + result.created + ' 条通知')
    batchRows.value = [emptyRow()]
    page.value = 1
    await load()
    tab.value = 'list'
  } catch (error) {
    notify(error instanceof Error ? error.message : '发送失败', 'error')
  } finally {
    batching.value = false
  }
}

// ---- 删除 ----
const confirmOpen = ref(false)
const confirmTarget = ref<AdminNotice | null>(null)
const removing = ref(false)

function askRemove(item: AdminNotice): void {
  confirmTarget.value = item
  confirmOpen.value = true
}

async function doRemove(): Promise<void> {
  const target = confirmTarget.value
  if (!target) return
  removing.value = true
  try {
    await deleteAdminNotice(target.id)
    confirmOpen.value = false
    confirmTarget.value = null
    await load()
    notify('已删除')
  } catch (error) {
    notify(error instanceof Error ? error.message : '删除失败', 'error')
  } finally {
    removing.value = false
  }
}

// ---- 通用 ----
const snack = reactive({ show: false, text: '', color: 'success' })

function notify(text: string, color = 'success'): void {
  snack.text = text
  snack.color = color
  snack.show = true
}

function formatDate(value: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  const pad = (n: number) => String(n).padStart(2, '0')
  return date.getFullYear() + '/' + pad(date.getMonth() + 1) + '/' + pad(date.getDate()) + ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes())
}

onMounted(async () => {
  await loadClasses()
  batchRows.value = [emptyRow()]
  await load()
})
</script>

<style scoped>
.notice-filters {
  display: grid;
  gap: 12px;
  grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
  margin-bottom: 16px;
}

.cell-nowrap {
  white-space: nowrap;
}

.notice-preview {
  max-width: 520px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.batch-list {
  max-height: 60vh;
  overflow-y: auto;
  padding-right: 4px;
}

.form-grid {
  display: grid;
  align-items: center;
  gap: 12px;
  margin-top: 12px;
}

.form-grid--broadcast {
  grid-template-columns: 150px 200px 110px minmax(0, 1fr);
  justify-items: start;
}

.form-grid--batch-top {
  grid-template-columns: minmax(0, 1fr) minmax(0, 2fr);
}

.form-grid--batch-bottom {
  grid-template-columns: 150px 200px 110px;
  justify-items: start;
}

.form-grid > .v-btn {
  justify-self: end;
}

@media (max-width: 900px) {
  .form-grid--broadcast,
  .form-grid--batch-top,
  .form-grid--batch-bottom {
    grid-template-columns: minmax(0, 1fr);
  }

  .form-grid > .v-btn {
    justify-self: stretch;
  }
}

@media (max-width: 720px) {
  .notice-filters {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
