<template>
  <v-card border class="hitokoto-card glow-track" elevation="2" :loading="loading" height="100%" rounded="xl" @click="next">
    <liquid-glass />
    <v-card-text class="pa-6 d-flex flex-column justify-center" style="height: 100%">
      <div class="font-weight-medium mb-4 serif-font" :style="contentStyle">{{ sentence.content }}</div>
      <div class="text-medium-emphasis serif-font" :style="authorStyle">
        <span v-if="sentence.author" class="mr-2">{{ sentence.author }}</span>
        <span v-if="sentence.origin">《{{ sentence.origin }}》</span>
      </div>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useBoardStore } from '@/stores/board'
import LiquidGlass from '@/components/ui/LiquidGlass.vue'
import { randomBuiltinSentence } from '@/lib/hitokotoBuiltin'
import { pickHitokoto, readHitokotoConfig, type HitokotoSentence } from '@/lib/hitokotoSources'

const HITOKOTO_FONT_RATIO = 0.75
const AUTHOR_FONT_RATIO = 0.6

const board = useBoardStore()
const settings = computed<Record<string, unknown>>(() => board.data?.settings ?? {})
const config = computed(() => readHitokotoConfig(settings.value))
const fontSize = computed(() => {
  const size = Number(settings.value['font.size'])
  return Number.isFinite(size) && size > 0 ? size : 28
})

// 先用内置句子占位，避免首屏空白
const sentence = ref<HitokotoSentence>({ ...randomBuiltinSentence(), source: 'builtin' })
const loading = ref(false)
let timer: number | undefined
let requestSeq = 0

const contentStyle = computed(() => ({
  fontSize: fontSize.value * HITOKOTO_FONT_RATIO + 'px',
  whiteSpace: 'pre-wrap' as const,
  lineHeight: '1.6',
  textAlign: 'left' as const,
}))

const authorStyle = computed(() => ({
  fontSize: fontSize.value * HITOKOTO_FONT_RATIO * AUTHOR_FONT_RATIO + 'px',
  textAlign: 'left' as const,
}))

async function next(): Promise<void> {
  if (loading.value) return
  loading.value = true
  const seq = ++requestSeq
  try {
    const result = await pickHitokoto(config.value)
    // 期间又点了一次，丢弃过期结果
    if (seq === requestSeq) sentence.value = result.sentence
  } finally {
    if (seq === requestSeq) loading.value = false
  }
}

function stopTimer(): void {
  if (timer) {
    window.clearInterval(timer)
    timer = undefined
  }
}

function startTimer(): void {
  stopTimer()
  const seconds = config.value.refreshInterval
  // 0 表示不自动轮换，只能点击卡片换句
  if (!config.value.enabled || seconds <= 0) return
  timer = window.setInterval(() => void next(), seconds * 1000)
}

watch(() => config.value.refreshInterval, startTimer)
watch(() => config.value.enabled, (enabled) => {
  if (enabled) void next()
  startTimer()
})

onMounted(() => {
  void next()
  startTimer()
})

onBeforeUnmount(() => {
  requestSeq += 1
  stopTimer()
})
</script>
