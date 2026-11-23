<template>
  <v-card v-if="visible" border class="pwa-install-card mt-4" variant="flat">
    <liquid-glass />
    <v-card-title class="d-flex align-center text-subtitle-1">
      安装应用与授权
      <v-spacer />
      <v-icon icon="mdi-monitor-cellphone" size="36" />
    </v-card-title>
    <v-card-subtitle class="pwa-sub">手动点选下方项目请求安装和权限，也可以直接关闭</v-card-subtitle>

    <v-card-text>
      <v-list density="compact" class="bg-transparent">
        <v-list-item v-for="item in items" :key="item.key" @click="handle(item)">
          <template #prepend>
            <v-icon class="mr-3" :color="item.color">{{ item.icon }}</v-icon>
          </template>
          <v-list-item-title class="text-body-2">{{ item.title }}</v-list-item-title>
          <v-list-item-subtitle class="text-caption">{{ item.desc }}</v-list-item-subtitle>
          <template #append>
            <v-chip :color="item.done ? 'success' : 'grey'" size="small" variant="tonal">
              {{ item.done ? '已授权' : '待授权' }}
            </v-chip>
            <v-btn class="ml-2" icon="mdi-information-outline" size="x-small" variant="text" @click.stop="showTip(item)" />
          </template>
        </v-list-item>
      </v-list>
    </v-card-text>

    <v-card-actions class="pa-4">
      <v-btn variant="outlined" prepend-icon="mdi-close" @click="dismiss">关闭</v-btn>
      <v-spacer />
      <v-btn color="primary" prepend-icon="mdi-check-all" variant="elevated" @click="handleAll">一次处理全部</v-btn>
    </v-card-actions>
  </v-card>

  <v-snackbar v-model="tip.show" :timeout="2600">{{ tip.text }}</v-snackbar>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import LiquidGlass from '@/components/ui/LiquidGlass.vue'

interface Item {
  key: string
  title: string
  desc: string
  icon: string
  color: string
  done: boolean
}

const DISMISS_KEY = 'sf.pwaCardDismissed'

const visible = ref(false)
const installPrompt = ref<{ prompt: () => Promise<void> } | null>(null)
const installed = ref(false)
const notified = ref(false)
const persisted = ref(false)
const tip = reactive({ show: false, text: '' })

const items = computed<Item[]>(() => [
  { key: 'install', title: '安装应用', desc: '将网站安装为独立应用，便于快速启动', icon: 'mdi-download-box-outline', color: 'primary', done: installed.value },
  { key: 'notify', title: '通知权限', desc: '允许接收作业、考试等通知提醒', icon: 'mdi-bell-outline', color: 'warning', done: notified.value },
  { key: 'storage', title: '离线存储', desc: '启用持久化存储以获得更可靠的离线体验', icon: 'mdi-database-outline', color: 'info', done: persisted.value },
])

function isMobileDevice(): boolean {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
}

async function refreshStatus(): Promise<void> {
  installed.value = window.matchMedia('(display-mode: standalone)').matches
  notified.value = typeof Notification !== 'undefined' && Notification.permission === 'granted'
  try {
    persisted.value = (await navigator.storage?.persisted?.()) ?? false
  } catch {
    persisted.value = false
  }
}

function dismiss(): void {
  visible.value = false
  localStorage.setItem(DISMISS_KEY, '1')
}

function showTip(item: Item): void {
  tip.text = item.desc
  tip.show = true
}

async function handle(item: Item): Promise<void> {
  if (item.key === 'install') {
    if (installed.value) {
      tip.text = '已经安装过了'
      tip.show = true
      return
    }
    if (installPrompt.value) {
      await installPrompt.value.prompt()
      installPrompt.value = null
      await refreshStatus()
      return
    }
    tip.text = isMobileDevice() ? '请用浏览器菜单「添加到主屏幕」' : '当前浏览器未提供安装入口'
    tip.show = true
    return
  }

  if (item.key === 'notify') {
    if (typeof Notification === 'undefined') {
      tip.text = '当前浏览器不支持通知'
      tip.show = true
      return
    }
    const result = await Notification.requestPermission()
    notified.value = result === 'granted'
    return
  }

  if (item.key === 'storage') {
    try {
      persisted.value = await navigator.storage.persist()
      tip.text = persisted.value ? '已启用持久化存储' : '浏览器暂不同意'
      tip.show = true
    } catch {
      tip.text = '当前环境不支持'
      tip.show = true
    }
  }
}

async function handleAll(): Promise<void> {
  for (const item of items.value) {
    if (!item.done) await handle(item)
  }
  await refreshStatus()
}

function onInstallPrompt(event: Event): void {
  event.preventDefault()
  installPrompt.value = event as unknown as { prompt: () => Promise<void> }
}

function onInstalled(): void {
  installed.value = true
  installPrompt.value = null
}

onMounted(async () => {
  await refreshStatus()
  const dismissed = localStorage.getItem(DISMISS_KEY) === '1'
  const allDone = installed.value && notified.value && persisted.value
  visible.value = !dismissed && !allDone
  window.addEventListener('beforeinstallprompt', onInstallPrompt)
  window.addEventListener('appinstalled', onInstalled)
})
</script>

<style scoped>
.pwa-sub {
  white-space: normal !important;
  line-height: 1.45;
  font-size: 13px;
}
</style>
