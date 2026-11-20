<template>
  <div class="settings-root">
    <v-app-bar elevation="1">
      <template #prepend>
        <v-btn aria-label="返回看板" icon="mdi-arrow-left" title="返回看板" variant="text" @click="go('board')" />
        <v-btn aria-label="打开设置导航" class="d-md-none" icon="mdi-menu" title="设置导航" variant="text" @click="drawer = !drawer" />
      </template>
      <v-app-bar-title class="text-h6">设置</v-app-bar-title>
      <v-spacer />
      <v-chip v-if="!isMobile" class="mr-2" :color="syncColor" size="small" variant="tonal">
        <v-icon start size="small">{{ syncIcon }}</v-icon>
        {{ syncText }}
      </v-chip>
      <v-btn v-if="!isMobile" :loading="saving" class="mr-2" prepend-icon="mdi-cloud-upload" variant="tonal" @click="saveAll">立即同步</v-btn>
      <v-btn v-else :loading="saving" aria-label="立即同步" class="mr-1" icon="mdi-cloud-upload" title="立即同步" variant="tonal" @click="saveAll" />
    </v-app-bar>

    <v-navigation-drawer v-model="drawer" :permanent="!isMobile" :temporary="isMobile">
      <v-list nav>
        <v-list-item
          v-for="tab in tabs"
          :key="tab.value"
          :active="activeTab === tab.value"
          :color="activeTab === tab.value ? 'primary' : undefined"
          :prepend-icon="tab.icon"
          class="rounded-e-xl"
          @click="activeTab = tab.value"
        >
          <v-list-item-title>{{ tab.title }}</v-list-item-title>
        </v-list-item>
      </v-list>
      <template #append>
        <v-divider />
        <div class="pa-3 text-caption text-medium-emphasis">
          {{ session.classInfo?.name || '-' }} · {{ session.device?.name || '-' }}
        </div>
      </template>
    </v-navigation-drawer>

    <v-main>
      <v-container class="py-4" max-width="900">
        <template v-if="settingsLoading">
          <form-skeleton :rows-per-section="3" :sections="3" />
        </template>
        <template v-else>
        <!-- 首页 -->
        <template v-if="activeTab === 'index'">
          <settings-card icon="mdi-home" subtitle="设置" title="星焰作业板">
            <div class="d-flex flex-wrap" style="gap: 8px">
              <v-btn :loading="saving" color="primary" prepend-icon="mdi-content-save" variant="elevated" @click="saveAll">保存全部设置</v-btn>
              <v-btn prepend-icon="mdi-refresh" variant="tonal" @click="loadAll">重新加载</v-btn>
            </div>
          </settings-card>

          <settings-card icon="mdi-alert-circle-outline" title="提示">
            <v-alert class="mb-2" density="compact" type="info" variant="tonal">
              设置会自动保存到班级云端，同一班级的所有大屏同步生效。
            </v-alert>
            <v-alert density="compact" type="warning" variant="tonal">
              请不要使用浏览器清除站点数据，否则会导致本地配置丢失（云端数据不受影响）。
            </v-alert>
          </settings-card>

          <settings-card icon="mdi-link-variant" title="设备绑定">
            <p class="text-body-2 text-medium-emphasis mb-1">
              当前设备已绑定「{{ session.classInfo?.name || '未绑定' }}」，身份为「{{ session.roleText || '未知' }}」。
            </p>
            <p class="text-body-2 text-medium-emphasis mb-0">
              换教室、换授权码或想重新输入班级码时，可在这里重置；重置后会回到欢迎页重新绑定。
            </p>
            <template #actions>
              <device-binding-reset />
            </template>
          </settings-card>

          <!-- 桌面端已经是 Electron 包壳，不需要再引导下载 -->
          <desktop-app-card v-if="!isDesktop" />
          <attribution-card />
          <open-source-card />
          <about-card />
        </template>

        <!-- 服务器 -->
        <template v-else-if="activeTab === 'server'">
          <data-source-card :provider="String(settings['server.provider'] ?? 'starflame-api')" @provider-changed="(v) => (settings['server.provider'] = v)" />
          <kv-data-card />
        </template>

        <!-- 科目 -->
        <template v-else-if="activeTab === 'subject'">
          <subject-management-card @saved="loadSubjects" />
          <homework-template-card />
        </template>

        <!-- 花名册 -->
        <template v-else-if="activeTab === 'student'">
          <student-list-card :count="studentCount" @manage="go('list')" />
          <teacher-list-card />
        </template>

        <!-- 预配链接 -->
        <template v-else-if="activeTab === 'share'">
          <settings-link-generator />
        </template>

        <!-- 编辑 -->
        <template v-else-if="activeTab === 'edit'">
          <settings-card icon="mdi-cog" title="编辑设置">
            <template v-for="(key, index) in group.edit" :key="key">
              <setting-item :model-value="settings[key]" :setting-key="key" @update:setting-key="onSettingUpdate" />
              <v-divider v-if="index < group.edit.length - 1" class="my-2" />
            </template>
          </settings-card>
        </template>

        <!-- 显示 -->
        <template v-else-if="activeTab === 'display'">
          <settings-card icon="mdi-monitor" title="显示设置">
            <v-list-item>
              <template #prepend><v-icon class="mr-3" icon="mdi-theme-light-dark" /></template>
              <v-list-item-title>主题模式</v-list-item-title>
              <v-list-item-subtitle>本机设置，不同步云端（每台设备各自生效）</v-list-item-subtitle>
              <template #append>
                <v-btn-toggle :model-value="themeMode" color="primary" density="comfortable" mandatory @update:model-value="onThemeChange">
                  <v-btn value="light"><v-icon class="mr-2" icon="mdi-white-balance-sunny" />明亮</v-btn>
                  <v-btn value="dark"><v-icon class="mr-2" icon="mdi-moon-waning-crescent" />暗黑</v-btn>
                </v-btn-toggle>
              </template>
            </v-list-item>
            <v-divider class="my-2" />
            <template v-for="(key, index) in group.display" :key="key">
              <setting-item :model-value="settings[key]" :setting-key="key" @update:setting-key="onSettingUpdate" />
              <v-divider v-if="index < group.display.length - 1" class="my-2" />
            </template>
          </settings-card>
        </template>

        <!-- 时间同步 -->
        <template v-else-if="activeTab === 'timeSync'">
          <settings-card icon="mdi-timer-sync-outline" title="时间同步设置">
            <template v-for="(key, index) in group.timeSync" :key="key">
              <setting-item :model-value="settings[key]" :setting-key="key" @update:setting-key="onSettingUpdate" />
              <v-divider v-if="index < group.timeSync.length - 1" class="my-2" />
            </template>
          </settings-card>
          <v-alert v-if="timeSyncHintText" :type="timeSyncHintType" variant="tonal" density="comfortable" class="mt-4" :text="timeSyncHintText" />
        </template>

        <!-- 作息时间 -->
        <template v-else-if="activeTab === 'schedule'">
          <schedule-settings-card :model="settings" @save="saveAll" @update="onSettingUpdate" />
        </template>

        <!-- 通知铃声 -->
        <template v-else-if="activeTab === 'notification'">
          <notification-sound-card :model="settings" @save="saveAll" @update="onSettingUpdate" />
        </template>

        <!-- 一言 -->
        <template v-else-if="activeTab === 'hitokoto'">
          <hitokoto-settings-card :model="settings" @save="flushSettings" @update="onSettingUpdate" />
        </template>

        <!-- 随机点名 -->
        <template v-else-if="activeTab === 'randomPicker'">
          <settings-card icon="mdi-cog" title="编辑设置">
            <template v-for="(key, index) in group.randomPicker" :key="key">
              <setting-item :model-value="settings[key]" :setting-key="key" @update:setting-key="onSettingUpdate" />
              <v-divider v-if="index < group.randomPicker.length - 1" class="my-2" />
            </template>
          </settings-card>
        </template>

        <!-- 背景 -->
        <template v-else-if="activeTab === 'background'">
          <background-settings-card :model="settings" @save="saveAll" @update="onSettingUpdate" />
        </template>

        <!-- 备份迁移 / 作业导入导出 -->
        <template v-else-if="activeTab === 'transfer'">
          <transfer-card />
        </template>

        <!-- 关于 -->
        <template v-else-if="activeTab === 'about'">
          <attribution-card />
          <open-source-card />
          <about-card />
        </template>
        </template>
      </v-container>
    </v-main>

    <v-snackbar v-model="snack.show" :color="snack.color" timeout="2400">{{ snack.text }}</v-snackbar>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { getData, patchData, postData } from '@/lib/api'
import { navigate, type PageName } from '@/lib/nav'
import { markSettingsDirty } from '@/lib/settingsDirty'
import { isMobileUi } from '@/lib/deviceMode'
import { isDesktop } from '@/lib/platform'
import { useSessionStore } from '@/stores/session'
import { useBoardStore } from '@/stores/board'
import { SETTING_DEFS, getDef, getDefault, keysByPrefix } from '@/lib/settingDefs'
import { applyTheme, currentTheme, type ThemeMode } from '@/lib/theme'
import SettingsCard from '@/components/settings/SettingsCard.vue'
import SettingItem from '@/components/settings/SettingItem.vue'
import AboutCard from '@/components/settings/AboutCard.vue'
import TransferCard from '@/components/settings/TransferCard.vue'
import HomeworkTransferCard from '@/components/settings/HomeworkTransferCard.vue'
import OpenSourceCard from '@/components/settings/OpenSourceCard.vue'
import AttributionCard from '@/components/settings/AttributionCard.vue'
import DesktopAppCard from '@/components/settings/DesktopAppCard.vue'
import DataSourceCard from '@/components/settings/DataSourceCard.vue'
import DeviceBindingReset from '@/components/settings/DeviceBindingReset.vue'
import KvDataCard from '@/components/settings/KvDataCard.vue'
import SubjectManagementCard from '@/components/settings/SubjectManagementCard.vue'
import HomeworkTemplateCard from '@/components/settings/HomeworkTemplateCard.vue'
import StudentListCard from '@/components/settings/StudentListCard.vue'
import TeacherListCard from '@/components/settings/TeacherListCard.vue'
import SettingsLinkGenerator from '@/components/settings/SettingsLinkGenerator.vue'
import BackgroundSettingsCard from '@/components/settings/BackgroundSettingsCard.vue'
import NotificationSoundCard from '@/components/settings/NotificationSoundCard.vue'
import ScheduleSettingsCard from '@/components/settings/ScheduleSettingsCard.vue'
import HitokotoSettingsCard from '@/components/settings/HitokotoSettingsCard.vue'
import FormSkeleton from '@/components/skeleton/FormSkeleton.vue'
import { syncUpdateSchedule } from '@/lib/updateScheduleSync'

const session = useSessionStore()
const board = useBoardStore()

async function go(page: PageName): Promise<void> {
  // 有未同步的改动时先落盘，避免刚出设置页看板读到的还是旧设置
  if (dirty.value && !saving.value) {
    saving.value = true
    await flushSettings()
    saving.value = false
  }
  navigate(page)
}

const isMobile = computed(() => isMobileUi.value)
const drawer = ref(true)
const activeTab = ref('index')

const dirty = ref(false)
const saving = ref(false)
/** 首屏设置加载中：显示微光骨架屏，避免表单闪现断值 */
const settingsLoading = ref(true)
const themeMode = ref('dark')
const studentCount = ref(0)
const snack = reactive({ show: false, text: '', color: 'success' })

const tabs = [
  { title: '首页', icon: 'mdi-home', value: 'index' },
  { title: '服务器', icon: 'mdi-server', value: 'server' },
  { title: '科目', icon: 'mdi-book-edit', value: 'subject' },
  { title: '花名册', icon: 'mdi-account-group', value: 'student' },
  { title: '预配链接', icon: 'mdi-share', value: 'share' },
  { title: '编辑', icon: 'mdi-pencil', value: 'edit' },
  { title: '显示', icon: 'mdi-eye', value: 'display' },
  { title: '时间同步', icon: 'mdi-timer-sync-outline', value: 'timeSync' },
  { title: '作息时间', icon: 'mdi-school', value: 'schedule' },
  { title: '通知铃声', icon: 'mdi-bell-ring', value: 'notification' },
  { title: '一言', icon: 'mdi-comment-quote', value: 'hitokoto' },
  { title: '随机点名', icon: 'mdi-dice-multiple', value: 'randomPicker' },
  { title: '背景', icon: 'mdi-image', value: 'background' },
  { title: '备份迁移', icon: 'mdi-cloud-sync-outline', value: 'transfer' },
  { title: '作业导入导出', icon: 'mdi-swap-vertical-bold', value: 'homeworkTransfer' },
  { title: '关于', icon: 'mdi-information', value: 'about' },
]

// 支持从首页「导入导出」等入口带 ?tab= 直接定位（必须放在 tabs 之后，避免 TDZ）
const wantedTab = new URLSearchParams(window.location.search).get('tab')
if (wantedTab && tabs.some((item) => item.value === wantedTab)) activeTab.value = wantedTab

// 严格对齐原项目各卡片引用的设置项
const group = {
  edit: [
    'edit.autoSave', 'edit.blockNonTodayAutoSave', 'edit.confirmNonTodaySave',
    'edit.refreshBeforeEdit', 'edit.blockPastDataEdit',
    'edit.autoSavePromptText', 'edit.manualSavePromptText',
  ],
  display: [
    'timeCard.enabled', 'display.emptySubjectDisplay', 'display.dynamicSort',
    'display.showRandomButton', 'display.showFullscreenButton', 'display.cardHoverEffect',
    'display.enhancedTouchMode', 'display.showQuickTools', 'display.showPasteButtons',
    'display.showAntiScreenBurnCard', 'display.showExamScheduleButton',
    'display.showListCard', 'display.showAttendance', 'display.forceDesktopMode',
    'display.lateStudentsArePresent', 'pwa.hideInstallCard',
  ],
  timeSync: ['timeSync.source', 'timeSync.customHost', 'timeSync.intervalMin'],
  notification: ['notification.singleSound', 'notification.urgentSound'],
  hitokoto: ['hitokoto.enabled', 'hitokoto.sources', 'hitokoto.categories', 'hitokoto.customUrl', 'hitokoto.jinrishiciToken', 'hitokoto.sensitiveWords', 'hitokoto.refreshInterval'],
  randomPicker: [
    'randomPicker.enabled', 'randomPicker.mode', 'randomPicker.minNumber',
    'randomPicker.maxNumber', 'randomPicker.defaultCount', 'randomPicker.animation',
    'randomPicker.excludeAbsent', 'randomPicker.excludeLate', 'randomPicker.excludeExcluded',
  ],
}

const settings = reactive<Record<string, unknown>>({})

/** 自定义时间源的前端即时校验提示 */
const timeSyncHintType = computed<'warning' | 'error' | 'info'>(() => {
  if (settings['timeSync.source'] !== 'custom') return 'info'
  const host = String(settings['timeSync.customHost'] ?? '').trim()
  if (!host) return 'warning'
  if (host.length > 100 || !/^[A-Za-z0-9.-]+$/.test(host)) return 'error'
  return 'info'
})

const timeSyncHintText = computed(() => {
  if (settings['timeSync.source'] !== 'custom') return ''
  const host = String(settings['timeSync.customHost'] ?? '').trim()
  if (!host) return '请填写自定义 NTP 主机名；留空时服务端会自动回退到阿里云 NTP。'
  if (host.length > 100 || !/^[A-Za-z0-9.-]+$/.test(host)) return '只能填写 NTP 主机名（字母、数字、点、短横线，长度不超过 100）。'
  return '服务端会校验该主机是否为公网地址；解析失败或不可用时自动回退到阿里云 NTP。'
})

function notify(text: string, color = 'success'): void {
  snack.text = text
  snack.color = color
  snack.show = true
}

// ---------- 自动同步云端 ----------
type SyncState = 'idle' | 'pending' | 'saving' | 'saved' | 'error'

const syncState = ref<SyncState>('idle')
let syncTimer: number | undefined

const syncText = computed(() => {
  switch (syncState.value) {
    case 'pending': return '待同步'
    case 'saving': return '同步中…'
    case 'saved': return '已同步云端'
    case 'error': return '同步失败'
    default: return '云端已是最新'
  }
})

const syncColor = computed(() => {
  switch (syncState.value) {
    case 'pending': return 'warning'
    case 'saving': return 'info'
    case 'saved': return 'success'
    case 'error': return 'error'
    default: return 'default'
  }
})

const syncIcon = computed(() => {
  switch (syncState.value) {
    case 'pending': return 'mdi-cloud-clock-outline'
    case 'saving': return 'mdi-cloud-sync-outline'
    case 'saved': return 'mdi-cloud-check'
    case 'error': return 'mdi-cloud-alert'
    default: return 'mdi-cloud-check-outline'
  }
})

/** 任何设置项变更都会走这里：立即更新本地 + 防抖同步云端 */
/** 切换主题：只写本机（不同步云端、不进待同步队列） */
function onThemeChange(value: unknown): void {
  const mode: ThemeMode = value === 'light' ? 'light' : 'dark'
  themeMode.value = mode
  applyTheme(mode)
}

function onSettingUpdate(key: string, value: unknown): void {
  settings[key] = value
  dirty.value = true
  syncState.value = 'pending'
  // 作息/课程节次改动要立刻同步给桌面主进程，上课时段闸门才能马上生效
  if (key.startsWith('schedule.') || key === 'update.pauseDuringClass') syncUpdateSchedule(settings)
  scheduleSync()
}

/** 防抖 600ms，避免拖动滑块时疯狂发请求 */
function scheduleSync(): void {
  if (syncTimer) window.clearTimeout(syncTimer)
  syncTimer = window.setTimeout(() => {
    void flushSettings()
  }, 600)
}

/** 真正把设置推到云端 */
async function flushSettings(): Promise<boolean> {
  if (syncTimer) {
    window.clearTimeout(syncTimer)
    syncTimer = undefined
  }
  if (!dirty.value) {
    syncState.value = 'saved'
    return true
  }

  syncState.value = 'saving'
  saving.value = true
  try {
    const payload: Record<string, unknown> = {}
    for (const key of Object.keys(settings)) {
      if (key === 'homeworkTemplate') continue
      // 本机设置（如主题）不上云、不入待同步队列
      if (getDef(key)?.local) continue
      payload[key] = settings[key]
    }
    // 合并写入，避免只传部分字段时覆盖掉其他端刚改的值
    await patchData('/board/settings', { settings: payload })
    dirty.value = false
    // 记录「云端设置刚被改过」，看板回到前台时强制刷新一次
    markSettingsDirty()
    syncState.value = 'saved'
    // 顺带同步给 board store，返回看板时能立即生效
    if (board.data) {
      board.data.settings = { ...(board.data.settings ?? {}), ...payload }
    }
    return true
  } catch (e) {
    syncState.value = 'error'
    notify(e instanceof Error ? e.message : '同步失败，请稍后重试', 'error')
    return false
  } finally {
    saving.value = false
  }
}

function previewSound(): void {
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = 880
    gain.gain.value = 0.2
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.25)
    notify('已试听提示音')
  } catch {
    notify('当前浏览器不支持音频播放', 'warning')
  }
}

async function loadSubjects(): Promise<void> {
  try {
    const board = await getData<{ subjects: unknown[]; students?: unknown[] }>('/board/bootstrap')
    studentCount.value = Array.isArray(board.students) ? board.students.length : 0
  } catch {
    // 忽略
  }
}

async function loadAll(): Promise<void> {
  try {
    const [me, board] = await Promise.all([
      getData<{ settings: Record<string, unknown> }>('/device/me'),
      getData<{ students?: unknown[] }>('/board/bootstrap'),
    ])
    for (const def of SETTING_DEFS) settings[def.key] = getDefault(def.key)
    const remote = me.settings ?? {}
    for (const [key, value] of Object.entries(remote)) {
      if (key === 'homeworkTemplate') continue
      settings[key] = value
    }
    // 主题是本机设置：永远以 localStorage 为准，忽略云端残留的 theme.mode
    delete settings['theme.mode']
    themeMode.value = currentTheme()
    applyTheme(themeMode.value as ThemeMode)
    studentCount.value = Array.isArray(board.students) ? board.students.length : 0
    dirty.value = false
    syncState.value = 'idle'
  } catch (e) {
    notify(e instanceof Error ? e.message : '加载失败', 'error')
  } finally {
    settingsLoading.value = false
  }
}

async function saveAll(): Promise<void> {
  if (saving.value) return
  dirty.value = true
  const ok = await flushSettings()
  if (ok) notify('设置已同步到云端')
}

// 离开或隐藏页面时，把还没同步的改动立即推上云端
function flushOnLeave(): void {
  if (dirty.value) void flushSettings()
}

onBeforeUnmount(() => {
  if (syncTimer) window.clearTimeout(syncTimer)
  flushOnLeave()
})

onMounted(async () => {
  window.addEventListener('pagehide', flushOnLeave)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushOnLeave()
  })
  drawer.value = !isMobile.value
  // 设备模式变化（含一体机 / 强制桌面）时自动收起或展开左侧设置导航
  watch(isMobile, (narrow) => {
    drawer.value = !narrow
  })
  // 本地模式（未登录）没有 /device/me 可读，直接跳过，避免 401
  if (!session.classInfo && session.token) {
    try {
      await session.loadMe()
    } catch {
      // 拦截器跳转
    }
  }
  await loadAll()
})
</script>

<style scoped>
/*
 * 整页固定一屏高，由 v-main 自己滚动。
 * 不能写成「根 min-height:100vh + v-main height:100vh」：
 * 一旦 v-app-bar 参与布局，总高就是 100vh + 顶栏高度，滚动区域底部被裁掉，
 * 表现就是「设置页最底下显示不全」。这里用 flex 让 v-main 吃满剩余高度，
 * 两种 app-bar 布局（in-flow / fixed）下都不会溢出。
 */
.settings-root {
  display: flex;
  flex-direction: column;
  /* 用 100% 而不是 100vh：桌面端 html{zoom:1.15} 时 100vh 不随缩放，会多出约 114px */
  height: 100%;
  overflow: hidden;
}

.settings-root .v-main {
  flex: 1 1 auto;
  height: auto;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
}

/* 滚动到底时给左下角常驻版本号留位置，避免最后一行被徽标压住 */
.settings-root .v-main > .v-container {
  padding-bottom: calc(56px + env(safe-area-inset-bottom));
}

/* 侧边导航独立滚动，避免长列表被截断 */
.settings-root .v-navigation-drawer .v-navigation-drawer__content {
  overflow-y: auto;
  overscroll-behavior: contain;
}

/*
 * 移动端：卡片副标题与列表行说明允许换行；带右侧控件的列表行改为
 * 「标题 → 说明 → 控件」三行堆叠，避免标题被压成单字竖排或被省略号截断。
 */
@media (max-width: 700px) {
  .settings-root :deep(.v-card-subtitle) {
    white-space: normal !important;
    overflow: visible !important;
    text-overflow: clip !important;
    height: auto !important;
    padding-bottom: 6px;
    line-height: 1.4;
  }

  /* 已经有 #append 控件、但不是自带三行结构的行（.flex-column 的除外） */
  .settings-root :deep(.v-list-item:not(.setting-item):not(.flex-column):has(.v-list-item__append .v-text-field, .v-list-item__append .v-select, .v-list-item__append .v-btn-toggle, .v-list-item__append .v-btn-group, .v-list-item__append .v-btn)) {
    display: grid !important;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: start;
    column-gap: 10px;
    row-gap: 8px;
    padding: 10px 12px !important;
    min-height: 0 !important;
  }

  .settings-root :deep(.v-list-item:not(.setting-item):not(.flex-column) > .v-list-item__prepend) {
    grid-area: 1 / 1 / 2 / 2;
    margin-inline-end: 0 !important;
    align-self: start;
    padding-top: 2px;
  }

  .settings-root :deep(.v-list-item:not(.setting-item):not(.flex-column) > .v-list-item__content) {
    grid-area: 1 / 2 / 2 / 3;
    min-width: 0 !important;
    overflow: visible !important;
  }

  .settings-root :deep(.v-list-item:not(.setting-item):not(.flex-column) > .v-list-item__append) {
    grid-area: 2 / 1 / 3 / 3;
    width: 100%;
    max-width: 100%;
    justify-content: flex-start;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
  }

  .settings-root :deep(.v-list-item:not(.setting-item) .v-list-item-title) {
    white-space: normal;
    overflow: visible;
    text-overflow: clip;
  }

  .settings-root :deep(.v-list-item:not(.setting-item) .v-list-item-subtitle) {
    white-space: normal;
    overflow: visible;
    text-overflow: clip;
    line-height: 1.35;
  }

  /* 右侧控件自身的固定宽度在窄屏上收窄 */
  .settings-root :deep(.v-list-item__append .v-text-field),
  .settings-root :deep(.v-list-item__append .v-select) {
    min-width: 0 !important;
    flex: 1 1 auto;
    width: auto !important;
    max-width: 100%;
  }
}
/* 左下角版本徽标会压住抽屉底部的「班级 · 设备」说明，往上让出位置 */
.settings-root :deep(.v-navigation-drawer__append) {
  padding-bottom: calc(44px + env(safe-area-inset-bottom));
}
</style>
