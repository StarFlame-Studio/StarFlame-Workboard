<template>
  <div class="login-wrap d-flex align-center justify-center">
    <div class="login-aura login-aura--1" />
    <div class="login-aura login-aura--2" />
    <div class="login-aura login-aura--3" />

    <div class="login-inner">
      <div class="login-brand">
        <img class="brand-logo" :src="logoUrl" alt="星焰作业板" />
        <h1 class="login-title">星焰作业板</h1>
        <p class="login-subtitle">管 理 后 台</p>
      </div>

      <v-card class="login-card" max-width="460" width="100%" variant="flat">
        <v-card-item class="text-center pt-7 pb-0">
          <v-card-title class="text-h6 font-weight-bold">
            {{ mode === 'login' ? '登录你的账号' : '注册新账号' }}
          </v-card-title>
          <v-card-subtitle class="login-card-sub">
            {{ mode === 'login' ? '账号或邮箱均可登录' : '注册后默认拥有教师权限' }}
          </v-card-subtitle>
        </v-card-item>

        <v-card-text class="px-7 pb-7">
        <v-form @submit.prevent="submit">
          <template v-if="mode === 'login'">
            <v-text-field
              v-model="account"
              autofocus
              class="mb-2"
              label="账号或邮箱"
              prepend-inner-icon="mdi-account-outline"
            />
          </template>
          <template v-else>
            <v-text-field
              v-model="email"
              class="mb-2"
              label="邮箱"
              prepend-inner-icon="mdi-email-outline"
              type="email"
            />
            <v-text-field v-model="name" class="mb-2" label="昵称（可选）" prepend-inner-icon="mdi-account-edit-outline" />
          </template>

          <v-text-field
            v-model="password"
            class="mb-2"
            label="密码"
            prepend-inner-icon="mdi-lock-outline"
            type="password"
          />
          <v-text-field
            v-if="mode === 'register'"
            v-model="password2"
            class="mb-2"
            label="确认密码"
            prepend-inner-icon="mdi-lock-check-outline"
            type="password"
          />
          <div v-if="mode === 'register'" class="text-caption text-medium-emphasis mb-3">
            密码 8-64 位，需同时包含字母和数字。注册后默认拥有「教师」权限，可在「班级」页凭班级ID加入并管理班级。
          </div>

          <v-alert v-if="error" class="mb-4" density="compact" type="error" variant="tonal">{{ error }}</v-alert>

          <v-btn
            block
            color="primary"
            :disabled="!canSubmit"
            :loading="loading"
            size="large"
            type="submit"
            variant="flat"
          >
            {{ mode === 'login' ? '登录' : '注册并登录' }}
          </v-btn>

          <div class="text-center mt-4">
            <v-btn
              size="small"
              variant="text"
              @click="switchMode(mode === 'login' ? 'register' : 'login')"
            >
              {{ mode === 'login' ? '没有账号？注册' : '已有账号？去登录' }}
            </v-btn>
          </div>
        </v-form>
        </v-card-text>
      </v-card>

      <p class="login-foot">课堂大屏 · 作业与考试看板</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import logoUrl from '@/assets/logo.svg'
import { computed, ref } from 'vue'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const mode = ref<'login' | 'register'>('login')
const account = ref('')
const email = ref('')
const name = ref('')
const password = ref('')
const password2 = ref('')
const loading = ref(false)
const error = ref('')

const canSubmit = computed(() => {
  if (loading.value) return false
  if (mode.value === 'login') return Boolean(account.value.trim() && password.value)
  return Boolean(email.value.trim() && password.value && password.value === password2.value)
})

function switchMode(next: 'login' | 'register'): void {
  mode.value = next
  error.value = ''
}

async function submit(): Promise<void> {
  if (loading.value) return
  error.value = ''
  if (mode.value === 'register' && password.value !== password2.value) {
    error.value = '两次输入的密码不一致'
    return
  }
  loading.value = true
  try {
    if (mode.value === 'login') {
      await auth.login(account.value.trim(), password.value)
    } else {
      await auth.register(email.value.trim(), password.value, name.value.trim() || undefined)
    }
    // 多页面站点：登录成功后整页跳转到概览
    window.location.replace('/')
  } catch (e) {
    error.value = e instanceof Error ? e.message : mode.value === 'login' ? '登录失败' : '注册失败'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
/* 暖色氛围底 + 三团光晕（对齐「焰火益游」登录页） */
.login-wrap {
  position: relative;
  min-height: 100vh;
  overflow: hidden;
  padding: 48px 20px 32px;
  background: linear-gradient(180deg, #fff6d8 0%, #fff1e2 42%, #ffe4d4 100%);
}

.login-aura {
  position: absolute;
  border-radius: 50%;
  filter: blur(60px);
  pointer-events: none;
}

.login-aura--1 {
  width: 78vw;
  height: 46vh;
  max-width: 760px;
  top: -16vh;
  left: 50%;
  transform: translateX(-50%);
  background: radial-gradient(circle, rgba(255, 206, 102, 0.75) 0%, rgba(255, 222, 150, 0) 70%);
}

.login-aura--2 {
  width: 90vw;
  height: 40vh;
  max-width: 860px;
  bottom: -18vh;
  left: -8vw;
  background: radial-gradient(circle, rgba(255, 145, 110, 0.55) 0%, rgba(255, 170, 140, 0) 70%);
}

.login-aura--3 {
  width: 60vw;
  height: 34vh;
  right: -12vw;
  bottom: -6vh;
  background: radial-gradient(circle, rgba(255, 176, 140, 0.45) 0%, rgba(255, 190, 160, 0) 70%);
}

.login-inner {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 460px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 22px;
}

.login-brand {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.brand-logo {
  width: 64px;
  height: 64px;
  border-radius: 17px;
  box-shadow: 0 10px 26px rgba(244, 81, 30, 0.3);
}

.brand-dot {
  width: 58px;
  height: 58px;
  border-radius: 19px;
  display: grid;
  place-items: center;
  background-image: linear-gradient(150deg, #ff7a1a 0%, #f4511e 100%);
  box-shadow: 0 12px 28px rgba(244, 81, 30, 0.32);
}

.login-title {
  font-size: 32px;
  font-weight: 800;
  letter-spacing: 2px;
  margin: 6px 0 0;
  background-image: linear-gradient(100deg, #ff8a1f 0%, #f0430a 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.login-subtitle {
  margin: 0;
  font-size: 13px;
  letter-spacing: 2px;
  color: #a08e7d;
}

.login-card {
  border-radius: 28px !important;
  box-shadow: 0 22px 56px rgba(190, 120, 60, 0.16), 0 2px 6px rgba(190, 120, 60, 0.06) !important;
  border: 1px solid rgba(255, 255, 255, 0.7) !important;
  background: #ffffff !important;
}

.login-card-sub {
  font-size: 13px !important;
  opacity: 0.7;
}

.login-foot {
  margin: 0;
  font-size: 12.5px;
  letter-spacing: 1px;
  color: #a89787;
}
</style>
