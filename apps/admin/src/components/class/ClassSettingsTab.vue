<template>
  <div>
    <div class="d-flex flex-wrap align-center ga-2 mb-4">
      <v-btn-toggle :model-value="mode" density="compact" variant="outlined" divided mandatory @update:model-value="(v: unknown) => (mode = v as 'form' | 'json')">
        <v-btn value="form" size="small" prepend-icon="mdi-format-list-bulleted-square">分组表单</v-btn>
        <v-btn value="json" size="small" prepend-icon="mdi-code-json">原始 JSON</v-btn>
      </v-btn-toggle>
      <v-spacer />
      <v-btn size="small" variant="tonal" prepend-icon="mdi-refresh" :loading="loading" @click="load">重新加载</v-btn>
      <v-btn size="small" color="primary" variant="flat" prepend-icon="mdi-content-save" :loading="saving" :disabled="!dirtyCount" @click="mode === 'json' ? saveJson() : saveForm()">
        保存{{ dirtyCount ? '（' + dirtyCount + '）' : '' }}
      </v-btn>
    </div>

    <v-alert v-if="error" type="error" variant="tonal" density="compact" class="mb-4" closable @click:close="error = ''">{{ error }}</v-alert>
    <v-alert type="info" variant="tonal" density="compact" class="mb-4">
      这里修改的是该班级的看板设置，保存后大屏会在数秒内自动刷新。
    </v-alert>

    <!-- 骨架：分组设置卡片（左侧标签条 + 右侧控件块） -->
    <v-row v-if="loading" dense>
      <v-col v-for="n in 4" :key="'set-skel-' + n" cols="12" lg="6">
        <div class="sf-skel-surface sf-skel-tile">
          <div class="sf-skel-tile__head">
            <SfSkeleton circle :w="18" />
            <SfSkeleton w="34%" h="13px" radius="6px" />
          </div>
          <div v-for="f in 4" :key="f" class="sf-skel-field">
            <div class="sf-skel-field__label">
              <SfSkeleton w="72%" h="12px" radius="6px" />
              <SfSkeleton w="48%" h="9px" radius="5px" />
            </div>
            <div class="sf-skel-field__control">
              <SfSkeleton w="100%" h="34px" radius="10px" />
            </div>
          </div>
        </div>
      </v-col>
    </v-row>

    <template v-else-if="mode === 'json'">
      <v-textarea v-model="jsonText" rows="26" variant="outlined" density="compact" hide-details class="json-box" spellcheck="false" />
      <div class="text-caption text-medium-emphasis mt-2">{{ jsonHint }}</div>
    </template>

    <v-row v-else dense>
      <v-col v-for="group in SETTING_GROUPS" :key="group.key" cols="12" lg="6">
        <v-card variant="outlined" class="h-100">
          <v-card-title class="text-subtitle-2 d-flex align-center ga-2">
            <v-icon size="18">{{ group.icon }}</v-icon>
            {{ group.title }}
          </v-card-title>
          <v-divider />
          <v-card-text>
            <div v-for="field in group.fields" :key="field.key" class="field-row">
              <div class="field-label">
                <div class="text-body-2">{{ field.title }}</div>
                <div class="text-caption text-medium-emphasis">
                  {{ field.key }}
                  <span v-if="isDefaultValue(field.key)" class="text-disabled">· 默认值</span>
                </div>
                <div v-if="field.hint" class="text-caption text-disabled">{{ field.hint }}</div>
              </div>
              <div class="field-control">
                <v-switch
                  v-if="field.type === 'bool'"
                  :model-value="form[field.key] === true"
                  color="primary"
                  density="compact"
                  hide-details
                  inset
                  @update:model-value="(v: unknown) => setField(field, v === true)"
                />
                <v-text-field
                  v-else-if="field.type === 'number'"
                  :model-value="form[field.key]"
                  type="number"
                  density="compact"
                  variant="outlined"
                  hide-details
                  :min="field.min"
                  :max="field.max"
                  :step="field.step ?? 1"
                  style="max-width: 150px"
                  @update:model-value="(v: unknown) => setField(field, Number(v))"
                />
                <v-select
                  v-else-if="field.type === 'select'"
                  :model-value="form[field.key]"
                  :items="field.options"
                  density="compact"
                  variant="outlined"
                  hide-details
                  style="max-width: 230px"
                  @update:model-value="(v: unknown) => setField(field, v)"
                />
                <v-textarea
                  v-else-if="field.type === 'json'"
                  :model-value="stringify(form[field.key])"
                  rows="2"
                  auto-grow
                  density="compact"
                  variant="outlined"
                  hide-details
                  spellcheck="false"
                  @update:model-value="(v: unknown) => setJsonField(field, String(v ?? ''))"
                />
                <v-text-field
                  v-else
                  :model-value="form[field.key]"
                  density="compact"
                  variant="outlined"
                  hide-details
                  style="max-width: 240px"
                  @update:model-value="(v: unknown) => setField(field, v)"
                />
              </div>
            </div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <ToastBar :toast="toast" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ApiError } from '../../lib/api'
import { getBootstrap, patchSettings } from '../../lib/boardApi'
import { MIRROR_FIELDS, SETTING_GROUPS, type MirrorField } from '../../lib/settingMirror'
import { useToast } from '../../composables/useToast'
import SfSkeleton from '../skeleton/SfSkeleton.vue'
import ToastBar from './ToastBar.vue'

const props = defineProps<{ classId: string }>()

const { toast, notify } = useToast()
const mode = ref<'form' | 'json'>('form')
const loading = ref(true)
const saving = ref(false)
const error = ref('')
const original = ref<Record<string, unknown>>({})
const form = reactive<Record<string, unknown>>({})
const touched = ref<Set<string>>(new Set())
const jsonText = ref('')
const jsonHint = ref('')

const dirtyCount = computed(() => {
  if (mode.value === 'json') return jsonText.value === stringify(original.value) ? 0 : 1
  return touched.value.size
})

function stringify(value: unknown): string {
  if (value === undefined) return ''
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch {
    return ''
  }
}

function setField(field: MirrorField, value: unknown) {
  let next = value
  if (field.type === 'number') {
    const number = Number(value)
    if (!Number.isFinite(number)) return
    const min = field.min ?? Number.NEGATIVE_INFINITY
    const max = field.max ?? Number.POSITIVE_INFINITY
    next = Math.min(max, Math.max(min, number))
  }
  form[field.key] = next
  if (next === original.value[field.key]) {
    touched.value.delete(field.key)
  } else {
    touched.value.add(field.key)
  }
}

function setJsonField(field: MirrorField, raw: string) {
  try {
    const parsed = raw.trim() ? JSON.parse(raw) : null
    form[field.key] = parsed
    if (JSON.stringify(parsed) === JSON.stringify(original.value[field.key])) {
      touched.value.delete(field.key)
    } else {
      touched.value.add(field.key)
    }
  } catch {
    error.value = field.title + ' 不是合法的 JSON，已忽略本次修改'
  }
}

function hydrate(settings: Record<string, unknown>) {
  original.value = { ...settings }
  for (const key of Object.keys(form)) delete form[key]
  for (const field of MIRROR_FIELDS) {
    form[field.key] = settings[field.key] === undefined ? field.default : settings[field.key]
  }
  for (const [key, value] of Object.entries(settings)) form[key] = value
  touched.value = new Set()
  jsonText.value = JSON.stringify(settings, null, 2)
  jsonHint.value = Object.keys(settings).length === 0 ? '该班级尚未保存任何自定义设置，下列为系统默认值。' : ''
}

function isDefaultValue(key: string): boolean {
  return original.value[key] === undefined
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const data = await getBootstrap(props.classId)
    hydrate(data.settings)
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : '加载设置失败'
  } finally {
    loading.value = false
  }
}

async function persist(payload: Record<string, unknown>, message: string) {
  saving.value = true
  error.value = ''
  try {
    const result = await patchSettings(props.classId, payload)
    hydrate(result.settings)
    notify(message)
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : '保存失败'
  } finally {
    saving.value = false
  }
}

async function saveForm() {
  if (!touched.value.size) return
  const payload: Record<string, unknown> = { ...original.value }
  for (const key of touched.value) payload[key] = form[key]
  await persist(payload, '设置已保存')
}

async function saveJson() {
  let parsed: unknown
  try {
    parsed = JSON.parse(jsonText.value || '{}')
  } catch {
    error.value = 'JSON 格式不正确，无法保存'
    return
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    error.value = '设置必须是一个 JSON 对象'
    return
  }
  await persist(parsed as Record<string, unknown>, '设置已保存')
}

onMounted(load)
</script>

<style scoped>
.field-row {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 6px 0;
}
.field-label {
  flex: 1 1 auto;
  min-width: 0;
}
.field-control {
  flex: 0 0 auto;
  display: flex;
  justify-content: flex-end;
  min-width: 200px;
  max-width: 260px;
}
.field-control :deep(.v-input) {
  flex: 1 1 auto;
}
@media (max-width: 700px) {
  .field-row {
    flex-direction: column;
    align-items: stretch;
    gap: 4px;
    padding: 8px 0;
  }
  .field-control {
    min-width: 0;
    max-width: 100%;
    justify-content: flex-start;
  }
}
.json-box :deep(textarea) {
  font-family: 'JetBrains Mono', Consolas, monospace;
  font-size: 12px;
  line-height: 1.5;
}
</style>
