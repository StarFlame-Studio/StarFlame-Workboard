<template>
  <v-dialog :model-value="modelValue" max-width="480" persistent @update:model-value="onToggle">
    <v-card class="tutorial-prompt rounded-xl" elevation="8">
      <v-card-title class="d-flex align-center pt-5">
        <v-icon class="mr-2" color="primary" size="26">mdi-school</v-icon>
        <span class="text-h6">要不要再看看进阶功能？</span>
      </v-card-title>
      <v-card-text class="pt-2 text-body-1">
        基础操作已经练完了。考试看板、随机点名、发送通知这几个功能用得更少，但用起来很省事——每段教程一分钟，可以挑着想看的看。
      </v-card-text>
      <v-card-actions class="pa-4 pt-0">
        <v-btn class="text-medium-emphasis" variant="text" @click="$emit('dismiss')">以后再说</v-btn>
        <v-spacer />
        <v-btn color="primary" prepend-icon="mdi-play-circle" size="large" variant="elevated" @click="$emit('start')">
          看看进阶教程
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
/** 基础教程结束后的追问：是否继续看进阶教程。只负责询问，选择与播放交给进阶教程弹窗与浮层。 */
withDefaults(defineProps<{ modelValue: boolean }>(), { modelValue: false })

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  start: []
  dismiss: []
}>()

function onToggle(value: boolean): void {
  emit('update:modelValue', value)
  if (!value) emit('dismiss')
}
</script>

<style scoped>
.tutorial-prompt {
  overflow: hidden;
}
</style>
