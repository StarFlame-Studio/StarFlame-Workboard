<template>
  <div>
    <v-card class="pa-4" variant="flat">
      <div class="list-toolbar">
        <v-text-field
          v-model="keyword"
          class="list-toolbar__search"
          clearable
          density="compact"
          hide-details
          placeholder="搜索班级"
          prepend-inner-icon="mdi-magnify"
          style="max-width: 260px"
          @keyup.enter="load"
        />
        <v-btn variant="tonal" @click="load">搜索</v-btn>
        <span class="text-caption text-medium-emphasis">共 {{ total }} 个班级</span>
        <v-spacer />
        <v-btn prepend-icon="mdi-link-variant" variant="tonal" @click="openJoin">加入班级</v-btn>
        <v-btn v-if="canAdmin" color="primary" prepend-icon="mdi-plus" variant="flat" @click="openCreate">新建班级</v-btn>
      </div>

      <v-data-table :headers="headers" :items="items" :items-per-page="pageSize" :loading="loading" item-value="id">
        <template #loading>
          <SfTableSkeleton :cols="headers.length" :rows="6" />
        </template>
        <template #item.name="{ item }">
          <div class="cell-title">{{ item.name }}</div>
          <div v-if="mobile" class="cell-sub mono">{{ item.classCode }}</div>
        </template>
        <template #item.classCode="{ item }">
          <v-chip size="small" variant="tonal" @click="copy(item.classCode)">{{ item.classCode }}</v-chip>
        </template>
        <template #item.classUid="{ item }">
          <span class="mono">{{ item.classUid }}</span>
        </template>
        <template #item.createdAt="{ item }">
          {{ formatDate(item.createdAt) }}
        </template>
        <template #item.actions="{ item }">
          <v-btn color="primary" size="small" variant="text" :href="'/class?classId=' + item.id">进入看板</v-btn>
          <v-btn v-if="canAdmin" size="small" variant="text" @click="openEdit(item)">编辑</v-btn>
          <v-btn v-if="canAdmin" color="error" size="small" variant="text" @click="askArchive(item)">归档</v-btn>
        </template>
        <template #no-data>
          <div class="py-8 text-medium-emphasis">暂无班级，点击右上角新建</div>
        </template>
      </v-data-table>
    </v-card>

    <!-- 新建班级 -->
    <v-dialog v-model="createOpen" max-width="560">
      <v-card>
        <v-card-title>新建班级</v-card-title>
        <v-card-text>
          <v-text-field v-model="form.name" class="mb-2" label="班级名称" placeholder="高二(3)班" />
          <v-row dense>
            <v-col cols="12" sm="6">
              <v-text-field v-model="form.grade" density="compact" label="年级（可选）" />
            </v-col>
            <v-col cols="12" sm="6">
              <v-text-field v-model="form.school" density="compact" label="学校（可选）" />
            </v-col>
          </v-row>
          <v-text-field
            v-model="form.classCode"
            :rules="codeRules"
            class="mb-2"
            hint="设备登录时填写，可与班级ID相同或不同"
            label="班级码"
            persistent-hint
            placeholder="例如 xingyan-2026"
            prepend-inner-icon="mdi-key-variant"
          />
          <v-text-field
            v-model="form.classUid"
            :rules="codeRules"
            label="班级ID"
            placeholder="例如 C7K2M9Q4TX8A"
            prepend-inner-icon="mdi-fingerprint"
          />
          <div class="text-caption text-warning mb-2">
            请谨慎保存：班级ID 用于「加入班级」与云端数据匹配，丢失后无法找回。
          </div>
        </v-card-text>
        <v-card-actions>
          <v-btn variant="text" @click="createOpen = false">取消</v-btn>
          <v-spacer />
          <v-btn :loading="submitting" color="primary" variant="flat" @click="submit">创建</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- 编辑班级 -->
    <v-dialog v-model="editOpen" max-width="560">
      <v-card>
        <v-card-title>编辑班级</v-card-title>
        <v-card-text>
          <v-text-field v-model="editForm.name" class="mb-2" label="班级名称" />
          <v-row dense>
            <v-col cols="12" sm="6">
              <v-text-field v-model="editForm.grade" density="compact" label="年级" />
            </v-col>
            <v-col cols="12" sm="6">
              <v-text-field v-model="editForm.school" density="compact" label="学校" />
            </v-col>
          </v-row>
          <v-text-field v-model="editForm.classCode" :rules="codeRules" class="mb-2" label="班级码" />
          <v-text-field v-model="editForm.classUid" :rules="codeRules" label="班级ID" prepend-inner-icon="mdi-fingerprint" />
          <div class="text-caption text-warning">
            修改后旧班级ID立即失效，请同步给需要加入班级的老师。
          </div>
        </v-card-text>
        <v-card-actions>
          <v-btn variant="text" @click="editOpen = false">取消</v-btn>
          <v-spacer />
          <v-btn :loading="submitting" color="primary" variant="flat" @click="submitEdit">保存</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- 加入班级 -->
    <v-dialog v-model="joinOpen" max-width="480">
      <v-card>
        <v-card-title>加入已有班级</v-card-title>
        <v-card-text>
          <v-text-field
            v-model="joinUid"
            :rules="codeRules"
            hint="请输入该班级的班级ID（由班级创建者提供）"
            label="班级ID"
            persistent-hint
            prepend-inner-icon="mdi-fingerprint"
          />
        </v-card-text>
        <v-card-actions>
          <v-btn variant="text" @click="joinOpen = false">取消</v-btn>
          <v-spacer />
          <v-btn :loading="submitting" color="primary" variant="flat" @click="submitJoin">加入</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="resultOpen" max-width="520">
      <v-card>
        <v-card-title>请妥善保存班级信息</v-card-title>
        <v-card-text>
          <v-alert class="mb-3" density="compact" type="warning" variant="tonal">
            班级码用于设备登录，班级ID用于加入班级。两者后续都可以在「编辑」里修改。
          </v-alert>
          <v-text-field :model-value="result.classCode" label="班级码" readonly>
            <template #append-inner><v-btn icon="mdi-content-copy" size="small" variant="text" @click="copy(result.classCode)" /></template>
          </v-text-field>
          <v-text-field :model-value="result.classUid" label="班级ID（谨慎保存）" readonly>
            <template #append-inner><v-btn icon="mdi-content-copy" size="small" variant="text" @click="copy(result.classUid)" /></template>
          </v-text-field>
          <v-text-field v-if="result.terminalAccessCode" :model-value="result.terminalAccessCode" label="一体机授权码" readonly>
            <template #append-inner><v-btn icon="mdi-content-copy" size="small" variant="text" @click="copy(result.terminalAccessCode)" /></template>
          </v-text-field>
          <v-text-field v-if="result.teacherAccessCode" :model-value="result.teacherAccessCode" label="教师授权码" readonly>
            <template #append-inner><v-btn icon="mdi-content-copy" size="small" variant="text" @click="copy(result.teacherAccessCode)" /></template>
          </v-text-field>
          <div v-if="result.terminalAccessCode || result.teacherAccessCode" class="text-caption text-medium-emphasis">
            设备登录需要「班级码 + 授权码」：一体机用一体机授权码，老师在手机或办公室电脑上用教师授权码。
            更多授权码、以及外泄后的一键重置，都在「进入看板 → 授权码」里。
          </div>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn color="primary" variant="flat" @click="resultOpen = false">我已记录</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="confirmOpen" max-width="420">
      <v-card>
        <v-card-title>归档班级</v-card-title>
        <v-card-text class="text-body-2">
          确定归档「{{ confirmTarget?.name || '该班级' }}」吗？归档后该班级的大屏与设备将无法继续访问。
        </v-card-text>
        <v-card-actions>
          <v-btn variant="text" @click="confirmOpen = false">取消</v-btn>
          <v-spacer />
          <v-btn :loading="archiving" color="error" variant="flat" @click="doArchive">确认归档</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-snackbar v-model="snack.show" :color="snack.color" timeout="2600">{{ snack.text }}</v-snackbar>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useDisplay } from 'vuetify'
import { deleteData, patchData, postData } from '@/lib/api'
import { loadAllClasses } from '@/lib/classList'
import { useAuthStore } from '@/stores/auth'
import SfTableSkeleton from '@/components/skeleton/SfTableSkeleton.vue'

interface ClassRow {
  id: string
  name: string
  grade: string | null
  school: string | null
  classCode: string
  classUid: string
  ownerName: string | null
  createdAt: string
}

const { mobile } = useDisplay()

const allHeaders = [
  { title: '班级', key: 'name' },
  { title: '年级', key: 'grade' },
  { title: '负责人', key: 'ownerName' },
  { title: '班级码', key: 'classCode', sortable: false },
  { title: '班级ID', key: 'classUid', sortable: false },
  { title: '创建时间', key: 'createdAt' },
  { title: '操作', key: 'actions', sortable: false, align: 'end' as const },
]

/** 移动端只保留关键列，避免横向滚动 */
const headers = computed(() =>
  mobile.value
    ? [
        { title: '班级', key: 'name' },
        { title: '操作', key: 'actions', sortable: false, align: 'end' as const },
      ]
    : allHeaders,
)

const codeRules = [
  (v: string) => Boolean(v && v.trim().length >= 4) || '至少 4 位',
  (v: string) => /^[\x21-\x7E]+$/.test(v ?? '') || '只能使用字母、数字与符号（不含空格）',
]

const items = ref<ClassRow[]>([])
const loading = ref(false)
const submitting = ref(false)
const keyword = ref('')
const pageSize = ref(20)
const total = ref(0)
const createOpen = ref(false)
const editOpen = ref(false)
const auth = useAuthStore()
/** owner/admin 可新建班级；列表里的班级已经是自己创建/加入的，管理员可编辑、归档，教师账号只读 */
const canAdmin = computed(() => auth.user?.role === 'owner' || auth.user?.role === 'admin')
const joinOpen = ref(false)
const resultOpen = ref(false)
const joinUid = ref('')
const result = reactive({ classCode: '', classUid: '', terminalAccessCode: '', teacherAccessCode: '' })
const snack = reactive({ show: false, text: '', color: 'success' })
const form = reactive({ name: '', grade: '', school: '', classCode: '', classUid: '' })
const editForm = reactive({ id: '', name: '', grade: '', school: '', classCode: '', classUid: '' })

function notify(text: string, color = 'success'): void {
  snack.text = text
  snack.color = color
  snack.show = true
}

function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleDateString('zh-CN')
}

async function load(): Promise<void> {
  loading.value = true
  try {
    // 自动翻页取全：服务端每页最多 100 条，只取第一页时班级多了会显示不全
    const response = await loadAllClasses<ClassRow>({ keyword: keyword.value })
    items.value = response.items
    total.value = response.total
  } catch (error) {
    notify(error instanceof Error ? error.message : '加载失败', 'error')
  } finally {
    loading.value = false
  }
}

function openCreate(): void {
  form.name = ''
  form.grade = ''
  form.school = ''
  form.classCode = ''
  form.classUid = ''
  createOpen.value = true
}

function openJoin(): void {
  joinUid.value = ''
  joinOpen.value = true
}

/** 生成一个默认班级ID，方便用户直接用 */
function suggestUid(): string {
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
  let out = 'C'
  for (let i = 0; i < 11; i += 1) out += alphabet[Math.floor(Math.random() * alphabet.length)]
  return out
}

async function submit(): Promise<void> {
  if (submitting.value) return
  if (!form.name.trim()) {
    notify('请填写班级名称', 'error')
    return
  }
  if (!/^[\x21-\x7E]{4,32}$/.test(form.classCode.trim())) {
    notify('班级码需 4-32 位字母/数字/符号', 'error')
    return
  }
  if (!/^[\x21-\x7E]{4,32}$/.test(form.classUid.trim())) {
    notify('班级ID需 4-32 位字母/数字/符号', 'error')
    return
  }
  submitting.value = true
  try {
    const response = await postData<{
      classCode: string
      classUid: string
      terminalAccessCode: string
      teacherAccessCode: string
    }>('/admin/classes', {
      name: form.name.trim(),
      grade: form.grade.trim() || null,
      school: form.school.trim() || null,
      classCode: form.classCode.trim(),
      classUid: form.classUid.trim(),
    })
    createOpen.value = false
    result.classCode = response.classCode
    result.classUid = response.classUid
    result.terminalAccessCode = response.terminalAccessCode
    result.teacherAccessCode = response.teacherAccessCode ?? ''
    resultOpen.value = true
    await load()
  } catch (error) {
    notify(error instanceof Error ? error.message : '创建失败', 'error')
  } finally {
    submitting.value = false
  }
}

function openEdit(item: ClassRow): void {
  editForm.id = item.id
  editForm.name = item.name
  editForm.grade = item.grade ?? ''
  editForm.school = item.school ?? ''
  editForm.classCode = item.classCode
  editForm.classUid = item.classUid
  editOpen.value = true
}

async function submitEdit(): Promise<void> {
  if (submitting.value) return
  submitting.value = true
  try {
    await patchData('/admin/classes/' + editForm.id, {
      name: editForm.name.trim(),
      grade: editForm.grade.trim() || null,
      school: editForm.school.trim() || null,
      classCode: editForm.classCode.trim(),
      classUid: editForm.classUid.trim(),
    })
    editOpen.value = false
    await load()
    notify('已保存')
  } catch (error) {
    notify(error instanceof Error ? error.message : '保存失败', 'error')
  } finally {
    submitting.value = false
  }
}

async function submitJoin(): Promise<void> {
  if (submitting.value) return
  if (!joinUid.value.trim()) {
    notify('请输入班级ID', 'error')
    return
  }
  submitting.value = true
  try {
    const response = await postData<{ id: string; name: string; alreadyJoined: boolean }>('/admin/classes/join', {
      classUid: joinUid.value.trim(),
    })
    joinOpen.value = false
    await load()
    notify(response.alreadyJoined ? '你已在该班级中：' + response.name : '已加入班级：' + response.name)
  } catch (error) {
    notify(error instanceof Error ? error.message : '加入失败', 'error')
  } finally {
    submitting.value = false
  }
}

const confirmOpen = ref(false)
const confirmTarget = ref<ClassRow | null>(null)
const archiving = ref(false)

function askArchive(item: ClassRow): void {
  confirmTarget.value = item
  confirmOpen.value = true
}

async function doArchive(): Promise<void> {
  const target = confirmTarget.value
  if (!target) return
  archiving.value = true
  try {
    await deleteData('/admin/classes/' + target.id)
    confirmOpen.value = false
    confirmTarget.value = null
    await load()
    notify('已归档')
  } catch (error) {
    notify(error instanceof Error ? error.message : '归档失败', 'error')
  } finally {
    archiving.value = false
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

onMounted(async () => {
  if (!auth.user) await auth.loadMe()
  form.classUid = suggestUid()
  load()
})
</script>

<style scoped>
.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 13px;
}
</style>
