<template>
  <settings-group
    description="生成预配链接：设备打开链接后自动登录并进入作业看板，无需再输入任何内容。链接形如 /bind?c=班级码&k=授权码，短且好记。"
    icon="mdi-link-variant"
    title="统一链接生成器"
  >
    <v-card class="ma-2 pa-4" variant="tonal">
      <div class="d-flex align-center mb-3">
        <v-icon class="mr-2" icon="mdi-account-key" size="small" />
        <span class="font-weight-medium">认证信息</span>
      </div>

      <v-row dense>
        <v-col cols="12" sm="6">
          <v-text-field v-model="form.classCode" density="compact" hint="设备登录用的班级码" label="班级码" persistent-hint variant="outlined" />
        </v-col>
        <v-col cols="12" sm="6">
          <v-text-field v-model="form.accessCode" density="compact" hint="留空 = 游客只读登录" label="授权码（可留空）" persistent-hint variant="outlined" />
        </v-col>
      </v-row>

      <div class="text-caption text-medium-emphasis mt-2">
        链接固定为「打开即自动登录」：设备名称由授权码身份自动决定（一体机 / 老师 / 学生 / 家长 / 游客）。
        不带授权码时以游客身份只读进入（需班级已开启游客登录）。
      </div>
    </v-card>

    <v-card class="ma-2 pa-4" variant="outlined">
      <div class="d-flex align-center mb-3">
        <v-icon class="mr-2" icon="mdi-link" size="small" />
        <span class="font-weight-medium">生成的预配链接</span>
      </div>

      <div class="d-flex flex-wrap mb-3" style="gap: 8px">
        <v-btn color="primary" prepend-icon="mdi-auto-fix" variant="elevated" @click="generate">生成预配链接</v-btn>
        <v-btn :disabled="!link" prepend-icon="mdi-open-in-new" variant="tonal" @click="testLink">测试链接</v-btn>
        <v-btn :disabled="!link" color="error" prepend-icon="mdi-delete" variant="tonal" @click="clearLink">清空所有</v-btn>
      </div>

      <v-text-field
        :model-value="link"
        density="compact"
        placeholder="预配链接"
        readonly
        variant="outlined"
      >
        <template #append-inner>
          <v-btn :disabled="!link" icon="mdi-content-copy" size="small" variant="text" @click="copyLink" />
        </template>
      </v-text-field>

      <div class="text-caption text-medium-emphasis mt-2">
        <v-icon icon="mdi-web" size="x-small" />
        链接域名：{{ webOrigin }}
      </div>
    </v-card>

    <v-alert class="ma-2" type="warning" variant="tonal">
      <div class="font-weight-medium mb-1">安全提醒</div>
      <ul class="text-body-2" style="padding-left: 18px">
        <li>链接里包含班级码和授权码，拿到链接的人就能以该身份登录，请只发给需要的人</li>
        <li>建议仅在受信任的网络环境中使用</li>
        <li>生产环境建议使用 HTTPS 协议</li>
        <li>链接中不包含任何 Token 等敏感凭证；如链接外泄，请在后台停用对应授权码</li>
      </ul>
    </v-alert>

    <v-snackbar v-model="snack.show" :color="snack.color" timeout="2400">{{ snack.text }}</v-snackbar>
  </settings-group>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import { resolveWebOrigin, webUrl } from '@/lib/webOrigin'
import SettingsGroup from '@/components/settings/SettingGroup.vue'

const form = reactive({ classCode: '', accessCode: '' })
/** 生成链接所用的网页域名（桌面端不是 app://local，而是真正的网页地址） */
const webOrigin = resolveWebOrigin()
const link = ref('')
const snack = reactive({ show: false, text: '', color: 'success' })

/**
 * 生成短预配链接：/bind?c=班级码&k=授权码
 *
 * 只带认证信息，不再携带设置快照：
 * - 班级设置统一在设置页维护，链接里塞一份快照会和云端设置互相覆盖；
 * - 主题、液态玻璃、背景图已经是本机设置，本来就不该随链接下发。
 */
function generate(): void {
  const classCode = form.classCode.trim()
  if (!classCode) {
    snack.text = '请先填写班级码'
    snack.color = 'error'
    snack.show = true
    return
  }
  const params = new URLSearchParams()
  params.set('c', classCode)
  const accessCode = form.accessCode.trim()
  if (accessCode) params.set('k', accessCode)
  // 必须用真正的网页地址：桌面端页面跑在 app://local，用 location.origin 拼出来的链接发出去打不开
  link.value = webUrl('/bind') + '?' + params.toString()
  snack.text = '已生成预配链接（打开即自动登录）'
  snack.color = 'success'
  snack.show = true
}

function testLink(): void {
  if (!link.value) return
  window.open(link.value, '_blank')
}

function clearLink(): void {
  link.value = ''
  form.classCode = ''
  form.accessCode = ''
}

async function copyLink(): Promise<void> {
  try {
    await navigator.clipboard.writeText(link.value)
    snack.text = '链接已复制'
    snack.color = 'success'
    snack.show = true
  } catch {
    snack.text = '复制失败'
    snack.color = 'error'
    snack.show = true
  }
}
</script>
