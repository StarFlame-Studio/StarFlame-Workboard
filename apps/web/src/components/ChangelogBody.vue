<template>
  <!--
    更新内容的统一排版：作业看板 / 后台管理面板两个板块，各自再分 新增 / 优化 / 修复。
    没有条目的板块与分类不会渲染，避免出现空标题。
  -->
  <div v-if="areas.length" class="changelog-body" :class="{ 'is-compact': compact }">
    <section v-for="area in areas" :key="area.key" class="cl-area">
      <div class="cl-area-title">{{ area.title }}</div>
      <div v-for="group in area.groups" :key="group.key" class="cl-group">
        <div class="cl-group-title" :class="'is-' + group.key">{{ group.title }}</div>
        <ul class="cl-items">
          <li v-for="(item, i) in group.items" :key="i">{{ item }}</li>
        </ul>
      </div>
    </section>
  </div>
  <p v-else class="cl-empty">本次更新包含若干修复与优化。</p>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { changelogAreas, type ChangelogEntry } from '@/lib/changelog'

const props = withDefaults(
  defineProps<{
    entry: ChangelogEntry | null | undefined
    /** 紧凑排版：用于「已更新到」弹窗与版本历史面板 */
    compact?: boolean
  }>(),
  { compact: false },
)

const areas = computed(() => changelogAreas(props.entry))
</script>

<style scoped>
.changelog-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.cl-area {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.cl-area-title {
  padding-left: 9px;
  border-left: 3px solid var(--brand-1, #ff8a1f);
  color: var(--text-1, #241d18);
  font-size: 13px;
  font-weight: 700;
  line-height: 1.4;
}

.cl-group {
  padding-left: 12px;
}

.cl-group-title {
  display: inline-block;
  margin-bottom: 2px;
  padding: 0 6px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 700;
  line-height: 18px;
  letter-spacing: 0.04em;
}

.cl-group-title.is-added {
  color: #1b7f3b;
  background: color-mix(in srgb, #1b7f3b 12%, transparent);
}

.cl-group-title.is-improved {
  color: #b26a00;
  background: color-mix(in srgb, #ff8a1f 16%, transparent);
}

.cl-group-title.is-fixed {
  color: #c0392b;
  background: color-mix(in srgb, #c0392b 12%, transparent);
}

.cl-items {
  margin: 4px 0 0;
  padding-left: 16px;
  color: var(--text-2, #4a423c);
  font-size: 13px;
  line-height: 1.85;
}

.cl-items li::marker {
  color: var(--brand-1, #ff8a1f);
}

.is-compact .cl-items {
  font-size: 12.5px;
  line-height: 1.8;
}

.is-compact .cl-area {
  gap: 6px;
}

.is-compact .cl-area-title {
  font-size: 12.5px;
}

.cl-empty {
  margin: 0;
  color: var(--text-3, #8a8078);
  font-size: 13px;
}
</style>
