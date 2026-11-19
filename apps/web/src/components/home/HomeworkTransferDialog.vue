<template>
  <v-dialog
    :model-value="modelValue"
    max-width="880"
    scrollable
    @update:model-value="(value: boolean) => emit('update:modelValue', value)"
  >
    <v-card class="rounded-xl">
      <v-card-title class="d-flex align-center">
        <v-icon class="mr-2" color="primary">mdi-swap-vertical-bold</v-icon>
        导入 / 导出
        <v-spacer />
        <v-btn icon="mdi-close" variant="text" @click="emit('update:modelValue', false)" />
      </v-card-title>
      <v-card-subtitle>
        导出当日作业为图片或 UAF 文件，也可以从 UAF / JSON 备份导入作业内容
      </v-card-subtitle>
      <v-divider />
      <v-card-text class="pa-4">
        <homework-transfer-card flat />
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import HomeworkTransferCard from '@/components/settings/HomeworkTransferCard.vue'

defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
</script>
