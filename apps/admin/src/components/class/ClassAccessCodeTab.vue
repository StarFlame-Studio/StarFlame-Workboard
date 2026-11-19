<template>
  <div>
    <v-card variant="flat">
      <v-card-text>
        <div class="d-flex align-center flex-wrap mb-3" style="gap: 12px">
          <div>
            <div class="text-subtitle-1 font-weight-medium">设备授权码</div>
            <div class="text-caption text-medium-emphasis">
              设备登录需要「班级码 + 授权码」。一体机通常给读写权限，学生/家长建议只读。
            </div>
          </div>
          <v-spacer />
          <v-btn size="small" variant="tonal" prepend-icon="mdi-refresh" :loading="loading" @click="load">刷新</v-btn>
          <v-btn color="primary" size="small" variant="flat" prepend-icon="mdi-plus" @click="openCreate">新建授权码</v-btn>
        </div>

        <v-alert v-if="error" class="mb-3" density="compact" type="error" variant="tonal">{{ error }}</v-alert>

        <!-- 游客登录：只输班级码即可只读进入，不占用授权码 -->
        <v-card class="mb-4 guest-panel" color="surface" variant="tonal">
          <v-card-text class="d-flex flex-wrap align-center" style="gap: 12px">
            <v-icon icon="mdi-account-outline" size="22" />
            <div class="flex-grow-1" style="min-width: 200px">
              <div class="text-body-2 font-weight-medium">允许游客登录（默认开启）</div>
              <div class="text-caption text-medium-emphasis">
                开启后，只填班级码、不填授权码也能进入看板，只能浏览不能修改；关闭后必须输入授权码。
              </div>
            </div>
            <v-switch
              :disabled="guestSaving || guestLoading"
              :loading="guestSaving || guestLoading"
              :model-value="guestEnabled"
              color="primary"
              density="compact"
              hide-details
              inset
              @update:model-value="(v: unknown) => toggleGuest(v === true)"
            />
          </v-card-text>
        </v-card>

        <v-data-table :headers="headers" :items="items" :loading="loading" item-value="id" density="comfortable">
          <template #loading>
            <SfTableSkeleton :cols="headers.length" :rows="6" />
          </template>
          <template #item.code="{ item }">
            <v-chip class="mono" size="small" variant="tonal" @click="copy(item.code)">{{ item.code }}</v-chip>
            <div v-if="mobile" class="cell-sub">
              {{ roleLabel(item.role) }} · {{ item.permission === 'write' ? '读写' : '只读' }}{{ item.label ? ' · ' + item.label : '' }}
            </div>
          </template>
          <template #item.role="{ item }">
            <v-chip :color="roleColor(item.role)" size="x-small" variant="flat">{{ roleLabel(item.role) }}</v-chip>
          </template>
          <template #item.permission="{ item }">
            <v-chip :color="item.permission === 'write' ? 'success' : 'grey'" size="x-small" variant="tonal">
              {{ item.permission === 'write' ? '读写' : '只读' }}
            </v-chip>
          </template>
          <template #item.status="{ item }">
            <v-chip :color="statusMeta(item).color" size="x-small" variant="tonal">{{ statusMeta(item).text }}</v-chip>
          </template>
          <template #item.lastUsedAt="{ item }">
            <span class="text-caption">{{ item.lastUsedAt ? formatTime(item.lastUsedAt) : '从未使用' }}</span>
          </template>
          <template #item.device="{ item }">
            <span v-if="item.device" class="text-caption">{{ item.device.name }}</span>
            <span v-else class="text-caption text-medium-emphasis">未绑定</span>
          </template>
          <template #item.actions="{ item }">
            <div class="row-actions">
              <v-btn size="small" variant="text" @click="openEdit(item)">编辑</v-btn>
              <v-btn size="small" variant="text" @click="toggleEnabled(item)">{{ item.enabled ? '停用' : '启用' }}</v-btn>
              <v-btn color="error" size="small" variant="text" @click="askDelete(item)">删除</v-btn>
            </div>
          </template>
          <template #no-data>
            <div class="py-8 text-medium-emphasis">暂无授权码，点击右上角新建</div>
          </template>
        </v-data-table>
      </v-card-text>
    </v-card>

    <v-dialog v-model="dialogOpen" max-width="540">
      <v-card>
        <v-card-title>{{ editing ? '编辑授权码' : '新建授权码' }}</v-card-title>
        <v-card-text>
          <v-text-field
            v-model="form.code"
            :rules="codeRules"
            class="mb-2"
            hint="留空自动生成 10 位授权码；至少 6 位"
            label="授权码"
            persistent-hint
            placeholder="留空自动生成"
          />
          <v-row dense>
            <v-col cols="12" sm="6">
              <v-select v-model="form.role" :items="roleOptions" item-title="text" item-value="value" label="身份" />
            </v-col>
            <v-col cols="12" sm="6">
              <v-select v-model="form.permission" :items="permissionOptions" item-title="text" item-value="value" label="权限" />
            </v-col>
          </v-row>
          <v-text-field v-model="form.label" class="mb-2" label="备注（可选）" placeholder="例如 3 号楼一体机" />
          <v-text-field
            v-model="form.expiresAt"
            class="mb-2"
            clearable
            hint="留空表示长期有效"
            label="有效期至（可选）"
            persistent-hint
            type="datetime-local"
          />
          <v-switch v-model="form.enabled" color="primary" density="compact" hide-details inset label="启用" />
        </v-card-text>
        <v-card-actions>
          <v-btn variant="text" @click="dialogOpen = false">取消</v-btn>
          <v-spacer />
          <v-btn :loading="submitting" color="primary" variant="flat" @click="submit">保存</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="deleteOpen" max-width="440">
      <v-card>
        <v-card-title>删除授权码</v-card-title>
        <v-card-text>
          确认删除授权码 <b class="mono">{{ deleting?.code }}</b>？使用该授权码登录的设备会立即掉线，需要重新登录。
        </v-card-text>
        <v-card-actions>
          <v-btn variant="text" @click="deleteOpen = false">取消</v-btn>
          <v-spacer />
          <v-btn :loading="submitting" color="error" variant="flat" @click="confirmDelete">删除</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <ToastBar :toast="toast" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useDisplay } from 'vuetify'
import { SETTING_GUEST_LOGIN } from '@starflame/shared'
import { patchData } from '../../lib/api'
import {
  createAccessCode,
  deleteAccessCode,
  getAccessCodes,
  getClassDetail,
  updateAccessCode,
  type AccessCode,
  type AccessPermission,
  type AccessRole,
} from '../../lib/boardApi'
import { useToast } from '../../composables/useToast'
import SfTableSkeleton from '../skeleton/SfTableSkeleton.vue'
import ToastBar from './ToastBar.vue'

const props = defineProps<{ classId: string }>()

const { mobile } = useDisplay()

const allHeaders = [
  { title: '授权码', key: 'code', sortable: false },
  { title: '身份', key: 'role', sortable: false },
  { title: '权限', key: 'permission', sortable: false },
  { title: '备注', key: 'label', sortable: false },
  { title: '状态', key: 'status', sortable: false },
  { title: '绑定设备', key: 'device', sortable: false },
  { title: '最近使用', key: 'lastUsedAt', sortable: false },
  { title: '操作', key: 'actions', sortable: false, align: 'end' as const },
]

const headers = computed(() =>
  mobile.value
    ? [
        { title: '授权码', key: 'code', sortable: false },
        { title: '状态', key: 'status', sortable: false },
        { title: '操作', key: 'actions', sortable: false, align: 'end' as const },
      ]
    : allHeaders,
)

const roleOptions: Array<{ value: AccessRole; text: string }> = [
  { value: 'terminal', text: '一体机' },
  { value: 'teacher', text: '老师' },
  { value: 'student', text: '学生' },
  { value: 'parent', text: '家长' },
]
const permissionOptions: Array<{ value: AccessPermission; text: string }> = [
  { value: 'write', text: '读写' },
  { value: 'read', text: '只读' },
]

const codeRules = [
  (v: string) => !v || v.trim().length >= 6 || '至少 6 位',
  (v: string) => !v || /^[\x21-\x7E]+$/.test(v) || '只能使用字母、数字与符号（不含空格）',
]

const items = ref<AccessCode[]>([])
const loading = ref(false)
/** 班级设置原始快照：其余键原样回写，避免覆盖其他设置 */
const classSettings = ref<Record<string, unknown>>({})
/** 游客登录开关（缺省开启） */
const guestEnabled = ref(true)
const guestLoading = ref(false)
const guestSaving = ref(false)
const submitting = ref(false)
const error = ref('')
const dialogOpen = ref(false)
const deleteOpen = ref(false)
const editing = ref<AccessCode | null>(null)
const deleting = ref<AccessCode | null>(null)
const { toast, notify } = useToast()

const form = reactive({
  code: '',
  role: 'terminal' as AccessRole,
  permission: 'write' as AccessPermission,
  label: '',
  expiresAt: '',
  enabled: true,
})

function roleLabel(role: AccessRole): string {
  return roleOptions.find((item) => item.value === role)?.text ?? role
}
function roleColor(role: AccessRole): string {
  return role === 'terminal' ? 'primary' : role === 'teacher' ? 'indigo' : role === 'student' ? 'teal' : 'brown'
}
function statusMeta(item: AccessCode): { text: string; color: string } {
  if (!item.enabled) return { text: '已停用', color: 'grey' }
  if (item.expiresAt && new Date(item.expiresAt).getTime() < Date.now()) return { text: '已过期', color: 'error' }
  return { text: '启用中', color: 'success' }
}
function formatTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString('zh-CN', { hour12: false })
}
function toLocalInput(value: string | null): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const offset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

async function load(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    items.value = await getAccessCodes(props.classId)
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败'
  } finally {
    loading.value = false
  }
  await loadGuestSetting()
}

/** 读取班级设置里的游客登录开关（缺省视为开启） */
async function loadGuestSetting(): Promise<void> {
  guestLoading.value = true
  try {
    const detail = await getClassDetail(props.classId)
    classSettings.value = detail.settings ?? {}
    guestEnabled.value = classSettings.value[SETTING_GUEST_LOGIN] !== false
  } catch {
    guestEnabled.value = true
  } finally {
    guestLoading.value = false
  }
}

/** 切换游客登录；写回时保留其余设置键 */
async function toggleGuest(next: boolean): Promise<void> {
  if (guestSaving.value || next === guestEnabled.value) return
  const previous = guestEnabled.value
  guestEnabled.value = next
  guestSaving.value = true
  try {
    const merged = { ...classSettings.value, [SETTING_GUEST_LOGIN]: next }
    await patchData('/admin/classes/' + props.classId, { settings: merged })
    classSettings.value = merged
    notify(next ? '已开启游客登录' : '已关闭游客登录')
  } catch (e) {
    guestEnabled.value = previous
    notify(e instanceof Error ? e.message : '保存失败', 'error')
  } finally {
    guestSaving.value = false
  }
}

function openCreate(): void {
  editing.value = null
  form.code = ''
  form.role = 'terminal'
  form.permission = 'write'
  form.label = ''
  form.expiresAt = ''
  form.enabled = true
  dialogOpen.value = true
}

function openEdit(item: AccessCode): void {
  editing.value = item
  form.code = item.code
  form.role = item.role
  form.permission = item.permission
  form.label = item.label ?? ''
  form.expiresAt = toLocalInput(item.expiresAt)
  form.enabled = item.enabled
  dialogOpen.value = true
}

async function submit(): Promise<void> {
  if (submitting.value) return
  const code = form.code.trim()
  if (code && !/^[\x21-\x7E]{6,32}$/.test(code)) {
    notify('授权码需 6-32 位字母/数字/符号', 'error')
    return
  }
  submitting.value = true
  try {
    const payload = {
      code: code || undefined,
      role: form.role,
      permission: form.permission,
      label: form.label.trim() || null,
      expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
      enabled: form.enabled,
    }
    if (editing.value) {
      await updateAccessCode(editing.value.id, payload)
      notify('已保存')
    } else {
      const created = await createAccessCode(props.classId, payload)
      notify('已创建授权码 ' + created.code)
    }
    dialogOpen.value = false
    await load()
  } catch (e) {
    notify(e instanceof Error ? e.message : '保存失败', 'error')
  } finally {
    submitting.value = false
  }
}

async function toggleEnabled(item: AccessCode): Promise<void> {
  try {
    await updateAccessCode(item.id, { enabled: !item.enabled })
    await load()
    notify(item.enabled ? '已停用，相关设备将掉线' : '已启用')
  } catch (e) {
    notify(e instanceof Error ? e.message : '操作失败', 'error')
  }
}

function askDelete(item: AccessCode): void {
  deleting.value = item
  deleteOpen.value = true
}

async function confirmDelete(): Promise<void> {
  if (!deleting.value || submitting.value) return
  submitting.value = true
  try {
    await deleteAccessCode(deleting.value.id)
    deleteOpen.value = false
    await load()
    notify('已删除')
  } catch (e) {
    notify(e instanceof Error ? e.message : '删除失败', 'error')
  } finally {
    submitting.value = false
  }
}

async function copy(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
    notify('已复制')
  } catch {
    notify('复制失败，请手动记录', 'error')
  }
}

onMounted(load)
</script>

<style scoped>
.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 13px;
}
.guest-panel {
  border-radius: 12px;
}
</style>
