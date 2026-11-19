<template>
  <span class="relative-time">{{ text }}</span>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

const props = defineProps<{ time: string | Date }>()

const now = ref(new Date())
let timer: number | undefined

onMounted(() => {
  timer = window.setInterval(() => {
    now.value = new Date()
  }, 60_000)
})

onBeforeUnmount(() => {
  if (timer) window.clearInterval(timer)
})

// 复刻原项目规则：今天/明天/后天/昨天/前天 → 同周周几 → M月D日
const text = computed(() => {
  const date = new Date(props.time)
  if (Number.isNaN(date.getTime())) return ''

  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const n = new Date(now.value.getFullYear(), now.value.getMonth(), now.value.getDate())
  const diffDays = Math.round((d.getTime() - n.getTime()) / 86_400_000)

  if (diffDays === 0) return '今天'
  if (diffDays === 1) return '明天'
  if (diffDays === 2) return '后天'
  if (diffDays === -1) return '昨天'
  if (diffDays === -2) return '前天'

  const nDay = n.getDay() || 7
  const startOfWeek = new Date(n)
  startOfWeek.setDate(n.getDate() - nDay + 1)
  const endOfWeek = new Date(n)
  endOfWeek.setDate(n.getDate() + (7 - nDay))

  if (d >= startOfWeek && d <= endOfWeek) {
    return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][date.getDay()] ?? ''
  }

  return date.getMonth() + 1 + '月' + date.getDate() + '日'
})
</script>

<style scoped>
.relative-time {
  white-space: nowrap;
}
</style>
