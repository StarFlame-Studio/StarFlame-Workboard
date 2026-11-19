<template>
  <div>
    <v-card class="pa-4" variant="flat">
      <div class="list-toolbar">
        <div class="text-subtitle-1 font-weight-bold">后台用户</div>
        <v-spacer />
        <v-btn prepend-icon="mdi-account-plus" color="primary" variant="flat" @click="openCreate">新建用户</v-btn>
      </div>

      <v-data-table :headers="headers" :items="items" :loading="loading" item-value="id">
        <template #loading>
          <SfTableSkeleton :cols="headers.length" :rows="6" />
        </template>
        <template #item.username="{ item }">
          <div class="cell-title">{{ item.username }}</div>
          <div v-if="mobile" class="cell-sub">{{ item.name || item.email || '—' }}</div>
        </template>
        <template #item.role="{ item }">
          <v-chip :color="roleColor(item.role)" size="small" variant="tonal">{{ roleLabel(item.role) }}</v-chip>
        </template>
        <template #item.status="{ item }">
          <v-chip :color="item.status === 'active' ? 'success' : 'secondary'" size="small" variant="flat">
            {{ item.status === 'active' ? '正常' : '停用' }}
          </v-chip>
        </template>
        <template #item.lastLoginAt="{ item }">
          {{ item.lastLoginAt ? formatDate(item.lastLoginAt) : '从未登录' }}
        </template>
        <template #item.actions="{ item }">
          <v-btn size="small" variant="text" @click="openEdit(item)">编辑</v-btn>
          <v-btn color="error" size="small" variant="text" @click="askRemove(item)">删除</v-btn>
        </template>
        <template #no-data>
          <div class="py-8 text-medium-emphasis">暂无用户</div>
        </template>
      </v-data-table>
    </v-card>

    <v-dialog v-model="dialogOpen" max-width="480">
      <v-card>
        <v-card-title>{{ editingId ? '编辑用户' : '新建用户' }}</v-card-title>
        <v-card-text>
          <v-form ref="formRef" @submit.prevent="submit">
            <v-text-field v-model="form.username" :disabled="Boolean(editingId)" :rules="usernameRules" class="mb-2" label="账号" />
            <v-text-field v-model="form.name" class="mb-2" label="姓名" />
            <v-text-field v-model="form.email" :rules="emailRules" class="mb-2" hint="可用于登录（账号或邮箱均可登录）" label="邮箱（可选）" persistent-hint />
            <v-select v-model="form.role" :items="roleOptions" class="mb-2" item-title="label" item-value="value" label="角色" />
            <v-text-field v-model="form.password" :label="editingId ? '新密码（留空不改）' : '密码'" :rules="passwordRules" type="password" />
          </v-form>
        </v-card-text>
        <v-card-actions>
          <v-btn variant="text" @click="dialogOpen = false">取消</v-btn>
          <v-spacer />
          <v-btn :loading="submitting" color="primary" variant="flat" @click="submit">保存</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="confirmOpen" max-width="420">
      <v-card>
        <v-card-title>删除用户</v-card-title>
        <v-card-text class="text-body-2">
          确定删除用户「{{ confirmTarget?.username || '' }}」吗？删除后该账号将无法登录，且不可恢复。
        </v-card-text>
        <v-card-actions>
          <v-btn variant="text" @click="confirmOpen = false">取消</v-btn>
          <v-spacer />
          <v-btn :loading="removing" color="error" variant="flat" @click="doRemove">确认删除</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-snackbar v-model="snack.show" :color="snack.color" timeout="2600">{{ snack.text }}</v-snackbar>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useDisplay } from 'vuetify'
import { deleteData, getData, patchData, postData } from '@/lib/api'
import SfTableSkeleton from '@/components/skeleton/SfTableSkeleton.vue'

interface UserRow {
  id: string
  username: string
  email: string | null
  name: string
  role: 'owner' | 'admin' | 'teacher'
  status: 'active' | 'disabled'
  lastLoginAt: string | null
}

const { mobile } = useDisplay()

const allHeaders = [
  { title: '账号', key: 'username' },
  { title: '邮箱', key: 'email' },
  { title: '姓名', key: 'name' },
  { title: '角色', key: 'role' },
  { title: '状态', key: 'status' },
  { title: '最近登录', key: 'lastLoginAt' },
  { title: '操作', key: 'actions', sortable: false, align: 'end' as const },
]

/** 移动端只保留关键列 */
const headers = computed(() =>
  mobile.value
    ? [
        { title: '账号', key: 'username' },
        { title: '角色', key: 'role' },
        { title: '操作', key: 'actions', sortable: false, align: 'end' as const },
      ]
    : allHeaders,
)

const roleOptions = [
  { label: '超级管理员', value: 'owner' },
  { label: '管理员', value: 'admin' },
  { label: '教师', value: 'teacher' },
]

const items = ref<UserRow[]>([])
const loading = ref(false)
const submitting = ref(false)
const dialogOpen = ref(false)
const editingId = ref('')
const snack = reactive({ show: false, text: '', color: 'success' })
const form = reactive({ username: '', email: '', name: '', role: 'teacher', password: '' })

function roleLabel(role: string): string {
  return roleOptions.find((item) => item.value === role)?.label ?? role
}
function roleColor(role: string): string {
  if (role === 'owner') return 'primary'
  if (role === 'admin') return 'info'
  return 'secondary'
}
function formatDate(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString('zh-CN')
}
function notify(text: string, color = 'success'): void {
  snack.text = text
  snack.color = color
  snack.show = true
}

async function load(): Promise<void> {
  loading.value = true
  try {
    const response = await getData<{ items: UserRow[] }>('/admin/users', { page: 1, pageSize: 100 })
    items.value = response.items
  } catch (error) {
    notify(error instanceof Error ? error.message : '加载失败', 'error')
  } finally {
    loading.value = false
  }
}

function openCreate(): void {
  editingId.value = ''
  form.username = ''
  form.email = ''
  form.name = ''
  form.role = 'teacher'
  form.password = ''
  dialogOpen.value = true
}

function openEdit(item: UserRow): void {
  editingId.value = item.id
  form.username = item.username
  form.email = item.email ?? ''
  form.name = item.name
  form.role = item.role
  form.password = ''
  dialogOpen.value = true
}

async function submit(): Promise<void> {
  if (submitting.value) return
  const checked = await formRef.value?.validate()
  if (checked && !checked.valid) return
  submitting.value = true
  try {
    if (editingId.value) {
      const payload: Record<string, unknown> = { name: form.name, role: form.role, email: form.email.trim() || null }
      if (form.password) payload.password = form.password
      await patchData('/admin/users/' + editingId.value, payload)
    } else {
      await postData('/admin/users', {
        username: form.username.trim(),
        email: form.email.trim() || undefined,
        name: form.name.trim(),
        role: form.role,
        password: form.password,
      })
    }
    dialogOpen.value = false
    await load()
    notify('已保存')
  } catch (error) {
    notify(error instanceof Error ? error.message : '保存失败', 'error')
  } finally {
    submitting.value = false
  }
}

const formRef = ref<{ validate: () => Promise<{ valid: boolean }> } | null>(null)
const confirmOpen = ref(false)
const confirmTarget = ref<UserRow | null>(null)
const removing = ref(false)

const usernameRules = [(v: string) => Boolean((v ?? '').trim()) || '请输入账号']
const emailRules = [(v: string) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || '邮箱格式不正确']
const passwordRules = computed(() => [
  (v: string) => (editingId.value && !v ? true : Boolean(v)) || '请输入密码',
  (v: string) => (!v || (v.length >= 8 && v.length <= 64 && /[a-zA-Z]/.test(v) && /\d/.test(v))) || '密码 8-64 位，需同时包含字母和数字',
])

function askRemove(item: UserRow): void {
  confirmTarget.value = item
  confirmOpen.value = true
}

async function doRemove(): Promise<void> {
  const target = confirmTarget.value
  if (!target) return
  removing.value = true
  try {
    await deleteData('/admin/users/' + target.id)
    confirmOpen.value = false
    confirmTarget.value = null
    await load()
    notify('已删除')
  } catch (error) {
    notify(error instanceof Error ? error.message : '删除失败', 'error')
  } finally {
    removing.value = false
  }
}

onMounted(load)
</script>
