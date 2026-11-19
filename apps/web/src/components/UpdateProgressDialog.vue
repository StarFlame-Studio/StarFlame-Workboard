<template>
  <v-dialog v-model="open" max-width="480" persistent scrollable>
    <v-card class="rounded-xl progress-dialog">
      <v-card-title class="d-flex align-center">
        <v-icon class="mr-2" color="primary">{{ headIcon }}</v-icon>
        <span class="text-h6">{{ headTitle }}</span>
      </v-card-title>
      <v-divider />
      <v-card-text class="pa-6">
        <div class="progress-text">{{ bodyText }}</div>
        <v-progress-linear
          v-if="state === 'downloading'"
          class="mt-4 progress-bar"
          color="primary"
          height="8"
          :model-value="percent"
          rounded
        />
        <div v-if="state === 'downloading'" class="progress-hint">已下载 {{ percent }}%</div>
        <div class="progress-foot">更新在后台进行，不会打断当前操作；下载完成后应用会自动重启，无需任何点击。</div>
      </v-card-text>
      <v-card-actions v-if="canDismiss" class="pa-4">
        <v-spacer />
        <v-btn color="primary" variant="tonal" prepend-icon="mdi-arrow-right" @click="dismiss">后台继续</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
/**
 * 自动更新进行中的全局提示：检测到新版本 → 下载 → 下载完成 → 自动重启安装。
 * 弹窗只用于告知，全程不需要点击；「后台继续」只是把窗口收起，下载不中断。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { isDesktop, onUpdateStatus } from '@/lib/platform'
import { desktopBridge, type SfUpdateStatus } from '@/lib/platform/desktop'

const open = ref(false)
const state = ref<SfUpdateStatus['state']>('idle')
const version = ref('')
const percent = ref(0)
/** 用户是否已点过「后台继续」（下载完成/开始安装时会重新弹出） */
const dismissed = ref(false)
let stop: (() => void) | null = null

const canDismiss = computed(() => state.value === 'available' || state.value === 'downloading')

const headIcon = computed(() => {
  if (state.value === 'downloading' || state.value === 'available') return 'mdi-cloud-download-outline'
  return 'mdi-restart-alert'
})

const headTitle = computed(() => {
  if (state.value === 'downloading' || state.value === 'available') return '正在下载新版本'
  return '正在进行更新'
})

const bodyText = computed(() => {
  const v = version.value ? 'v' + version.value : '新版本'
  if (state.value === 'available' || state.value === 'downloading') {
    return '发现 ' + v + '，正在后台下载，下载完成后会自动重启完成更新，无需任何操作。'
  }
  if (state.value === 'downloaded') {
    return v + ' 已下载完成，正在自动重启安装，请稍候…'
  }
  return '正在安装 ' + v + ' 并重启应用，请稍候…'
})

function apply(status: SfUpdateStatus | null): void {
  if (!status) return
  state.value = status.state
  if (status.version) version.value = status.version
  percent.value = Math.max(0, Math.min(100, Math.round(status.percent ?? 0)))
  const relevant = status.state === 'available' || status.state === 'downloading' || status.state === 'downloaded' || status.state === 'installing'
  if (!relevant) {
    open.value = false
    return
  }
  // 下载完成 / 开始安装一定要重新弹出，确保用户知道马上要重启
  if (status.state === 'downloaded' || status.state === 'installing') dismissed.value = false
  if (!dismissed.value) open.value = true
}

function dismiss(): void {
  dismissed.value = true
  open.value = false
}

onMounted(() => {
  if (!isDesktop) return
  // 先取当前状态：页面切换（整页刷新）后若 Downloading 仍在进行，同样要提示
  void desktopBridge
    ?.update.status()
    .then(apply)
    .catch(() => {})
  stop = onUpdateStatus(apply)
})

onBeforeUnmount(() => {
  stop?.()
})
</script>

<style scoped>
.progress-text {
  font-size: 14px;
  line-height: 1.8;
  color: var(--text-1);
}

.progress-bar {
  border-radius: 999px;
}

.progress-hint {
  margin-top: 8px;
  font-size: 12px;
  color: var(--text-3);
}

.progress-foot {
  margin-top: 14px;
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-3);
}
</style>
