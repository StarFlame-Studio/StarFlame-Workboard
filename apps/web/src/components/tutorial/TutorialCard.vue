<template>
  <v-card v-if="visible" border class="tutorial-card mt-4" variant="flat">
    <liquid-glass />
    <v-card-title class="d-flex align-center text-subtitle-1">
      使用教程
      <v-spacer />
      <v-icon class="mr-2" icon="mdi-school" size="30" />
      <v-btn icon="mdi-close" size="small" title="关闭教程卡片" variant="text" @click="dismiss" />
    </v-card-title>
    <v-card-subtitle class="tutorial-sub">
      没时间一次看完没关系：可以只练一段，随时回来继续。关闭后可在「设置 → 首页 → 使用教程」里重新打开。
    </v-card-subtitle>

    <v-card-text class="pt-1">
      <div class="d-flex flex-wrap tutorial-actions" style="gap: 10px">
        <v-btn color="primary" prepend-icon="mdi-gesture-tap" variant="tonal" @click="emit('basic')">基础教程</v-btn>
        <v-btn prepend-icon="mdi-school" variant="tonal" @click="emit('advanced')">进阶教程</v-btn>
        <v-btn v-if="canTeacherLogin" prepend-icon="mdi-account-key" variant="tonal" @click="emit('teacher-login')">
          教师端登录
        </v-btn>
      </div>
      <div class="text-caption text-medium-emphasis mt-3">
        基础教程：布置作业、调字体、切日期。进阶教程：考试看板、随机点名、发送通知。
      </div>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import LiquidGlass from '@/components/ui/LiquidGlass.vue'
import { useSessionStore } from '@/stores/session'

/** 关闭状态存本机：每台设备各自决定要不要显示这张卡片 */
const DISMISS_KEY = 'sf.tutorialCardDismissed'

const emit = defineEmits<{
  basic: []
  advanced: []
  'teacher-login': []
}>()

const session = useSessionStore()
const visible = ref(false)

/** 只有一体机（terminal）能取到教师授权码，其他设备不显示这个入口 */
const canTeacherLogin = computed(() => session.role === 'terminal')

function dismiss(): void {
  visible.value = false
  try {
    localStorage.setItem(DISMISS_KEY, '1')
  } catch {
    // 隐私模式下存不了，至少本次会话内隐藏
  }
}

onMounted(() => {
  try {
    visible.value = localStorage.getItem(DISMISS_KEY) !== '1'
  } catch {
    visible.value = true
  }
})
</script>

<style scoped>
.tutorial-card {
  overflow: hidden;
}
.tutorial-sub {
  white-space: normal !important;
  line-height: 1.5;
  font-size: 13px;
  padding-bottom: 0;
}
.tutorial-actions :deep(.v-btn) {
  text-transform: none;
  font-weight: 600;
}
</style>
