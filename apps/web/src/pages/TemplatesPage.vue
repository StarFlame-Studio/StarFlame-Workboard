<template>
  <v-container class="py-4 sf-page-scroll" max-width="900">
    <div class="d-flex align-center mb-4">
      <v-btn icon="mdi-arrow-left" variant="text" @click="go('board')" />
      <div class="text-h6 font-weight-bold ml-2">作业模板设置</div>
      <v-spacer />
      <v-btn :loading="saving" color="primary" prepend-icon="mdi-content-save" variant="elevated" @click="save">保存</v-btn>
    </div>

    <v-alert class="mb-4" density="compact" type="info" variant="tonal">
      这里配置的内容会出现在作业编辑弹窗里：点课本展开页码，点页码往文本里插入「课本 页码」；快捷操作会作为蓝色按钮。
    </v-alert>

    <template v-if="loading">
      <form-skeleton :rows-per-section="2" :sections="3" />
    </template>
    <template v-else>

    <v-card class="mb-4 pa-4" variant="flat">
      <div class="text-subtitle-1 font-weight-bold mb-3">提示语</div>
      <v-text-field v-model="autoSaveText" class="mb-2" density="comfortable" label="自动保存时的提示" />
      <v-text-field v-model="manualSaveText" density="comfortable" label="手动保存时的提示" />
    </v-card>

    <v-card class="mb-4 pa-4" variant="flat">
      <div class="text-subtitle-1 font-weight-bold mb-3">快捷操作</div>
      <v-text-field
        v-model="actionsText"
        density="comfortable"
        hint="用逗号分隔，例如：导完,下一课,不交,明天交,今晚交,下周交"
        persistent-hint
        placeholder="导完,下一课,不交,明天交,今晚交,下周交"
      />
    </v-card>

    <v-card class="mb-4 pa-4" variant="flat">
      <div class="d-flex align-center mb-3">
        <div class="text-subtitle-1 font-weight-bold">分科目课本</div>
        <v-spacer />
        <v-select v-model="currentSubject" class="mr-2" density="compact" hide-details :items="subjectOptions" style="max-width: 160px" variant="outlined" />
        <v-btn color="primary" prepend-icon="mdi-plus" size="small" variant="tonal" @click="addBook(subjectBooks)">添加课本</v-btn>
      </div>

      <div v-if="subjectBooks.length === 0" class="text-center text-medium-emphasis py-4">
        该科目还没有课本，点「添加课本」
      </div>

      <div v-for="(book, index) in subjectBooks" :key="index" class="mb-2">
        <div class="d-flex align-center" style="gap: 8px">
          <v-text-field v-model="book.name" density="compact" hide-details label="课本名" style="max-width: 160px" variant="outlined" />
          <v-text-field
            v-model="book.pagesText"
            density="compact"
            hide-details
            hint="页码用逗号分隔，支持 1-10 范围"
            label="页码"
            persistent-hint
            variant="outlined"
          />
          <v-btn color="error" icon="mdi-delete" size="small" variant="text" @click="subjectBooks.splice(index, 1)" />
        </div>
        <div class="text-caption text-medium-emphasis mt-1 ml-1">将生成 {{ parsePages(book.pagesText).length }} 个页码按钮</div>
      </div>
    </v-card>

    <v-card class="mb-4 pa-4" variant="flat">
      <div class="d-flex align-center mb-3">
        <div class="text-subtitle-1 font-weight-bold">通用课本（所有科目都显示）</div>
        <v-spacer />
        <v-btn color="primary" prepend-icon="mdi-plus" size="small" variant="tonal" @click="addBook(commonBooks)">添加课本</v-btn>
      </div>

      <div v-if="commonBooks.length === 0" class="text-center text-medium-emphasis py-4">
        还没有通用课本
      </div>

      <div v-for="(book, index) in commonBooks" :key="'c' + index" class="mb-2">
        <div class="d-flex align-center" style="gap: 8px">
          <v-text-field v-model="book.name" density="compact" hide-details label="课本名" style="max-width: 160px" variant="outlined" />
          <v-text-field
            v-model="book.pagesText"
            density="compact"
            hide-details
            hint="页码用逗号分隔，支持 1-10 范围"
            label="页码"
            persistent-hint
            variant="outlined"
          />
          <v-btn color="error" icon="mdi-delete" size="small" variant="text" @click="commonBooks.splice(index, 1)" />
        </div>
      </div>
    </v-card>

    <v-card class="pa-4" variant="flat">
      <div class="d-flex align-center">
        <div class="text-body-2 text-medium-emphasis">没有模板？可以一键生成一份常用示例，再自己改。</div>
        <v-spacer />
        <v-btn prepend-icon="mdi-auto-fix" variant="tonal" @click="fillSample">填充示例</v-btn>
      </div>
    </v-card>

    </template>

    <v-snackbar v-model="snack.show" :color="snack.color" timeout="2400">{{ snack.text }}</v-snackbar>
  </v-container>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { getData, patchData } from '@/lib/api'
import { navigate, type PageName } from '@/lib/nav'
import FormSkeleton from '@/components/skeleton/FormSkeleton.vue'

function go(page: PageName): void {
  navigate(page)
}

interface BookRow {
  name: string
  pagesText: string
}

interface TemplateState {
  subjects?: Record<string, { books?: Record<string, string[]> }>
  commonSubject?: { books?: Record<string, string[]> }
  actions?: string[]
}

const subjects = ref<Array<{ id: string; name: string; code: string }>>([])
const currentSubject = ref('语文')
const actionsText = ref('导完,下一课,不交,明天交,今晚交,下周交')
const autoSaveText = ref('内容会自动保存，关闭对话框即生效')
const manualSaveText = ref('修改后请点击保存')
const saving = ref(false)
const loading = ref(true)
const snack = reactive({ show: false, text: '', color: 'success' })

const subjectBooks = reactive<BookRow[]>([])
const commonBooks = reactive<BookRow[]>([])
const perSubject = reactive<Record<string, BookRow[]>>({})

const subjectOptions = computed(() => subjects.value.map((item) => item.name))

function parsePages(text: string): string[] {
  const result: string[] = []
  const parts = (text || '').split(/[,，\s]+/).filter(Boolean)
  for (const part of parts) {
    const range = part.match(/^(\d+)\s*[-~]\s*(\d+)$/)
    if (range) {
      const start = Number(range[1])
      const end = Number(range[2])
      if (Number.isFinite(start) && Number.isFinite(end) && end >= start && end - start < 100) {
        for (let i = start; i <= end; i += 1) result.push('P' + i)
        continue
      }
    }
    if (/^P\d+$/i.test(part)) result.push(part.toUpperCase())
    else if (/^\d+$/.test(part)) result.push('P' + part)
  }
  return Array.from(new Set(result))
}

function syncSubjectBooks(): void {
  const list = perSubject[currentSubject.value]
  subjectBooks.splice(0, subjectBooks.length, ...(list ? list.map((item) => ({ ...item })) : []))
}

watch(currentSubject, () => {
  syncSubjectBooks()
})

watch(
  subjectBooks,
  () => {
    perSubject[currentSubject.value] = subjectBooks.map((item) => ({ ...item }))
  },
  { deep: true },
)

function addBook(list: BookRow[]): void {
  list.push({ name: '', pagesText: '' })
}

function notify(text: string, color = 'success'): void {
  snack.text = text
  snack.color = color
  snack.show = true
}

function fillSample(): void {
  const sample: Record<string, BookRow[]> = {
    语文: [{ name: '书', pagesText: '1-10' }, { name: '复习', pagesText: '1-5' }],
    数学: [{ name: '试卷', pagesText: '1-3' }, { name: '练习', pagesText: '1-10' }],
    英语: [{ name: '书', pagesText: '1-10' }, { name: '同步练习', pagesText: '1-8' }],
  }
  for (const [subject, books] of Object.entries(sample)) {
    perSubject[subject] = books.map((item) => ({ ...item }))
  }
  if (!perSubject[currentSubject.value]) perSubject[currentSubject.value] = []
  commonBooks.splice(0, commonBooks.length, { name: '同步练习', pagesText: '1-8' })
  syncSubjectBooks()
  actionsText.value = '导完,下一课,不交,明天交,今晚交,下周交'
  notify('已填充示例，记得点保存')
}

async function load(): Promise<void> {
  try {
    const [boardResult, meResult] = await Promise.all([
      getData<{ subjects: Array<{ id: string; name: string; code: string }> }>('/board/bootstrap'),
      getData<{ settings: Record<string, unknown> }>('/device/me'),
    ])
    subjects.value = boardResult.subjects
    currentSubject.value = boardResult.subjects[0]?.name ?? '语文'

    const settings = meResult.settings ?? {}
    const tpl = (settings.homeworkTemplate ?? null) as TemplateState | null
    if (tpl) {
      if (tpl.actions?.length) actionsText.value = tpl.actions.join(',')
      if (typeof tpl.subjects === 'object' && tpl.subjects) {
        for (const [subject, value] of Object.entries(tpl.subjects)) {
          const books = value?.books ?? {}
          perSubject[subject] = Object.entries(books).map(([name, pages]) => ({
            name,
            pagesText: pages.map((p) => p.replace(/^P/i, '')).join(','),
          }))
        }
      }
      const common = tpl.commonSubject?.books ?? {}
      commonBooks.splice(
        0,
        commonBooks.length,
        ...Object.entries(common).map(([name, pages]) => ({
          name,
          pagesText: pages.map((p) => p.replace(/^P/i, '')).join(','),
        })),
      )
    }
    if (typeof settings.autoSavePromptText === 'string' && settings.autoSavePromptText) {
      autoSaveText.value = settings.autoSavePromptText
    }
    if (typeof settings.manualSavePromptText === 'string' && settings.manualSavePromptText) {
      manualSaveText.value = settings.manualSavePromptText
    }
    syncSubjectBooks()
  } catch (error) {
    notify(error instanceof Error ? error.message : '加载失败', 'error')
  } finally {
    loading.value = false
  }
}

async function save(): Promise<void> {
  if (saving.value) return
  saving.value = true
  try {
    perSubject[currentSubject.value] = subjectBooks.map((item) => ({ ...item }))

    const subjectsOut: Record<string, { books: Record<string, string[]> }> = {}
    for (const [subject, books] of Object.entries(perSubject)) {
      const map: Record<string, string[]> = {}
      for (const book of books) {
        const name = book.name.trim()
        if (!name) continue
        const pages = parsePages(book.pagesText)
        if (pages.length > 0) map[name] = pages
      }
      if (Object.keys(map).length > 0) subjectsOut[subject] = { books: map }
    }

    const commonMap: Record<string, string[]> = {}
    for (const book of commonBooks) {
      const name = book.name.trim()
      if (!name) continue
      const pages = parsePages(book.pagesText)
      if (pages.length > 0) commonMap[name] = pages
    }

    await patchData('/board/settings', {
      settings: {
        homeworkTemplate: {
          subjects: subjectsOut,
          commonSubject: { books: commonMap },
          actions: actionsText.value.split(/[,，]/).map((item) => item.trim()).filter(Boolean),
        },
        autoSavePromptText: autoSaveText.value,
        manualSavePromptText: manualSaveText.value,
      },
    })
    notify('已保存')
  } catch (error) {
    notify(error instanceof Error ? error.message : '保存失败', 'error')
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>
