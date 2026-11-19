<template>
  <settings-group icon="mdi-account-tie" title="教师列表">
    <template #actions>
      <v-btn prepend-icon="mdi-refresh" variant="text" @click="load">重新加载教师列表</v-btn>
    </template>

    <v-list-item>
      <v-text-field v-model="form.name" density="compact" hide-details placeholder="教师姓名" variant="outlined" />
      <v-select
        v-model="form.subject"
        class="ml-2"
        density="compact"
        hide-details
        :items="subjectOptions"
        placeholder="任教科目"
        style="max-width: 150px"
        variant="outlined"
      />
      <div class="d-flex align-center ml-2" style="gap: 4px">
        <v-checkbox v-model="form.isHeadTeacher" density="compact" hide-details label="班主任" />
        <v-btn :disabled="!form.name.trim()" color="primary" prepend-icon="mdi-plus" variant="tonal" @click="add">添加教师</v-btn>
      </div>
    </v-list-item>

    <v-alert v-if="teachers.length === 0" class="ma-2" density="compact" type="info" variant="tonal">
      暂无教师信息，请添加教师
    </v-alert>

    <template v-for="(teacher, index) in teachers" :key="teacher.id">
      <v-list-item>
        <template #prepend>
          <v-icon :color="teacher.isHeadTeacher ? 'primary' : 'default'" :icon="teacher.isHeadTeacher ? 'mdi-account-star' : 'mdi-account'" />
        </template>
        <v-list-item-title>{{ teacher.name }}</v-list-item-title>
        <v-list-item-subtitle>
          {{ teacher.subject || '未指定科目' }}{{ teacher.isHeadTeacher ? ' · 班主任' : '' }}
        </v-list-item-subtitle>
        <template #append>
          <v-btn color="error" icon="mdi-delete" size="small" variant="text" @click="remove(teacher.id)" />
        </template>
      </v-list-item>
      <v-divider v-if="index < teachers.length - 1" />
    </template>
  </settings-group>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { deleteData, getData, postData } from '@/lib/api'
import SettingsGroup from '@/components/settings/SettingGroup.vue'

interface Teacher {
  id: string
  name: string
  subject: string | null
  isHeadTeacher: boolean
}

const teachers = ref<Teacher[]>([])
const subjects = ref<Array<{ name: string }>>([])
const form = reactive({ name: '', subject: '', isHeadTeacher: false })

const subjectOptions = computed(() => subjects.value.map((item) => item.name))

async function load(): Promise<void> {
  try {
    const result = await getData<{ items: Teacher[] }>('/board/teachers')
    teachers.value = result.items
  } catch {
    teachers.value = []
  }
}

async function add(): Promise<void> {
  const name = form.name.trim()
  if (!name) return
  try {
    await postData('/board/teachers', {
      name,
      subject: form.subject || null,
      isHeadTeacher: form.isHeadTeacher,
    })
    form.name = ''
    form.isHeadTeacher = false
    await load()
  } catch {
    // 忽略
  }
}

async function remove(id: string): Promise<void> {
  try {
    await deleteData('/board/teachers/' + id)
    await load()
  } catch {
    // 忽略
  }
}

onMounted(async () => {
  await load()
  try {
    const board = await getData<{ subjects: Array<{ name: string }> }>('/board/bootstrap')
    subjects.value = board.subjects
  } catch {
    // 忽略
  }
})
</script>
