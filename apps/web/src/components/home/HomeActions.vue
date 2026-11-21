<template>
  <div class="home-actions d-flex flex-wrap align-center mt-4">
    <v-btn v-if="!synced" :loading="loadingUpload" class="act act-upload" @click="$emit('upload')">
      上传
    </v-btn>
    <v-btn class="act act-sync" prepend-icon="mdi-check-circle-outline" @click="$emit('show-sync-message')">
      同步完成
    </v-btn>

    <v-btn
      v-if="showFullscreenButton"
      :prepend-icon="isFullscreen ? 'mdi-fullscreen-exit' : 'mdi-fullscreen'"
      class="act act-full"
      @click="$emit('toggle-fullscreen')"
    >
      {{ isFullscreen ? '退出全屏' : '全屏' }}
    </v-btn>

    <v-btn
      v-if="showRandomPickerButton"
      append-icon="mdi-dice-multiple"
      class="act act-random"
      prepend-icon="mdi-account-question"
      @click="$emit('open-random-picker')"
    >
      随机点名
    </v-btn>

    <v-btn
      v-if="showExamScheduleButton"
      class="act act-exam"
      prepend-icon="mdi-calendar-check"
      @click="$emit('open-exam-picker')"
    >
      考试看板
    </v-btn>

    <v-btn
      v-if="showListCardButton"
      class="act act-list"
      prepend-icon="mdi-list-box"
      @click="$emit('open-list')"
    >
      列表
    </v-btn>

    <v-btn
      v-if="showTransferButton"
      class="act act-transfer"
      prepend-icon="mdi-swap-vertical-bold"
      @click="$emit('open-transfer')"
    >
      导入导出
    </v-btn>

    <v-btn
      v-if="showTestCardButton"
      class="act act-test"
      prepend-icon="mdi-test-tube"
      @click="$emit('add-test-card')"
    >
      添加测试卡片
    </v-btn>
  </div>

</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    synced?: boolean
    loadingUpload?: boolean
    showRandomPickerButton?: boolean
    showExamScheduleButton?: boolean
    showListCardButton?: boolean
    showFullscreenButton?: boolean
    isFullscreen?: boolean
    showTestCardButton?: boolean
    showTransferButton?: boolean
  }>(),
  {
    synced: true,
    loadingUpload: false,
    showRandomPickerButton: false,
    showExamScheduleButton: false,
    showListCardButton: true,
    showFullscreenButton: true,
    isFullscreen: false,
    showTestCardButton: false,
    showTransferButton: true,
  },
)

defineEmits<{
  upload: []
  'show-sync-message': []
  'open-random-picker': []
  'toggle-fullscreen': []
  'add-exam-card': []
  'open-exam-picker': []
  'open-list': []
  'open-transfer': []
  'add-test-card': []
}>()
</script>

<style scoped>
.home-actions {
  gap: 10px;
  padding: 2px 0;
}

.home-actions .act {
  height: 44px !important;
  padding-inline: 20px !important;
  border-radius: 999px !important;
  box-shadow: none !important;
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: none;
  transition: transform 0.18s ease, filter 0.18s ease, box-shadow 0.18s ease;
}

.home-actions .act:hover {
  transform: translateY(-2px);
  filter: brightness(1.03);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.12) !important;
}

.home-actions .act-upload {
  background: rgba(229, 72, 77, 0.16) !important;
  color: #e5484d !important;
}

.home-actions .act-sync {
  background: rgba(46, 158, 99, 0.14) !important;
  color: #2e9e63 !important;
}

.home-actions .act-full {
  background: var(--bg-card-sub) !important;
  color: var(--text-2) !important;
  border: 1px solid var(--border-strong) !important;
}

.home-actions .act-random {
  background: rgba(201, 128, 31, 0.16) !important;
  color: #c9801f !important;
}

.home-actions .act-exam {
  background: rgba(180, 85, 46, 0.16) !important;
  color: #b4552e !important;
}

.home-actions .act-list {
  background: rgba(244, 81, 30, 0.14) !important;
  color: var(--brand-2, #f4511e) !important;
}

.home-actions .act-transfer {
  background: rgba(47, 127, 209, 0.14) !important;
  color: #2f7fd1 !important;
}

.home-actions .act-test {
  background: rgba(122, 108, 216, 0.16) !important;
  color: #7a6cd8 !important;
}

.v-theme--dark .home-actions .act-sync { color: #5ec38d !important; }
.v-theme--dark .home-actions .act-random { color: #e0a049 !important; }
.v-theme--dark .home-actions .act-exam { color: #d2794f !important; }
.v-theme--dark .home-actions .act-full { background: var(--bg-card-sub) !important; color: var(--text-2) !important; }
.v-theme--dark .home-actions .act-list { color: #ff8a5c !important; }
.v-theme--dark .home-actions .act-transfer { color: #86bcf5 !important; }


</style>
