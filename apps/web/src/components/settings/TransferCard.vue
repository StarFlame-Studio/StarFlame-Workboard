<template>
  <settings-card icon="mdi-cloud-sync-outline" subtitle="导出当前班级的全部云端设置，或从备份文件快速恢复" title="备份与迁移">
    <div class="text-body-2 text-medium-emphasis mb-3">
      导出的文件包含本班所有「会同步到云端」的设置项（显示、编辑、科目模板、作息、通知铃声、一言、随机点名、背景等）。科目本身、花名册、作业与通知属于独立数据，不在备份范围内。
    </div>

    <v-row dense>
      <v-col cols="12" sm="6">
        <v-card border class="pa-3 h-100" variant="flat">
          <div class="d-flex align-center mb-2">
            <v-icon class="mr-2" color="primary" icon="mdi-download" />
            <span class="text-subtitle-2 font-weight-bold">导出设置</span>
          </div>
          <div class="text-caption text-medium-emphasis mb-3">
            共 {{ settingCount }} 项设置，约 {{ sizeText }}；文件名带班级名与时间，便于归档。
          </div>
          <v-btn :loading="exporting" block color="primary" prepend-icon="mdi-file-export-outline" variant="elevated" @click="exportSettings">
            导出为 JSON 文件
          </v-btn>
          <v-btn block class="mt-2" prepend-icon="mdi-content-copy" variant="text" @click="copyJson">
            复制到剪贴板
          </v-btn>
        </v-card>
      </v-col>

      <v-col cols="12" sm="6">
        <v-card border class="pa-3 h-100" variant="flat">
          <div class="d-flex align-center mb-2">
            <v-icon class="mr-2" color="secondary" icon="mdi-upload" />
            <span class="text-subtitle-2 font-weight-bold">导入设置</span>
          </div>
          <div class="text-caption text-medium-emphasis mb-3">
            选择之前导出的 JSON 文件，确认后覆盖同名设置项（未包含的设置项保持不变）。
          </div>
          <v-btn :disabled="readOnly" :loading="importing" block color="secondary" prepend-icon="mdi-file-import-outline" variant="elevated" @click="pickFile">
            选择备份文件
          </v-btn>
          <input ref="fileInput" accept=".json,application/json" class="d-none" type="file" @change="onFileChange" />
          <div v-if="readOnly" class="text-caption text-warning mt-2">当前设备为只读授权，无法导入设置</div>
        </v-card>
      </v-col>
    </v-row>

    <v-alert v-if="error" class="mt-3" closable density="compact" type="error" variant="tonal" @click:close="error = ''">
      {{ error }}
    </v-alert>

    <v-dialog v-model="confirm.open" max-width="560">
      <v-card>
        <v-card-title class="d-flex align-center">
          <v-icon class="mr-2" color="secondary">mdi-file-import-outline</v-icon>
          确认导入设置
          <v-spacer />
          <v-btn icon="mdi-close" variant="text" @click="confirm.open = false" />
        </v-card-title>
        <v-card-subtitle class="pb-2">{{ confirm.fileName }}</v-card-subtitle>
        <v-card-text>
          <div class="text-body-2 mb-3">
            将导入 <strong>{{ confirm.keys.length }}</strong> 项设置
            <span v-if="confirm.from">（导出自：{{ confirm.from }}）</span>，覆盖本班同名设置项。
          </div>
          <v-chip-group column>
            <v-chip v-for="key in confirm.keys.slice(0, 24)" :key="key" size="small" variant="tonal">{{ key }}</v-chip>
            <v-chip v-if="confirm.keys.length > 24" size="small" variant="text">… 另有 {{ confirm.keys.length - 24 }} 项</v-chip>
          </v-chip-group>
        </v-card-text>
        <v-card-actions>
          <v-btn variant="text" @click="confirm.open = false">取消</v-btn>
          <v-spacer />
          <v-btn :loading="importing" color="secondary" variant="elevated" @click="applyImport">确认导入</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-snackbar v-model="snack.show" :color="snack.color" timeout="2600">{{ snack.text }}</v-snackbar>
  </settings-card>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { getData, patchData } from '@/lib/api'
import { useSessionStore } from '@/stores/session'
import SettingsCard from '@/components/settings/SettingsCard.vue'
import { markSettingsDirty } from '@/lib/settingsDirty'

/** 备份文件格式标识与版本 */
const FORMAT = 'starflame-board-settings'
const VERSION = 1
/** 仅本机生效的设置项：不导出、不导入 */
const LOCAL_ONLY_KEYS = ['theme.mode']
/** 预览用的设置项名（中文提示，缺失时直接显示键名） */
const KEY_LABELS: Record<string, string> = {
  'font.size': '看板正文字号',
  'display.emptySubjectDisplay': '空科目展示方式',
  'display.showAttendance': '出勤统计卡片',
  'timeCard.enabled': '时间卡片',
  'hitokoto.enabled': '一言卡片',
  'background.enabled': '背景图',
  'theme.card': '卡片主题',
  'randomPicker.enabled': '随机点名',
  examCardIds: '考试卡片',
  'schedule.weekly': '作息时间',
  'schedule.periods': '课程时间段',
  'schedule.bellOffset': '课铃偏移时间（秒）',
  // 旧键：早期版本曾支持按周几分别设置偏移
  'schedule.bellOffsetAuto': '每天自动调整课铃偏移（旧）',
  'schedule.bellOffsets': '每天的课铃偏移（旧）',
  homeworkTemplate: '作业模板',
  // 旧扁平键：历史备份文件里仍可能出现
  'fontScale': '字体缩放',
  clock12h: '12 小时制',
  emptySubjectDisplay: '空科目展示方式（旧）',
  hitokoto: '一言（旧）',
  randomPicker: '随机点名（旧）',
  background: '背景（旧）',
  'notification.sound': '通知铃声',
}

const session = useSessionStore()
const readOnly = computed(() => session.readOnly)

const fileInput = ref<HTMLInputElement | null>(null)
const exporting = ref(false)
const importing = ref(false)
const error = ref('')
const snack = reactive({ show: false, text: '', color: 'success' })
const confirm = reactive({ open: false, keys: [] as string[], from: '', settings: {} as Record<string, unknown>, fileName: '' })

const remoteSettings = ref<Record<string, unknown>>({})
const settingCount = computed(() => Object.keys(remoteSettings.value).length)
const sizeText = computed(() => {
  const bytes = new Blob([JSON.stringify(remoteSettings.value)]).size
  return bytes < 1024 ? bytes + ' B' : (bytes / 1024).toFixed(1) + ' KB'
})

function notify(text: string, color = 'success'): void {
  snack.text = text
  snack.color = color
  snack.show = true
}

function pick<T extends Record<string, unknown>>(source: T): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(source ?? {})) {
    if (LOCAL_ONLY_KEYS.includes(key)) continue
    out[key] = value
  }
  return out
}

async function loadSettings(): Promise<void> {
  try {
    const me = await getData<{ settings: Record<string, unknown> }>('/device/me')
    remoteSettings.value = pick(me.settings ?? {})
  } catch (e) {
    error.value = e instanceof Error ? e.message : '读取设置失败'
  }
}

function buildPayload(): Record<string, unknown> {
  const className = session.classInfo?.name ?? '班级'
  const now = new Date()
  return {
    format: FORMAT,
    version: VERSION,
    exportedAt: now.toISOString(),
    class: { id: session.classId, name: className },
    settings: pick(remoteSettings.value),
  }
}

function fileName(): string {
  const className = (session.classInfo?.name ?? 'class').replace(/[\\/:*?"<>|\s]+/g, '')
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')
  return '星焰作业板设置-' + className + '-' + stamp + '.json'
}

async function exportSettings(): Promise<void> {
  exporting.value = true
  error.value = ''
  try {
    await loadSettings()
    const text = JSON.stringify(buildPayload(), null, 2)
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = fileName()
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 4000)
    notify('已导出 ' + settingCount.value + ' 项设置')
  } catch (e) {
    error.value = e instanceof Error ? e.message : '导出失败'
  } finally {
    exporting.value = false
  }
}

async function copyJson(): Promise<void> {
  try {
    await loadSettings()
    await navigator.clipboard.writeText(JSON.stringify(buildPayload(), null, 2))
    notify('已复制到剪贴板')
  } catch (e) {
    error.value = e instanceof Error ? e.message : '复制失败'
  }
}

function pickFile(): void {
  if (readOnly.value) {
    notify('当前设备为只读授权，无法导入设置', 'warning')
    return
  }
  fileInput.value?.click()
}

async function onFileChange(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  error.value = ''
  try {
    const parsed = JSON.parse(await file.text()) as { format?: string; version?: number; settings?: unknown; class?: { name?: string } }
    const raw = (parsed.settings ?? {}) as Record<string, unknown>
    if (parsed.format !== FORMAT) {
      error.value = '文件格式不匹配：请选择本系统导出的备份文件'
      return
    }
    if (Number(parsed.version) > VERSION) {
      error.value = '备份文件版本过新，请先升级前端后再导入'
      return
    }
    const settings = pick(raw)
    const keys = Object.keys(settings)
    if (keys.length === 0) {
      error.value = '备份文件里没有可导入的设置项'
      return
    }
    confirm.settings = settings
    confirm.keys = keys
    confirm.from = parsed.class?.name ?? ''
    confirm.fileName = file.name
    confirm.open = true
  } catch (e) {
    error.value = e instanceof Error ? e.message : '读取文件失败'
  }
}

async function applyImport(): Promise<void> {
  if (importing.value) return
  importing.value = true
  error.value = ''
  try {
    await patchData('/board/settings', { settings: confirm.settings })
    markSettingsDirty()
    confirm.open = false
    await loadSettings()
    notify('已导入 ' + confirm.keys.length + ' 项设置，重新进入页面后全部生效')
  } catch (e) {
    error.value = e instanceof Error ? e.message : '导入失败'
  } finally {
    importing.value = false
  }
}

onMounted(loadSettings)
</script>

<style scoped>
.h-100 {
  height: 100%;
}
</style>
