<template>
  <settings-group icon="mdi-cloud-cog" title="数据源设置">
    <template #actions>
      <v-btn prepend-icon="mdi-refresh" variant="text" @click="load">刷新设备信息</v-btn>
    </template>

    <v-list>
      <v-list-item>
        <template #prepend><v-icon class="mr-3" icon="mdi-database" /></template>
        <v-list-item-title>数据提供者</v-list-item-title>
        <v-list-item-subtitle class="text-caption">{{ modeHint }}</v-list-item-subtitle>
        <template #append>
          <v-select
            :model-value="currentProvider"
            density="compact"
            hide-details
            :items="providerOptions"
            style="min-width: 220px"
            variant="outlined"
            @update:model-value="onSelect"
          />
        </template>
      </v-list-item>

      <v-list-item>
        <template #prepend><v-icon class="mr-3" :color="offlineTone.color" :icon="offlineTone.icon" /></template>
        <v-list-item-title>断网自动切换</v-list-item-title>
        <v-list-item-subtitle class="text-caption">{{ offlineTone.text }}</v-list-item-subtitle>
        <template #append>
          <v-btn v-if="ds.pending > 0" :loading="syncing" size="small" variant="tonal" @click="syncNow">立即重试</v-btn>
        </template>
      </v-list-item>

      <v-list-item v-if="ds.pending > 0">
        <template #prepend><v-icon class="mr-3" color="warning" icon="mdi-cloud-upload-outline" /></template>
        <v-list-item-title>待同步数据</v-list-item-title>
        <v-list-item-subtitle class="text-caption">
          本地共有 {{ ds.pending }} 条改动尚未上传，网络恢复后会自动上传
        </v-list-item-subtitle>
        <template #append>
          <div class="d-flex" style="gap: 8px">
            <v-btn :loading="syncing" size="small" variant="tonal" @click="syncNow">立即同步</v-btn>
            <v-btn size="small" variant="text" @click="discard">丢弃</v-btn>
          </div>
        </template>
      </v-list-item>

      <v-list-item v-for="item in pendingItems" :key="item.id" density="compact" class="pl-10">
        <template #prepend><v-icon class="mr-2" icon="mdi-circle-small" size="small" /></template>
        <v-list-item-title class="text-body-2">{{ item.label }}</v-list-item-title>
        <v-list-item-subtitle class="text-caption">
          {{ formatAt(item.createdAt) }}<span v-if="item.tries > 0"> · 已重试 {{ item.tries }} 次</span>
        </v-list-item-subtitle>
      </v-list-item>

      <v-divider class="my-2" />

      <v-list-item>
        <template #prepend><v-icon class="mr-3" icon="mdi-shield-key" /></template>
        <v-list-item-title>设备令牌</v-list-item-title>
        <v-list-item-subtitle class="text-caption" style="word-break: break-all">{{ maskedToken }}</v-list-item-subtitle>
        <template #append>
          <v-btn icon="mdi-content-copy" size="small" variant="text" @click="copyToken" />
        </template>
      </v-list-item>
    </v-list>

    <v-alert class="ma-2" density="compact" :type="isLocal ? 'warning' : 'info'" variant="tonal">
      <template v-if="isLocal">
        当前使用<strong>本地缓存模式</strong>：只读取本机缓存数据，作业与通知的改动先存在本机，切回星焰作业板API 后自动同步。
      </template>
      <template v-else>
        本设备使用星焰作业板API 作为数据源，配置会自动同步到云端，对同一班级的所有设备生效。
      </template>
    </v-alert>

    <v-card v-if="isLocal" class="ma-2" variant="tonal">
      <v-card-title class="text-subtitle-1 d-flex align-center">
        <v-icon class="mr-2" icon="mdi-harddisk" size="small" />
        本地快照
      </v-card-title>
      <v-card-text class="text-body-2">
        <div class="d-flex justify-space-between"><span class="text-medium-emphasis">班级</span><span>{{ className || '未缓存' }}</span></div>
        <div class="d-flex justify-space-between"><span class="text-medium-emphasis">最近缓存</span><span>{{ snapshotAt }}</span></div>
        <div class="d-flex justify-space-between"><span class="text-medium-emphasis">待同步</span><span>{{ ds.pending }} 条</span></div>
      </v-card-text>
      <v-card-actions>
        <v-btn prepend-icon="mdi-cloud-download-outline" variant="text" @click="refreshSnapshot">重新抓取快照</v-btn>
      </v-card-actions>
    </v-card>

    <v-card class="ma-2" variant="tonal">
      <v-card-title class="text-subtitle-1 d-flex align-center">
        <v-icon class="mr-2" icon="mdi-monitor" size="small" />
        设备信息
      </v-card-title>
      <v-card-text>
        <v-table density="compact">
          <tbody>
            <tr><td class="text-medium-emphasis">设备名称</td><td>{{ device.name || '-' }}</td></tr>
            <tr>
              <td class="text-medium-emphasis">身份</td>
              <td>
                {{ session.roleText || '-' }}
                <v-chip v-if="session.isGuest" class="ml-2" color="warning" size="x-small" variant="tonal">游客只读</v-chip>
              </td>
            </tr>
            <tr><td class="text-medium-emphasis">所属班级</td><td>{{ className || '-' }}</td></tr>
            <tr><td class="text-medium-emphasis">权限</td><td>{{ device.isReadOnly ? '只读' : '可写' }}</td></tr>
            <tr><td class="text-medium-emphasis">最近心跳</td><td>{{ lastSeen }}</td></tr>
            <tr><td class="text-medium-emphasis">接口地址</td><td>{{ apiBase }}</td></tr>
          </tbody>
        </v-table>
      </v-card-text>
      <v-card-actions class="px-4 pb-4">
        <device-binding-reset class="ml-0" size="small" variant="tonal" />
        <span class="text-caption text-medium-emphasis ml-2">清除本机设备令牌并回到欢迎页重新绑定</span>
      </v-card-actions>
    </v-card>

    <div class="ma-2 d-flex flex-wrap align-center" style="gap: 8px">
      <v-btn :loading="testing" prepend-icon="mdi-lan-connect" variant="tonal" @click="testConnection">测试连接</v-btn>
      <v-btn prepend-icon="mdi-cached" variant="outlined" @click="reloadData">重新加载诊断数据</v-btn>

      <v-chip v-if="latency !== null" :color="latencyColor" prepend-icon="mdi-speedometer" variant="tonal">
        延迟 {{ latency }} ms
      </v-chip>
    </div>

    <v-dialog v-model="confirmOpen" max-width="440" persistent>
      <v-card>
        <v-card-title class="text-h6">有 {{ ds.pending }} 条本地改动待同步</v-card-title>
        <v-card-text class="text-body-2">
          切回星焰作业板API 前，需要决定如何处理这些改动：立即同步到云端，或直接丢弃。
        </v-card-text>
        <v-card-actions>
          <v-btn variant="text" @click="cancelSwitch">取消</v-btn>
          <v-btn variant="text" @click="discardThenSwitch">丢弃改动</v-btn>
          <v-btn :loading="switching" color="primary" variant="elevated" @click="flushThenSwitch">立即同步</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-snackbar v-model="snack.show" :color="snack.color" timeout="2400">{{ snack.text }}</v-snackbar>
  </settings-group>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { DEVICE_TOKEN_STORAGE_KEY } from '@starflame/shared'
import { apiBase, getData } from '@/lib/api'
import {
  PROVIDER_API,
  PROVIDER_LOCAL,
  captureSnapshot,
  discardPending,
  ds,
  flushPending,
  pendingList,
  modeToProvider,
  providerToMode,
  saveProviderToCloud,
  setMode,
} from '@/lib/dataSource'
import { getClassCache } from '@/lib/localCache'
import { offlineUi, retryNow } from '@/lib/offline'
import { useSessionStore } from '@/stores/session'
import SettingsGroup from '@/components/settings/SettingGroup.vue'
import DeviceBindingReset from '@/components/settings/DeviceBindingReset.vue'

interface DeviceMe {
  device: { id: string; name: string; isReadOnly: boolean; lastSeenAt: string | null }
  class: { id: string; name: string }
  settings: Record<string, unknown>
}

const session = useSessionStore()

const props = withDefaults(defineProps<{ provider?: string }>(), { provider: PROVIDER_API })

const emit = defineEmits<{ 'provider-changed': [value: string] }>()

const providerOptions = [
  { title: '星焰作业板API', value: PROVIDER_API },
  { title: '本地缓存模式（离线可用）', value: PROVIDER_LOCAL },
]

const currentProvider = ref(props.provider)

watch(
  () => props.provider,
  (value) => {
    if (value) currentProvider.value = value
  },
)

const isLocal = computed(() => currentProvider.value === PROVIDER_LOCAL)
const modeHint = computed(() => (isLocal.value ? '离线优先，改动先存本机' : '云端实时同步'))

const device = ref<DeviceMe['device']>({ id: '', name: '', isReadOnly: false, lastSeenAt: null })
const className = ref('')
const snack = reactive({ show: false, text: '', color: 'success' })
const syncing = ref(false)
const switching = ref(false)
const confirmOpen = ref(false)
const snapshotAt = ref('未缓存')

/** 断网自动切换的当前状态文案 */
const offlineTone = computed(() => {
  if (offlineUi.status === 'offline') {
    return { color: 'warning', icon: 'mdi-cloud-off-outline', text: '当前离线：自动使用本机缓存读取数据，改动先存在本机' }
  }
  if (offlineUi.status === 'syncing') {
    return { color: 'info', icon: 'mdi-cloud-sync-outline', text: '正在把本地改动上传到云端…' }
  }
  if (offlineUi.status === 'synced') {
    return { color: 'success', icon: 'mdi-cloud-check-outline', text: '已同步 ' + offlineUi.syncedCount + ' 项本地改动' }
  }
  return { color: 'success', icon: 'mdi-cloud-check-outline', text: '在线：断网时会自动切换到本机缓存，恢复后自动上传改动' }
})

/** 待同步明细（最多展示 8 条） */
const pendingItems = computed(() => pendingList().slice(0, 8))

function formatAt(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString('zh-CN')
}

const maskedToken = computed(() => {
  const token = localStorage.getItem(DEVICE_TOKEN_STORAGE_KEY) ?? ''
  if (!token) return '（未找到设备令牌）'
  if (token.length <= 12) return token
  return token.slice(0, 8) + '…' + token.slice(-8)
})

const lastSeen = computed(() => {
  const raw = device.value.lastSeenAt
  if (!raw) return '从未连接'
  const date = new Date(raw)
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString('zh-CN')
})

function toast(text: string, color = 'success'): void {
  snack.text = text
  snack.color = color
  snack.show = true
}

function refreshSnapshotInfo(): void {
  const classId = ds.classId
  const entry = classId ? getClassCache(classId) : null
  if (!entry) {
    snapshotAt.value = '未缓存'
    return
  }
  if (entry.className) className.value = entry.className
  const date = new Date(entry.updatedAt)
  snapshotAt.value = Number.isNaN(date.getTime()) ? '未缓存' : date.toLocaleString('zh-CN')
}

async function load(): Promise<void> {
  try {
    const me = await getData<DeviceMe>('/device/me')
    device.value = me.device
    className.value = me.class?.name ?? ''
  } catch {
    // 忽略
  }
  refreshSnapshotInfo()
}

async function copyToken(): Promise<void> {
  const token = localStorage.getItem(DEVICE_TOKEN_STORAGE_KEY) ?? ''
  try {
    await navigator.clipboard.writeText(token)
    toast('令牌已复制')
  } catch {
    toast('复制失败', 'error')
  }
}

/** 上次测试的往返延迟（毫秒），null 表示尚未测试 */
const latency = ref<number | null>(null)
const testing = ref(false)

const latencyColor = computed(() => {
  const ms = latency.value
  if (ms === null) return 'default'
  if (ms < 120) return 'success'
  if (ms < 350) return 'warning'
  return 'error'
})

async function testConnection(): Promise<void> {
  if (testing.value) return
  testing.value = true
  latency.value = null
  const startedAt = performance.now()
  try {
    const res = await fetch(apiBase + '/health', { cache: 'no-store' })
    const json = (await res.json()) as { data?: { db?: boolean } }
    const ms = Math.round(performance.now() - startedAt)
    latency.value = ms

    const okDb = json.data?.db === true
    toast(okDb ? '连接正常，数据库可用' : '连接成功，但数据库异常', okDb ? 'success' : 'warning')
  } catch {
    toast('连接失败，请检查网络', 'error')
    latency.value = null
  } finally {
    testing.value = false
  }
}

function reloadData(): void {
  void load()
  toast('已重新加载')
}

// ---- 数据源切换 ----

function onSelect(value: string): void {
  if (switching.value || value === currentProvider.value) return
  if (value === PROVIDER_API && ds.pending > 0) {
    confirmOpen.value = true
    return
  }
  if (value === PROVIDER_LOCAL) {
    void switchToLocal()
    return
  }
  void switchToApi(false)
}

async function switchToLocal(): Promise<void> {
  switching.value = true
  try {
    const snapshot = await captureSnapshot()
    if (!snapshot) {
      toast('无法抓取数据快照，请检查网络后重试', 'error')
      return
    }
    try {
      await saveProviderToCloud(PROVIDER_LOCAL)
    } catch {
      // 离线时允许仅在本机生效
    }
    setMode(providerToMode(PROVIDER_LOCAL))
    currentProvider.value = PROVIDER_LOCAL
    emit('provider-changed', PROVIDER_LOCAL)
    refreshSnapshotInfo()
    toast('已切换到本地缓存模式')
  } finally {
    switching.value = false
  }
}

async function switchToApi(discard: boolean): Promise<void> {
  switching.value = true
  try {
    if (discard) {
      discardPending()
    } else if (ds.pending > 0) {
      syncing.value = true
      const result = await flushPending()
      syncing.value = false
      if (result.remaining > 0) {
        toast('仍有 ' + result.remaining + ' 条未能同步，已保留在队列中', 'warning')
      } else if (result.failed > 0) {
        toast('已同步 ' + result.synced + ' 条，' + result.failed + ' 条多次失败已跳过', 'warning')
      } else {
        toast('已同步 ' + result.synced + ' 条本地改动')
      }
    }
    setMode(providerToMode(PROVIDER_API))
    try {
      await saveProviderToCloud(PROVIDER_API)
    } catch {
      // 忽略离线错误
    }
    currentProvider.value = PROVIDER_API
    emit('provider-changed', PROVIDER_API)
    confirmOpen.value = false
    toast('已切回星焰作业板API')
  } finally {
    switching.value = false
  }
}

function flushThenSwitch(): void {
  void switchToApi(false)
}

function discardThenSwitch(): void {
  void switchToApi(true)
}

function cancelSwitch(): void {
  confirmOpen.value = false
  currentProvider.value = modeToProvider(ds.mode)
}

async function syncNow(): Promise<void> {
  if (syncing.value) return
  syncing.value = true
  try {
    if (offlineUi.status === 'offline') {
      await retryNow()
      toast(offlineUi.status === 'offline' ? '仍有改动未能上传，请稍后再试' : '本地改动已同步')
      return
    }
    const result = await flushPending()
    if (result.remaining > 0) {
      toast('仍有 ' + result.remaining + ' 条未同步', 'warning')
    } else {
      toast('已同步 ' + result.synced + ' 条改动')
    }
  } finally {
    syncing.value = false
  }
}

function discard(): void {
  discardPending()
  toast('已丢弃本地改动')
}

async function refreshSnapshot(): Promise<void> {
  const snapshot = await captureSnapshot()
  if (!snapshot) {
    toast('抓取失败，请检查网络', 'error')
    return
  }
  refreshSnapshotInfo()
  toast('快照已更新')
}

onMounted(() => {
  void load()
  refreshSnapshotInfo()
})
</script>
