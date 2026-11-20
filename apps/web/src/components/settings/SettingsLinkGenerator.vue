<template>
  <settings-group
    description="生成预配链接：设备打开链接后自动登录并进入作业看板，无需再输入任何内容。可同时预配置设备认证信息与班级设置。"
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
          <v-text-field v-model="form.accessCode" density="compact" hint="留空 = 游客只读登录" label="授权码（可留空）" persistent-hint variant="outlined" />
        </v-col>
        <v-col cols="12">
          <v-text-field
            v-model="form.deviceName"
            density="compact"
            hint="留空则由授权码身份自动命名（一体机 / 老师 / 学生 / 家长 / 游客）"
            label="设备名称（可选）"
            persistent-hint
            variant="outlined"
          />
        </v-col>
      </v-row>

      <v-checkbox v-model="form.autoAuth" density="compact" hide-details label="打开链接即自动登录" />
      <div class="text-caption text-medium-emphasis mb-2">
        开启后设备打开链接会直接登录并进入作业看板；不带授权码时以游客身份只读进入（需班级已开启游客登录）。
      </div>
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

      <div class="text-caption text-medium-emphasis mt-2">
        <v-icon icon="mdi-web" size="x-small" />
        链接域名：{{ webOrigin }}
      </div>

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
import { resolveWebOrigin, webUrl } from '@/lib/webOrigin'
import SettingsGroup from '@/components/settings/SettingGroup.vue'

const form = reactive({ classCode: '', accessCode: '', deviceName: '', autoAuth: true })
/** 生成链接所用的网页域名（桌面端不是 app://local，而是真正的网页地址） */
const webOrigin = resolveWebOrigin()
const selectedKeys = ref<string[]>([])
const link = ref('')
const settings = ref<Record<string, unknown>>({})
const snack = reactive({ show: false, text: '', color: 'success' })

/**
 * 预配链接可携带的设置快照。
 * 这里必须使用与「班级设置」一致的设置键（settingDefs.ts 里的点分键），
 * 否则设备端读不到（看板只认这些键，旧的扁平键已不再写入）。
 */
const settingGroups = [
  {
    key: 'display',
    label: '显示设置',
    keys: [
      'theme.mode',
      'timeCard.enabled',
      'hitokoto.enabled',
      'display.emptySubjectDisplay',
      'display.dynamicSort',
      'display.showRandomButton',
      'display.showFullscreenButton',
      'display.cardHoverEffect',
      'display.enhancedTouchMode',
      'display.showQuickTools',
      'display.showPasteButtons',
      'display.showAntiScreenBurnCard',
      'display.showListCard',
      'display.showExamScheduleButton',
      'display.showAttendance',
      'display.forceDesktopMode',
      'display.lateStudentsArePresent',
      'font.size',
    ],
  },
  {
    key: 'bell',
    label: '课铃偏移',
    keys: ['schedule.bellOffset'],
  },
  {
    key: 'edit',
    label: '编辑设置',
    keys: [
      'edit.autoSave',
      'edit.blockNonTodayAutoSave',
      'edit.confirmNonTodaySave',
      'edit.refreshBeforeEdit',
      'edit.blockPastDataEdit',
      'edit.autoSavePromptText',
      'edit.manualSavePromptText',
    ],
  },
  {
    key: 'random',
    label: '随机点名',
    keys: [
      'randomPicker.enabled',
      'randomPicker.mode',
      'randomPicker.minNumber',
      'randomPicker.maxNumber',
      'randomPicker.defaultCount',
      'randomPicker.animation',
      'randomPicker.excludeAbsent',
      'randomPicker.excludeLate',
      'randomPicker.excludeExcluded',
    ],
  },
  {
    key: 'background',
    label: '背景设置',
    keys: [
      'background.enabled',
      'background.url',
      'background.imageData',
      'background.blur',
      'background.opacity',
    ],
  },
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
  if (form.deviceName.trim()) params.set('deviceName', form.deviceName.trim())
  // 默认带上 autoAuth=1：设备打开链接即自动登录进看板
  if (form.autoAuth) params.set('autoAuth', '1')
  if (selectedKeys.value.length > 0) {
    const snapshot: Record<string, unknown> = {}
    for (const key of selectedKeys.value) {
      if (settings.value[key] !== undefined) snapshot[key] = settings.value[key]
    }
    params.set('settings', encodeURIComponent(JSON.stringify(snapshot)))
  }
  // 必须用真正的网页地址：桌面端页面跑在 app://local，用 location.origin 拼出来的链接发出去打不开
  link.value = webUrl('/bind') + '?' + params.toString()
  snack.text = form.autoAuth ? '已生成预配链接（打开即自动登录）' : '已生成统一链接'
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
  form.deviceName = ''
  form.autoAuth = true
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
