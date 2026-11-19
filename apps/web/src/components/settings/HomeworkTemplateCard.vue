<template>
  <settings-group icon="mdi-book-edit" title="作业模板配置">
    <template #actions>
      <v-btn :loading="loading" class="mr-2" color="primary" prepend-icon="mdi-refresh" variant="text" @click="loadConfig">
        重新加载配置
      </v-btn>
      <v-btn :loading="saving" color="success" prepend-icon="mdi-content-save" variant="elevated" @click="saveConfig">
        保存所有更改
      </v-btn>
      <v-chip v-if="hasChanges" class="ml-3" color="warning" size="small" variant="elevated">有未保存的更改</v-chip>
    </template>

    <v-alert v-if="error" class="ma-2" closable type="error" variant="tonal" @click:close="error = ''">{{ error }}</v-alert>

    <v-row class="pa-2">
      <v-col cols="12" md="6">
        <v-card border variant="outlined">
          <v-card-title class="d-flex align-center text-subtitle-1">
            <v-icon class="mr-2" icon="mdi-book" size="small" />
            科目配置
          </v-card-title>
          <v-card-text>
            <div class="text-caption text-medium-emphasis mb-1">
              科目自动读取「科目管理」中的科目，在这里只为每个科目配置作业本（增删科目请到「科目」页）。
            </div>
            <div v-if="subjectsLoading" class="d-flex justify-center py-3">
              <v-progress-circular indeterminate size="20" />
            </div>

            <v-card v-for="subject in subjectNames" :key="subject" border class="mt-3" variant="flat">
              <v-card-title class="d-flex align-center py-2">
                <v-icon class="mr-2" icon="mdi-bookmark-outline" size="small" />
                <span class="text-subtitle-1 font-weight-bold">{{ subject }}</span>
                <v-spacer />
              </v-card-title>
              <v-card-text>
                <v-text-field
                  :model-value="newBookTypes[subject] ?? ''"
                  append-inner-icon="mdi-plus"
                  class="mb-2"
                  density="comfortable"
                  label="添加作业本名称"
                  variant="outlined"
                  @update:model-value="(v) => { newBookTypes[subject] = String(v) }"
                  @click:append-inner="addBookType(subject)"
                  @keyup.enter="addBookType(subject)"
                />

                <v-list density="compact" rounded>
                  <v-list-item v-for="(pages, book) in booksOf(subject)" :key="book" @click="openBookDialog(subject, book)">
                    <template #prepend>
                      <v-icon class="mr-2" icon="mdi-book-open-variant" size="small" />
                    </template>
                    <v-list-item-title>{{ book }}</v-list-item-title>
                    <template #append>
                      <v-chip class="mr-2" color="info" size="x-small">{{ pages.length }} 个部分</v-chip>
                      <v-btn color="error" icon="mdi-delete" size="small" variant="text" @click.stop="removeBookType(subject, book)" />
                    </template>
                  </v-list-item>
                  <v-list-item v-if="Object.keys(booksOf(subject)).length === 0">
                    <v-list-item-title class="text-caption text-medium-emphasis">还没有作业本</v-list-item-title>
                  </v-list-item>
                </v-list>
              </v-card-text>
            </v-card>

            <div v-if="!subjectsLoading && subjectNames.length === 0" class="text-caption text-medium-emphasis mt-3">
              还没有科目，请先到「科目」页添加
            </div>
          </v-card-text>
        </v-card>
      </v-col>

      <v-col cols="12" md="6">
        <v-card border variant="outlined">
          <v-card-title class="d-flex align-center text-subtitle-1">
            <v-icon class="mr-2" icon="mdi-cog" size="small" />
            通用配置
          </v-card-title>
          <v-card-text>
            <v-text-field
              v-model="newCommonBook"
              append-inner-icon="mdi-plus"
              density="comfortable"
              label="添加作业本名称"
              variant="outlined"
              @click:append-inner="addCommonBook"
              @keyup.enter="addCommonBook"
            />

            <v-list class="mt-2" density="compact" rounded>
              <v-list-item v-for="(pages, book) in commonBooks" :key="book" @click="openCommonDialog(book)">
                <template #prepend>
                  <v-icon class="mr-2" icon="mdi-book-open-variant" size="small" />
                </template>
                <v-list-item-title>{{ book }}</v-list-item-title>
                <template #append>
                  <v-chip class="mr-2" color="info" size="x-small">{{ pages.length }} 个部分</v-chip>
                  <v-btn color="error" icon="mdi-delete" size="small" variant="text" @click.stop="removeCommonBook(book)" />
                </template>
              </v-list-item>
              <v-list-item v-if="Object.keys(commonBooks).length === 0">
                <v-list-item-title class="text-caption text-medium-emphasis">还没有通用作业本</v-list-item-title>
              </v-list-item>
            </v-list>

            <v-divider class="my-4" />

            <v-text-field
              v-model="newAction"
              append-inner-icon="mdi-plus"
              class="mb-2"
              density="comfortable"
              label="添加操作"
              variant="outlined"
              @click:append-inner="addAction"
              @keyup.enter="addAction"
            />

            <v-list density="compact" rounded>
              <v-list-item v-for="(action, index) in actions" :key="action + index">
                <template #prepend>
                  <v-icon class="mr-2" icon="mdi-gesture-tap-button" size="small" />
                </template>
                <v-list-item-title>{{ action }}</v-list-item-title>
                <template #append>
                  <v-btn color="error" icon="mdi-delete" size="small" variant="text" @click="removeAction(index)" />
                </template>
              </v-list-item>
              <v-list-item v-if="actions.length === 0">
                <v-list-item-title class="text-caption text-medium-emphasis">还没有快捷操作</v-list-item-title>
              </v-list-item>
            </v-list>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <v-dialog v-model="bookDialog.open" max-width="560">
      <v-card>
        <v-card-title class="d-flex align-center">
          {{ bookDialog.book }}
          <v-spacer />
          <v-btn icon="mdi-close" variant="text" @click="bookDialog.open = false" />
        </v-card-title>
        <v-card-subtitle>{{ bookDialog.common ? '通用课本' : bookDialog.subject }} · 页码范围</v-card-subtitle>
        <v-card-text>
          <v-text-field
            v-model="bookDialog.pagesText"
            density="comfortable"
            hint="用逗号分隔，支持区间，如：1,3,5-10"
            label="页码"
            persistent-hint
            variant="outlined"
          />
          <div class="text-caption text-medium-emphasis mt-2">将生成 {{ parsePages(bookDialog.pagesText).length }} 个页码按钮</div>
          <div class="d-flex flex-wrap mt-3" style="gap: 4px">
            <v-chip v-for="page in parsePages(bookDialog.pagesText).slice(0, 40)" :key="page" size="x-small" variant="tonal">
              {{ page }}
            </v-chip>
          </div>
        </v-card-text>
        <v-card-actions>
          <v-btn variant="text" @click="bookDialog.open = false">取消</v-btn>
          <v-spacer />
          <v-btn color="primary" variant="elevated" @click="applyBookPages">确定</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-snackbar v-model="snack.show" :color="snack.color" timeout="2400">{{ snack.text }}</v-snackbar>
  </settings-group>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { getData, patchData } from '@/lib/api'
import SettingsGroup from '@/components/settings/SettingGroup.vue'

interface BookMap {
  [book: string]: string[]
}

interface TemplateState {
  subjects: Record<string, { books: BookMap }>
  commonSubject: { books: BookMap }
  actions: string[]
}

const loading = ref(false)
const saving = ref(false)
const error = ref('')
const snack = reactive({ show: false, text: '', color: 'success' })

/** 默认模板（与班级默认设置一致） */
const DEFAULT_ACTIONS = ['写完', '不交', '明天交', '今晚交', '下周交', '下周一交']
const DEFAULT_COMMON_BOOKS: BookMap = { 书: [], 复习: [], 预习: [], 周练卷: [], 练习册: [] }

const state = reactive<TemplateState>({
  subjects: {},
  commonSubject: { books: { ...DEFAULT_COMMON_BOOKS } },
  actions: [...DEFAULT_ACTIONS],
})
const baseline = ref('')

const subjectsLoading = ref(false)
const managedSubjects = ref<string[]>([])
const newBookTypes = reactive<Record<string, string>>({})
const newCommonBook = ref('')
const newAction = ref('')

const bookDialog = reactive({
  open: false,
  common: false,
  subject: '',
  book: '',
  pagesText: '',
})

const subjectNames = computed(() => Object.keys(state.subjects))
const commonBooks = computed(() => state.commonSubject.books)
const actions = computed(() => state.actions)

const hasChanges = computed(() => {
  syncToState()
  return JSON.stringify(state) !== baseline.value
})

function notify(text: string, color = 'success'): void {
  snack.text = text
  snack.color = color
  snack.show = true
}

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

function pagesToText(pages: string[]): string {
  return pages.map((p) => p.replace(/^P/i, '')).join(',')
}

/** 模板 v-list 的键在索引签名下被推断为 string | number，这里统一收敛为字符串 */
function bookKey(book: string | number): string {
  return String(book)
}

function booksOf(subject: string): BookMap {
  return state.subjects[subject]?.books ?? {}
}

function addBookType(subject: string): void {
  const name = (newBookTypes[subject] ?? '').trim()
  if (!name) return
  if (!state.subjects[subject]) return
  state.subjects[subject].books[name] = state.subjects[subject].books[name] ?? []
  newBookTypes[subject] = ''
  openBookDialog(subject, name)
}

function removeBookType(subject: string, rawBook: string | number): void {
  const book = bookKey(rawBook)
  if (state.subjects[subject]) delete state.subjects[subject].books[book]
}

function addCommonBook(): void {
  const name = newCommonBook.value.trim()
  if (!name) return
  state.commonSubject.books[name] = state.commonSubject.books[name] ?? []
  newCommonBook.value = ''
  openCommonDialog(name)
}

function removeCommonBook(rawBook: string | number): void {
  delete state.commonSubject.books[bookKey(rawBook)]
}

function addAction(): void {
  const name = newAction.value.trim()
  if (!name) return
  state.actions.push(name)
  newAction.value = ''
}

function removeAction(index: number): void {
  state.actions.splice(index, 1)
}

function openBookDialog(subject: string, rawBook: string | number): void {
  const book = bookKey(rawBook)
  bookDialog.open = true
  bookDialog.common = false
  bookDialog.subject = subject
  bookDialog.book = book
  bookDialog.pagesText = pagesToText(state.subjects[subject]?.books[book] ?? [])
}

function openCommonDialog(rawBook: string | number): void {
  const book = bookKey(rawBook)
  bookDialog.open = true
  bookDialog.common = true
  bookDialog.subject = ''
  bookDialog.book = book
  bookDialog.pagesText = pagesToText(state.commonSubject.books[book] ?? [])
}

function applyBookPages(): void {
  const pages = parsePages(bookDialog.pagesText)
  if (bookDialog.common) {
    state.commonSubject.books[bookDialog.book] = pages
  } else if (state.subjects[bookDialog.subject]) {
    state.subjects[bookDialog.subject]!.books[bookDialog.book] = pages
  }
  bookDialog.open = false
}

function syncToState(): void {
  for (const subject of Object.keys(state.subjects)) {
    if (!state.subjects[subject]) state.subjects[subject] = { books: {} }
  }
}

function normalize(raw: unknown): TemplateState {
  const value = (raw ?? {}) as Partial<TemplateState>
  const subjects: Record<string, { books: BookMap }> = {}
  for (const [key, entry] of Object.entries(value.subjects ?? {})) {
    subjects[key] = { books: { ...(entry?.books ?? {}) } }
  }
  const storedBooks = value.commonSubject?.books ?? {}
  return {
    subjects,
    commonSubject: {
      books: Object.keys(storedBooks).length > 0 ? { ...storedBooks } : { ...DEFAULT_COMMON_BOOKS },
    },
    actions: Array.isArray(value.actions) && value.actions.length > 0 ? [...value.actions] : [...DEFAULT_ACTIONS],
  }
}

/** 读取「科目管理」里的科目（与科目页同一数据源 /board/bootstrap） */
async function loadManagedSubjects(): Promise<string[]> {
  subjectsLoading.value = true
  try {
    const board = await getData<{ subjects: Array<{ name: string; enabled?: boolean }> }>('/board/bootstrap')
    managedSubjects.value = board.subjects.map((item) => item.name)
  } catch {
    managedSubjects.value = []
  } finally {
    subjectsLoading.value = false
  }
  return managedSubjects.value
}

/** 把模板里的科目按科目管理顺序对齐：保留同名科目的作业本配置 */
function alignSubjects(tplSubjects: Record<string, { books: BookMap }>): Record<string, { books: BookMap }> {
  const next: Record<string, { books: BookMap }> = {}
  for (const name of managedSubjects.value) {
    next[name] = { books: { ...(tplSubjects[name]?.books ?? {}) } }
  }
  return next
}

async function loadConfig(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    await loadManagedSubjects()
    const me = await getData<{ settings: Record<string, unknown> }>('/device/me')
    const tpl = normalize(me.settings?.homeworkTemplate)
    state.subjects = alignSubjects(tpl.subjects)
    state.commonSubject = tpl.commonSubject
    state.actions = tpl.actions
    baseline.value = JSON.stringify({ subjects: state.subjects, commonSubject: state.commonSubject, actions: state.actions })
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败'
  } finally {
    loading.value = false
  }
}

async function saveConfig(): Promise<void> {
  if (saving.value) return
  saving.value = true
  error.value = ''
  try {
    await loadManagedSubjects()
    const payload = {
      subjects: alignSubjects(state.subjects),
      commonSubject: state.commonSubject,
      actions: state.actions,
    }
    await patchData('/board/settings', { settings: { homeworkTemplate: payload } })
    baseline.value = JSON.stringify(payload)
    notify('已保存')
  } catch (e) {
    error.value = e instanceof Error ? e.message : '保存失败'
  } finally {
    saving.value = false
  }
}

onMounted(loadConfig)
</script>
