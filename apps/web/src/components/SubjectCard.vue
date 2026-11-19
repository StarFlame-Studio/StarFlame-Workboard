<template>
  <v-card
    class="sf-board-card d-flex flex-column"
    height="100%"
    variant="flat"
    color="surface"
    @click="$emit('edit')"
  >
    <div class="sf-flame-bar" :style="{ height: '4px', background: barColor }" />
    <v-card-item class="pb-1">
      <template #prepend>
        <v-avatar :color="subject.color || '#FF6B2C'" size="34" variant="tonal">
          <v-icon :icon="subject.icon || 'mdi-book-outline'" size="20" />
        </v-avatar>
      </template>
      <v-card-title class="text-h6 font-weight-bold pl-2">{{ subject.name }}</v-card-title>
    </v-card-item>
    <v-card-text class="pt-1 sf-scroll flex-grow-1">
      <template v-if="lines.length > 0">
        <div v-for="(line, index) in lines" :key="index" class="d-flex mb-1">
          <span class="text-medium-emphasis mr-2 num">{{ index + 1 }}.</span>
          <span class="text-body-1">{{ line }}</span>
        </div>
      </template>
      <div v-else class="text-disabled text-body-1 d-flex align-center" style="height: 100%">
        暂无作业，点击添加
      </div>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { SubjectInfo } from '@starflame/shared'

const props = defineProps<{ subject: SubjectInfo; content: string }>()
defineEmits<{ edit: [] }>()

const lines = computed(() =>
  props.content
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean),
)

const barColor = computed(() => props.subject.color || '#FF6B2C')
</script>
