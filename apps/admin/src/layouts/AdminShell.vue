<template>
  <v-app>
    <v-navigation-drawer v-model="drawer" :permanent="!mobile" :temporary="mobile" width="228">
      <a class="brand d-flex align-center px-4 py-4 text-decoration-none" href="/">
        <span class="brand-logo mr-3">
          <img alt="星焰作业板" class="brand-logo__img" :src="logoUrl" />
        </span>
        <span class="brand-text">
          <span class="brand-name">星焰作业板</span>
          <span class="brand-sub">管理后台</span>
        </span>
      </a>
      <v-divider />
      <v-list density="comfortable" nav>
        <v-list-item
          v-for="item in navItems"
          :key="item.key"
          :active="item.key === active"
          :href="item.href"
          :prepend-icon="item.icon"
          :title="item.title"
          @click="mobile && (drawer = false)"
        />
      </v-list>
      <template #append>
        <div class="pa-3">
          <div class="shell-user">
            <div class="shell-user__avatar">{{ avatarText }}</div>
            <div class="shell-user__text">
              <strong>{{ auth.user?.name ?? auth.user?.username ?? '未登录' }}</strong>
              <small>{{ roleLabel }}</small>
            </div>
          </div>
          <v-btn block prepend-icon="mdi-logout" variant="tonal" @click="logout">退出登录</v-btn>
        </div>
      </template>
    </v-navigation-drawer>

    <v-app-bar class="shell-bar" color="transparent" elevation="0" :height="mobile ? 60 : 72">
      <v-btn v-if="mobile" aria-label="打开导航菜单" class="ml-1" icon="mdi-menu" title="导航菜单" variant="text" @click="drawer = !drawer" />
      <v-app-bar-title class="shell-bar-title">{{ currentTitle }}</v-app-bar-title>
      <v-spacer />
      <div v-if="identity" class="shell-identity">
        <span class="shell-identity__name">{{ auth.user?.name ?? auth.user?.username ?? '' }}</span>
        <span class="shell-identity__pill">{{ roleLabel }}</span>
      </div>
      <v-btn aria-label="刷新" class="ml-2" icon="mdi-refresh" title="刷新" variant="text" @click="reload" />
    </v-app-bar>

    <v-main>
      <v-container :class="mobile ? 'pa-3' : 'pa-6'" fluid>
        <slot />
      </v-container>
    </v-main>
  </v-app>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useDisplay } from 'vuetify'
import logoUrl from '@/assets/logo.svg'
import { useAuthStore } from '@/stores/auth'

const props = defineProps<{ active: string }>()

const auth = useAuthStore()

/** 移动端：侧栏改为抽屉，默认收起，由顶栏汉堡按钮唤出 */
const { mobile } = useDisplay()
const drawer = ref(!mobile.value)

watch(mobile, (isMobile) => {
  drawer.value = !isMobile
})

/** 多页面站点的导航表：href 为静态页面地址，点击即整页跳转 */
const NAV = [
  { key: 'overview', title: '概览', icon: 'mdi-view-dashboard-outline', href: '/' },
  { key: 'classes', title: '班级', icon: 'mdi-google-classroom', href: '/classes.html' },
  { key: 'notices', title: '通知', icon: 'mdi-bullhorn-outline', href: '/notices.html' },
  { key: 'users', title: '用户', icon: 'mdi-account-multiple-outline', href: '/users.html' },
  { key: 'devices', title: '设备', icon: 'mdi-monitor-dashboard', href: '/devices.html' },
  { key: 'audit', title: '审计日志', icon: 'mdi-clipboard-list-outline', href: '/audit.html' },
]

/** 仅管理员可见全部菜单；教师账号只保留班级 */
const canAdmin = computed(() => auth.user?.role === 'owner' || auth.user?.role === 'admin')
const navItems = computed(() => (canAdmin.value ? NAV : NAV.filter((item) => item.key === 'classes')))

const currentTitle = computed(() => NAV.find((item) => item.key === props.active)?.title ?? '管理后台')
const avatarText = computed(() => (auth.user?.name ?? auth.user?.username ?? '星').slice(0, 1))
const roleLabel = computed(() => {
  const role = auth.user?.role
  if (role === 'owner') return '超级管理员'
  if (role === 'admin') return '管理员'
  return '教师'
})

/** 名称与角色相同时只显示一次，避免「超级管理员 · 超级管理员」 */
const identity = computed(() => {
  const name = auth.user?.name ?? ''
  return name === roleLabel.value ? name : name + ' · ' + roleLabel.value
})

function reload(): void {
  window.location.reload()
}

async function logout(): Promise<void> {
  await auth.logout()
  window.location.replace('/login.html')
}

onMounted(async () => {
  if (!auth.user) await auth.loadMe()
  if (!canAdmin.value && props.active === 'overview') {
    window.location.replace('/classes.html')
  }
})
</script>

<style scoped>
.brand {
  position: relative;
  border-radius: 0 14px 14px 0;
  transition: background-color 0.18s var(--ease);
}

.brand:hover {
  background: var(--brand-soft);
}

.brand-logo {
  position: relative;
  box-sizing: border-box;
  flex: 0 0 auto;
  width: 38px;
  height: 38px;
  padding: 2px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  background: radial-gradient(circle at 30% 20%, rgba(255, 165, 58, 0.28), rgba(244, 81, 30, 0.1));
  border: 1px solid rgba(255, 138, 61, 0.3);
  box-shadow: 0 8px 18px rgba(244, 81, 30, 0.22), inset 0 1px 0 rgba(255, 233, 220, 0.2);
  isolation: isolate;
}

.brand-logo::after {
  content: '';
  position: absolute;
  inset: -3px;
  z-index: -1;
  border-radius: 15px;
  background: radial-gradient(circle, rgba(255, 138, 61, 0.24), transparent 68%);
  pointer-events: none;
}

.brand-logo__img {
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  border-radius: 10px;
  display: block;
  object-fit: contain;
}

.brand-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.brand-name {
  font-size: 15px;
  font-weight: 800;
  letter-spacing: 0.6px;
  line-height: 1.15;
  color: var(--text-1);
}

.brand-sub {
  font-size: 11.5px;
  letter-spacing: 1.4px;
  line-height: 1.15;
  color: var(--text-3);
}

.shell-bar {
  border-bottom: 1px solid var(--border);
  backdrop-filter: saturate(180%) blur(16px);
}

.shell-bar-title {
  font-size: 17px !important;
  font-weight: 700 !important;
  letter-spacing: 0 !important;
  color: var(--text-1);
}

.shell-identity {
  display: flex;
  align-items: center;
  gap: 8px;
}

.shell-identity__name {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--text-2);
}

.shell-identity__pill {
  height: 22px;
  padding: 0 10px;
  border-radius: var(--r-pill);
  display: inline-flex;
  align-items: center;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--brand-2);
  background: var(--brand-soft);
}

.shell-user {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 4px 12px;
}

.shell-user__avatar {
  width: 34px;
  height: 34px;
  border-radius: 11px;
  display: grid;
  place-items: center;
  font-size: 15px;
  font-weight: 700;
  color: #fff;
  background-image: var(--grad-avatar);
  box-shadow: var(--shadow-warm);
  flex-shrink: 0;
}

.shell-user__text {
  display: flex;
  flex-direction: column;
  line-height: 1.3;
  min-width: 0;
}

.shell-user__text strong {
  font-size: 13.5px;
  color: var(--text-1);
}

.shell-user__text small {
  font-size: 11.5px;
  color: var(--text-3);
}

@media (max-width: 900px) {
  .shell-identity {
    display: none;
  }
}
</style>
