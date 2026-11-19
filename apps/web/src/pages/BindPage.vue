<template>
  <div class="bind-wrap d-flex align-center justify-center">
    <v-card class="bind-card pa-2" max-width="520" width="100%" variant="flat">
      <v-card-item class="text-center pt-6">
        <img alt="星焰作业板" class="brand-logo mx-auto mb-4" :src="logoUrl" />
        <v-card-title class="text-h4 font-weight-bold">星焰作业板</v-card-title>
        <v-card-subtitle class="mt-1">把今天交给大屏</v-card-subtitle>
      </v-card-item>

      <v-card-text class="px-6 pb-2">
        <v-form @submit.prevent="submit">
          <v-text-field
            v-model="classCode"
            autocomplete="off"
            class="mb-2"
            hint="由班主任或管理员提供"
            label="班级码"
            persistent-hint
            placeholder="例如 xingyan-2026"
            prepend-inner-icon="mdi-key-variant"
            :rules="[codeRule(classCode, '班级码')]"
          />
          <v-text-field
            v-model="accessCode"
            autocomplete="off"
            class="mb-2 mt-4"
            hint="可留空：留空即以游客身份只读浏览"
            label="授权码（可留空）"
            persistent-hint
            placeholder="留空为游客只读"
            prepend-inner-icon="mdi-key-chain-variant"
            :rules="[accessCodeRule(accessCode)]"
          />
          <v-text-field
            v-model="deviceName"
            autocomplete="off"
            class="mb-2 mt-4"
            counter="64"
            hint="可留空：自动用授权码的设备类型命名（一体机 / 老师 / 学生 / 家长；未填授权码则为「游客」）"
            label="设备名称（可选）"
            maxlength="64"
            persistent-hint
            placeholder="例如 高二(18)班一体机"
            prepend-inner-icon="mdi-monitor"
          />
          <v-chip v-if="!accessCode.trim()" class="mt-3" color="warning" prepend-icon="mdi-account-outline" size="small" variant="tonal">
            游客登录：只能看，不能改
          </v-chip>
          <v-alert v-if="error" class="mb-4" density="compact" type="error" variant="tonal">
            {{ error }}
          </v-alert>
          <v-btn
            block
            color="primary"
            :disabled="!canSubmit"
            :loading="loading"
            size="large"
            type="submit"
            variant="flat"
          >
            登录大屏
          </v-btn>
          <div class="text-center mt-3">
            <v-btn size="small" variant="text" @click="goWelcome">返回欢迎页</v-btn>
          </div>
        </v-form>
      </v-card-text>
    </v-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import logoUrl from '@/assets/logo.svg'
import { navigate } from '@/lib/nav'
import { useSessionStore } from '@/stores/session'

const session = useSessionStore()

const classCode = ref('')
const accessCode = ref('')
/** 设备名称可选：留空由服务端按授权码身份自动命名 */
const deviceName = ref('')
const loading = ref(false)
const error = ref('')

const UUID_KEY = 'sf.deviceUuid'
/** 记住上次的设备名称，下次打开自动填好（可随时改） */
const NAME_KEY = 'sf.deviceName'

const canSubmit = computed(() => Boolean(classCode.value.trim()) && !loading.value)

function codeRule(value: string, label: string): true | string {
  const text = value ?? ''
  if (!text.trim()) return '请填写' + label
  if (text.trim().length < 4) return label + '至少 4 位'
  if (!/^[\x21-\x7E]+$/.test(text.trim())) return label + '只能使用字母、数字与符号（不含空格）'
  return true
}

/** 授权码可留空（游客只读），填了才校验 */
function accessCodeRule(value: string): true | string {
  const text = (value ?? '').trim()
  if (!text) return true
  if (text.length < 6) return '授权码至少 6 位'
  if (!/^[\x21-\x7E]+$/.test(text)) return '授权码只能使用字母、数字与符号（不含空格）'
  return true
}

function ensureUuid(): string {
  let uuid = localStorage.getItem(UUID_KEY)
  if (!uuid) {
    uuid = crypto.randomUUID()
    localStorage.setItem(UUID_KEY, uuid)
  }
  return uuid
}

onMounted(() => {
  ensureUuid()
  const remembered = localStorage.getItem(NAME_KEY)
  if (remembered && !deviceName.value) deviceName.value = remembered
})

function goWelcome(): void {
  window.location.href = '/welcome'
}

async function submit(): Promise<void> {
  if (loading.value) return
  // 保留原样大小写：班级码与授权码区分由服务端比较规则决定
  const classCodeValue = classCode.value.trim()
  const accessCodeValue = accessCode.value.trim()
  loading.value = true
  error.value = ''
  try {
    const result = await session.login(classCodeValue, accessCodeValue, ensureUuid(), deviceName.value.trim())
    // 服务端按授权码身份自动命名时，把最终名称回写进输入框并记住，下次打开即自动填好
    const finalName = result?.device?.name ?? ''
    if (finalName) {
      deviceName.value = finalName
      try {
        localStorage.setItem(NAME_KEY, finalName)
      } catch {
        /* 隐私模式下忽略 */
      }
    }
    navigate('board')
  } catch (e) {
    error.value = e instanceof Error ? e.message : '登录失败，请检查班级码与授权码'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.brand-logo {
  width: 66px;
  height: 66px;
  border-radius: 18px;
  display: block;
  box-shadow: 0 10px 24px rgba(244, 81, 30, 0.22);
}
.bind-wrap {
  height: 100%;
  overflow-y: auto;
  overscroll-behavior: contain;
  background:
    radial-gradient(1200px 600px at 15% 10%, rgba(255, 138, 31, 0.14), transparent 60%),
    radial-gradient(900px 500px at 85% 90%, rgba(244, 81, 30, 0.1), transparent 55%),
    var(--bg-page);
  padding: 24px;
}
.bind-card {
  /* 内容比视口高时仍可完整滚到，不会被 flex 居中裁掉顶部 */
  margin: auto;
  border-radius: var(--r-xl);
  border: 1px solid var(--border);
  box-shadow: var(--shadow-lg);
}
.brand-mark {
  width: 64px;
  height: 64px;
  border-radius: 20px;
  display: grid;
  place-items: center;
  background: var(--grad-brand);
  box-shadow: var(--shadow-warm);
}
</style>
