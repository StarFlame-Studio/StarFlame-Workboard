<template>
  <v-dialog v-model="visible" max-width="520">
    <v-card>
      <v-card-title class="d-flex align-center py-3 px-4">
        <v-icon class="mr-2" color="primary">mdi-calendar-check</v-icon>
        考试看板
        <v-spacer />
        <v-btn icon="mdi-close" variant="text" @click="visible = false" />
      </v-card-title>

      <v-divider />

      <v-list class="pa-2">
        <v-list-item class="mb-1 rounded-lg" data-tutorial-anchor="exam-open-page" @click="openFullPage">
          <template #prepend>
            <v-icon class="mr-2" color="success">mdi-open-in-new</v-icon>
          </template>
          <v-list-item-title class="text-success font-weight-medium">打开考试看板</v-list-item-title>
          <template #append>
            <v-icon color="success">mdi-arrow-right</v-icon>
          </template>
        </v-list-item>

        <v-divider class="my-2" />

        <v-list-item
          v-for="exam in exams"
          :key="exam.id"
          :data-tutorial-anchor="exam.id === demoExamId ? 'exam-demo-item' : 'exam-item'"
          class="rounded-lg"
          @click="toggle(exam.id)"
        >
          <template #prepend>
            <v-icon class="mr-2" color="primary">mdi-calendar-text</v-icon>
          </template>
          <v-list-item-title class="font-weight-medium">{{ exam.title }}</v-list-item-title>
          <v-list-item-subtitle class="text-caption">{{ exam.id }}</v-list-item-subtitle>
          <template #append>
            <v-icon :color="isChecked(exam.id) ? 'success' : 'grey'" size="22">
              {{ isChecked(exam.id) ? 'mdi-check' : 'mdi-plus' }}
            </v-icon>
          </template>
        </v-list-item>

        <div v-if="exams.length === 0" class="text-center text-medium-emphasis py-6">
          还没有考试配置，去考试看板新建一个
        </div>
      </v-list>

      <v-divider />

      <v-card-actions class="pa-4">
        <v-spacer />
        <v-btn color="primary" variant="text" @click="visible = false">关闭</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ExamItem } from '@starflame/shared'

const props = defineProps<{
  modelValue: boolean
  exams: ExamItem[]
  checkedIds: string[]
  /** 进阶教程临时生成的模拟考试 id：列表项会挂上单独的教程锚点 */
  demoExamId?: string | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'update:checked-ids': [ids: string[]]
  'open-full-page': []
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
})

const localChecked = ref<string[]>([...props.checkedIds])

if (localChecked.value.length === 0 && props.exams.length > 0) {
  // 首次打开没有配置时不自动勾选
}

function isChecked(id: string): boolean {
  return localChecked.value.includes(id)
}

function toggle(id: string): void {
  if (isChecked(id)) {
    localChecked.value = localChecked.value.filter((item) => item !== id)
  } else {
    localChecked.value = [...localChecked.value, id]
  }
  emit('update:checked-ids', localChecked.value)
}

function openFullPage(): void {
  visible.value = false
  emit('open-full-page')
}
</script>
