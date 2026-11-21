<template>
  <v-dialog :model-value="modelValue" max-width="480" persistent @update:model-value="onToggle">
    <v-card class="tutorial-prompt rounded-xl" elevation="8">
      <v-card-title class="d-flex align-center pt-5">
        <v-icon class="mr-2" color="primary" size="26">mdi-gesture-tap</v-icon>
        <span class="text-h6">需要看看使用教程吗？</span>
      </v-card-title>
      <v-card-text class="pt-2 text-body-1">
        一分钟的基础引导，教你布置作业、调整字号和切换日期。看完就能上手，随时可以在「设置 → 首页」里重新观看。
      </v-card-text>
      <v-card-actions class="pa-4 pt-0">
        <v-btn class="text-medium-emphasis" variant="text" @click="$emit('dismiss')">以后再说</v-btn>
        <v-spacer />
        <v-btn color="primary" prepend-icon="mdi-play-circle" size="large" variant="elevated" @click="$emit('start')">
          开始引导
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
/** 首次进入作业板时的「是否查看使用教程」询问框。只负责询问，教程本身在 TutorialOverlay。 */
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
