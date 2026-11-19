<template>
  <settings-card icon="mdi-microsoft-windows" subtitle="与网页端同一套界面与功能，装到教室一体机后开机即用。" title="Windows 桌面端">
    <div class="desktop-body">
      <div class="d-flex flex-wrap align-center" style="gap: 10px">
        <v-btn class="desktop-download" color="primary" href="/desktop/" prepend-icon="mdi-download" target="_blank" variant="elevated">
          下载 Windows 版
        </v-btn>
        <span class="text-caption text-medium-emphasis">Win10 / 11 与 Win7 SP1 均有对应安装包</span>
      </div>
      <div class="desktop-tips">
        <div class="tip-row">
          <v-icon icon="mdi-check-circle-outline" size="16" />
          <span>同一份源码构建，布局、字号、离线缓存与网页端完全一致</span>
        </div>
        <div class="tip-row">
          <v-icon icon="mdi-check-circle-outline" size="16" />
          <span>支持开机自启与窗口全屏，一体机上不用再开浏览器</span>
        </div>
        <div class="tip-row">
          <v-icon icon="mdi-check-circle-outline" size="16" />
          <span>自动更新：检测到新版本会立即下载安装并自动重启</span>
        </div>
      </div>
      <div class="text-caption text-medium-emphasis">
        安装包由「焰火工作室」自签名（未购买权威证书），Windows 若提示「已保护你的电脑」，点「更多信息 → 仍要运行」即可。
      </div>
    </div>
  </settings-card>
</template>

<script setup lang="ts">
import SettingsCard from '@/components/settings/SettingsCard.vue'
</script>

<style scoped>
.desktop-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.desktop-tips {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 14px;
  line-height: 1.55;
  color: rgba(var(--v-theme-on-surface), 0.78);
}

.tip-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.tip-row .v-icon {
  margin-top: 2px;
  color: rgb(var(--v-theme-primary));
}

@media (max-width: 700px) {
  .desktop-download {
    width: 100%;
  }
}
</style>
