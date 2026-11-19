<template>
  <v-dialog :model-value="modelValue" max-width="680" @update:model-value="$emit('update:modelValue', $event)">
    <v-card>
      <v-card-item>
        <v-card-title class="d-flex align-center">
          <v-icon class="mr-2" color="primary" icon="mdi-pencil-outline" />
          {{ subjectName }} · 作业
        </v-card-title>
        <v-card-subtitle>每行一条，保存后大屏立即更新</v-card-subtitle>
      </v-card-item>
      <v-card-text>
        <v-textarea
          v-model="draft"
          auto-grow
          counter
          maxlength="4000"
          placeholder="例如：练习册 P32-34"
          rows="6"
          @keydown.ctrl.enter="submit"
        />
        <v-alert v-if="error" class="mt-2" density="compact" type="error" variant="tonal">
          {{ error }}
        </v-alert>
      </v-card-text>
      <v-card-actions>
        <v-btn variant="text" @click="$emit('update:modelValue', false)">取消</v-btn>
        <v-spacer />
        <v-btn :loading="saving" color="primary" variant="flat" @click="submit">保存</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'

const props = defineProps<{
  modelValue: boolean
  subjectName: string
  content: string
  version?: number
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  save: [content: string, version: number | undefined]
}>()

const draft = ref('')
const saving = ref(false)
const error = ref('')

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      draft.value = props.content
      error.value = ''
      saving.value = false
    }
  },
)

function submit(): void {
  if (saving.value) return
  saving.value = true
  error.value = ''
  emit('save', draft.value, props.version)
}

function setSaving(value: boolean): void {
  saving.value = value
}

function setError(message: string): void {
  saving.value = false
  error.value = message
}

defineExpose({ setSaving, setError })
</script>
