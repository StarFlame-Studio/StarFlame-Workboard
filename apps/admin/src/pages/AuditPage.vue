<template>
  <div>
    <v-card class="pa-4" variant="flat">
      <div class="list-toolbar">
        <div class="text-subtitle-1 font-weight-bold">审计日志</div>
        <v-spacer />
        <v-btn icon="mdi-refresh" variant="text" @click="load" />
      </div>

      <v-data-table :headers="headers" :items="items" :loading="loading" item-value="id">
        <template #loading>
          <SfTableSkeleton :cols="headers.length" :rows="8" />
        </template>
        <template #item.createdAt="{ item }">{{ formatDate(item.createdAt) }}</template>
        <template #item.actorType="{ item }">
          <v-chip size="small" variant="tonal">{{ item.actorType }}</v-chip>
        </template>
        <template #item.action="{ item }">
          <span class="font-weight-medium">{{ item.action }}</span>
          <div v-if="mobile" class="cell-sub">{{ summarize(item.detail) }}</div>
        </template>
        <template #item.detail="{ item }">
          <span class="text-caption text-medium-emphasis">{{ summarize(item.detail) }}</span>
        </template>
        <template #no-data>
          <div class="py-8 text-medium-emphasis">暂无日志</div>
        </template>
      </v-data-table>
    </v-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useDisplay } from 'vuetify'
import { getData } from '@/lib/api'
import SfTableSkeleton from '@/components/skeleton/SfTableSkeleton.vue'

interface AuditRow {
  id: string
  actorType: string
  actorId: string | null
  action: string
  target: string | null
  detail: unknown
  ip: string | null
  createdAt: string
}

const { mobile } = useDisplay()

const allHeaders = [
  { title: '时间', key: 'createdAt' },
  { title: '主体', key: 'actorType' },
  { title: '动作', key: 'action' },
  { title: '详情', key: 'detail', sortable: false },
  { title: 'IP', key: 'ip' },
]

/** 移动端只保留时间 + 动作（详情折到动作下方） */
const headers = computed(() =>
  mobile.value
    ? [
        { title: '时间', key: 'createdAt' },
        { title: '动作', key: 'action' },
      ]
    : allHeaders,
)

const items = ref<AuditRow[]>([])
const loading = ref(false)

function formatDate(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString('zh-CN')
}
function summarize(detail: unknown): string {
  if (!detail) return '-'
  try {
    const text = JSON.stringify(detail)
    return text.length > 60 ? text.slice(0, 60) + '…' : text
  } catch {
    return '-'
  }
}

async function load(): Promise<void> {
  loading.value = true
  try {
    const response = await getData<{ items: AuditRow[] }>('/admin/audit-logs', { page: 1, pageSize: 50 })
    items.value = response.items
  } catch {
    items.value = []
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>
