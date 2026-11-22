<template>
  <div>
    <!-- 首屏统计骨架：圆角块 + 2 行文本条 + 右侧图标圆块 -->
    <v-row v-if="loading">
      <v-col v-for="n in 4" :key="'stat-skel-' + n" cols="12" sm="6" md="3">
        <div class="sf-skel-surface" style="padding: 16px">
          <div class="d-flex align-center justify-space-between">
            <div class="sf-skel-stack" style="flex: 1 1 auto; gap: 10px">
              <SfSkeleton w="42%" h="12px" radius="6px" />
              <SfSkeleton w="58%" h="26px" radius="8px" />
            </div>
            <SfSkeleton circle :w="44" />
          </div>
        </div>
      </v-col>
    </v-row>

    <v-row v-else>
      <v-col v-for="card in cards" :key="card.key" cols="12" sm="6" md="3">
        <v-card class="pa-4" variant="flat">
          <div class="d-flex align-center justify-space-between">
            <div>
              <div class="text-caption text-medium-emphasis">{{ card.label }}</div>
              <div class="num text-h4 font-weight-bold mt-1">{{ card.value }}</div>
            </div>
            <v-avatar :color="card.color" size="44" variant="tonal">
              <v-icon :icon="card.icon" />
            </v-avatar>
          </div>
        </v-card>
      </v-col>
    </v-row>

    <!-- 快捷操作区骨架 -->
    <div v-if="loading" class="sf-skel-surface mt-4" style="padding: 16px">
      <div class="d-flex align-center justify-space-between mb-4">
        <SfSkeleton w="112px" h="15px" radius="6px" />
        <SfSkeleton w="76px" h="12px" radius="6px" />
      </div>
      <div class="sf-skel-row" style="gap: 10px">
        <SfSkeleton w="112px" h="36px" radius="10px" />
        <SfSkeleton w="112px" h="36px" radius="10px" />
        <SfSkeleton w="104px" h="36px" radius="10px" />
      </div>
    </div>

    <v-card v-else class="mt-4 pa-4" variant="flat">
      <div class="d-flex align-center mb-3">
        <div class="text-subtitle-1 font-weight-bold">快捷操作</div>
        <v-spacer />
        <div class="text-caption text-medium-emphasis">{{ overview.date }}</div>
      </div>
      <div class="d-flex flex-wrap" style="gap: 10px">
        <v-btn prepend-icon="mdi-plus" color="primary" variant="flat" @click="go('/classes')">新建班级</v-btn>
        <v-btn prepend-icon="mdi-account-plus" variant="tonal" @click="go('/users')">新建用户</v-btn>
        <v-btn prepend-icon="mdi-monitor-dashboard" variant="text" @click="go('/devices')">查看设备</v-btn>
      </div>
    </v-card>

    <v-alert v-if="error" class="mt-4" type="error" variant="tonal">{{ error }}</v-alert>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { getData } from '@/lib/api'
import SfSkeleton from '@/components/skeleton/SfSkeleton.vue'

interface Overview {
  classCount: number
  userCount: number
  deviceCount: number
  homeworkToday: number
  studentCount: number
  date: string
}

const overview = reactive<Overview>({
  classCount: 0,
  userCount: 0,
  deviceCount: 0,
  homeworkToday: 0,
  studentCount: 0,
  date: '',
})
const loading = ref(true)
const error = ref('')

function go(path: string): void {
  window.location.href = path
}

const cards = computed(() => [
  { key: 'class', label: '班级数', value: overview.classCount, icon: 'mdi-google-classroom', color: 'primary' },
  { key: 'user', label: '用户数', value: overview.userCount, icon: 'mdi-account-multiple-outline', color: 'info' },
  { key: 'device', label: '在线设备', value: overview.deviceCount, icon: 'mdi-monitor-dashboard', color: 'success' },
  { key: 'homework', label: '今日作业', value: overview.homeworkToday, icon: 'mdi-book-open-page-variant', color: 'warning' },
])

onMounted(async () => {
  try {
    const result = await getData<Overview>('/admin/overview')
    Object.assign(overview, result)
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败'
  } finally {
    loading.value = false
  }
})
</script>
