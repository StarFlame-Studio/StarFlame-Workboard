<template>
  <settings-group icon="mdi-database-eye" title="Cloud 数据浏览">
    <template #actions>
      <v-btn prepend-icon="mdi-refresh" variant="text" @click="load">刷新</v-btn>
    </template>

    <v-alert class="ma-2" density="compact" type="info" variant="tonal">
      这里展示当前班级在云端的全部数据实体（对应原项目的 KV 键）。点击操作可查看内容。
    </v-alert>

    <v-list-subheader>数据条目 · 共 {{ items.length }} 条</v-list-subheader>

    <v-list-item>
      <v-text-field v-model="keyword" clearable density="compact" hide-details placeholder="搜索名称" prepend-inner-icon="mdi-magnify" variant="outlined" />
    </v-list-item>

    <v-divider class="my-2" />

    <template v-for="(item, index) in filtered" :key="item.key">
      <v-list-item>
        <template #prepend>
          <v-icon class="mr-3" :icon="item.icon" size="small" />
        </template>
        <v-list-item-title class="text-body-2">
          <code>{{ item.key }}</code>
        </v-list-item-title>
        <v-list-item-subtitle class="text-caption">{{ item.desc }} · {{ item.count }}</v-list-item-subtitle>
        <template #append>
          <v-btn icon="mdi-eye-outline" size="small" variant="text" @click="inspect(item)" />
          <v-btn :disabled="!item.link" icon="mdi-link" size="small" variant="text" @click="openLink(item)" />
        </template>
      </v-list-item>
      <v-divider v-if="index < filtered.length - 1" />
    </template>

    <v-list-item v-if="filtered.length === 0">
      <v-list-item-title class="text-caption text-medium-emphasis">没有匹配的数据</v-list-item-title>
    </v-list-item>

    <v-dialog v-model="dialog.open" max-width="720" scrollable>
      <v-card>
        <v-card-title class="d-flex align-center">
          <code class="text-body-1">{{ dialog.key }}</code>
          <v-spacer />
          <v-btn icon="mdi-close" variant="text" @click="dialog.open = false" />
        </v-card-title>
        <v-card-subtitle>{{ dialog.desc }}</v-card-subtitle>
        <v-divider />
        <v-card-text>
          <pre class="json-view">{{ dialog.content }}</pre>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn prepend-icon="mdi-content-copy" variant="text" @click="copyContent">复制</v-btn>
          <v-btn color="primary" variant="text" @click="dialog.open = false">关闭</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-snackbar v-model="snack.show" :color="snack.color" timeout="2400">{{ snack.text }}</v-snackbar>
  </settings-group>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { apiBase, getData } from '@/lib/api'
import SettingsGroup from '@/components/settings/SettingGroup.vue'

interface Entry {
  key: string
  desc: string
  count: number
  icon: string
  link: string
  loader: () => Promise<unknown>
}

const items = ref<Entry[]>([])
const keyword = ref('')
const snack = reactive({ show: false, text: '', color: 'success' })
const dialog = reactive({ open: false, key: '', desc: '', content: '' })

const filtered = computed(() => {
  const key = keyword.value.trim().toLowerCase()
  if (!key) return items.value
  return items.value.filter((item) => item.key.toLowerCase().includes(key))
})

function toJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

async function buildEntries(): Promise<void> {
  const board = await getData<{
    subjects: unknown[]
    homework: unknown[]
    exams: unknown[]
    notices: unknown[]
    students: unknown[]
    customCards: unknown[]
    settings: Record<string, unknown>
  }>('/board/bootstrap')

  const entries: Entry[] = [
    { key: 'classworks-config-settings', desc: '看板配置', count: Object.keys(board.settings ?? {}).length, icon: 'mdi-cog', link: '', loader: async () => board.settings },
    { key: 'board-subjects', desc: '科目表', count: board.subjects.length, icon: 'mdi-book-outline', link: '', loader: async () => board.subjects },
    { key: 'board-homework', desc: '当日作业', count: board.homework.length, icon: 'mdi-book-open-page-variant', link: '', loader: async () => board.homework },
    { key: 'board-exams', desc: '考试配置', count: board.exams.length, icon: 'mdi-calendar-check', link: '', loader: async () => board.exams },
    { key: 'board-notices', desc: '通知公告', count: board.notices.length, icon: 'mdi-bullhorn', link: '', loader: async () => board.notices },
    { key: 'board-students', desc: '花名册', count: board.students.length, icon: 'mdi-account-group', link: '', loader: async () => board.students },
    { key: 'board-custom-cards', desc: '自定义卡片', count: board.customCards.length, icon: 'mdi-shape-outline', link: '', loader: async () => board.customCards },
  ]

  try {
    const lists = await getData<{ items: unknown[] }>('/board/lists')
    entries.push({ key: 'board-student-lists', desc: '多套名单', count: lists.items.length, icon: 'mdi-format-list-bulleted', link: '', loader: async () => lists.items })
  } catch {
    // 忽略
  }

  try {
    const teachers = await getData<{ items: unknown[] }>('/board/teachers')
    entries.push({ key: 'board-teachers', desc: '教师列表', count: teachers.items.length, icon: 'mdi-account-tie', link: '', loader: async () => teachers.items })
  } catch {
    // 忽略
  }

  // 考试配置附带公开链接
  const exams = board.exams as Array<{ id: string }>
  const examEntries = await Promise.all(
    exams.slice(0, 10).map(async (exam, index) => ({
      key: 'public-exam-' + (index + 1),
      desc: '考试公开配置 ' + exam.id.slice(-6),
      count: 1,
      icon: 'mdi-link-variant',
      link: apiBase + '/public/exams/' + exam.id,
      loader: async () => getData('/public/exams/' + exam.id),
    })),
  )
  entries.push(...examEntries)

  items.value = entries
}

async function load(): Promise<void> {
  try {
    await buildEntries()
  } catch (error) {
    snack.text = error instanceof Error ? error.message : '加载失败'
    snack.color = 'error'
    snack.show = true
  }
}

async function inspect(entry: Entry): Promise<void> {
  dialog.key = entry.key
  dialog.desc = entry.desc
  dialog.content = '加载中…'
  dialog.open = true
  try {
    const data = await entry.loader()
    dialog.content = toJson(data)
  } catch {
    dialog.content = '加载失败'
  }
}

function openLink(entry: Entry): void {
  if (entry.link) window.open(entry.link, '_blank')
}

async function copyContent(): Promise<void> {
  try {
    await navigator.clipboard.writeText(dialog.content)
    snack.text = '已复制'
    snack.color = 'success'
  } catch {
    snack.text = '复制失败'
    snack.color = 'error'
  }
  snack.show = true
}

onMounted(load)
</script>

<style scoped>
.json-view {
  max-height: 420px;
  overflow: auto;
  font-size: 12px;
  line-height: 1.6;
  margin: 0;
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
