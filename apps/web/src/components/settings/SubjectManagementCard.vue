<template>
  <v-card border class="settings-card rounded-lg mb-4" elevation="2">
    <v-card-item>
      <template #prepend>
        <v-icon class="mr-2" icon="mdi-book-multiple" size="large" />
      </template>
      <v-card-title class="text-h6">科目管理</v-card-title>
    </v-card-item>

    <v-card-text>
      <v-alert v-if="error" class="mb-4" closable type="error" variant="tonal" @click:close="error = ''">{{ error }}</v-alert>

      <div class="d-flex flex-wrap align-center mb-6" style="gap: 8px">
        <v-btn :loading="loading" color="primary" prepend-icon="mdi-refresh" size="large" variant="text" @click="loadConfig">重新加载</v-btn>
        <v-btn :loading="saving" color="success" prepend-icon="mdi-content-save" size="large" variant="elevated" @click="saveConfig">保存</v-btn>
        <v-btn :loading="loading" prepend-icon="mdi-restore" variant="text" @click="resetToDefault">重置为默认</v-btn>
        <v-spacer />
        <v-chip v-if="hasChanges" color="warning" variant="elevated">有未保存的更改</v-chip>
      </div>

      <v-card class="mb-4" variant="outlined">
        <v-card-text>
          <v-row>
            <v-col cols="12" sm="6">
              <v-text-field
                v-model="newSubjectName"
                append-inner-icon="mdi-plus"
                density="comfortable"
                label="科目名称"
                variant="outlined"
                @keyup.enter="addSubject"
                @click:append-inner="addSubject"
              />
            </v-col>
          </v-row>
        </v-card-text>
      </v-card>

      <v-card variant="outlined">
        <v-card-text class="pa-0">
          <v-list lines="one">
            <v-list-item v-for="(subject, index) in subjects" :key="subject.id">
              <template #prepend>
                <v-icon class="mr-2" :color="subject.color || 'primary'" :icon="subject.icon || 'mdi-book-outline'" />
              </template>

              <v-list-item-title>
                <v-text-field
                  v-model="subject.name"
                  density="compact"
                  hide-details
                  variant="plain"
                  @update:model-value="hasChanges = true"
                />
              </v-list-item-title>

              <template #append>
                <v-btn :disabled="index === 0" icon="mdi-chevron-up" size="small" variant="text" @click="moveSubject(index, -1)" />
                <v-btn :disabled="index === subjects.length - 1" icon="mdi-chevron-down" size="small" variant="text" @click="moveSubject(index, 1)" />
                <v-switch
                  :model-value="subject.enabled"
                  class="ml-1"
                  color="primary"
                  density="comfortable"
                  hide-details
                  inset
                  @update:model-value="(v) => { subject.enabled = Boolean(v); hasChanges = true }"
                />
                <v-btn color="error" icon="mdi-delete" size="small" variant="text" @click="deleteSubject(subject)" />
              </template>
            </v-list-item>
          </v-list>
        </v-card-text>
      </v-card>
    </v-card-text>

    <v-snackbar v-model="snack.show" :color="snack.color" timeout="2400">{{ snack.text }}</v-snackbar>
  </v-card>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { deleteData, getData, patchData, postData } from '@/lib/api'

interface SubjectRow {
  id: string
  name: string
  color: string | null
  icon: string | null
  enabled: boolean
}

const emit = defineEmits<{ saved: [] }>()

const subjects = ref<SubjectRow[]>([])
const newSubjectName = ref('')
const loading = ref(false)
const saving = ref(false)
const hasChanges = ref(false)
const error = ref('')
const snack = reactive({ show: false, text: '', color: 'success' })

function notify(text: string, color = 'success'): void {
  snack.text = text
  snack.color = color
  snack.show = true
}

async function loadConfig(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    const board = await getData<{ subjects: SubjectRow[] }>('/board/bootstrap')
    subjects.value = board.subjects.map((item) => ({
      id: item.id,
      name: item.name,
      color: item.color,
      icon: item.icon,
      enabled: item.enabled,
    }))
    hasChanges.value = false
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败'
  } finally {
    loading.value = false
  }
}

function moveSubject(index: number, delta: number): void {
  const target = index + delta
  if (target < 0 || target >= subjects.value.length) return
  const list = [...subjects.value]
  const [item] = list.splice(index, 1)
  if (item) list.splice(target, 0, item)
  subjects.value = list
  hasChanges.value = true
}

function addSubject(): void {
  const name = newSubjectName.value.trim()
  if (!name) return
  postData<SubjectRow>('/board/subjects', { name })
    .then((created) => {
      subjects.value.push({
        id: created.id,
        name: created.name,
        color: created.color ?? null,
        icon: created.icon ?? null,
        enabled: true,
      })
      newSubjectName.value = ''
      notify('已添加科目')
      emit('saved')
    })
    .catch((e) => {
      error.value = e instanceof Error ? e.message : '添加失败'
    })
}

async function deleteSubject(subject: SubjectRow): Promise<void> {
  if (!window.confirm('确定删除科目「' + subject.name + '」吗？该科目的作业也会一并删除。')) return
  try {
    await deleteData('/board/subjects/' + subject.id)
    subjects.value = subjects.value.filter((item) => item.id !== subject.id)
    notify('已删除')
    emit('saved')
  } catch (e) {
    error.value = e instanceof Error ? e.message : '删除失败'
  }
}

async function saveConfig(): Promise<void> {
  saving.value = true
  try {
    for (const [index, subject] of subjects.value.entries()) {
      await patchData('/board/subjects/' + subject.id, {
        name: subject.name,
        enabled: subject.enabled,
        sortIndex: index,
      })
    }
    hasChanges.value = false
    notify('已保存')
    emit('saved')
  } catch (e) {
    error.value = e instanceof Error ? e.message : '保存失败'
  } finally {
    saving.value = false
  }
}

async function resetToDefault(): Promise<void> {
  if (!window.confirm('确定重置为默认科目列表吗？现有自定义科目会被删除。')) return
  notify('请手动删除自定义科目后重新加载', 'warning')
  await loadConfig()
}

onMounted(loadConfig)
</script>
