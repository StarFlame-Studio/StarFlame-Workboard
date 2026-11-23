<template>
  <div class="status-footer">
    <v-btn
      append-icon="mdi-open-in-new"
      class="status-btn"
      :href="STATUS_URL"
      prepend-icon="mdi-monitor-dashboard"
      rel="noopener noreferrer"
      size="small"
      target="_blank"
      variant="text"
    >
      系统状态
    </v-btn>
    <span class="status-hint">服务可用性、接口与更新服务的实时状态</span>
  </div>
</template>

<script setup lang="ts">
import { STATUS_PAGE_URL } from '@/lib/repoLinks'

const STATUS_URL = STATUS_PAGE_URL
</script>

<style scoped>
.status-footer {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 8px 0 20px;
}

.status-btn {
  font-size: 13px;
  letter-spacing: 0;
  opacity: 0.85;
}

.status-hint {
  font-size: 12px;
  color: rgba(var(--v-theme-on-surface), 0.5);
}
</style>
