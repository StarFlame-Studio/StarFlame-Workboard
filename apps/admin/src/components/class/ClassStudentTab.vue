<template>
  <div>
    <v-row dense>
      <v-col cols="12" lg="8">
        <v-card variant="outlined" class="pa-4">
          <div class="d-flex flex-wrap align-center ga-2 mb-3">
            <div class="text-subtitle-2">名单</div>
            <v-chip-group :model-value="listId" mandatory selected-class="text-primary" @update:model-value="selectList">
              <v-chip v-for="list in lists" :key="list.id || 'default'" :value="list.id" size="small" variant="tonal" :text="(list.name || '默认名单') + ' · ' + list.studentCount" />
            </v-chip-group>
            <v-spacer />
            <v-btn size="x-small" variant="text" prepend-icon="mdi-playlist-plus" @click="listDialog = true">新建名单</v-btn>
            <v-btn v-if="listId" size="x-small" variant="text" prepend-icon="mdi-pencil-outline" @click="openRenameList">重命名</v-btn>
            <v-btn v-if="listId" size="x-small" variant="text" color="error" prepend-icon="mdi-trash-can-outline" @click="removeList">删除名单</v-btn>
          </div>

          <v-alert v-if="error" type="error" variant="tonal" density="compact" class="mb-3" closable @click:close="error = ''">{{ error }}</v-alert>

          <div class="d-flex flex-wrap align-center ga-2 mb-3">
            <v-text-field v-model="newStudent.name" class="student-add-field" label="姓名" density="compact" variant="outlined" hide-details style="max-width: 180px" maxlength="32" @keydown.enter="addStudent" />
            <v-text-field v-model="newStudent.studentNo" class="student-add-field" label="学号（可选）" density="compact" variant="outlined" hide-details style="max-width: 160px" maxlength="16" @keydown.enter="addStudent" />
            <v-btn size="small" color="primary" variant="flat" prepend-icon="mdi-account-plus" :loading="saving" @click="addStudent">添加</v-btn>
            <v-spacer />
            <v-btn size="small" variant="tonal" prepend-icon="mdi-upload" @click="importDialog = true">批量导入</v-btn>
            <v-btn size="small" variant="text" prepend-icon="mdi-refresh" :loading="loading" @click="loadStudents">刷新</v-btn>
          </div>

          <!-- 骨架：花名册表格（# / 姓名 / 学号 / 状态 / 操作） -->
          <SfTableSkeleton v-if="loading" :cols="5" :rows="6" />
          <div v-else-if="!students.length" class="text-body-2 text-medium-emphasis py-6 text-center">该名单下还没有学生。</div>
          <v-table v-else density="compact">
            <thead>
              <tr>
                <th style="width: 56px">#</th>
                <th>姓名</th>
                <th style="width: 130px">学号</th>
                <th style="width: 100px">状态</th>
                <th style="width: 160px">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(student, index) in students" :key="student.id">
                <td class="text-medium-emphasis">{{ index + 1 }}</td>
                <td>
                  <v-text-field v-if="editingId === student.id" v-model="editingName" density="compact" variant="outlined" hide-details autofocus @keydown.enter="saveRename(student)" @keydown.esc="editingId = ''" />
                  <span v-else class="font-weight-medium text-no-wrap">{{ student.name }}</span>
                </td>
                <td class="text-caption">{{ student.studentNo || '—' }}</td>
                <td>
                  <v-chip size="x-small" variant="tonal" :color="student.status === 'active' ? 'success' : 'default'">{{ student.status === 'active' ? '在册' : '已离开' }}</v-chip>
                </td>
                <td>
                  <div class="row-actions">
                    <v-btn size="x-small" variant="text" @click="startRename(student)">改名</v-btn>
                    <v-btn v-if="student.status === 'active'" size="x-small" variant="text" color="error" @click="removeStudent(student)">移除</v-btn>
                  </div>
                </td>
              </tr>
            </tbody>
          </v-table>
        </v-card>
      </v-col>

      <v-col cols="12" lg="4">
        <v-card variant="outlined" class="pa-4">
          <div class="text-subtitle-2 mb-3">任课教师</div>
          <div class="d-flex ga-2 mb-3">
            <v-text-field v-model="newTeacher.name" label="姓名" density="compact" variant="outlined" hide-details maxlength="32" @keydown.enter="addTeacher" />
            <v-text-field v-model="newTeacher.subject" label="学科" density="compact" variant="outlined" hide-details maxlength="32" style="max-width: 130px" @keydown.enter="addTeacher" />
            <v-btn size="small" color="primary" variant="flat" :loading="savingTeacher" @click="addTeacher">添加</v-btn>
          </div>
          <div v-if="!teachers.length" class="text-body-2 text-medium-emphasis py-4 text-center">还没有教师。</div>
          <v-list v-else density="compact">
            <v-list-item v-for="teacher in teachers" :key="teacher.id">
              <v-list-item-title>{{ teacher.name }}</v-list-item-title>
              <v-list-item-subtitle>{{ teacher.subject || '未填学科' }}</v-list-item-subtitle>
              <template #append>
                <v-btn size="x-small" variant="text" color="error" icon="mdi-delete-outline" @click="removeTeacher(teacher)" />
              </template>
            </v-list-item>
          </v-list>
        </v-card>
      </v-col>
    </v-row>

    <v-dialog v-model="importDialog" max-width="520" persistent>
      <v-card>
        <v-card-title class="text-subtitle-1">批量导入学生</v-card-title>
        <v-card-text>
          <v-textarea v-model="importText" rows="8" variant="outlined" density="compact" placeholder="每行一个姓名，例如：&#10;张三&#10;李四" hide-details />
          <div class="text-caption text-medium-emphasis mt-2">将导入到当前名单，最多 200 人。</div>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="importDialog = false">取消</v-btn>
          <v-btn color="primary" variant="flat" :loading="saving" @click="submitImport">导入</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="listDialog" max-width="420" persistent>
      <v-card>
        <v-card-title class="text-subtitle-1">{{ renamingList ? '重命名名单' : '新建名单' }}</v-card-title>
        <v-card-text>
          <v-text-field v-model="listName" label="名单名称" density="compact" variant="outlined" hide-details maxlength="32" @keydown.enter="submitList" />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="closeListDialog">取消</v-btn>
          <v-btn color="primary" variant="flat" :loading="saving" @click="submitList">保存</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <ToastBar :toast="toast" />
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ApiError } from '../../lib/api'
import {
  createList,
  createStudent,
  createTeacher,
  deleteList,
  deleteStudent,
  deleteTeacher,
  getLists,
  getStudents,
  getTeachers,
  importStudents,
  renameList,
  updateStudent,
  type Student,
  type StudentList,
  type Teacher,
} from '../../lib/boardApi'
import { useToast } from '../../composables/useToast'
import SfTableSkeleton from '../skeleton/SfTableSkeleton.vue'
import ToastBar from './ToastBar.vue'

const props = defineProps<{ classId: string }>()

const { toast, notify } = useToast()
const lists = ref<StudentList[]>([])
const listId = ref('')
const students = ref<Student[]>([])
const teachers = ref<Teacher[]>([])
const loading = ref(true)
const saving = ref(false)
const savingTeacher = ref(false)
const error = ref('')
const newStudent = reactive({ name: '', studentNo: '' })
const newTeacher = reactive({ name: '', subject: '' })
const editingId = ref('')
const editingName = ref('')
const importDialog = ref(false)
const importText = ref('')
const listDialog = ref(false)
const renamingList = ref(false)
const listName = ref('')

function fail(e: unknown, fallback: string) {
  error.value = e instanceof ApiError ? e.message : fallback
}

async function loadLists() {
  try {
    lists.value = await getLists(props.classId)
  } catch (e) {
    fail(e, '加载名单失败')
  }
}

async function loadStudents() {
  loading.value = true
  error.value = ''
  try {
    students.value = await getStudents(props.classId, listId.value)
  } catch (e) {
    fail(e, '加载学生失败')
  } finally {
    loading.value = false
  }
}

function selectList(value: unknown) {
  if (typeof value !== 'string' && value !== null) return
  listId.value = (value as string) || ''
  void loadStudents()
}

async function addStudent() {
  if (!newStudent.name.trim()) return
  saving.value = true
  try {
    await createStudent(props.classId, { name: newStudent.name.trim(), studentNo: newStudent.studentNo.trim() || null, listId: listId.value || undefined })
    newStudent.name = ''
    newStudent.studentNo = ''
    notify('学生已添加')
    await Promise.all([loadStudents(), loadLists()])
  } catch (e) {
    fail(e, '添加失败')
  } finally {
    saving.value = false
  }
}

function startRename(student: Student) {
  editingId.value = student.id
  editingName.value = student.name
}

async function saveRename(student: Student) {
  const name = editingName.value.trim()
  if (!name || name === student.name) {
    editingId.value = ''
    return
  }
  try {
    await updateStudent(props.classId, student.id, { name })
    editingId.value = ''
    notify('已改名')
    await loadStudents()
  } catch (e) {
    fail(e, '改名失败')
  }
}

async function removeStudent(student: Student) {
  try {
    await deleteStudent(props.classId, student.id)
    notify('已移除 ' + student.name)
    await Promise.all([loadStudents(), loadLists()])
  } catch (e) {
    fail(e, '移除失败')
  }
}

async function submitImport() {
  const text = importText.value.trim()
  if (!text) return
  saving.value = true
  try {
    const result = await importStudents(props.classId, text)
    notify('已导入 ' + result.imported + ' 名学生')
    importDialog.value = false
    importText.value = ''
    await Promise.all([loadStudents(), loadLists()])
  } catch (e) {
    fail(e, '导入失败')
  } finally {
    saving.value = false
  }
}

function closeListDialog() {
  listDialog.value = false
  renamingList.value = false
  listName.value = ''
}

function openRenameList() {
  const current = lists.value.find((l) => l.id === listId.value)
  renamingList.value = true
  listName.value = current?.name ?? ''
  listDialog.value = true
}

async function submitList() {
  const name = listName.value.trim()
  if (!name) return
  saving.value = true
  try {
    if (renamingList.value) {
      await renameList(props.classId, listId.value, name)
      notify('名单已重命名')
    } else {
      const created = await createList(props.classId, name)
      notify('名单已创建')
      listId.value = created.id
    }
    closeListDialog()
    await Promise.all([loadLists(), loadStudents()])
  } catch (e) {
    fail(e, '保存名单失败')
  } finally {
    saving.value = false
  }
}

async function removeList() {
  if (!listId.value) return
  try {
    await deleteList(props.classId, listId.value)
    notify('名单已删除，学生已回到默认名单')
    listId.value = ''
    await Promise.all([loadLists(), loadStudents()])
  } catch (e) {
    fail(e, '删除名单失败')
  }
}

async function loadTeachers() {
  try {
    teachers.value = await getTeachers(props.classId)
  } catch (e) {
    fail(e, '加载教师失败')
  }
}

async function addTeacher() {
  if (!newTeacher.name.trim()) return
  savingTeacher.value = true
  try {
    await createTeacher(props.classId, { name: newTeacher.name.trim(), subject: newTeacher.subject.trim() || null })
    newTeacher.name = ''
    newTeacher.subject = ''
    notify('教师已添加')
    await loadTeachers()
  } catch (e) {
    fail(e, '添加教师失败')
  } finally {
    savingTeacher.value = false
  }
}

async function removeTeacher(teacher: Teacher) {
  try {
    await deleteTeacher(props.classId, teacher.id)
    await loadTeachers()
  } catch (e) {
    fail(e, '删除教师失败')
  }
}

onMounted(async () => {
  await Promise.all([loadLists(), loadStudents(), loadTeachers()])
})
</script>
