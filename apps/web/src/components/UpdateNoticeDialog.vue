<template>
  <v-dialog v-model="open" max-width="560" scrollable>
    <v-card class="rounded-xl update-dialog">
      <v-card-title class="d-flex align-center">
        <v-icon class="mr-2" color="primary">mdi-check-decagram-outline</v-icon>
        <span class="text-h6">已更新到 v{{ version }}</span>
      </v-card-title>
      <v-divider />
      <v-card-text class="pa-6">
        <div class="update-summary">{{ entry?.summary || '本次更新包含若干修复与优化。' }}</div>
        <ul v-if="items.length" class="update-items">
          <li v-for="(item, i) in items" :key="i">{{ item }}</li>
        </ul>
        <div class="update-foot">桌面端已在后台静默完成安装并自动重启，无需任何操作。</div>
      </v-card-text>
      <v-divider />
      <v-card-actions class="pa-4">
        <v-spacer />
        <v-btn color="primary" prepend-icon="mdi-check" size="large" variant="elevated" @click="close">知道了</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
/**
 * 静默更新重启后的「已更新到 x.y.z」提示。
 * 主进程在启动时判定本轮是不是刚被自动更新（--updated 启动参数 / 版本号变化），
 * 这里取一次并展示对应版本的更新内容（数据源与版本号徽标共用 CHANGELOG）。
 */
import { computed, onMounted, ref } from 'vue'
import { findChangelog, type ChangelogEntry } from '@/lib/changelog'
import { isDesktop, startupNotice } from '@/lib/platform'

/** 记下已提示过的版本：即使主进程重复给出同一次提示，也不重复弹窗 */
const SEEN_KEY = 'sf.updateNotice.seenVersion'

const open = ref(false)
const version = ref('')
const entry = ref<ChangelogEntry | null>(null)

const items = computed(() => entry.value?.items ?? [])

onMounted(() => {
  if (!isDesktop) return
  void startupNotice()
    .then((notice) => {
      if (!notice || !notice.to) return
      if (localStorage.getItem(SEEN_KEY) === notice.to) return
      version.value = notice.to
      entry.value = findChangelog(notice.to) ?? null
      open.value = true
    })
    .catch(() => {
      // 提示失败不影响正常使用
    })
})

function close(): void {
  open.value = false
  if (version.value) localStorage.setItem(SEEN_KEY, version.value)
}
</script>

<style scoped>
.update-dialog {
  overflow: hidden;
}

.update-summary {
  font-size: 15px;
  font-weight: 600;
  line-height: 1.7;
  color: var(--text-1);
}

.update-items {
  margin: 14px 0 0;
  padding-left: 20px;
  font-size: 14px;
  line-height: 1.9;
  color: var(--text-2);
}

.update-items li {
  margin-bottom: 6px;
}

.update-foot {
  margin-top: 16px;
  font-size: 13px;
  color: var(--text-3);
}
</style>
