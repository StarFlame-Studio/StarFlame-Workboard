<template>
  <v-dialog v-model="visible" :fullscreen="isMobile" max-width="1120" width="auto" @click:outside="handleClose">
    <v-card ref="cardRef" border tabindex="-1">
      <v-card-title class="d-flex align-center">
        {{ title }}
        <v-spacer />
        <v-btn icon="mdi-close" variant="text" @click="handleClose" />
      </v-card-title>
      <v-card-subtitle>{{ autoSave ? autoSavePromptText : manualSavePromptText }}</v-card-subtitle>

      <v-card-text>
        <div class="d-flex">
          <div class="flex-grow-1">
            <v-textarea
              ref="inputRef"
              v-model="content"
              auto-grow
              placeholder="使用换行表示分条"
              rows="5"
              :width="isMobile ? '100%' : '480'"
              @click="updateCurrentLine"
              @keyup="updateCurrentLine"
              @pointerdown="userTouchedInput = true"
            />

            <div v-if="showPasteButtons" class="d-flex justify-center" style="gap: 8px">
              <v-btn size="small" variant="outlined" prepend-icon="mdi-content-paste" @click="pasteFromClipboard">
                粘贴
              </v-btn>
              <v-btn size="small" color="primary" variant="elevated" prepend-icon="mdi-content-paste" @click="pasteAndComplete">
                粘贴并完成
              </v-btn>
            </div>

            <div v-if="templateData" class="mt-4">
              <div v-if="hasTemplates">
                <template v-if="subjectBooks">
                  <div v-for="(pages, book) in subjectBooks" :key="'s-' + book" class="mb-1">
                    <v-chip
                      :color="isBookSelected(book) ? 'success' : 'default'"
                      :variant="isBookSelected(book) ? 'elevated' : 'flat'"
                      class="ma-1 book-chip"
                      @click="handleBookClick(book)"
                    >
                      {{ book }}
                    </v-chip>
                    <div v-if="isBookSelected(book)" class="mt-2 ml-2">
                      <v-chip
                        v-for="page in pages"
                        :key="page"
                        :color="isPageSelected(book, page) ? 'info' : 'default'"
                        :variant="isPageSelected(book, page) ? 'elevated' : 'flat'"
                        class="ma-1"
                        size="small"
                        @click="handlePageClick(book, page)"
                      >
                        {{ page }}
                      </v-chip>
                    </div>
                  </div>
                </template>

                <template v-if="commonBooks">
                  <div v-for="(pages, book) in commonBooks" :key="'c-' + book" class="mb-1">
                    <v-chip
                      :color="isBookSelected(book) ? 'success' : 'default'"
                      :variant="isBookSelected(book) ? 'elevated' : 'flat'"
                      class="ma-1 book-chip"
                      @click="handleBookClick(book)"
                    >
                      {{ book }}
                    </v-chip>
                    <div v-if="isBookSelected(book)" class="mt-2 ml-2">
                      <v-chip
                        v-for="page in pages"
                        :key="page"
                        :color="isPageSelected(book, page) ? 'info' : 'default'"
                        :variant="isPageSelected(book, page) ? 'elevated' : 'flat'"
                        class="ma-1"
                        size="small"
                        @click="handlePageClick(book, page)"
                      >
                        {{ page }}
                      </v-chip>
                    </div>
                  </div>
                </template>

                <div v-if="templateData.actions && templateData.actions.length" class="mt-3">
                  <v-chip
                    v-for="action in templateData.actions"
                    :key="action"
                    class="ma-1"
                    color="primary"
                    size="small"
                    variant="flat"
                    @click="insertTemplate(action)"
                  >
                    {{ action }}
                  </v-chip>
                </div>
              </div>
              <div v-else class="text-center text-body-2 text-disabled mt-2">暂无可用的模板</div>
            </div>
          </div>

          <div v-if="showQuickTools && !isMobile" class="quick-tools ml-4" style="min-width: 300px">
            <div class="numeric-keypad mb-4">
              <div class="keypad-row">
                <v-btn v-for="n in 3" :key="'a' + n" class="keypad-btn" size="small" variant="tonal" @click="insertAtCursor(String(n))">{{ n }}</v-btn>
              </div>
              <div class="keypad-row">
                <v-btn v-for="n in 3" :key="'b' + n" class="keypad-btn" size="small" variant="tonal" @click="insertAtCursor(String(n + 3))">{{ n + 3 }}</v-btn>
              </div>
              <div class="keypad-row">
                <v-btn v-for="n in 3" :key="'c' + n" class="keypad-btn" size="small" variant="tonal" @click="insertAtCursor(String(n + 6))">{{ n + 6 }}</v-btn>
              </div>
              <div class="keypad-row">
                <v-btn class="keypad-btn" size="small" variant="tonal" @click="insertAtCursor('-')">-</v-btn>
                <v-btn class="keypad-btn" size="small" variant="tonal" @click="insertAtCursor('0')">0</v-btn>
                <v-btn class="keypad-btn" color="error" size="small" variant="tonal" @click="deleteLastChar">←</v-btn>
              </div>
              <div class="keypad-row">
                <v-btn class="keypad-btn space-btn" size="small" variant="tonal" @click="insertAtCursor(' ')">空格</v-btn>
                <v-btn class="keypad-btn space-btn" size="small" variant="tonal" @click="insertAtCursor('\n')">换行</v-btn>
              </div>
            </div>

            <div class="d-flex flex-wrap" style="gap: 4px">
              <v-btn v-for="text in quickTexts" :key="text" size="small" variant="flat" @click="insertAtCursor(text)">{{ text }}</v-btn>
            </div>
          </div>
        </div>
      </v-card-text>

      <v-alert
        v-if="isEditingPastData"
        border="start"
        border-color="warning"
        class="mx-4 mb-4"
        prominent
        type="warning"
        variant="tonal"
      >
        <div class="text-h6 mb-1">你打算修改历史？</div>
        <div class="text-body-2">{{ pastDateText }} 的作业 · 请谨慎操作，确保不会覆盖重要数据</div>
      </v-alert>

      <div class="text-center text-body-2 text-disabled mb-5">点击空白处完成编辑</div>

      <v-alert v-if="error" class="mx-4 mb-4" density="compact" type="error" variant="tonal">{{ error }}</v-alert>

      <v-card-actions class="px-4 pb-4">
        <v-btn variant="text" prepend-icon="mdi-close" @click="handleClose">关闭</v-btn>
        <v-spacer />
        <v-btn :loading="saving" color="primary" prepend-icon="mdi-content-save" variant="elevated" @click="handleSave">保存</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'

interface BookGroup {
  [book: string]: string[]
}

export interface HomeworkTemplate {
  subjects?: Record<string, { books?: BookGroup }>
  commonSubject?: { books?: BookGroup }
  actions?: string[]
}

const props = withDefaults(
  defineProps<{
    modelValue: boolean
    title?: string
    initialContent?: string
    autoSave?: boolean
    isMobile?: boolean
    isEditingPastData?: boolean
    currentDateString?: string
    templateData?: HomeworkTemplate | null
    autoSavePromptText?: string
    manualSavePromptText?: string
    showQuickTools?: boolean
    showPasteButtons?: boolean
    /** 修改历史作业时不自动保存（必须点「保存」） */
    blockPastAutoSave?: boolean
  }>(),
  {
    title: '编辑作业',
    initialContent: '',
    autoSave: false,
    isMobile: false,
    isEditingPastData: false,
    currentDateString: '',
    templateData: null,
    autoSavePromptText: '内容会自动保存，关闭对话框即生效',
    manualSavePromptText: '修改后请点击保存',
    showQuickTools: true,
    showPasteButtons: false,
    blockPastAutoSave: true,
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  save: [content: string]
}>()

const content = ref('')
const saving = ref(false)
const error = ref('')
const inputRef = ref<{ $el?: HTMLElement } | null>(null)
const cardRef = ref<{ $el?: HTMLElement } | null>(null)

// 打开弹窗后 Vuetify 会把焦点交给第一个可聚焦元素（textarea），在一体机 / 手机上会立刻弹出软键盘。
// 这里在打开后的一小段时间内监测焦点，一旦落在正文输入框就把焦点转移到弹窗容器上。
let autoFocusTimer: number | null = null
const userTouchedInput = ref(false)

function stopAutoFocusGuard(): void {
  if (autoFocusTimer !== null) {
    window.clearInterval(autoFocusTimer)
    autoFocusTimer = null
  }
}

function startAutoFocusGuard(): void {
  stopAutoFocusGuard()
  userTouchedInput.value = false
  const startedAt = Date.now()
  autoFocusTimer = window.setInterval(() => {
    if (userTouchedInput.value || Date.now() - startedAt > 1200) {
      stopAutoFocusGuard()
      return
    }
    const cardEl = cardRef.value?.$el
    if (!(cardEl instanceof HTMLElement)) return
    const active = document.activeElement
    if (active instanceof HTMLTextAreaElement && cardEl.contains(active)) {
      active.blur()
      cardEl.focus({ preventScroll: true })
      stopAutoFocusGuard()
    }
  }, 60)
}

// 光标所在行的范围（对齐原项目）
const currentLine = ref('')
const currentLineStart = ref(0)
const currentLineEnd = ref(0)

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
})

const quickTexts = ['课', '题', '例', '变', 'T', 'P']

const subjectBooks = computed<BookGroup | null>(
  () => props.templateData?.subjects?.[props.title]?.books ?? null,
)

const commonBooks = computed<BookGroup | null>(() => props.templateData?.commonSubject?.books ?? null)

const hasTemplates = computed(() =>
  Boolean(props.templateData?.actions?.length || subjectBooks.value || commonBooks.value),
)

const pastDateText = computed(() => {
  const raw = props.currentDateString
  if (/^\d{8}$/.test(raw)) {
    return new Date(Number(raw.slice(0, 4)), Number(raw.slice(4, 6)) - 1, Number(raw.slice(6, 8))).toLocaleDateString()
  }
  return raw
})

function getTextarea(): HTMLTextAreaElement | null {
  const el = (inputRef.value as unknown as { $el?: HTMLElement })?.$el
  const area = el?.querySelector('textarea')
  return area instanceof HTMLTextAreaElement ? area : null
}

watch(
  () => props.modelValue,
  (open) => {
    if (!open) {
      stopAutoFocusGuard()
      return
    }
    const initial = props.initialContent || ''
    // 原项目：末尾没有换行时补一个空行，方便立即另起一条
    content.value = initial === '' || initial.endsWith('\n') ? initial : initial + '\n'
    error.value = ''
    saving.value = false
    // 打开弹窗不自动聚焦输入框：避免一体机/移动端立即弹出软键盘
    currentLine.value = ''
    currentLineStart.value = content.value.length
    currentLineEnd.value = content.value.length
    startAutoFocusGuard()
  },
)

onBeforeUnmount(() => {
  stopAutoFocusGuard()
})

/** 计算光标所在行的起止位置（原项目算法） */
function updateCurrentLine(): void {
  const textarea = getTextarea()
  if (!textarea) return
  const cursor = textarea.selectionStart ?? 0
  const lines = content.value.split('\n')
  let pos = 0
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? ''
    const total = pos + line.length
    if (cursor <= total || i === lines.length - 1) {
      currentLine.value = line
      currentLineStart.value = pos
      currentLineEnd.value = total
      break
    }
    pos = total + 1
  }
  if (!currentLine.value) {
    currentLine.value = ''
    currentLineStart.value = content.value.length
    currentLineEnd.value = content.value.length
  }
}

/** 模板 v-for 的键在索引签名下被推断为 string | number，这里统一收敛为字符串 */
function bookKey(book: string | number): string {
  return String(book)
}

function isBookSelected(rawBook: string | number): boolean {
  return currentLine.value.includes(bookKey(rawBook))
}

function isPageSelected(_book: string | number, page: string): boolean {
  return currentLine.value.includes(page)
}

/** 点课本：已选则删除包含该课本的整行；未选则在末尾新增一行 */
function handleBookClick(rawBook: string | number): void {
  const book = bookKey(rawBook)
  if (isBookSelected(book)) {
    const lines = content.value.split('\n')
    const index = lines.findIndex((line) => line.includes(book))
    if (index !== -1) {
      lines.splice(index, 1)
      content.value = lines.join('\n')
    }
  } else {
    const hasContent = content.value.trim().length > 0
    content.value = (hasContent ? content.value.trim() + '\n' : '') + book
  }

  void nextTick(() => {
    const textarea = getTextarea()
    if (!textarea) return
    textarea.focus()
    if (!isBookSelected(book)) {
      const lines = content.value.split('\n')
      let position = 0
      for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i] ?? ''
        if (line.includes(book)) {
          position += line.length
          break
        }
        position += line.length + 1
      }
      textarea.setSelectionRange(position, position)
    }
    updateCurrentLine()
  })
}

/** 点页码：已选则删除当前行最后一处；未选则追加到当前行末尾 */
function handlePageClick(book: string | number, page: string): void {
  const start = currentLineStart.value
  const end = currentLineEnd.value
  const lineContent = content.value.slice(start, end)

  if (isPageSelected(book, page)) {
    const lastIndex = lineContent.lastIndexOf(page)
    if (lastIndex !== -1) {
      const nextLine = lineContent.slice(0, lastIndex) + lineContent.slice(lastIndex + page.length)
      content.value = content.value.slice(0, start) + nextLine.trim() + content.value.slice(end)
    }
  } else {
    const trimmed = lineContent.trim()
    content.value =
      content.value.slice(0, start) +
      trimmed +
      (trimmed.length > 0 ? ' ' : '') +
      page +
      content.value.slice(end)
  }

  void nextTick(() => {
    const textarea = getTextarea()
    if (!textarea) return
    textarea.focus()
    const lines = content.value.split('\n')
    let position = 0
    for (let i = 0; i < lines.length; i += 1) {
      position += (lines[i] ?? '').length
      if (position > currentLineStart.value) break
      position += 1
    }
    textarea.setSelectionRange(position, position)
    updateCurrentLine()
  })
}

/** 快捷操作：插入到光标处，必要时自动补空格 */
function insertTemplate(text: string): void {
  const textarea = getTextarea()
  if (!textarea) return
  const start = textarea.selectionStart ?? 0
  const end = textarea.selectionEnd ?? start
  const prev = start > 0 ? content.value[start - 1] : ''
  const needsSpace = start > 0 && prev !== ' ' && prev !== '\n'
  content.value = content.value.slice(0, start) + (needsSpace ? ' ' : '') + text + content.value.slice(end)
  void nextTick(() => {
    textarea.focus()
    const next = start + text.length + (needsSpace ? 1 : 0)
    textarea.setSelectionRange(next, next)
    updateCurrentLine()
  })
}

/** 数字键盘：替换选中内容 */
function insertAtCursor(text: string): void {
  if (!text) return
  const textarea = getTextarea()
  if (!textarea) return
  const start = textarea.selectionStart ?? 0
  const end = textarea.selectionEnd ?? start
  content.value = content.value.slice(0, start) + text + content.value.slice(end)
  void nextTick(() => {
    textarea.focus()
    const next = start + text.length
    textarea.setSelectionRange(next, next)
    updateCurrentLine()
  })
}

/** 退格：有选区则删选区，否则删光标前一个字符 */
function deleteLastChar(): void {
  const textarea = getTextarea()
  if (!textarea) return
  const start = textarea.selectionStart ?? 0
  const end = textarea.selectionEnd ?? start
  if (start === end) {
    if (start > 0) {
      content.value = content.value.slice(0, start - 1) + content.value.slice(start)
      void nextTick(() => {
        textarea.focus()
        textarea.setSelectionRange(start - 1, start - 1)
        updateCurrentLine()
      })
    }
    return
  }
  content.value = content.value.slice(0, start) + content.value.slice(end)
  void nextTick(() => {
    textarea.focus()
    textarea.setSelectionRange(start, start)
    updateCurrentLine()
  })
}

async function pasteFromClipboard(): Promise<void> {
  try {
    const text = await navigator.clipboard.readText()
    if (text) insertAtCursor(text)
  } catch {
    error.value = '无法读取剪贴板，请手动粘贴'
  }
}

async function pasteAndComplete(): Promise<void> {
  await pasteFromClipboard()
  handleSave()
}

function trimmed(): string {
  return content.value.trim()
}

/** 保存：仅在内容变化时提交 */
function handleSave(): void {
  if (saving.value) return
  const next = trimmed()
  if (next !== props.initialContent.trim()) {
    emit('save', next)
    return
  }
  visible.value = false
}

/**
 * 关闭弹窗：
 * - 开启「关闭编辑弹窗时自动保存」时，内容有变化就提交；
 * - 修改的是历史作业且「历史数据必须手动确认」开启时，不自动提交，直接放弃本次修改；
 * - 未开启自动保存时，关闭即放弃修改（必须点「保存」按钮才提交）。
 */
function handleClose(): void {
  const next = trimmed()
  const changed = next !== props.initialContent.trim()
  if (changed && props.autoSave && !(props.isEditingPastData && props.blockPastAutoSave)) {
    emit('save', next)
    visible.value = false
    return
  }
  visible.value = false
}

function setSaving(value: boolean): void {
  saving.value = value
}
function setError(message: string): void {
  saving.value = false
  error.value = message
}
function focus(): void {
  getTextarea()?.focus()
}

defineExpose({ setSaving, setError, focus })
</script>

<style scoped>
.quick-tools {
  border-left: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  padding-left: 16px;
}

.numeric-keypad {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 6px;
}

.keypad-row {
  display: flex;
  gap: 6px;
}

.keypad-btn {
  flex: 1;
  min-width: 68px !important;
  height: 50px !important;
  font-size: 19px !important;
  font-weight: 600 !important;
}

.space-btn {
  width: 100% !important;
}

.book-chip {
  cursor: pointer;
}
</style>
