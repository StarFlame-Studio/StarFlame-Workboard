<template>
  <v-card border class="settings-card rounded-lg mb-4" elevation="2">
    <v-card-item>
      <template #prepend>
        <img class="about-logo mr-2" :src="logoUrl" alt="星焰作业板" />
      </template>
      <v-card-title class="text-h6">关于</v-card-title>
    </v-card-item>
    <v-card-text>
      <v-table density="compact">
        <tbody>
          <tr><td class="text-medium-emphasis label-cell">产品</td><td>星焰作业板</td></tr>
          <tr><td class="text-medium-emphasis label-cell">定位</td><td>适用于班级大屏的作业展示工具</td></tr>
          <tr>
            <td class="text-medium-emphasis label-cell">来源</td>
            <td>
              基于原项目
              <a class="about-link" :href="REPO_URL" rel="noopener noreferrer" target="_blank">
                <b>Classworks 作业板</b>
                <v-icon icon="mdi-open-in-new" size="12" />
              </a>
              二次开发（原作者 孙悟元）
            </td>
          </tr>
          <tr><td class="text-medium-emphasis label-cell">作者</td><td>焰火工作室</td></tr>
          <tr>
            <td class="text-medium-emphasis label-cell">开源仓库</td>
            <td>
              <a class="about-link" :href="GITHUB_REPO_URL" rel="noopener noreferrer" target="_blank">
                <b>GitHub</b>
                <v-icon icon="mdi-open-in-new" size="12" />
              </a>
              <span class="text-medium-emphasis mx-1">·</span>
              <a class="about-link" :href="GITEE_REPO_URL" rel="noopener noreferrer" target="_blank">
                <gitee-icon class="mr-1" :size="14" />
                <b>Gitee</b>
                <v-icon icon="mdi-open-in-new" size="12" />
              </a>
            </td>
          </tr>
          <tr>
            <td class="text-medium-emphasis label-cell">开源协议</td>
            <td>
              <a class="about-link" :href="GITHUB_REPO_URL + '/blob/master/LICENSE'" rel="noopener noreferrer" target="_blank">
                GNU AGPL-3.0
                <v-icon icon="mdi-open-in-new" size="12" />
              </a>
            </td>
          </tr>
          <tr><td class="text-medium-emphasis label-cell">前端</td><td>{{ origin }}</td></tr>
          <tr><td class="text-medium-emphasis label-cell">接口</td><td>{{ apiBase }}</td></tr>
          <tr><td class="text-medium-emphasis label-cell">班级</td><td>{{ session.classInfo?.name || '-' }}</td></tr>
          <tr><td class="text-medium-emphasis label-cell">设备</td><td>{{ session.device?.name || '-' }}</td></tr>
          <tr>
            <td class="text-medium-emphasis label-cell">身份</td>
            <td>
              {{ session.roleText || '-' }}
              <v-chip v-if="session.isGuest" class="ml-2" color="warning" size="x-small" variant="tonal">游客只读</v-chip>
            </td>
          </tr>
          <tr>
            <td class="text-medium-emphasis label-cell">设备模式</td>
            <td>
              {{ DEVICE_MODE_LABEL[deviceMode] }}（{{ deviceMode }}）
              <v-select
                :model-value="overrideRef"
                class="mode-select mt-1"
                density="compact"
                hide-details
                :items="modeOptions"
                variant="outlined"
                @update:model-value="onModeChange"
              />
              <span class="text-caption text-medium-emphasis">
                自动检测会按屏幕尺寸与触摸能力判断一体机；判断不准时可在这里手动指定（仅本机生效）。
              </span>
            </td>
          </tr>
          <tr>
            <td class="text-medium-emphasis label-cell">运行平台</td>
            <td>
              <span>{{ platformText }}</span>
              <template v-if="isDesktop">
                <v-btn
                  class="update-btn mt-2"
                  density="compact"
                  size="small"
                  variant="outlined"
                  :prepend-icon="updateState === 'downloaded' ? 'mdi-restart' : 'mdi-cloud-download-outline'"
                  :loading="updateBusy"
                  @click="runUpdateCheck"
                >
                  {{ updateButtonText }}
                </v-btn>
                <span v-if="updateHint" class="text-caption text-medium-emphasis d-block mt-1">
                  {{ updateHint }}
                </span>
              </template>
            </td>
          </tr>
          <tr><td class="text-medium-emphasis label-cell">版本</td><td>{{ version }}</td></tr>
          <tr>
            <td class="text-medium-emphasis label-cell">备案</td>
            <td>
              <a class="about-link" href="https://beian.miit.gov.cn/" rel="noopener noreferrer" target="_blank">
                粤ICP备2026147155号-2
                <v-icon icon="mdi-open-in-new" size="12" />
              </a>
            </td>
          </tr>
        </tbody>
      </v-table>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { APP_VERSION, APP_VERSION_CODE } from '@starflame/shared'

import { useSessionStore } from '@/stores/session'
import { apiBase } from '@/lib/api'
import GiteeIcon from '@/components/GiteeIcon.vue'
import { GITHUB_REPO_URL, GITEE_REPO_URL } from '@/lib/repoLinks'
import { resolveWebOrigin } from '@/lib/webOrigin'
import {
  DEVICE_MODE_LABEL,
  deviceMode,
  overrideRef,
  setDeviceModeOverride,
  type DeviceModeOverride,
} from '@/lib/deviceMode'
import {
  appInfo,
  checkForUpdates,
  downloadUpdate,
  installUpdate,
  isDesktop,
  onUpdateStatus,
  type SfAppInfo,
  type SfUpdateStatus,
} from '@/lib/platform'

const modeOptions: { title: string; value: DeviceModeOverride }[] = [
  { title: '自动检测', value: 'auto' },
  { title: '一体机模式', value: 'terminal' },
  { title: '桌面模式', value: 'desktop' },
]

function onModeChange(value: unknown): void {
  if (value === 'auto' || value === 'terminal' || value === 'desktop') setDeviceModeOverride(value)
}

import logoUrl from '@/assets/logo.svg'

const REPO_URL = 'https://github.com/Moonrend/Classworks'
const CHANNEL_LABEL: Record<string, string> = {
  'win7-ia32': 'Win7/8 通用版（32 位）',
  'win10-x64': 'Win10+ 64 位版',
  'win10-ia32': 'Win10+ 32 位版',
  'dev': '开发版',
}

const session = useSessionStore()
// 桌面端页面跑在 app://local，这里显示真正可分发的网页地址
const origin = resolveWebOrigin()
const version = APP_VERSION
const versionCode = String(APP_VERSION_CODE)

const info = ref<SfAppInfo | null>(null)

const platformText = computed(() => {
  if (!isDesktop) return '网页端（浏览器）'
  const channel = info.value?.channel ?? ''
  const label = CHANNEL_LABEL[channel] ?? channel
  const electron = info.value?.electron ?? '-'
  return `桌面端 · ${label} · Electron ${electron} · 版本 ${info.value?.version ?? version}（${versionCode}）`
})

const updateState = ref<SfUpdateStatus['state']>('idle')
const updatePercent = ref(0)
const updateVersion = ref('')
const updateMessage = ref('')

const updateBusy = computed(
  () => updateState.value === 'checking' || updateState.value === 'downloading' || updateState.value === 'installing',
)

const updateButtonText = computed(() => {
  switch (updateState.value) {
    case 'checking':
      return '正在检查…'
    case 'downloading':
      return '正在下载…'
    case 'downloaded':
      return '正在安装…'
    case 'installing':
      return '正在安装…'
    case 'error':
      return '重新检查'
    default:
      return '检查更新'
  }
})

const updateHint = computed(() => {
  switch (updateState.value) {
    case 'checking':
      return '正在向更新服务器查询新版本…'
    case 'downloading':
      return `正在下载 v${updateVersion.value || '新版本'}（${updatePercent.value}%）`
    case 'available':
      return `发现新版本 v${updateVersion.value}，准备下载…`
    case 'downloaded':
      return `新版本 v${updateVersion.value} 已下载完成，即将自动安装并重启。`
    case 'installing':
      return `正在静默安装 v${updateVersion.value || '新版本'}，完成后会自动重启，无需任何操作。`
    case 'not-available':
      return '当前已是最新版本。'
    case 'error':
      return updateMessage.value || '检查更新失败，请稍后重试。'
    case 'disabled':
      return '开发模式下不检查更新。'
    default:
      return ''
  }
})

function applyStatus(status: SfUpdateStatus): void {
  updateState.value = status.state
  if (typeof status.percent === 'number') updatePercent.value = Math.round(status.percent)
  if (status.version) updateVersion.value = status.version
  if (status.message) updateMessage.value = status.message
}

let unsubscribe: (() => void) | null = null

async function runUpdateCheck(): Promise<void> {
  if (updateState.value === 'downloaded') {
    await installUpdate()
    return
  }
  updateMessage.value = ''
  updatePercent.value = 0
  const checked = await checkForUpdates()
  if (!checked) return
  applyStatus(checked)
  if (checked.state === 'available') {
    const downloaded = await downloadUpdate()
    if (downloaded) applyStatus(downloaded)
  }
}

onMounted(async () => {
  if (!isDesktop) return
  unsubscribe = onUpdateStatus(applyStatus)
  info.value = await appInfo()
})

onBeforeUnmount(() => {
  unsubscribe?.()
  unsubscribe = null
})
</script>

<style scoped>
.mode-select {
  max-width: 220px;
  font-size: 13px;
}

.update-btn {
  font-size: 12px;
  letter-spacing: 0;
}

:deep(.v-table .label-cell) {
  width: 1px;
  padding-inline-end: 16px;
  white-space: nowrap;
}

/* 移动端：label 列宽固定 1px 会被内容挤成一字一行，这里恢复自适应宽度 */
@media (max-width: 700px) {
  :deep(.v-table .label-cell) {
    width: auto;
    padding-inline-end: 12px;
    white-space: nowrap;
    vertical-align: top;
  }
  :deep(.v-table td) {
    padding: 8px 4px;
    word-break: break-all;
  }
  .mode-select {
    max-width: none;
  }
}

.about-logo {
  width: 40px;
  height: 40px;
  border-radius: 12px;
}

.about-link {
  color: rgb(var(--v-theme-primary));
  text-decoration: none;
}
.about-link:hover {
  text-decoration: underline;
}
</style>
