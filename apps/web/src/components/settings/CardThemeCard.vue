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
          <span class="ct-card" :class="`ct-card--${opt.value}`">
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
      液态玻璃的贴边折射需要 Chromium 内核（Chrome / Edge / 桌面端）；其他浏览器会自动退回相近的毛玻璃质感。
    </p>

    <!-- 选中液态玻璃后展开：所有可调参数，改完立刻作用于全局所有玻璃卡片 / 胶囊 -->
    <v-expand-transition>
      <div v-if="current === 'liquid'" class="ct-tuning">
        <div class="ct-tuning__head">
          <span class="ct-tuning__title">
            <v-icon icon="mdi-tune-variant" size="18" />
            液态玻璃参数
          </span>
          <v-spacer />
          <v-btn
            density="comfortable"
            prepend-icon="mdi-restore"
            size="small"
            variant="text"
            @click="resetAll"
          >
            全部恢复默认
          </v-btn>
        </div>
        <v-list class="ct-tuning__list" density="compact">
          <template v-for="(key, index) in liquidKeys" :key="key">
            <setting-item
              :model-value="model[key] ?? getDefault(key)"
              :setting-key="key"
              @update:setting-key="onSettingUpdate"
            />
            <v-divider v-if="index < liquidKeys.length - 1" />
          </template>
        </v-list>
      </div>
    </v-expand-transition>
  </settings-card>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { CARD_THEME_KEY, cardThemeSetting, type CardThemeMode } from '@/lib/cardTheme'
import { getDefault, keysByPrefix } from '@/lib/settingDefs'
import SettingsCard from './SettingsCard.vue'
import SettingItem from './SettingItem.vue'

const props = defineProps<{ model: Record<string, unknown> }>()
const emit = defineEmits<{ update: [key: string, value: unknown] }>()

const OPTIONS: Array<{ value: CardThemeMode; title: string }> = [
  { value: 'default', title: '默认' },
  { value: 'glass', title: '玻璃' },
  { value: 'liquid', title: '液态玻璃' },
]

/** 液态玻璃的可调参数：定义顺序即展示顺序（见 lib/settingDefs.ts 的 liquid.* 段） */
const liquidKeys = keysByPrefix('liquid')

const current = computed(() => cardThemeSetting(props.model))

function choose(value: CardThemeMode): void {
  if (value === current.value) return
  emit('update', CARD_THEME_KEY, value)
}

function onSettingUpdate(key: string, value: unknown): void {
  emit('update', key, value)
}

/** 一键回默认：逐项写回 settingDefs 里声明的 default */
function resetAll(): void {
  for (const key of liquidKeys) emit('update', key, getDefault(key))
}
</script>

<style lang="scss" scoped>
@use '../../styles/glass-mixins' as g;
@use '../../styles/liquid-glass-mixins' as lg;

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

/* 液态玻璃：同一套混入 + 深色底板专用的那套参数（厚度描边、135° 高光、柔和投影） */
.ct-card--liquid {
  --lg-frost: rgba(38, 32, 44, 0.42);
  --lg-rim: rgba(255, 255, 255, 0.34);
  --lg-sheen: linear-gradient(
    135deg,
    rgba(255, 255, 255, 0.34) 0%,
    rgba(255, 255, 255, 0.06) 36%,
    rgba(255, 255, 255, 0) 62%,
    rgba(255, 255, 255, 0.16) 100%
  );
  --lg-shadow:
    inset 0 0 2px 1px rgba(255, 255, 255, 0.3),
    inset 0 0 10px 4px rgba(255, 255, 255, 0.12),
    inset 0 1px 0 rgba(255, 255, 255, 0.24),
    0 8px 20px rgba(0, 0, 0, 0.28);
  @include lg.surface;

  /* 混入里带了 position: relative（为看板上的真实卡片准备），预览这里要还原成绝对定位 */
  position: absolute;
  /* 让预览的圆角与看板卡片一致，矩形预览看不出玻璃厚度 */
  border-radius: 12px !important;
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
.ct-card--glass .ct-card__line,
.ct-card--liquid .ct-card__title,
.ct-card--liquid .ct-card__line {
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

/* ---------- 参数面板 ---------- */
.ct-tuning {
  margin-top: 16px;
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  background: var(--bg-card-sub);
  overflow: hidden;
}

.ct-tuning__head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px 6px 14px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-hover);
}

.ct-tuning__title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 700;
  color: var(--text-2);
}

.ct-tuning__list {
  padding: 4px 0;
  background: transparent !important;
}
</style>
