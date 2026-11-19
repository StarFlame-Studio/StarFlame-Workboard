<template>
  <v-row density="comfortable">
    <v-col v-for="i in count" :key="i" :cols="span.xs" :sm="span.sm" :md="span.md" :lg="span.lg">
      <div class="sf-skel-surface sf-skel-tile">
        <div class="sf-skel-tile__head">
          <SfSkeleton circle :w="36" />
          <SfSkeleton w="46%" h="13px" radius="6px" />
        </div>
        <SfSkeleton w="100%" h="12px" radius="6px" />
        <SfSkeleton w="86%" h="12px" radius="6px" />
      </div>
    </v-col>
  </v-row>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import SfSkeleton from './SfSkeleton.vue'

/**
 * 卡片网格骨架：图标圆块 + 标题条 + 两行文本条，
 * 卡片外壳用 .sf-skel-surface（与真实 .v-card 同一套圆角 / 描边 / 阴影令牌）。
 */
const props = withDefaults(
  defineProps<{
    count?: number
    cols?: { xs?: number; sm?: number; md?: number; lg?: number }
  }>(),
  {
    count: 4,
    cols: () => ({ xs: 12, sm: 6, md: 6, lg: 4 }),
  },
)

const span = computed(() => ({
  xs: props.cols?.xs ?? 12,
  sm: props.cols?.sm ?? 6,
  md: props.cols?.md ?? 6,
  lg: props.cols?.lg ?? 4,
}))
</script>
