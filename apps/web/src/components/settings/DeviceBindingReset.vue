<template>
  <v-btn
    :block="block"
    :color="color"
    :loading="resetting"
    :prepend-icon="prependIcon"
    :size="size"
    :variant="variant"
    @click="openConfirm"
  >
    {{ label }}
  </v-btn>

  <v-dialog v-model="confirming" max-width="460" persistent>
    <v-card>
      <v-card-title class="text-h6 d-flex align-center">
        <v-icon class="mr-2" color="error" icon="mdi-link-off" />
        重置设备绑定信息？
      </v-card-title>
      <v-card-text class="text-body-2">
        <p class="mb-2">将退出当前设备登录并清除本机保存的设备令牌，随后回到欢迎页重新输入班级码绑定。</p>
        <ul class="reset-list mb-2">
          <li>云端设置与作业、通知数据不会被删除</li>
          <li>本机缓存的作业数据会保留</li>
          <li>设备标识保留，重新绑定后沿用原设备记录</li>
        </ul>
        <p class="mb-0 text-medium-emphasis">
          当前绑定：{{ session.classInfo?.name || '未绑定' }}{{ session.roleText ? ' · ' + session.roleText : '' }}
        </p>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="confirming = false">取消</v-btn>
        <v-btn color="error" :loading="resetting" variant="elevated" @click="resetBinding">重置并退出</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { DEVICE_TOKEN_STORAGE_KEY } from '@starflame/shared'
import { postData } from '@/lib/api'
import { setMode } from '@/lib/dataSource'
import { ROUTES } from '@/lib/nav'
import { useSessionStore } from '@/stores/session'

withDefaults(
  defineProps<{
    label?: string
    variant?: 'flat' | 'tonal' | 'outlined' | 'text' | 'elevated' | 'plain'
    color?: string
    size?: 'x-small' | 'small' | 'default' | 'large' | 'x-large'
    block?: boolean
    prependIcon?: string
  }>(),
  {
    label: '重置设备绑定信息',
    variant: 'outlined',
    color: 'error',
    size: 'default',
    block: false,
    prependIcon: 'mdi-link-off',
  },
)

const session = useSessionStore()
const confirming = ref(false)
const resetting = ref(false)

function openConfirm(): void {
  confirming.value = true
}

/** 解绑并回到欢迎页：清本机令牌 -> 会话状态 -> 数据源回云端 */
async function resetBinding(): Promise<void> {
  if (resetting.value) return
  resetting.value = true
  try {
    // 先让服务端令牌立即失效；离线或令牌已失效时忽略
    try {
      await postData('/device/logout')
    } catch {
      // 忽略
    }
    localStorage.removeItem(DEVICE_TOKEN_STORAGE_KEY)
    session.clear()
    // 本地缓存模式下重置绑定后回到云端数据源，避免仍以本地身份继续使用
    setMode('starflame')
    confirming.value = false
    window.location.replace(ROUTES.welcome)
  } finally {
    resetting.value = false
  }
}
</script>

<style scoped>
.reset-list {
  padding-left: 18px;
}
.reset-list li {
  margin-bottom: 4px;
}
</style>
