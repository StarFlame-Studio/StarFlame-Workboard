<template>
  <settings-group
    description="生成包含预配置认证信息和设置的统一链接。可以同时预配置设备认证和应用设置。"
    icon="mdi-link-variant"
    title="统一链接生成器"
  >
    <v-card class="ma-2 pa-4" variant="tonal">
      <div class="d-flex align-center mb-3">
        <v-icon class="mr-2" icon="mdi-account-key" size="small" />
        <span class="font-weight-medium">预配置认证信息</span>
      </div>

      <v-row dense>
        <v-col cols="12" sm="6">
          <v-text-field v-model="form.classCode" density="compact" hint="设备登录用的班级码" label="班级码" persistent-hint variant="outlined" />
        </v-col>
        <v-col cols="12" sm="6">
          <v-text-field v-model="form.accessCode" density="compact" hint="留空则需要用户手动输入" label="授权码" persistent-hint variant="outlined" />
        </v-col>
      </v-row>

      <v-checkbox v-model="form.autoAuth" density="compact" hide-details label="自动执行认证" />
      <div class="text-caption text-medium-emphasis mb-2">启用后会自动尝试认证，即使没有认证码也会尝试</div>
    </v-card>

    <v-card class="ma-2 pa-4" variant="tonal">
      <div class="d-flex align-center mb-3">
        <v-icon class="mr-2" icon="mdi-tune-variant" size="small" />
        <span class="font-weight-medium">设置分享（可选）</span>
      </div>
      <div class="text-caption text-medium-emphasis mb-3">选择需要包含在链接中的设置项。如果不勾选任何设置，将只生成预配置认证链接。</div>

      <div class="d-flex flex-wrap mb-3" style="gap: 8px">
        <v-chip
          v-for="group in settingGroups"
          :key="group.key"
          :color="isGroupSelected(group.key) ? 'primary' : 'default'"
          :variant="isGroupSelected(group.key) ? 'flat' : 'outlined'"
          size="small"
          @click="toggleGroup(group.key)"
        >
          {{ group.label }}
        </v-chip>
        <v-chip color="success" size="small" variant="tonal" @click="selectAll">全选</v-chip>
        <v-chip color="error" size="small" variant="tonal" @click="clearAll">清除选择</v-chip>
      </div>

      <div class="text-caption text-medium-emphasis">已选 {{ selectedKeys.length }} 项设置</div>

      <v-expansion-panels class="mt-2" variant="accordion">
        <v-expansion-panel>
          <v-expansion-panel-title class="text-body-2">显示设置列表详情</v-expansion-panel-title>
          <v-expansion-panel-text>
            <v-list density="compact">
              <v-list-item v-for="key in selectedKeys" :key="key">
                <v-list-item-title class="text-caption">{{ key }}</v-list-item-title>
                <template #append>
                  <span class="text-caption text-medium-emphasis">{{ formatValue(key) }}</span>
                </template>
              </v-list-item>
              <v-list-item v-if="selectedKeys.length === 0">
                <v-list-item-title class="text-caption text-medium-emphasis">尚未选择任何设置</v-list-item-title>
              </v-list-item>
            </v-list>
          </v-expansion-panel-text>
        </v-expansion-panel>
      </v-expansion-panels>
    </v-card>

    <v-card class="ma-2 pa-4" variant="outlined">
      <div class="d-flex align-center mb-3">
        <v-icon class="mr-2" icon="mdi-link" size="small" />
        <span class="font-weight-medium">生成的统一链接</span>
      </div>

      <div class="d-flex flex-wrap mb-3" style="gap: 8px">
        <v-btn color="primary" prepend-icon="mdi-auto-fix" variant="elevated" @click="generate">生成统一链接</v-btn>
        <v-btn :disabled="!link" prepend-icon="mdi-open-in-new" variant="tonal" @click="testLink">测试链接</v-btn>
        <v-btn :disabled="!link" color="error" prepend-icon="mdi-delete" variant="tonal" @click="clearLink">清空所有</v-btn>
      </div>

      <v-text-field
        :model-value="link"
        density="compact"
        placeholder="统一链接"
        readonly
        variant="outlined"
      >
        <template #append-inner>
          <v-btn :disabled="!link" icon="mdi-content-copy" size="small" variant="text" @click="copyLink" />
        </template>
      </v-text-field>
    </v-card>

    <v-alert class="ma-2" type="warning" variant="tonal">
      <div class="font-weight-medium mb-1">安全提醒</div>
      <ul class="text-body-2" style="padding-left: 18px">
        <li>班级码、授权码和设置信息会在 URL 中传输，请谨慎分发</li>
        <li>建议仅在受信任的网络环境中使用</li>
        <li>生产环境建议使用 HTTPS 协议</li>
        <li>链接中不包含任何 Token 等敏感凭证</li>
      </ul>
    </v-alert>

    <v-snackbar v-model="snack.show" :color="snack.color" timeout="2400">{{ snack.text }}</v-snackbar>
  </settings-group>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { getData } from '@/lib/api'
import SettingsGroup from '@/components/settings/SettingGroup.vue'

const form = reactive({ classCode: '', accessCode: '', autoAuth: false })
const selectedKeys = ref<string[]>([])
const link = ref('')
const settings = ref<Record<string, unknown>>({})
const snack = reactive({ show: false, text: '', color: 'success' })

const settingGroups = [
  { key: 'display', label: '显示设置', keys: ['theme', 'showTime', 'showExam', 'showAttendance', 'showNotice', 'showHitokoto', 'clock12h', 'fontScale', 'columns', 'emptySubjectDisplay'] },
  { key: 'edit', label: '编辑设置', keys: ['autoSave', 'autoSavePromptText', 'manualSavePromptText'] },
  { key: 'random', label: '随机点名', keys: ['randomNameMode', 'randomExcludeAbsent', 'showRandomPicker'] },
  { key: 'background', label: '背景设置', keys: ['bgEnabled', 'bgUrl', 'bgBlur', 'bgOpacity'] },
]

function isGroupSelected(groupKey: string): boolean {
  const group = settingGroups.find((item) => item.key === groupKey)
  if (!group) return false
  return group.keys.every((key) => selectedKeys.value.includes(key))
}

function toggleGroup(groupKey: string): void {
  const group = settingGroups.find((item) => item.key === groupKey)
  if (!group) return
  if (isGroupSelected(groupKey)) {
    selectedKeys.value = selectedKeys.value.filter((key) => !group.keys.includes(key))
  } else {
    selectedKeys.value = Array.from(new Set([...selectedKeys.value, ...group.keys]))
  }
}

function selectAll(): void {
  selectedKeys.value = settingGroups.flatMap((group) => group.keys)
}

function clearAll(): void {
  selectedKeys.value = []
}

function formatValue(key: string): string {
  const value = settings.value[key]
  if (value === undefined || value === null || value === '') return '—'
  return String(value).slice(0, 40)
}

function generate(): void {
  const params = new URLSearchParams()
  if (form.classCode.trim()) params.set('classCode', form.classCode.trim())
  if (form.accessCode.trim()) params.set('accessCode', form.accessCode.trim())
  if (form.autoAuth) params.set('autoAuth', '1')
  if (selectedKeys.value.length > 0) {
    const snapshot: Record<string, unknown> = {}
    for (const key of selectedKeys.value) {
      if (settings.value[key] !== undefined) snapshot[key] = settings.value[key]
    }
    params.set('settings', encodeURIComponent(JSON.stringify(snapshot)))
  }
  link.value = window.location.origin + '/bind?' + params.toString()
  snack.text = '已生成统一链接'
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
  form.autoAuth = false
  selectedKeys.value = []
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

onMounted(async () => {
  try {
    const me = await getData<{ settings: Record<string, unknown> }>('/device/me')
    settings.value = me.settings ?? {}
  } catch {
    // 忽略
  }
})
</script>
