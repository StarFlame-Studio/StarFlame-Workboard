<template>
  <div class="init-overlay">
    <div class="init-container">
      <div class="init-header">
        <img class="brand-logo" :src="logoUrl" alt="星焰作业板" />
        <div class="title">欢迎使用 星焰作业板</div>
        <div class="subtitle">请选择你的使用方式</div>
      </div>

      <v-alert
        v-if="offline && !offlineDismissed"
        class="welcome-offline"
        closable
        density="compact"
        type="warning"
        variant="tonal"
        @click:close="offlineDismissed = true"
      >
        离线模式<br />
        <span class="text-caption">显示缓存数据，联网后将自动同步</span>
      </v-alert>

      <!-- 主要选择卡片 -->
      <div class="main-card-row">
        <v-card
          v-for="entry in entries"
          :key="entry.key"
          class="main-service-card clickable"
          :class="[entry.gradient, { 'card-disabled': entry.disabled }]"
          elevation="4"
          @click="handleEntry(entry)"
        >
          <v-card-item>
            <div class="card-horizontal-layout">
              <div class="card-icon-wrapper">
                <v-icon :color="entry.color" class="entry-icon"> {{ entry.icon }} </v-icon>
              </div>
              <div class="card-content">
                <div class="d-flex align-center" style="gap: 8px">
                  <span class="text-h6 font-weight-bold">{{ entry.title }}</span>
                  <v-chip v-if="entry.badge" color="primary" size="x-small" variant="flat">{{ entry.badge }}</v-chip>
                </div>
                <div class="text-body-2 text-medium-emphasis mt-1">{{ entry.desc }}</div>
              </div>
            </div>
          </v-card-item>
        </v-card>
      </div>

      <!-- 网页端专用：引导下载 Windows 桌面端（桌面端应用内不再显示） -->
      <div v-if="showDesktopCard" class="desktop-card">
        <div class="desktop-card-inner">
          <div class="desktop-icon">
            <v-icon color="primary" size="34">mdi-microsoft-windows</v-icon>
          </div>
          <div class="desktop-body">
            <div class="d-flex align-center flex-wrap" style="gap: 8px">
              <span class="text-subtitle-1 font-weight-bold">下载 Windows 桌面端</span>
              <v-chip color="primary" size="x-small" variant="flat">推荐一体机</v-chip>
            </div>
            <div class="desktop-desc">
              与网页端同一套界面与功能，开机自动启动、断网可用，支持一键更新。约 70–86 MB。
            </div>
            <div class="desktop-links">
              <v-btn
                class="desktop-download-btn"
                color="primary"
                :href="DOWNLOAD_PAGE_URL"
                prepend-icon="mdi-download"
                rel="noopener"
                size="small"
                target="_blank"
                variant="flat"
              >
                前往下载页
              </v-btn>
              <span class="desktop-tip">Win10 / 11 与 Win7 均有对应版本，页面会自动推荐合适的架构</span>
            </div>
          </div>
        </div>
      </div>

      <div class="options-buttons">
        <v-btn
          v-for="action in actions"
          :key="action.key"
          :prepend-icon="action.icon"
          size="small"
          variant="tonal"
          @click="action.run()"
        >
          {{ action.title }}
        </v-btn>
        <v-btn prepend-icon="mdi-code-tags" size="small" variant="tonal" @click="aboutOpen = true">
          查看版本信息
        </v-btn>
      </div>

      <div class="footer-hint">
        没有授权码也可以直接点「使用本地模式」：看板用本机数据，之后登录会自动接上云端。
      </div>
    </div>

    <!-- 输入设备令牌 -->
    <v-dialog v-model="tokenOpen" max-width="500">
      <v-card>
        <v-card-title>输入设备令牌</v-card-title>
        <v-card-text>
          <p class="text-body-2 text-medium-emphasis mb-4">
            如果你之前登录过这台设备，可以粘贴令牌直接恢复，无需重新输入班级码与授权码。
          </p>
          <v-textarea
            v-model="tokenInput"
            auto-grow
            density="comfortable"
            hide-details="auto"
            label="设备令牌"
            placeholder="粘贴形如 c9f3... 的令牌"
            rows="2"
            variant="outlined"
          />
          <v-alert v-if="tokenError" class="mt-3" density="compact" type="error" variant="tonal">
            {{ tokenError }}
          </v-alert>
        </v-card-text>
        <v-card-actions class="pa-4">
          <v-spacer />
          <v-btn variant="text" @click="tokenOpen = false">取消</v-btn>
          <v-btn :loading="tokenLoading" color="primary" variant="elevated" @click="submitToken">
            验证并进入
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- 版本信息 -->
    <v-dialog v-model="aboutOpen" max-width="420">
      <v-card>
        <v-card-title>关于星焰作业板</v-card-title>
        <v-card-text>
          <v-table density="compact">
            <tbody>
              <tr><td class="text-medium-emphasis">产品</td><td>星焰作业板</td></tr>
              <tr><td class="text-medium-emphasis">定位</td><td>适用于班级大屏的作业展示工具</td></tr>
              <tr><td class="text-medium-emphasis">版本</td><td>{{ appVersion }}</td></tr>
              <tr><td class="text-medium-emphasis">接口</td><td>{{ apiBase }}</td></tr>
            </tbody>
          </v-table>
        </v-card-text>
        <v-card-actions class="pa-4">
          <v-spacer />
          <v-btn variant="text" @click="aboutOpen = false">关闭</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-snackbar v-model="snack.show" :color="snack.color" timeout="2600">{{ snack.text }}</v-snackbar>
  </div>
</template>

<script setup lang="ts">
import logoUrl from '@/assets/logo.svg'
import { computed, onMounted, reactive, ref } from 'vue'
import { DEVICE_TOKEN_STORAGE_KEY } from '@starflame/shared'
import { apiBase, getData } from '@/lib/api'
import { appVersion, loadAppVersion } from '@/lib/appVersion'
import { navigate, ROUTES } from '@/lib/nav'
import { captureSnapshot, ensureLocalBoard, setMode } from '@/lib/dataSource'
import { isDesktop } from '@/lib/platform'

/** 桌面端下载页（与网页端同源部署，目录 /desktop/） */
const DOWNLOAD_PAGE_URL = '/desktop/'
/**
 * 后台管理面板：与 API 同族域名（zyapi.* → zyadmin.*）。
 * 部署到别的域名时用 VITE_ADMIN_URL 覆盖。
 */
const ADMIN_PANEL_URL = (() => {
  const override = import.meta.env.VITE_ADMIN_URL as string | undefined
  if (override) return override
  try {
    const url = new URL(apiBase)
    if (url.hostname.startsWith('zyapi.')) {
      url.hostname = `zyadmin.${url.hostname.slice('zyapi.'.length)}`
      url.pathname = '/'
      return url.origin
    }
  } catch {
    /* 开发环境 apiBase 是相对路径，退到生产域名 */
  }
  return 'https://zyadmin.yanhuoyiyou.cn'
})()
/** 桌面端应用内不再提示下载自己 */
const showDesktopCard = computed(() => !isDesktop)

const offline = ref(!navigator.onLine)
const offlineDismissed = ref(false)
const tokenOpen = ref(false)
const tokenInput = ref('')
const tokenError = ref('')
const tokenLoading = ref(false)
const aboutOpen = ref(false)
const snack = reactive({ show: false, text: '', color: 'success' })

const hasToken = computed(() => Boolean(localStorage.getItem(DEVICE_TOKEN_STORAGE_KEY)))

/**
 * 进入本地模式：在线且已绑定设备时顺手抓一份最新快照；
 * 未登录 / 无网络 / 本机完全没有缓存时也能进——此时生成一份空白本地看板。
 */
async function enterLocalMode(): Promise<void> {
  const canFetch = navigator.onLine && Boolean(localStorage.getItem(DEVICE_TOKEN_STORAGE_KEY))
  const snapshot = canFetch ? await captureSnapshot() : null
  if (!snapshot) ensureLocalBoard()
  setMode('local')
  navigate('board')
}

interface Entry {
  key: string
  title: string
  desc: string
  icon: string
  color: string
  gradient?: string
  badge?: string
  disabled?: boolean
  run: () => void
}

const entries = computed<Entry[]>(() => [
  {
    key: 'new',
    title: '初次使用',
    desc: '用班级码 + 授权码登录这台设备，开始使用作业看板',
    icon: 'mdi-new-box',
    color: 'primary',
    gradient: 'gradient-new',
    badge: 'NEW',
    run: () => navigate('bind'),
  },
  {
    key: 'local',
    title: '使用本地模式',
    desc: '免登录、断网也能用，看板直接用本机数据；之后登录会自动接上云端',
    icon: 'mdi-harddisk',
    color: 'success',
    gradient: 'gradient-registered',
    run: () => {
      void enterLocalMode()
    },
  },
  {
    key: 'admin',
    title: '后台管理面板',
    desc: '可注册新班级并配置授权码',
    icon: 'mdi-view-dashboard-edit-outline',
    color: 'info',
    run: () => {
      window.open(ADMIN_PANEL_URL, '_blank', 'noopener')
    },
  },
])

const actions = [
  {
    key: 'bind',
    title: '使用班级码登录',
    icon: 'mdi-key-variant',
    run: () => navigate('bind'),
  },
  {
    key: 'token',
    title: '输入设备令牌',
    icon: 'mdi-shield-key-outline',
    run: () => {
      tokenError.value = ''
      tokenOpen.value = true
    },
  },

  {
    key: 'board',
    title: hasToken.value ? '我已绑定，直接进入' : '进入作业看板',
    icon: 'mdi-monitor-dashboard',
    run: () => {
      if (hasToken.value) navigate('board')
      else navigate('bind')
    },
  },
]

function handleEntry(entry: Entry): void {
  if (entry.disabled) {
    snack.text = '请先完成设备登录'
    snack.color = 'warning'
    snack.show = true
    return
  }
  entry.run()
}

/** 校验令牌是否有效：请求 /device/me，成功即写入本地 */
async function submitToken(): Promise<void> {
  if (tokenLoading.value) return
  const token = tokenInput.value.trim()
  if (!token) {
    tokenError.value = '请粘贴设备令牌'
    return
  }
  tokenLoading.value = true
  tokenError.value = ''
  const previous = localStorage.getItem(DEVICE_TOKEN_STORAGE_KEY)
  localStorage.setItem(DEVICE_TOKEN_STORAGE_KEY, token)
  try {
    await getData('/device/me')
    window.location.href = ROUTES.board
  } catch (e) {
    if (previous) localStorage.setItem(DEVICE_TOKEN_STORAGE_KEY, previous)
    else localStorage.removeItem(DEVICE_TOKEN_STORAGE_KEY)
    tokenError.value = e instanceof Error ? e.message : '令牌无效或已失效'
  } finally {
    tokenLoading.value = false
  }
}

onMounted(() => {
  window.addEventListener('online', () => { offline.value = false })
  window.addEventListener('offline', () => { offline.value = true })
  void loadAppVersion()
})
</script>
<style scoped>
/*
 * 欢迎页自己就是滚动容器：全局 body 设了 overflow:hidden，
 * 页面不自己开滚动的话，窄屏上内容超出视口后就再也滚不到（下面的按钮看不见）。
 */
.init-overlay {
  position: relative;
  /* 100% 而非 100vh：桌面端 zoom 下 vh 不随缩放会超出视口被裁 */
  height: 100%;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
}

.init-container {
  max-width: 900px;
  margin: 0 auto;
  /* 底部多留一截，避免左下角版本徽标压住最后一屏内容 */
  padding: 24px 16px calc(64px + env(safe-area-inset-bottom));
}

.init-header .brand-logo {
  display: block;
  width: 66px;
  height: 66px;
  margin: 0 auto 14px;
  border-radius: 18px;
  box-shadow: 0 10px 26px rgba(244, 81, 30, 0.28);
}

.init-header .title {
  font-size: 28px;
  font-weight: 700;
  text-align: left;
  margin-bottom: 8px;
}

.init-header .subtitle {
  font-size: 14px;
  opacity: 0.75;
  text-align: left;
}

.welcome-offline {
  margin-top: 16px;
  max-width: 320px;
  font-size: 0.8rem;
}

/* 主要卡片 */
.main-card-row {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-top: 32px;
}

.main-service-card {
  min-height: 100px;
  cursor: pointer;
  transition: all 0.3s ease;
}

.main-service-card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15) !important;
}

.main-service-card .v-card-item {
  padding: 20px 24px;
}

.card-horizontal-layout {
  display: flex;
  align-items: center;
  gap: 20px;
}

.card-icon-wrapper {
  flex-shrink: 0;
}

.entry-icon {
  font-size: 48px;
  width: 48px;
  height: 48px;
}

.card-content {
  flex: 1;
  text-align: left;
}

.gradient-new {
  background: linear-gradient(135deg, rgba(33, 150, 243, 0.12), rgba(103, 80, 164, 0.08) 60%);
  border: 2px solid rgba(33, 150, 243, 0.2);
}

.gradient-registered {
  background: linear-gradient(135deg, rgba(76, 175, 80, 0.12), rgba(0, 184, 212, 0.08) 60%);
  border: 2px solid rgba(76, 175, 80, 0.2);
}

.card-disabled {
  cursor: not-allowed;
  opacity: 0.5;
  filter: saturate(0.6);
}

.card-disabled:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15) !important;
}

/* 桌面端下载卡 */
.desktop-card {
  margin-top: 16px;
}

.desktop-card-inner {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  padding: 18px 22px;
  border-radius: 16px;
  border: 1px dashed rgba(var(--v-theme-primary), 0.45);
  background: rgba(var(--v-theme-primary), 0.06);
}

.desktop-icon {
  flex-shrink: 0;
  width: 52px;
  height: 52px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 14px;
  background: rgba(var(--v-theme-primary), 0.12);
}

.desktop-body {
  flex: 1;
  min-width: 0;
}

.desktop-desc {
  margin-top: 4px;
  font-size: 13px;
  line-height: 1.65;
  opacity: 0.75;
}

.desktop-links {
  margin-top: 12px;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}

.desktop-tip {
  font-size: 12px;
  opacity: 0.6;
}

/* 其他选项 */
.options-buttons {
  margin-top: 24px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-start;
}

.clickable {
  cursor: pointer;
}

.footer-hint {
  margin-top: 24px;
  font-size: 13px;
  opacity: 0.7;
  text-align: left;
}

@media (max-width: 768px) {
  .card-horizontal-layout {
    gap: 16px;
  }

  .card-icon-wrapper .entry-icon {
    font-size: 40px !important;
    width: 40px !important;
    height: 40px !important;
  }

  .desktop-card-inner {
    flex-direction: column;
    gap: 12px;
    padding: 16px;
  }

  .desktop-links .v-btn {
    width: 100%;
  }

  .options-buttons {
    flex-direction: column;
  }

  .options-buttons .v-btn {
    width: 100%;
  }
}
</style>
