<template>
  <v-dialog :model-value="modelValue" max-width="560" persistent @update:model-value="onToggle">
    <v-card class="advanced-tutorial-dialog rounded-xl" elevation="8">
      <v-card-title class="d-flex align-center pt-5">
        <v-icon class="mr-2" color="primary" size="26">mdi-school</v-icon>
        <span class="text-h6">进阶教程</span>
        <v-spacer />
        <v-btn icon="mdi-close" variant="text" @click="close" />
      </v-card-title>
      <v-card-text class="pt-2">
        <p class="text-body-2 text-medium-emphasis mb-4">
          每个功能都是独立的一小段引导，跟着点几下就会了。练习时临时生成的数据会在教程结束时自动清理。
        </p>
        <div
          v-for="item in ADVANCED_TUTORIALS"
          :key="item.id"
          :class="['advanced-item', { 'is-disabled': isDisabled(item) }]"
          role="button"
          tabindex="0"
          @click="start(item)"
          @keydown.enter.prevent="start(item)"
          @keydown.space.prevent="start(item)"
        >
          <v-icon class="mr-3" color="primary" size="26">{{ item.icon }}</v-icon>
          <div class="flex-grow-1">
            <div class="d-flex align-center">
              <span class="text-subtitle-1 font-weight-bold">{{ item.title }}</span>
              <v-chip v-if="item.teacherOnly" class="ml-2" size="x-small" variant="tonal">教师端专属</v-chip>
            </div>
            <div class="text-body-2 text-medium-emphasis">{{ item.description }}</div>
            <div v-if="isDisabled(item)" class="text-caption text-warning mt-1">
              当前设备不是教师端，无法练习这个功能
            </div>
          </div>
          <v-icon class="ml-2" color="primary" size="20">mdi-chevron-right</v-icon>
        </div>
      </v-card-text>
      <v-card-actions class="pa-4 pt-0">
        <v-spacer />
        <v-btn variant="text" @click="close">以后再说</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
/**
 * 进阶教程选择弹窗：考试看板 / 随机点名 / 发送通知，每个都是独立的一套步骤。
 * 只负责挑选，教程浮层仍是 TutorialOverlay。
 */
import { computed } from 'vue'
import { useSessionStore } from '@/stores/session'
import { ADVANCED_TUTORIALS, type AdvancedTutorialId, type AdvancedTutorialInfo } from '@/lib/tutorial'

withDefaults(defineProps<{ modelValue: boolean }>(), { modelValue: false })

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  start: [id: AdvancedTutorialId]
}>()

const session = useSessionStore()
/** 发送通知是教师端专属功能 */
const isTeacher = computed(() => session.role === 'teacher')

function isDisabled(item: AdvancedTutorialInfo): boolean {
  return Boolean(item.teacherOnly) && !isTeacher.value
}

function start(item: AdvancedTutorialInfo): void {
  if (isDisabled(item)) return
  emit('start', item.id)
}

function close(): void {
  emit('update:modelValue', false)
}

function onToggle(value: boolean): void {
  if (!value) close()
}
</script>

<style scoped>
.advanced-item {
  display: flex;
  align-items: flex-start;
  padding: 12px 14px;
  margin-bottom: 8px;
  border-radius: 12px;
  /* 跟随主题：暗色用浅描边，亮色自动变深，不用写死白色 */
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  background: rgba(var(--v-theme-on-surface), 0.04);
  cursor: pointer;
  transition: background-color 0.16s ease, transform 0.16s ease;
}

.advanced-item:hover {
  background: rgba(var(--v-theme-on-surface), 0.08);
  transform: translateY(-1px);
}

.advanced-item.is-disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.advanced-item.is-disabled:hover {
  background: rgba(var(--v-theme-on-surface), 0.04);
  transform: none;
}
</style>
