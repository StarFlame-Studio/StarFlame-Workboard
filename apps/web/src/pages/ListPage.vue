<template>
  <v-app-bar elevation="1" height="64">
    <v-btn aria-label="返回看板" icon="mdi-arrow-left" title="返回看板" @click="go('board')" />
    <v-app-bar-title class="text-h6">列表</v-app-bar-title>
  </v-app-bar>

  <v-main>
  <v-container class="py-4 px-4" max-width="980">
    <v-card border class="mb-5" rounded="xl">
      <v-card-title>现有列表</v-card-title>
      <v-card-text v-if="lists.length === 0">暂无列表，请创建新列表</v-card-text>
      <v-list v-else>
        <v-list-item
          v-for="list in lists"
          :key="list.id || 'default'"
          :active="list.id === activeListId"
          @click="selectList(list.id)"
        >
          <template #prepend>
            <v-icon class="mr-3" color="primary">mdi-account-multiple-outline</v-icon>
          </template>
          <v-list-item-title>{{ list.name }}</v-list-item-title>
          <v-list-item-subtitle>{{ list.studentCount }} 人</v-list-item-subtitle>
          <template #append>
            <v-btn aria-label="重命名列表" icon="mdi-pencil" size="small" title="重命名" variant="text" @click.stop="startRename(list)" />
            <v-btn v-if="list.id" aria-label="删除列表" color="error" icon="mdi-delete" size="small" title="删除列表" variant="text" @click.stop="confirmDeleteList(list)" />
          </template>
        </v-list-item>
      </v-list>
    </v-card>

    <v-card border class="mb-5" rounded="xl">
      <v-card-title>创建新列表</v-card-title>
      <v-card-text>
        <v-text-field v-model="newListName" class="mb-2" label="列表名称" />
        <v-btn :disabled="!newListName.trim()" color="primary" @click="createList">创建列表</v-btn>
      </v-card-text>
    </v-card>

    <v-card border class="mb-5" rounded="xl">
      <v-card-title class="d-flex align-center">
        {{ activeListName }} · 学生
        <v-spacer />
        <v-btn prepend-icon="mdi-upload" size="small" variant="text" @click="importOpen = true">批量导入</v-btn>
      </v-card-title>
      <v-card-text>
        <div class="d-flex mb-4" style="gap: 8px">
          <v-text-field v-model="newName" density="compact" hide-details label="姓名" style="max-width: 180px" />
          <v-text-field v-model="newNo" density="compact" hide-details label="学号（可选）" style="max-width: 160px" />
          <v-btn :disabled="!newName.trim()" :loading="adding" color="primary" variant="flat" @click="addStudent">添加</v-btn>
        </div>

        <list-skeleton v-if="loading" :rows="6" avatar chip />
        <div v-else-if="students.length === 0" class="py-8 text-center text-medium-emphasis">
          <v-icon class="mb-2" icon="mdi-account-off-outline" size="36" />
          <div>该列表还没有学生</div>
        </div>
        <div v-else class="student-chips">
          <v-chip
            v-for="student in students"
            :key="student.id"
            closable
            variant="tonal"
            @click:close="removeStudent(student)"
          >
            {{ student.name }}<span v-if="student.studentNo" class="text-caption ml-1">({{ student.studentNo }})</span>
          </v-chip>
        </div>
      </v-card-text>
    </v-card>
  </v-container>

  <v-dialog v-model="renameOpen" max-width="420">
    <v-card>
      <v-card-title>重命名列表</v-card-title>
      <v-card-text><v-text-field v-model="renameText" label="列表名称" /></v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="renameOpen = false">取消</v-btn>
        <v-btn color="primary" :disabled="!renameText.trim()" variant="elevated" @click="doRename">确定</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <v-dialog v-model="importOpen" max-width="520">
    <v-card>
      <v-card-title>批量导入</v-card-title>
      <v-card-subtitle>每行一个姓名，最多 200 人</v-card-subtitle>
      <v-card-text><v-textarea v-model="importText" auto-grow placeholder="张三&#10;李四" rows="8" /></v-card-text>
      <v-card-actions>
        <v-btn variant="text" @click="importOpen = false">取消</v-btn>
        <v-spacer />
        <v-btn :loading="importing" color="primary" variant="elevated" @click="doImport">导入</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <v-snackbar v-model="snack.show" :color="snack.color" timeout="2400">{{ snack.text }}</v-snackbar>
  </v-main>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import type { StudentItem } from '@starflame/shared'
import { deleteData, getData, patchData, postData } from '@/lib/api'
import { navigate, type PageName } from '@/lib/nav'
import ListSkeleton from '@/components/skeleton/ListSkeleton.vue'

function go(page: PageName): void {
  navigate(page)
}

interface ListItem {
  id: string
  name: string
  isDefault: boolean
  studentCount: number
}

const lists = ref<ListItem[]>([])
const students = ref<StudentItem[]>([])
const activeListId = ref('')
// 首屏即显示骨架：loadLists 也要等网络，先占位避免闪出「暂无列表」
const loading = ref(true)
const adding = ref(false)
const importing = ref(false)
const newListName = ref('')
const newName = ref('')
const newNo = ref('')
const importOpen = ref(false)
const importText = ref('')
const renameOpen = ref(false)
const renameText = ref('')
const renamingId = ref('')
const snack = reactive({ show: false, text: '', color: 'success' })

const activeListName = computed(() => lists.value.find((item) => item.id === activeListId.value)?.name ?? '默认名单')

function notify(text: string, color = 'success'): void {
  snack.text = text
  snack.color = color
  snack.show = true
}

async function loadLists(): Promise<void> {
  try {
    const result = await getData<{ items: ListItem[] }>('/board/lists')
    lists.value = result.items
    if (lists.value.length > 0 && !lists.value.some((item) => item.id === activeListId.value)) {
      activeListId.value = lists.value[0]?.id ?? ''
    }
  } catch (error) {
    notify(error instanceof Error ? error.message : '加载失败', 'error')
  }
}

async function loadStudents(): Promise<void> {
  loading.value = true
  try {
    const result = await getData<{ items: StudentItem[] }>('/board/students', {
      listId: activeListId.value || undefined,
    })
    students.value = result.items
  } catch (error) {
    notify(error instanceof Error ? error.message : '加载失败', 'error')
  } finally {
    loading.value = false
  }
}

async function selectList(id: string): Promise<void> {
  activeListId.value = id
  await loadStudents()
}

async function createList(): Promise<void> {
  const name = newListName.value.trim()
  if (!name) return
  try {
    await postData('/board/lists', { name })
    newListName.value = ''
    await loadLists()
    notify('已创建列表')
  } catch (error) {
    notify(error instanceof Error ? error.message : '创建失败', 'error')
  }
}

function startRename(list: ListItem): void {
  renamingId.value = list.id
  renameText.value = list.name
  renameOpen.value = true
}

async function doRename(): Promise<void> {
  const name = renameText.value.trim()
  if (!name) return
  try {
    if (renamingId.value) {
      await patchData('/board/lists/' + renamingId.value, { name })
    } else {
      notify('默认名单不支持重命名', 'warning')
      renameOpen.value = false
      return
    }
    renameOpen.value = false
    await loadLists()
    notify('已重命名')
  } catch (error) {
    notify(error instanceof Error ? error.message : '重命名失败', 'error')
  }
}

async function confirmDeleteList(list: ListItem): Promise<void> {
  if (!list.id) return
  if (!window.confirm('确定删除列表「' + list.name + '」吗？名单里的学生会移到默认名单。')) return
  try {
    await deleteData('/board/lists/' + list.id)
    await loadLists()
    await loadStudents()
    notify('已删除')
  } catch (error) {
    notify(error instanceof Error ? error.message : '删除失败', 'error')
  }
}

async function addStudent(): Promise<void> {
  const name = newName.value.trim()
  if (!name || adding.value) return
  adding.value = true
  try {
    await postData('/board/students', {
      name,
      studentNo: newNo.value.trim() || null,
      listId: activeListId.value || null,
    })
    newName.value = ''
    newNo.value = ''
    await loadStudents()
    await loadLists()
    notify('已添加')
  } catch (error) {
    notify(error instanceof Error ? error.message : '添加失败', 'error')
  } finally {
    adding.value = false
  }
}

async function removeStudent(student: StudentItem): Promise<void> {
  try {
    await patchData('/board/students/' + student.id, { status: 'left' })
    students.value = students.value.filter((item) => item.id !== student.id)
    await loadLists()
    notify('已移出名单')
  } catch (error) {
    notify(error instanceof Error ? error.message : '操作失败', 'error')
  }
}

async function doImport(): Promise<void> {
  const text = importText.value.trim()
  if (!text || importing.value) return
  importing.value = true
  try {
    const names = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 200)
    for (const name of names) {
      await postData('/board/students', { name, listId: activeListId.value || null })
    }
    importOpen.value = false
    importText.value = ''
    await loadStudents()
    await loadLists()
    notify('已导入 ' + names.length + ' 人')
  } catch (error) {
    notify(error instanceof Error ? error.message : '导入失败', 'error')
  } finally {
    importing.value = false
  }
}

onMounted(async () => {
  await loadLists()
  await loadStudents()
})
</script>

<style scoped>
.student-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
</style>
