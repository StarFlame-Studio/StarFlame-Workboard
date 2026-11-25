<template>
  <div class="floating-toolbar-container">
    <v-slide-y-transition>
      <v-card :class="{ 'toolbar-expanded': isExpanded }" class="floating-toolbar" elevation="4" rounded="xl">
        <liquid-glass capsule />
        <v-btn-group class="toolbar-buttons" variant="text">
          <v-btn v-ripple class="toolbar-btn" icon="mdi-chevron-left" title="查看昨天" variant="text" @click="$emit('prev-day')" />
          <v-btn
            v-ripple
            class="toolbar-btn"
            icon="mdi-format-font-size-decrease"
            title="缩小字体"
            variant="text"
            @click="$emit('zoom', 'out')"
          />
          <v-btn
            v-ripple
            class="toolbar-btn"
            icon="mdi-format-font-size-increase"
            title="放大字体"
            variant="text"
            @click="$emit('zoom', 'up')"
          />
          <v-menu v-model="menuOpen" :close-on-content-click="false" location="top">
            <template #activator="{ props }">
              <v-btn v-ripple v-bind="props" class="toolbar-btn" icon="mdi-calendar" title="选择日期" variant="text" />
            </template>
            <v-card border class="date-picker-card">
              <v-date-picker :model-value="selectedDate" color="primary" @update:model-value="handleDateSelect" />
            </v-card>
          </v-menu>
          <v-btn
            v-ripple
            :loading="loading"
            class="toolbar-btn"
            icon="mdi-refresh"
            title="刷新数据"
            variant="text"
            @click="$emit('refresh')"
          />

          <v-btn
            v-if="!isToday"
            v-ripple
            class="toolbar-btn"
            icon="mdi-chevron-right"
            title="查看明天"
            variant="text"
            @click="$emit('next-day')"
          />
        </v-btn-group>
      </v-card>
    </v-slide-y-transition>

    <v-slide-x-reverse-transition>
      <v-btn
        v-if="!isToday"
        :disabled="copyToTodayLoading"
        :loading="copyToTodayLoading"
        class="side-action-btn"
        color="primary"
        elevation="4"
        prepend-icon="mdi-content-copy"
        rounded="xl"
        size="large"
        @click="$emit('copy-to-today')"
      >
        复制到今天
      </v-btn>
    </v-slide-x-reverse-transition>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import LiquidGlass from './ui/LiquidGlass.vue'

withDefaults(
  defineProps<{
    loading?: boolean
    unreadCount?: number
    selectedDate: Date | string
    isToday: boolean
    copyToTodayLoading?: boolean
  }>(),
  { loading: false, unreadCount: 0, copyToTodayLoading: false },
)

const emit = defineEmits<{
  refresh: []
  zoom: [direction: 'up' | 'out']
  'prev-day': []
  'next-day': []
  'date-select': [value: unknown]
  'copy-to-today': []
}>()

const isExpanded = ref(false)
const menuOpen = ref(false)

function handleDateSelect(value: unknown): void {
  if (value === null || value === undefined) return
  emit('date-select', value)
  // 选定日期后主动收起日历：菜单叠在看板上，留着会挡住上下一天等按钮，
  // 用户会误以为「日期切换不了」
  menuOpen.value = false
}
</script>

<style scoped>
.floating-toolbar-container {
  position: fixed;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 0;
  z-index: 100;
  display: flex;
  justify-content: center;
  pointer-events: none;
}

.floating-toolbar {
  position: absolute;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  /* 背景 / 描边 / 阴影由 styles/index.scss 按亮暗主题分别定义；
     低不透明度 + 高模糊实现通透的磨砂玻璃效果 */
  backdrop-filter: blur(22px) saturate(150%);
  -webkit-backdrop-filter: blur(22px) saturate(150%);
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 4px;
  pointer-events: auto;
  will-change: transform;
}

.floating-toolbar:hover {
  transform: translateX(-50%) translateY(-4px);
}

.toolbar-buttons {
  display: flex;
  align-items: center;
}

/* 按钮宽度沿用 v-btn-group 默认（48px），只把高度撑到 40px，
   使悬停时的白色高亮块与原项目一样是接近正方形的完整区域 */
.toolbar-btn {
  height: 40px !important;
  min-height: 40px !important;
  margin: 0 2px;
  border-radius: 10px !important;
}

.toolbar-btn :deep(.v-btn__overlay),
.toolbar-btn :deep(.v-ripple__container) {
  border-radius: inherit;
}

.toolbar-btn:hover {
  transform: scale(1.05);
}

.toolbar-btn:active {
  transform: scale(0.95);
}

.side-action-btn {
  position: absolute;
  bottom: 24px;
  right: 24px;
  pointer-events: auto;
  z-index: 101;
  backdrop-filter: blur(20px) saturate(150%);
  -webkit-backdrop-filter: blur(20px) saturate(150%);
}

.date-picker-card {
  border-radius: 16px;
  overflow: hidden;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

@media (max-width: 600px) {
  .floating-toolbar {
    /* 抬高一点，给右下角备案号留出位置，避免压在工具条上 */
    bottom: 32px;
    width: auto;
    max-width: 95%;
    padding: 2px;
  }

  .toolbar-buttons {
    width: 100%;
    justify-content: space-around;
    padding: 4px;
  }

  .toolbar-btn {
    min-width: 40px;
    height: 44px !important;
    min-height: 44px !important;
    margin: 0;
  }

  .side-action-btn {
    bottom: 80px;
    right: 16px;
  }
}

/* 主题相关配色统一放在 styles/index.scss 里（scoped 中无法安全跨层选择） */
</style>
