<template>
  <!-- 左下角常驻版本号：点击打开版本信息弹窗 -->
  <button class="version-badge" type="button" :title="'查看版本信息（当前 ' + versionText + '）'" @click="open">
    {{ versionText }}
  </button>

  <v-dialog v-model="dialog" max-width="600" scrollable>
    <v-card class="version-card">
      <v-card-item>
        <template #prepend>
          <div class="version-mark">焰</div>
        </template>
        <v-card-title class="text-h6">版本信息</v-card-title>
        <v-card-subtitle>星焰作业板 · 焰火工作室</v-card-subtitle>
      </v-card-item>

      <v-card-text class="version-body">
        <!-- 当前版本 -->
        <div class="current-block">
          <div class="current-head">
            <span class="current-version">{{ versionText }}</span>
            <v-chip v-if="currentEntry" class="ml-2" color="primary" size="x-small" variant="tonal">
              {{ currentEntry.date }} 发布
            </v-chip>
            <v-chip v-if="isDesktop" class="ml-2" size="x-small" variant="tonal">
              {{ channelLabel }}
            </v-chip>
            <v-spacer />
            <v-btn
              v-if="isDesktop"
              :disabled="update.state === 'checking' || update.state === 'downloading'"
              :loading="update.state === 'checking'"
              density="comfortable"
              prepend-icon="mdi-cloud-download-outline"
              size="small"
              variant="tonal"
              @click="runCheck"
            >
              检查更新
            </v-btn>
          </div>

          <p v-if="currentEntry" class="current-summary">{{ currentEntry.summary }}</p>

          <v-progress-linear
            v-if="update.state === 'downloading'"
            class="mt-2"
            color="primary"
            height="6"
            rounded
            :model-value="update.percent ?? 0"
          />
          <p v-if="updateHint" class="update-hint">{{ updateHint }}</p>

          <ChangelogBody v-if="currentEntry" class="current-items" :entry="currentEntry" />

          <v-alert
            v-if="!isDesktop"
            class="mt-1"
            density="compact"
            type="info"
            variant="tonal"
          >
            网页端刷新页面即为最新版本；桌面端可在同一弹窗里检查更新与回退历史版本。
          </v-alert>
        </div>

        <v-divider class="my-4" />

        <!-- 历史版本 -->
        <div class="history-head">
          <span class="history-title">历史版本</span>
          <span class="history-count">共 {{ CHANGELOG.length }} 个版本</span>
        </div>

        <v-expansion-panels class="history-panels" flat variant="accordion">
          <v-expansion-panel v-for="entry in CHANGELOG" :key="entry.version" :value="entry.version">
            <v-expansion-panel-title>
              <div class="panel-title">
                <span class="panel-version">{{ entry.version }}</span>
                <v-chip v-if="entry.version === displayVersion" color="primary" size="x-small" variant="flat">
                  当前
                </v-chip>
                <span class="panel-date">{{ entry.date }}</span>
                <v-spacer />
                <v-btn
                  v-if="canRollback(entry)"
                  density="compact"
                  size="x-small"
                  variant="tonal"
                  :loading="rolling === entry.version"
                  prepend-icon="mdi-history"
                  @click.stop="doRollback(entry.version)"
                >
                  回退到此版本
                </v-btn>
              </div>
            </v-expansion-panel-title>
            <v-expansion-panel-text>
              <p class="panel-summary">{{ entry.summary }}</p>
              <ChangelogBody class="panel-items" compact :entry="entry" />
            </v-expansion-panel-text>
          </v-expansion-panel>
        </v-expansion-panels>
      </v-card-text>

      <v-card-actions class="pa-4">
        <span class="build-hint">版本号 {{ APP_VERSION_CODE }}</span>
        <v-spacer />
        <v-btn variant="text" @click="dialog = false">关闭</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { APP_VERSION, APP_VERSION_CODE } from '@starflame/shared'
import ChangelogBody from '@/components/ChangelogBody.vue'
import { CHANGELOG, compareVersion, findChangelog, type ChangelogEntry } from '@/lib/changelog'
import {
  appInfo,
  checkForUpdates,
  isDesktop,
  onUpdateStatus,
  type SfAppInfo,
  type SfUpdateStatus,
} from '@/lib/platform'

const dialog = ref(false)
const info = ref<SfAppInfo | null>(null)
const update = ref<SfUpdateStatus>({ state: 'idle' })
/** 回退中的版本号（空 = 没有回退任务） */
const rolling = ref('')
const rollbackText = ref('')

const CHANNEL_LABEL: Record<string, string> = {
  'win7-ia32': 'Win7/8 通用版',
  'win10-x64': 'Win10+ 64 位版',
  'win10-ia32': 'Win10+ 32 位版',
  dev: '开发版',
}

/** 桌面端用安装包真实版本，网页端用构建时注入的版本（裸版本号，用于比较） */
const displayVersion = computed(() => info.value?.version || APP_VERSION)
/** 展示用版本号，统一带 v 前缀（V1.1.0） */
const versionText = computed(() => 'v' + displayVersion.value)
const channelLabel = computed(() => CHANNEL_LABEL[info.value?.channel ?? 'dev'] ?? '桌面端')
const currentEntry = computed<ChangelogEntry | undefined>(() => findChangelog(displayVersion.value))

const updateHint = computed(() => {
  const status = update.value
  switch (status.state) {
    case 'disabled':
      return '开发模式下不检查更新。'
    case 'checking':
      return '正在检查最新版本…'
    case 'available':
      return '发现新版本 ' + (status.version ?? '') + '，正在后台下载…'
    case 'not-available':
      return '已是最新版本' + (status.version ? '（远端 ' + status.version + '）' : '') + '。'
    case 'downloading':
      return '正在下载新版本 ' + (update.value.percent ?? 0) + '%…'
    case 'downloaded':
      return '新版本已下载完成，即将自动安装并重启。'
    case 'installing':
      return '正在静默安装并重启，无需任何操作…'
    case 'error':
      return '检查更新失败：' + (status.message ?? '未知错误')
    default:
      return rollbackText.value
  }
})

/** 只有桌面端、且该版本确实发布过桌面安装包、且比当前版本旧时才允许回退 */
function canRollback(entry: ChangelogEntry): boolean {
  if (!isDesktop) return false
  if (!entry.desktop) return false
  if (entry.version === displayVersion.value) return false
  return compareVersion(entry.version, displayVersion.value) < 0
}

let stopStatus: (() => void) | null = null

onMounted(() => {
  stopStatus = onUpdateStatus((status) => {
    update.value = status
  })
  if (isDesktop) {
    void appInfo().then((value) => {
      info.value = value
      void refreshStatus()
    })
  }
})

onBeforeUnmount(() => {
  if (stopStatus) stopStatus()
})

async function refreshStatus(): Promise<void> {
  const bridge = typeof window !== 'undefined' ? window.sfDesktop : undefined
  if (!bridge) return
  update.value = await bridge.update.status()
}

function open(): void {
  dialog.value = true
  if (isDesktop) void refreshStatus()
}

async function runCheck(): Promise<void> {
  update.value = { state: 'checking' }
  const next = await checkForUpdates()
  if (next) update.value = next
}

async function doRollback(version: string): Promise<void> {
  const bridge = typeof window !== 'undefined' ? window.sfDesktop : undefined
  if (!bridge) return
  rolling.value = version
  rollbackText.value = '正在准备安装包 ' + version + '…'
  const off = bridge.update.onRollback((progress) => {
    if (progress.version !== version) return
    if (progress.state === 'downloading') {
      rollbackText.value = '正在下载 ' + version + ' 安装包 ' + progress.percent + '%…'
    } else if (progress.message) {
      rollbackText.value = progress.message
    }
  })
  try {
    const result = await bridge.update.rollback(version)
    if (!result.ok) rollbackText.value = '回退失败：' + (result.message ?? '未知错误')
  } finally {
    rolling.value = ''
    off()
  }
}
</script>

<style scoped>
.version-badge {
  position: fixed;
  left: 16px;
  bottom: 12px;
  z-index: 60;
  padding: 2px 9px;
  border: 0;
  border-radius: 999px;
  background: color-mix(in srgb, var(--bg-card, #fff) 66%, transparent);
  color: var(--text-3, #8a8078);
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
  line-height: 1.6;
  cursor: pointer;
  opacity: 0.72;
  transition: color 0.15s ease, background 0.15s ease, opacity 0.15s ease;
}

.version-badge:hover {
  color: var(--brand-2, #f4511e);
  opacity: 1;
}

.version-badge:focus-visible {
  outline: 2px solid var(--brand-1, #ff8a1f);
  outline-offset: 2px;
}

.version-mark {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  margin-right: 12px;
  border-radius: 12px;
  background: var(--grad-brand, linear-gradient(100deg, #ff8a1f, #f4511e));
  color: #fff;
  font-size: 18px;
  font-weight: 700;
}

.version-body {
  padding-top: 4px;
}

.current-block {
  padding: 14px 16px;
  border: 1px solid var(--border, #efeae4);
  border-radius: 14px;
  background: var(--bg-card-sub, #faf8f6);
}

.current-head {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}

.current-version {
  font-size: 22px;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.current-summary {
  margin: 8px 0 0;
  color: var(--text-2, #4a423c);
  font-size: 13px;
  line-height: 1.7;
}

.current-items {
  margin-top: 10px;
}

.panel-items {
  margin-top: 8px;
}

.update-hint {
  margin: 8px 0 0;
  color: var(--text-3, #8a8078);
  font-size: 12px;
  line-height: 1.6;
  word-break: break-all;
}

.history-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 6px;
}

.history-title {
  font-size: 14px;
  font-weight: 700;
}

.history-count {
  color: var(--text-3, #8a8078);
  font-size: 12px;
}

.history-panels {
  border-radius: 12px;
  overflow: hidden;
}

.panel-title {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.panel-version {
  font-size: 14px;
  font-weight: 700;
}

.panel-date {
  color: var(--text-3, #8a8078);
  font-size: 12px;
}

.panel-summary {
  margin: 0;
  color: var(--text-3, #8a8078);
  font-size: 12px;
  line-height: 1.7;
}

.build-hint {
  color: var(--text-3, #8a8078);
  font-size: 12px;
}

/* 移动端：徽标固定在左下角（贴边、避让安全区）。
   底部居中浮动工具条从屏幕中间算起，左下角这一段是空的，因此不会互相遮挡 */
@media (max-width: 600px) {
  .version-badge {
    left: 10px;
    bottom: calc(10px + env(safe-area-inset-bottom, 0px));
    font-size: 10px;
    padding: 1px 6px;
    opacity: 0.55;
  }
}
</style>
