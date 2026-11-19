<template>
  <div class="list-skel" aria-busy="true" aria-live="polite">
    <div v-for="i in rows" :key="i" class="list-skel-row">
      <span v-if="avatar" class="sf-skel sf-skel--circle list-skel-avatar" />
      <div class="list-skel-body">
        <span class="sf-skel sf-skel--text" :style="{ width: width(i) + '%' }" />
        <span v-if="twoLine" class="sf-skel sf-skel--text" style="width: 46%; height: 9px" />
      </div>
      <span v-if="chip" class="sf-skel sf-skel--pill list-skel-chip" />
    </div>
  </div>
</template>

<script setup lang="ts">
/** 行式列表骨架：学生名单、考试配置、表格行等通用。 */
const props = withDefaults(
  defineProps<{
    rows?: number
    /** 左侧圆形头像占位 */
    avatar?: boolean
    /** 两行文本 */
    twoLine?: boolean
    /** 右侧胶囊（标签 / 操作） */
    chip?: boolean
  }>(),
  { rows: 5, avatar: false, twoLine: false, chip: false },
)

/** 让每行的条纹宽度有细微差别，看起来像真实内容而不是色块 */
function width(index: number): number {
  const pattern = [88, 72, 94, 66, 82, 76]
  return pattern[(index - 1) % pattern.length] ?? props.rows
}
</script>

<style scoped>
.list-skel {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 6px 2px;
}

.list-skel-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.list-skel-avatar {
  width: 34px;
  height: 34px;
  flex: 0 0 34px;
}

.list-skel-body {
  display: flex;
  flex-direction: column;
  gap: 7px;
  flex: 1 1 auto;
  min-width: 0;
}

.list-skel-chip {
  width: 54px;
  height: 20px;
  flex: 0 0 54px;
}
</style>