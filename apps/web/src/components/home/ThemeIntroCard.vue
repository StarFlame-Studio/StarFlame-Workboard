<template>
  <v-card border class="theme-intro-card mt-4" variant="flat">
    <liquid-glass />
    <v-card-title class="d-flex align-center text-subtitle-1">
      卡片主题
      <v-spacer />
      <v-icon class="mr-2" icon="mdi-palette" size="30" />
    </v-card-title>
    <v-card-subtitle class="theme-sub">
      学科卡片、底栏按钮、通知与考试安排都能换外观：默认、毛玻璃、液态玻璃三种材质，设置后只在本机生效。
    </v-card-subtitle>

    <v-card-text class="pt-1">
      <div class="theme-options">
        <button
          v-for="item in OPTIONS"
          :key="item.value"
          :class="{ 'is-active': current === item.value }"
          :title="item.desc"
          class="theme-option"
          type="button"
          @click="emit('open-settings')"
        >
          <span class="theme-preview" :class="'preview-' + item.value" />
          <span class="theme-name">{{ item.title }}</span>
          <v-icon v-if="current === item.value" icon="mdi-check" size="14" />
        </button>
        <v-btn
          class="theme-goto ml-auto"
          color="primary"
          prepend-icon="mdi-palette"
          variant="tonal"
          @click="emit('open-settings')"
        >
          去设置里换主题
        </v-btn>
      </div>
      <div class="text-caption text-medium-emphasis mt-3">
        当前材质：{{ currentTitle }}。切换后立即生效，每台设备各自保留自己的选择。
      </div>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import LiquidGlass from '@/components/ui/LiquidGlass.vue'
import { cardThemeMode, type CardThemeMode } from '@/lib/cardTheme'

const emit = defineEmits<{ 'open-settings': [] }>()

const OPTIONS: Array<{ value: CardThemeMode; title: string; desc: string }> = [
  { value: 'default', title: '默认', desc: '不透明卡片，加载最轻' },
  { value: 'glass', title: '毛玻璃', desc: '半透明磨砂，默认材质' },
  { value: 'liquid', title: '液态玻璃', desc: '带高光折射的玻璃质感' },
]

const current = computed<CardThemeMode>(() => cardThemeMode.value)
const currentTitle = computed(() => OPTIONS.find((item) => item.value === current.value)?.title ?? '毛玻璃')
</script>

<style scoped>
.theme-intro-card {
  overflow: hidden;
}
.theme-sub {
  white-space: normal !important;
  line-height: 1.5;
  font-size: 13px;
  padding-bottom: 0;
}
.theme-options {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}
.theme-option {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px 6px 8px;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 999px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  transition: transform 0.16s ease, border-color 0.16s ease;
}
.theme-option:hover {
  transform: translateY(-1px);
  border-color: rgba(var(--v-theme-primary), 0.5);
}
.theme-option.is-active {
  border-color: rgb(var(--v-theme-primary));
  box-shadow: 0 0 0 1px rgb(var(--v-theme-primary));
}
.theme-preview {
  width: 42px;
  height: 26px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.22);
  background: rgba(255, 255, 255, 0.1);
}
.preview-default {
  background: #2b2724;
  border-color: rgba(255, 255, 255, 0.16);
}
.preview-glass {
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.34), rgba(255, 255, 255, 0.08));
  backdrop-filter: blur(6px);
}
.preview-liquid {
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.55), rgba(255, 255, 255, 0.08) 45%, rgba(120, 170, 255, 0.28) 100%),
    rgba(255, 255, 255, 0.1);
}
.theme-goto {
  text-transform: none;
  font-weight: 600;
}
</style>
