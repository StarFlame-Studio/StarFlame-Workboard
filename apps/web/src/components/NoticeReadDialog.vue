<template>
  <v-dialog :model-value="Boolean(notice)" max-width="640" persistent scrollable>
    <v-card v-if="notice" class="rounded-xl read-dialog">
      <v-card-title class="d-flex align-center">
        <v-icon class="mr-2" :color="notice.level === 'urgent' ? 'error' : 'primary'">
          {{ notice.level === 'urgent' ? 'mdi-alert' : 'mdi-bullhorn-outline' }}
        </v-icon>
        <span class="text-h6">收到新通知</span>
        <v-chip class="ml-2" :color="notice.level === 'urgent' ? 'error' : 'primary'" size="small" variant="tonal">
          {{ notice.level === 'urgent' ? '加急' : '通知' }}
        </v-chip>
        <v-spacer />
        <v-chip v-if="queueTotal > 1" size="small" variant="text">还有 {{ queueTotal - 1 }} 条待读</v-chip>
      </v-card-title>
      <v-divider />
      <v-card-text class="pa-6">
        <div class="read-title">{{ notice.title || '新通知' }}</div>
        <div class="read-body">{{ notice.content || '（无正文）' }}</div>
        <div class="read-meta">发布于 {{ publishText }}</div>
        <div class="read-meta">本窗口需点击「我已阅读」才会关闭</div>
      </v-card-text>
      <v-divider />
      <v-card-actions class="pa-4">
        <v-spacer />
        <v-btn
          color="primary"
          :loading="marking"
          prepend-icon="mdi-check"
          size="large"
          variant="elevated"
          @click="$emit('read')"
        >
          我已阅读
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { NoticeItem } from '@starflame/shared'

const props = defineProps<{ notice: NoticeItem | null; queueTotal: number; marking?: boolean }>()
defineEmits<{ read: [] }>()

const publishText = computed(() => {
  const value = props.notice?.publishAt
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  const pad = (n: number) => String(n).padStart(2, '0')
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes())
})
</script>

<style scoped>
.read-title {
  font-size: 26px;
  font-weight: 700;
  line-height: 1.4;
  margin-bottom: 12px;
}

.read-body {
  font-size: 18px;
  line-height: 1.7;
  white-space: pre-wrap;
  color: var(--text-2);
}

.read-meta {
  margin-top: 12px;
  font-size: 13px;
  color: var(--text-3);
}

@media (max-width: 600px) {
  .read-dialog :deep(.v-card-text) { padding: 16px !important; }
  .read-title { font-size: 20px; }
  .read-body { font-size: 15px; }
}
</style>
