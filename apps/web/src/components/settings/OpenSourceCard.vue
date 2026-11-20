<template>
  <settings-card icon="mdi-open-source-initiative" subtitle="本项目以 GNU AGPL-3.0 协议开源" title="开源说明">
    <div class="opensource-body">
      <div class="d-flex align-center" style="gap: 8px">
        <v-icon icon="mdi-github" size="22" />
        <gitee-icon :size="20" />
        <span class="font-weight-medium">源代码已公开在 GitHub 与 Gitee</span>
      </div>
      <p class="opensource-text">
        星焰作业板是开源项目，采用 GNU AGPL-3.0 协议。欢迎自建部署、提交问题与改进建议；
        如果你在网络上提供服务，按协议需要一并提供完整源代码。
      </p>

      <div class="opensource-actions">
        <v-btn
          append-icon="mdi-open-in-new"
          :href="GITHUB_REPO_URL"
          prepend-icon="mdi-github"
          rel="noopener noreferrer"
          target="_blank"
          variant="tonal"
        >
          GitHub 仓库
        </v-btn>
        <v-btn
          append-icon="mdi-open-in-new"
          :href="GITEE_REPO_URL"
          rel="noopener noreferrer"
          target="_blank"
          variant="tonal"
        >
          <template #prepend>
            <gitee-icon class="mr-2" :size="18" />
          </template>
          Gitee 仓库
        </v-btn>
        <v-btn
          append-icon="mdi-download"
          :href="GITHUB_RELEASES_URL"
          prepend-icon="mdi-package-variant-closed"
          rel="noopener noreferrer"
          target="_blank"
          variant="text"
        >
          历史版本安装包
        </v-btn>
      </div>

      <div class="text-caption text-medium-emphasis">
        GitHub 与 Gitee 均为公开仓库；安装包归档以 GitHub Releases 为准。
      </div>
    </div>
  </settings-card>
</template>

<script setup lang="ts">
import SettingsCard from '@/components/settings/SettingsCard.vue'
import GiteeIcon from '@/components/GiteeIcon.vue'
import { GITHUB_RELEASES_URL, GITHUB_REPO_URL, GITEE_REPO_URL } from '@/lib/repoLinks'
</script>

<style scoped>
.opensource-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.opensource-text {
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
  color: rgba(var(--v-theme-on-surface), 0.78);
}

.opensource-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin: 2px 0 4px;
}

@media (max-width: 700px) {
  .opensource-text {
    font-size: 13px;
  }
}
</style>
