<template>
  <settings-card
    icon="mdi-open-source-initiative"
    subtitle="Inspired by Classworks 作业板 · 原作者 孙悟元"
    title="致谢 · 基于原项目开发"
  >
    <div class="attribution-body">
      <p class="attribution-text">
        星焰作业板基于原项目 <b>Classworks 作业板</b> 二次开发，作业展示、作业编辑交互与整体使用流程均参考并延续了原项目的设计。
      </p>
      <p class="attribution-text">
        衷心感谢原作者 <b>孙悟元</b> 的付出与分享 —— 没有他打下的底子，就没有今天的星焰作业板。
      </p>

      <div class="attribution-actions">
        <v-btn
          append-icon="mdi-open-in-new"
          href="https://github.com/Moonrend/Classworks"
          prepend-icon="mdi-github"
          rel="noopener noreferrer"
          target="_blank"
          variant="tonal"
        >
          Moonrend/Classworks
        </v-btn>
      </div>
    </div>
  </settings-card>
</template>

<script setup lang="ts">
import SettingsCard from '@/components/settings/SettingsCard.vue'
</script>

<style scoped>
.attribution-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.attribution-text {
  margin: 0;
  font-size: 14px;
  line-height: 1.75;
  color: var(--text-2, #4a423a);
}

.attribution-text b {
  color: var(--sf-primary, #e2683c);
  font-weight: 700;
}

.attribution-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 2px;
}

@media (max-width: 700px) {
  .attribution-text {
    font-size: 13px;
  }
}
</style>
