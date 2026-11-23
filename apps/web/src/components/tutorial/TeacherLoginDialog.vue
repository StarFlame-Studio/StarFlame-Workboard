<template>
  <v-dialog v-model="visible" max-width="680" scrollable>
    <v-card>
      <v-card-title class="d-flex align-center py-3 px-4">
        <v-icon class="mr-2" color="primary">mdi-account-key</v-icon>
        教师端登录
        <v-spacer />
        <v-btn icon="mdi-close" variant="text" @click="close" />
      </v-card-title>
      <v-divider />
      <v-card-text class="pa-4">
        <p class="text-body-2 text-medium-emphasis mb-4">
          老师想用手机或办公室电脑布置作业时，在登录页填下面这两个码即可。班级码和教师授权码由这台一体机自动带出，没有教师授权码时会自动创建一条。
        </p>

        <v-alert v-if="error" class="mb-4" density="compact" type="error" variant="tonal">{{ error }}</v-alert>

        <template v-else-if="loading">
          <div class="d-flex align-center justify-center py-10">
            <v-progress-circular indeterminate size="32" />
            <span class="ml-3 text-body-2 text-medium-emphasis">正在获取登录信息…</span>
          </div>
        </template>

        <template v-else>
          <div class="cred-box mb-3">
            <div class="text-caption text-medium-emphasis mb-1">班级码</div>
            <div class="d-flex align-center">
              <span class="cred-value">{{ classCode }}</span>
              <v-spacer />
              <v-btn prepend-icon="mdi-content-copy" size="small" variant="tonal" @click="copy(classCode, '班级码已复制')">复制</v-btn>
            </div>
          </div>

          <div class="cred-box mb-3">
            <div class="text-caption text-medium-emphasis mb-1">
              教师授权码
              <v-chip v-if="created" class="ml-2" color="success" size="x-small" variant="tonal">刚刚自动创建</v-chip>
            </div>
            <div class="d-flex align-center">
              <span class="cred-value">{{ accessCode }}</span>
              <v-spacer />
              <v-btn prepend-icon="mdi-content-copy" size="small" variant="tonal" @click="copy(accessCode, '教师授权码已复制')">复制</v-btn>
            </div>
          </div>

          <div class="cred-box mb-4">
            <div class="text-caption text-medium-emphasis mb-1">预配链接（打开即自动登录教师端）</div>
            <div class="link-text mb-2">{{ link }}</div>
            <div class="d-flex flex-wrap" style="gap: 8px">
              <v-btn color="primary" prepend-icon="mdi-content-copy" size="small" variant="elevated" @click="copy(link, '预配链接已复制')">复制链接</v-btn>
              <v-btn prepend-icon="mdi-open-in-new" size="small" variant="tonal" @click="openLink">打开链接</v-btn>
            </div>
          </div>

          <v-divider class="mb-4" />

          <div class="text-subtitle-2 font-weight-bold mb-2">怎么用</div>
          <img :src="guideUrl" alt="教师端登录说明" class="guide-img mb-3" />
          <ol class="text-body-2 text-medium-emphasis guide-steps">
            <li>在这台一体机的教程卡片里点「教师端登录」，就能看到班级码和教师授权码。</li>
            <li>手机或办公室电脑打开本站，选「绑定班级」，填入上面两个码，设备名称写「老师手机」之类。</li>
            <li>也可以直接复制上面的预配链接发给自己，打开后自动登录，不用手输。</li>
            <li>教师授权码拥有写权限，可以布置作业、发通知；请勿把它发给学生或家长。</li>
          </ol>
        </template>
      </v-card-text>
    </v-card>
  </v-dialog>

  <v-snackbar v-model="snack.show" :timeout="2200">{{ snack.text }}</v-snackbar>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { getData } from '@/lib/api'
import { webUrl } from '@/lib/webOrigin'
import guideUrl from '@/assets/teacher-login-guide.svg'

interface AccessCodeInfo {
  classCode: string
  classUid: string
  className: string
  accessCode: string
  accessCodeId: string
  label: string | null
  created: boolean
}

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
})

const loading = ref(false)
const error = ref('')
const info = ref<AccessCodeInfo | null>(null)
const snack = reactive({ show: false, text: '' })

const classCode = computed(() => info.value?.classCode ?? '')
const accessCode = computed(() => info.value?.accessCode ?? '')
const created = computed(() => info.value?.created ?? false)
const link = computed(() => {
  if (!info.value) return ''
  const params = new URLSearchParams()
  params.set('c', info.value.classCode)
  params.set('k', info.value.accessCode)
  return webUrl('/bind') + '?' + params.toString()
})

async function load(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    info.value = await getData<AccessCodeInfo>('/board/access-code')
  } catch (e) {
    error.value = e instanceof Error ? e.message : '获取登录信息失败'
  } finally {
    loading.value = false
  }
}

function close(): void {
  visible.value = false
}

function openLink(): void {
  if (!link.value) return
  window.open(link.value, '_blank')
}

async function copy(text: string, message: string): Promise<void> {
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
    snack.text = message
    snack.show = true
  } catch {
    snack.text = '复制失败，请手动选中复制'
    snack.show = true
  }
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) void load()
  },
)
</script>

<style scoped>
.cred-box {
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  padding: 10px 14px;
}
.cred-value {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 0.08em;
}
.link-text {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  line-height: 1.5;
  word-break: break-all;
  opacity: 0.85;
}
.guide-img {
  display: block;
  width: 100%;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.08);
}
.guide-steps {
  padding-left: 18px;
  line-height: 1.9;
}
</style>
