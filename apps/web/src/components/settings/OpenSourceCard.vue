<template>
  <settings-card icon="mdi-open-source-initiative" subtitle="本项目为开源项目，源代码及相关文件即将上传至 GitHub。" title="开源说明">
    <div class="opensource-body">
      <div class="d-flex align-center" style="gap: 8px">
        <v-icon icon="mdi-github" size="22" />
        <span class="font-weight-medium">源代码即将公开</span>
      </div>
      <p class="opensource-text">
        本项目为开源项目，源代码及相关文件即将上传至 GitHub。上传完成后，仓库地址会在这里公布，
        欢迎自建部署、提交问题与改进建议。
      </p>
      <div class="text-caption text-medium-emphasis">当前版本仍在持续迭代，功能与界面可能继续调整。</div>
    </div>
  </settings-card>
</template>

<script setup lang="ts">
import SettingsCard from '@/components/settings/SettingsCard.vue'
</script>

<style scoped>
.opensource-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.opensource-text {
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
  color: rgba(var(--v-theme-on-surface), 0.78);
}
</style>
