<template>
  <div class="sf-skel-table" role="status" aria-busy="true" aria-label="加载中">
    <div class="sf-skel-table__head">
      <div class="sf-skel-table__lead">
        <SfSkeleton w="38%" h="10px" radius="5px" />
      </div>
      <div v-for="c in otherCols" :key="'head-' + c" class="sf-skel-table__cell">
        <SfSkeleton :w="headerWidth(c)" h="10px" radius="5px" />
      </div>
    </div>

    <div v-for="r in rowList" :key="'row-' + r" class="sf-skel-table__row">
      <!-- 首列：头像圆块 + 主文本条，对齐真实表格的「名称」列 -->
      <div class="sf-skel-table__lead">
        <SfSkeleton circle :w="36" />
        <SfSkeleton :w="cellWidth(r, 0)" h="12px" radius="6px" />
      </div>
      <div v-for="c in otherCols" :key="'cell-' + r + '-' + c" class="sf-skel-table__cell">
        <SfSkeleton :w="cellWidth(r, c)" h="12px" radius="6px" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import SfSkeleton from './SfSkeleton.vue'

/**
 * 表格骨架：用于 v-data-table 的 #loading 插槽，形状对齐全站的数据表格
 * （首列头像圆块 + 文本条，其余列为等宽文本条）。
 */
const props = withDefaults(defineProps<{ rows?: number; cols?: number }>(), {
  rows: 5,
  cols: 5,
})

/** 首列固定留一条较宽的「名称」列，其余列均分 */
const otherCols = computed(() => Math.max(props.cols - 1, 1))
const rowList = computed(() => Array.from({ length: Math.max(props.rows, 1) }, (_, index) => index + 1))

/** 固定错落的宽度序列，避免所有条一样长显得机械 */
const WIDTHS = ['62%', '78%', '54%', '70%', '46%', '66%', '58%', '84%']

function cellWidth(row: number, col: number): string {
  return WIDTHS[(row * 3 + col * 2) % WIDTHS.length] as string
}

function headerWidth(col: number): string {
  return WIDTHS[(col * 3 + 1) % WIDTHS.length] as string
}
</script>
