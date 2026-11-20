<template>
  <div>
    <v-card class="pa-4" variant="flat">
      <div class="list-toolbar">
        <div class="text-subtitle-1 font-weight-bold">大屏设备</div>
        <v-spacer />
        <v-btn icon="mdi-refresh" :loading="loading" variant="text" @click="load()" />
      </div>

      <div class="device-filters">
        <v-text-field
          v-model="keyword"
          class="filter-search"
          clearable
          density="compact"
          hide-details
          label="搜索设备名 / 班级 / 设备标识"
          prepend-inner-icon="mdi-magnify"
          variant="outlined"
          @click:clear="keyword = ''"
        />
        <v-btn-toggle v-model="statusFilter" density="compact" divided mandatory variant="outlined">
          <v-btn size="small" value="all">全部 {{ allCount }}</v-btn>
          <v-btn size="small" value="online">
            <span class="status-dot is-online mr-2" />在线 {{ onlineCount }}
          </v-btn>
          <v-btn size="small" value="offline">
            <span class="status-dot is-offline mr-2" />离线 {{ offlineCount }}
          </v-btn>
        </v-btn-toggle>
        <div class="live-hint text-caption text-medium-emphasis">
          <v-icon icon="mdi-autorenew" size="14" />
          <span class="ml-1">每 30 秒自动刷新</span>
        </div>
      </div>

      <div v-if="selected.length" class="bulk-bar">
        <v-icon icon="mdi-checkbox-multiple-marked-outline" size="18" />
        <span class="text-body-2">已选 {{ selected.length }} 台设备</span>
        <v-btn
          :loading="revoking"
          color="error"
          prepend-icon="mdi-delete-sweep-outline"
          size="small"
          variant="flat"
          @click="askBatchRevoke"
        >
          批量吊销
        </v-btn>
        <v-btn size="small" variant="text" @click="selected = []">清除选择</v-btn>
      </div>

      <v-data-table-server
        v-model="selected"
        :headers="headers"
        :items="items"
        :items-length="total"
        :items-per-page="pageSize"
        :loading="loading"
        :page="page"
        item-value="id"
        show-select
        @update:options="onOptions"
      >
        <template #loading>
          <SfTableSkeleton :cols="headers.length" :rows="6" />
        </template>
        <template #item.name="{ item }">
          <div class="cell-title">{{ item.name }}</div>
          <div v-if="mobile" class="cell-sub">
            {{ item.className || '未绑定班级' }} · {{ roleLabel(item.role) }} · {{ item.online ? '在线' : '离线' }}
          </div>
        </template>
        <template #item.online="{ item }">
          <span class="status-dot" :class="item.online ? 'is-online' : 'is-offline'" />
          <span :class="item.online ? 'text-success' : 'text-medium-emphasis'">
            {{ item.online ? '在线' : '离线' }}
          </span>
        </template>
        <template #item.role="{ item }">
          <v-chip :color="item.role === 'guest' ? 'warning' : 'primary'" size="small" variant="tonal">
            {{ roleLabel(item.role) }}
          </v-chip>
        </template>
        <template #item.isReadOnly="{ item }">
          <v-chip :color="item.isReadOnly ? 'warning' : 'success'" size="small" variant="tonal">
            {{ item.isReadOnly ? '只读' : '可写' }}
          </v-chip>
        </template>
        <template #item.lastSeenAt="{ item }">
          <span
            :class="item.online ? 'text-success' : 'text-medium-emphasis'"
            :title="item.lastSeenAt ? formatDate(item.lastSeenAt) : '从未连接'"
          >
            {{ lastSeenText(item.lastSeenAt) }}
          </span>
        </template>
        <template #item.actions="{ item }">
          <v-btn size="small" variant="text" @click="openDetail(item)">详情</v-btn>
          <v-btn color="error" size="small" variant="text" @click="askRevoke(item)">吊销</v-btn>
        </template>
        <template #no-data>
          <div class="py-8 text-medium-emphasis">{{ emptyText }}</div>
        </template>
      </v-data-table-server>
    </v-card>

    <v-dialog v-model="confirmOpen" max-width="440">
      <v-card>
        <v-card-title>{{ confirmMode === 'batch' ? '批量吊销设备' : '吊销设备' }}</v-card-title>
        <v-card-text class="text-body-2">
          <template v-if="confirmMode === 'batch'">
            确定吊销已选中的 <strong>{{ selected.length }}</strong> 台设备吗？吊销后这些设备会立即掉线，需要重新输入班级码与授权码才能恢复访问。
          </template>
          <template v-else>
            确定吊销「{{ confirmTarget?.name || '该设备' }}」吗？吊销后该设备会立即掉线，需要重新输入班级码与授权码才能恢复访问。
          </template>
        </v-card-text>
        <v-card-actions>
          <v-btn variant="text" @click="confirmOpen = false">取消</v-btn>
          <v-spacer />
          <v-btn :loading="revoking" color="error" variant="flat" @click="doRevoke">
            {{ confirmMode === 'batch' ? '确认吊销 ' + selected.length + ' 台' : '确认吊销' }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="detailOpen" max-width="560">
      <v-card v-if="detailTarget">
        <v-card-title class="detail-title">
          <v-icon icon="mdi-monitor-dashboard" size="22" class="mr-2" />
          设备详情
          <v-spacer />
          <v-chip :color="detailTarget.online ? 'success' : 'default'" size="small" variant="tonal">
            {{ detailTarget.online ? '在线' : '离线' }}
          </v-chip>
        </v-card-title>
        <v-card-text>
          <div class="detail-section-title">基本信息</div>
          <div class="detail-grid">
            <div class="detail-label">设备名称</div>
            <div class="detail-value">{{ detailTarget.name }}</div>
            <div class="detail-label">所属班级</div>
            <div class="detail-value">{{ detailTarget.className || '未绑定班级' }}</div>
            <div class="detail-label">设备身份</div>
            <div class="detail-value">{{ roleLabel(detailTarget.role) }}</div>
            <div class="detail-label">设备权限</div>
            <div class="detail-value">{{ detailTarget.isReadOnly ? '只读' : '可写' }}</div>
            <div class="detail-label">设备标识</div>
            <div class="detail-value detail-mono">{{ detailTarget.uuid }}</div>
            <div class="detail-label">创建时间</div>
            <div class="detail-value">{{ detailTarget.createdAt ? formatDate(detailTarget.createdAt) : '-' }}</div>
            <div class="detail-label">最近心跳</div>
            <div class="detail-value">
              {{ lastSeenText(detailTarget.lastSeenAt) }}
              <span v-if="detailTarget.lastSeenAt" class="detail-sub">{{ formatDate(detailTarget.lastSeenAt) }}</span>
            </div>
          </div>

          <div class="detail-section-title mt-4">运行环境</div>
          <div class="detail-grid">
            <div class="detail-label">运行平台</div>
            <div class="detail-value">
              {{ uaInfo.platform }}
              <span v-if="uaInfo.platformVersion" class="detail-sub">{{ uaInfo.platformVersion }}</span>
            </div>
            <div class="detail-label">运行形态</div>
            <div class="detail-value">{{ uaInfo.runtime }}</div>
            <div class="detail-label">客户端版本</div>
            <div class="detail-value">{{ uaInfo.version ? 'v' + uaInfo.version : '未上报' }}</div>
            <div class="detail-label">运行内核</div>
            <div class="detail-value">{{ uaInfo.engine || '未上报' }}</div>
            <div class="detail-label">IP 地址</div>
            <div class="detail-value detail-mono">{{ detailTarget.lastIp || '未记录' }}</div>
          </div>

          <v-expansion-panels class="mt-4" variant="accordion">
            <v-expansion-panel title="原始 User-Agent">
              <v-expansion-panel-text>
                <div class="detail-ua">{{ uaInfo.raw || '未上报' }}</div>
              </v-expansion-panel-text>
            </v-expansion-panel>
          </v-expansion-panels>
        </v-card-text>
        <v-card-actions>
          <v-btn
            v-if="uaInfo.raw"
            prepend-icon="mdi-content-copy"
            size="small"
            variant="text"
            @click="copyUa"
          >
            复制 UA
          </v-btn>
          <v-spacer />
          <v-btn variant="text" @click="detailOpen = false">关闭</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-snackbar v-model="snack.show" :color="snack.color" timeout="2600">{{ snack.text }}</v-snackbar>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useDisplay } from 'vuetify'
import { DEVICE_ROLE_LABEL, type DeviceRole } from '@starflame/shared'
import { deleteData, getData, postData } from '@/lib/api'
import SfTableSkeleton from '@/components/skeleton/SfTableSkeleton.vue'
import { parseUserAgent } from '@/lib/uaInfo'

interface DeviceRow {
  id: string
  name: string
  uuid: string
  className: string | null
  role: DeviceRole
  isReadOnly: boolean
  userAgent: string | null
  lastIp: string | null
  lastSeenAt: string | null
  createdAt: string | null
  online: boolean
}

interface DeviceListResult {
  items: DeviceRow[]
  total: number
  page: number
  pageSize: number
  onlineCount: number
  offlineCount: number
}

const { mobile } = useDisplay()

function roleLabel(role: DeviceRole): string {
  return DEVICE_ROLE_LABEL[role] ?? role
}

const allHeaders = [
  { title: '设备名', key: 'name' },
  { title: '所属班级', key: 'className' },
  { title: '身份', key: 'role' },
  { title: '权限', key: 'isReadOnly' },
  { title: '在线状态', key: 'online' },
  { title: '最近心跳', key: 'lastSeenAt' },
  { title: '操作', key: 'actions', sortable: false, align: 'end' as const },
]

/** 移动端只保留关键列（在线状态必须在，它是这页最关心的信息） */
const headers = computed(() =>
  mobile.value
    ? [
        // 窄屏还有勾选列，身份并进设备名下方的副标题，避免设备名被挤成两行
        { title: '设备', key: 'name' },
        { title: '状态', key: 'online' },
        { title: '操作', key: 'actions', sortable: false, align: 'end' as const },
      ]
    : allHeaders,
)

const items = ref<DeviceRow[]>([])
const loading = ref(false)
const total = ref(0)
const onlineCount = ref(0)
const offlineCount = ref(0)
const page = ref(1)
const pageSize = ref(50)
const keyword = ref('')
const statusFilter = ref<'all' | 'online' | 'offline'>('all')
const snack = reactive({ show: false, text: '', color: 'success' })

const allCount = computed(() => onlineCount.value + offlineCount.value)
const emptyText = computed(() => {
  if (keyword.value.trim()) return '没有匹配的设备'
  if (statusFilter.value === 'online') return '当前没有在线设备'
  if (statusFilter.value === 'offline') return '当前没有离线设备'
  return '暂无设备'
})

function formatDate(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString('zh-CN')
}

/** 相对时间：管理面板更关心「多久没心跳了」而不是精确时间点 */
function lastSeenText(value: string | null): string {
  if (!value) return '从未连接'
  const time = new Date(value).getTime()
  if (Number.isNaN(time)) return '-'
  const diff = Date.now() - time
  if (diff < 60 * 1000) return '刚刚'
  if (diff < 60 * 60 * 1000) return Math.floor(diff / 60000) + ' 分钟前'
  if (diff < 24 * 60 * 60 * 1000) return Math.floor(diff / 3600000) + ' 小时前'
  if (diff < 30 * 24 * 60 * 60 * 1000) return Math.floor(diff / 86400000) + ' 天前'
  return formatDate(value)
}

function notify(text: string, color = 'success'): void {
  snack.text = text
  snack.color = color
  snack.show = true
}

async function load(): Promise<void> {
  loading.value = true
  try {
    const response = await getData<DeviceListResult>('/admin/devices', {
      page: page.value,
      pageSize: pageSize.value,
      keyword: keyword.value.trim() || undefined,
      status: statusFilter.value === 'all' ? undefined : statusFilter.value,
    })
    items.value = response.items
    total.value = response.total
    onlineCount.value = response.onlineCount
    offlineCount.value = response.offlineCount
  } catch (error) {
    notify(error instanceof Error ? error.message : '加载失败', 'error')
  } finally {
    loading.value = false
  }
}

/** 搜索防抖：输入停下 350ms 再请求 */
let searchTimer: ReturnType<typeof setTimeout> | null = null
watch(keyword, () => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    searchTimer = null
    page.value = 1
    resetSelection()
    void load()
  }, 350)
})

watch(statusFilter, () => {
  page.value = 1
  resetSelection()
  void load()
})

function onOptions(options: { page: number; itemsPerPage: number }): void {
  const nextPage = Math.max(1, options.page)
  const nextSize = Math.max(1, options.itemsPerPage)
  if (nextPage === page.value && nextSize === pageSize.value) return
  page.value = nextPage
  pageSize.value = nextSize
  resetSelection()
  void load()
}

/** 在线状态会变，页面打开时每 30 秒静默刷新一次（切到后台就暂停） */
let refreshTimer: ReturnType<typeof setInterval> | null = null

/** 切回前台立刻刷新：轮询在后台标签页里是暂停的，不补一次会看到过期状态 */
function onVisibilityChange(): void {
  if (document.visibilityState !== 'visible') return
  if (loading.value) return
  void load()
}

onMounted(() => {
  void load()
  refreshTimer = setInterval(() => {
    if (document.visibilityState !== 'visible') return
    if (loading.value) return
    void load()
  }, 30000)
  document.addEventListener('visibilitychange', onVisibilityChange)
  window.addEventListener('focus', onVisibilityChange)
})

onBeforeUnmount(() => {
  if (refreshTimer) clearInterval(refreshTimer)
  if (searchTimer) clearTimeout(searchTimer)
  document.removeEventListener('visibilitychange', onVisibilityChange)
  window.removeEventListener('focus', onVisibilityChange)
})

const selected = ref<string[]>([])
const confirmOpen = ref(false)
const confirmMode = ref<'single' | 'batch'>('single')
const confirmTarget = ref<DeviceRow | null>(null)
const revoking = ref(false)

/** 翻页 / 改筛选 / 改关键词时清空选择：批量吊销只针对当前列表里看到的设备 */
function resetSelection(): void {
  selected.value = []
}

function askRevoke(item: DeviceRow): void {
  confirmMode.value = 'single'
  confirmTarget.value = item
  confirmOpen.value = true
}

function askBatchRevoke(): void {
  if (selected.value.length === 0) return
  confirmMode.value = 'batch'
  confirmTarget.value = null
  confirmOpen.value = true
}

async function doRevoke(): Promise<void> {
  const batch = confirmMode.value === 'batch'
  const ids = batch ? [...selected.value] : confirmTarget.value ? [confirmTarget.value.id] : []
  if (ids.length === 0) return
  revoking.value = true
  try {
    if (batch) {
      const result = await postData<{ revoked: number; disconnected: number }>('/admin/devices/revoke-batch', {
        ids,
      })
      notify(
        result.disconnected > 0
          ? `已吊销 ${result.revoked} 台设备，${result.disconnected} 台在线设备已强制下线`
          : `已吊销 ${result.revoked} 台设备`,
      )
    } else {
      const result = await deleteData<{ revoked: boolean; disconnected: number }>('/admin/devices/' + ids[0])
      notify(result.disconnected > 0 ? '已吊销该设备，并已强制下线' : '已吊销该设备')
    }
    confirmOpen.value = false
    confirmTarget.value = null
    selected.value = []
    await load()
  } catch (error) {
    notify(error instanceof Error ? error.message : '操作失败', 'error')
  } finally {
    revoking.value = false
  }
}

// ---------- 设备详情 ----------
const detailOpen = ref(false)
const detailTarget = ref<DeviceRow | null>(null)

/** 平台 / 客户端版本直接从 UA 里解析，服务端不做解析以保持接口轻量 */
const uaInfo = computed(() => parseUserAgent(detailTarget.value?.userAgent))

function openDetail(item: DeviceRow): void {
  detailTarget.value = item
  detailOpen.value = true
}

async function copyUa(): Promise<void> {
  const raw = uaInfo.value.raw
  if (!raw) return
  try {
    await navigator.clipboard.writeText(raw)
    notify('已复制 User-Agent')
  } catch {
    notify('复制失败，请手动选中复制', 'error')
  }
}
</script>

<style scoped>
.device-filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin: 4px 0 12px;
}
.filter-search {
  max-width: 320px;
  min-width: 220px;
}
.live-hint {
  display: inline-flex;
  align-items: center;
}
.bulk-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
  padding: 6px 10px;
  border: 1px solid rgba(var(--v-theme-error), 0.28);
  border-radius: 10px;
  background: rgba(var(--v-theme-error), 0.06);
  color: rgb(var(--v-theme-error));
}
.status-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  margin-right: 6px;
  border-radius: 50%;
  background: #9e9e9e;
  vertical-align: middle;
}
.status-dot.is-online {
  background: #2e7d32;
  box-shadow: 0 0 0 3px rgba(46, 125, 50, 0.18);
}
.status-dot.is-offline {
  background: #bdbdbd;
}
.detail-title {
  display: flex;
  align-items: center;
}
.detail-section-title {
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: rgba(var(--v-theme-on-surface), 0.6);
  margin-bottom: 8px;
}
.detail-grid {
  display: grid;
  grid-template-columns: 84px minmax(0, 1fr);
  gap: 6px 12px;
  font-size: 14px;
}
.detail-label {
  color: rgba(var(--v-theme-on-surface), 0.6);
}
.detail-value {
  word-break: break-all;
}
.detail-sub {
  margin-left: 6px;
  font-size: 12px;
  color: rgba(var(--v-theme-on-surface), 0.6);
}
.detail-mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 13px;
}
.detail-ua {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  line-height: 1.6;
  word-break: break-all;
  color: rgba(var(--v-theme-on-surface), 0.8);
}
@media (max-width: 600px) {
  .filter-search {
    max-width: none;
    width: 100%;
  }
}
</style>