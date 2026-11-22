<template>
  <settings-card icon="mdi-palette-outline" subtitle="学科卡片与底栏按钮用哪种材质" title="卡片主题">
    <div class="ct-options">
      <button
        v-for="opt in OPTIONS"
        :key="opt.value"
        :aria-pressed="current === opt.value"
        class="ct-option"
        :class="{ 'ct-option--active': current === opt.value }"
        type="button"
        @click="choose(opt.value)"
      >
        <span class="ct-stage">
          <span aria-hidden="true" class="ct-stage__art" />
          <span class="ct-card" :class="opt.value === 'glass' ? 'ct-card--glass' : 'ct-card--default'">
            <span class="ct-card__bar" />
            <span class="ct-card__title" />
            <span class="ct-card__line" />
            <span class="ct-card__line ct-card__line--short" />
          </span>
          <span v-if="current === opt.value" class="ct-check">
            <v-icon icon="mdi-check" size="14" />
          </span>
        </span>
        <span class="ct-name">{{ opt.title }}</span>
      </button>
    </div>

    <p class="ct-hint">
      玻璃 = <b>全透明</b> + <b>4px 白色包边</b>（胶囊按钮 3px）。没有模糊、没有折射、没有色带，
      卡片背后是什么就直接透出什么；搭配自定义背景图时边界最清楚。
    </p>
  </settings-card>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { CARD_THEME_KEY, cardThemeSetting, type CardThemeMode } from '@/lib/cardTheme'
import SettingsCard from './SettingsCard.vue'

const props = defineProps<{ model: Record<string, unknown> }>()
const emit = defineEmits<{ update: [key: string, value: unknown] }>()

const OPTIONS: Array<{ value: CardThemeMode; title: string }> = [
  { value: 'default', title: '默认' },
  { value: 'glass', title: '玻璃' },
]

const current = computed(() => cardThemeSetting(props.model))

function choose(value: CardThemeMode): void {
  if (value === current.value) return
  emit('update', CARD_THEME_KEY, value)
}
</script>

<style lang="scss" scoped>
@use '../../styles/glass-mixins' as g;

.ct-options {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
}

.ct-option {
  width: 172px;
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  cursor: pointer;
  font: inherit;
  text-align: left;
}

.ct-stage {
  position: relative;
  display: block;
  height: 98px;
  border: 2px solid transparent;
  border-radius: 14px;
  overflow: hidden;
  transition:
    border-color 0.18s ease,
    box-shadow 0.18s ease;
}

/* 预览底板：故意用高彩度渐变，透镜的折射与色散才看得出来 */
.ct-stage__art {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(120% 90% at 12% 8%, #ffb347 0%, rgba(255, 179, 71, 0) 55%),
    radial-gradient(110% 90% at 92% 18%, #7c4dff 0%, rgba(124, 77, 255, 0) 60%),
    linear-gradient(135deg, #2b1a3d 0%, #43234f 45%, #1b2b3a 100%);
}

.ct-card {
  position: absolute;
  top: 20px;
  right: 22px;
  bottom: 20px;
  left: 22px;
  display: block;
  overflow: hidden;
  padding: 8px 10px;
  border-radius: 10px;
}

.ct-card--default {
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.28);
}

/* 预览复用生产用的混入，保证「所见即所得」：毛玻璃 + 细描边 */
.ct-card--glass {
  /* 预览底板是深色渐变，用深色那套参数才看得清 */
  --glass-bg: rgba(30, 30, 30, 0.4);
  --glass-border: rgba(255, 255, 255, 0.18);
  --glass-shadow: 0 8px 20px rgba(0, 0, 0, 0.28);
  --glass-blur: 10px;
  @include g.glass;

  /* 混入里带了 position: relative（为看板上的真实卡片准备），预览这里要还原成绝对定位 */
  position: absolute;
}

.ct-card__bar {
  display: block;
  height: 3px;
  margin-bottom: 6px;
  border-radius: 2px;
  background: linear-gradient(90deg, #ff8a1f, #f4511e);
}

.ct-card__title {
  display: block;
  width: 44%;
  height: 7px;
  margin-bottom: 6px;
  border-radius: 4px;
  background: #8a8078;
}

.ct-card__line {
  display: block;
  height: 5px;
  margin-bottom: 4px;
  border-radius: 3px;
  background: #8a8078;
  opacity: 0.75;
}

.ct-card__line--short {
  width: 62%;
}

.ct-card--glass .ct-card__title,
.ct-card--glass .ct-card__line {
  background: rgba(255, 255, 255, 0.86);
  opacity: 1;
}

.ct-option--active .ct-stage {
  border-color: rgb(var(--v-theme-primary));
  box-shadow: 0 0 0 3px rgba(var(--v-theme-primary), 0.18);
}

.ct-check {
  position: absolute;
  top: 6px;
  right: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: rgb(var(--v-theme-primary));
  color: #fff;
}

.ct-name {
  display: block;
  margin-top: 8px;
  color: var(--text-1);
  font-size: 14px;
  font-weight: 600;
}

.ct-hint {
  margin: 14px 0 0;
  color: var(--text-3);
  font-size: 12px;
  line-height: 1.7;
}
</style>
