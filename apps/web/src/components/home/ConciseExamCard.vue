<template>
  <v-card border class="concise-exam-card fill-height d-flex flex-column cursor-pointer hover-elevation" data-tutorial-anchor="exam-card" elevation="0" rounded="xl" @click="$emit('open', exam.id)">
    <liquid-glass />
    <v-card-title class="d-flex align-center py-2 px-3 text-subtitle-1 font-weight-bold">
      <v-icon class="mr-2" color="primary" size="small">mdi-calendar-check</v-icon>
      <span class="text-truncate">{{ exam.title || '考试安排' }}</span>
    </v-card-title>

    <v-card-text class="flex-grow-1 pa-4 scroll-thin" :style="contentStyle">
      <div v-for="(group, gIndex) in grouped" :key="gIndex" class="mb-3">
        <div class="text-subtitle-2 font-weight-bold text-primary mb-1">
          <relative-time-display :time="group.date" />
        </div>
        <div
          v-for="(info, index) in group.infos"
          :key="index"
          class="d-flex align-center justify-space-between py-1"
          :class="{ 'text-medium-emphasis': isPast(info.end), 'border-none': index === group.infos.length - 1 }"
        >
          <div class="font-weight-bold mr-2" style="font-size: 1.1em">{{ info.name }}</div>
          <div class="font-weight-medium text-medium-emphasis" style="font-size: 0.85em; white-space: nowrap">
            {{ formatTimeOnly(info.start) }} - {{ formatTimeOnly(info.end) }}
          </div>
        </div>
      </div>

      <div v-if="grouped.length === 0" class="text-center text-medium-emphasis py-4">暂无安排</div>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { ExamItem, SubjectInfo } from '@starflame/shared'
import RelativeTimeDisplay from '@/components/RelativeTimeDisplay.vue'
import LiquidGlass from '@/components/ui/LiquidGlass.vue'

const props = defineProps<{ exam: ExamItem; subjects: SubjectInfo[]; contentStyle?: Record<string, string> }>()
defineEmits<{ open: [id: string] }>()

interface FlatInfo {
  name: string
  start: Date
  end: Date
}

const flat = computed<FlatInfo[]>(() =>
  (props.exam.subjects ?? [])
    .map((item) => ({
      name: props.subjects.find((s) => s.id === item.subjectId)?.name ?? '其他',
      start: new Date(String(item.startAt)),
      end: new Date(String(item.endAt)),
    }))
    .filter((item) => !Number.isNaN(item.start.getTime()))
    .sort((a, b) => a.start.getTime() - b.start.getTime()),
)

const grouped = computed(() => {
  const map = new Map<string, FlatInfo[]>()
  for (const item of flat.value) {
    const key = item.start.toDateString()
    const list = map.get(key) ?? []
    list.push(item)
    map.set(key, list)
  }
  return Array.from(map.entries()).map(([, infos]) => ({
    date: infos[0]!.start,
    infos,
  }))
})

function formatTimeOnly(value: Date): string {
  return String(value.getHours()).padStart(2, '0') + ':' + String(value.getMinutes()).padStart(2, '0')
}

function isPast(value: Date): boolean {
  return value.getTime() < Date.now()
}
</script>

<style scoped>
.hover-elevation {
  transition: all 0.25s ease;
}

.hover-elevation:hover {
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18) !important;
}

.scroll-thin {
  overflow-y: auto;
}
</style>
