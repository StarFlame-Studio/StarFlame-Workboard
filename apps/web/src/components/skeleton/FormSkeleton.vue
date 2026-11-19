<template>
  <div class="form-skel" aria-busy="true" aria-live="polite">
    <div v-for="i in sections" :key="i" class="form-skel-card">
      <div class="form-skel-title">
        <span class="sf-skel sf-skel--circle form-skel-icon" />
        <span class="sf-skel sf-skel--text" style="width: 30%; height: 14px" />
      </div>
      <div v-for="row in rowsPerSection" :key="row" class="form-skel-row">
        <span class="sf-skel sf-skel--text" style="width: 22%; height: 11px" />
        <span class="sf-skel form-skel-input" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/** 表单/设置页骨架：标题行 + 「标签 + 输入框」若干行，形状对齐设置卡片。 */
withDefaults(defineProps<{ sections?: number; rowsPerSection?: number }>(), {
  sections: 3,
  rowsPerSection: 3,
})
</script>

<style scoped>
.form-skel {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-skel-card {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 18px;
  border: 1px solid rgb(var(--v-theme-on-surface), 0.07);
  border-radius: var(--r-lg, 16px);
  background: rgb(var(--v-theme-surface), 0.5);
}

.form-skel-title {
  display: flex;
  align-items: center;
  gap: 10px;
}

.form-skel-icon {
  width: 26px;
  height: 26px;
}

.form-skel-row {
  display: flex;
  align-items: center;
  gap: 14px;
}

.form-skel-input {
  flex: 1 1 auto;
  height: 38px;
  border-radius: 10px;
}
</style>