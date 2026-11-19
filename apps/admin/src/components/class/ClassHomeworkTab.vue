<template>
  <div>
    <div class="d-flex flex-wrap align-center ga-2 mb-4">
      <v-btn size="small" variant="tonal" prepend-icon="mdi-chevron-left" @click="shift(-1)">昨天</v-btn>
      <v-btn size="small" variant="tonal" @click="setDate(todayString())">今天</v-btn>
      <v-btn size="small" variant="tonal" append-icon="mdi-chevron-right" @click="shift(1)">明天</v-btn>
      <v-text-field v-model="date" type="date" density="compact" variant="outlined" hide-details style="max-width: 168px" @update:model-value="reload" />
      <v-spacer />
      <v-btn size="small" color="primary" variant="flat" prepend-icon="mdi-content-save-all" :loading="savingAll" :disabled="!dirtySubjects.length" @click="saveAll">
        保存全部{{ dirtySubjects.length ? '（' + dirtySubjects.length + '）' : '' }}
      </v-btn>
    </div>

    <v-alert v-if="error" type="error" variant="tonal" density="compact" class="mb-4" closable @click:close="error = ''">{{ error }}</v-alert>

    <!-- 骨架：与作业卡片同形状（图标 + 科目名 + 状态胶囊 + 大输入块） -->
    <v-row v-if="loading" density="comfortable">
      <v-col v-for="n in 4" :key="'hw-skel-' + n" cols="12" md="6">
        <div class="sf-skel-surface sf-skel-tile">
          <div class="sf-skel-tile__head">
            <SfSkeleton circle :w="18" />
            <SfSkeleton w="34%" h="13px" radius="6px" />
            <SfSkeleton w="52px" h="18px" pill />
          </div>
          <SfSkeleton w="100%" h="108px" radius="10px" />
          <SfSkeleton w="56%" h="10px" radius="5px" />
        </div>
      </v-col>
    </v-row>

    <v-card v-else-if="!subjects.length" variant="outlined" class="pa-8 text-center">
      <v-icon size="40" color="medium-emphasis">mdi-book-plus-outline</v-icon>
      <div class="text-body-2 text-medium-emphasis mt-2">该班级还没有科目，请先到「科目」页添加。</div>
    </v-card>

    <v-row v-else density="comfortable">
      <v-col v-for="subject in subjects" :key="subject.id" cols="12" md="6">
        <v-card variant="outlined" class="pa-3 h-100">
          <div class="d-flex align-center ga-2 mb-2">
            <v-icon :color="subject.color" size="18">{{ subject.icon }}</v-icon>
            <span class="text-subtitle-2 font-weight-medium">{{ subject.name }}</span>
            <v-chip size="x-small" variant="tonal" :color="isDirty(subject.id) ? 'warning' : 'success'">
              {{ isDirty(subject.id) ? '未保存' : '已同步' }}
            </v-chip>
            <v-spacer />
            <v-btn size="x-small" variant="text" :disabled="!isDirty(subject.id)" :loading="savingId === subject.id" @click="saveOne(subject.id)">保存</v-btn>
          </div>
          <v-textarea
            v-model="draft[subject.id]"
            rows="4"
            auto-grow
            density="compact"
            variant="outlined"
            hide-details
            maxlength="4000"
            counter
            placeholder="使用换行表示分条"
            @keydown.ctrl.s.prevent="saveOne(subject.id)"
            @keydown.meta.s.prevent="saveOne(subject.id)"
          />
          <div class="text-caption text-medium-emphasis mt-1">{{ subject.hint }}</div>
        </v-card>
      </v-col>
    </v-row>

    <ToastBar :toast="toast" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ApiError } from '../../lib/api'
import { getBootstrap, getHomework, saveHomework, todayString, shiftDate, type HomeworkItem, type Subject } from '../../lib/boardApi'
import { useToast } from '../../composables/useToast'
import SfSkeleton from '../skeleton/SfSkeleton.vue'
import ToastBar from './ToastBar.vue'

const props = defineProps<{ classId: string }>()

const { toast, notify } = useToast()
const date = ref(todayString())
const subjects = ref<Array<Subject & { hint: string }>>([])
const items = ref<HomeworkItem[]>([])
const draft = reactive<Record<string, string>>({})
const savedContent = reactive<Record<string, string>>({})
const versions = reactive<Record<string, number>>({})
const loading = ref(true)
const savingAll = ref(false)
const savingId = ref('')
const error = ref('')

const dirtySubjects = computed(() => subjects.value.filter((s) => isDirty(s.id)))

function isDirty(id: string): boolean {
  return (draft[id] ?? '') !== (savedContent[id] ?? '')
}

function resetContent(list: HomeworkItem[]) {
  items.value = list
  const byId = new Map(list.map((item) => [item.subjectId, item]))
  for (const subject of subjects.value) {
    const item = byId.get(subject.id)
    draft[subject.id] = item?.content ?? ''
    savedContent[subject.id] = item?.content ?? ''
    versions[subject.id] = item?.version ?? 0
  }
}

async function loadHomework() {
  const data = await getHomework(props.classId, date.value)
  resetContent(data.items)
}

async function reload() {
  loading.value = true
  error.value = ''
  try {
    await loadHomework()
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : '加载作业失败'
  } finally {
    loading.value = false
  }
}

function setDate(value: string) {
  if (!value) return
  date.value = value
  void reload()
}

function shift(days: number) {
  setDate(shiftDate(date.value, days))
}

async function saveOne(subjectId: string) {
  const subject = subjects.value.find((s) => s.id === subjectId)
  if (!subject || !isDirty(subjectId)) return
  savingId.value = subjectId
  error.value = ''
  try {
    const result = await saveHomework(props.classId, {
      subjectId,
      date: date.value,
      content: draft[subjectId] ?? '',
      version: versions[subjectId] ? versions[subjectId] : undefined,
    })
    items.value = [...items.value.filter((item) => item.subjectId !== subjectId), result]
    savedContent[subjectId] = result.content
    draft[subjectId] = result.content
    versions[subjectId] = result.version
    notify(subject.name + ' 作业已保存')
  } catch (e) {
    if (e instanceof ApiError && e.status === 409) {
      error.value = '作业已被其他设备修改，请刷新后重试。'
    } else {
      error.value = e instanceof ApiError ? e.message : '保存失败'
    }
    notify('保存失败', 'error')
  } finally {
    savingId.value = ''
  }
}

async function saveAll() {
  const targets = dirtySubjects.value.map((s) => s.id)
  if (!targets.length) return
  savingAll.value = true
  let done = 0
  for (const id of targets) {
    await saveOne(id)
    if (!isDirty(id)) done += 1
  }
  savingAll.value = false
  notify('已保存 ' + done + ' / ' + targets.length + ' 个科目', done === targets.length ? 'success' : 'warning')
}

onMounted(async () => {
  try {
    const data = await getBootstrap(props.classId, date.value)
    subjects.value = data.subjects
      .filter((s) => s.enabled)
      .map((s) => ({ ...s, hint: s.code.startsWith('custom-') ? '自定义科目' : s.code }))
    resetContent(data.homework)
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : '加载失败'
  } finally {
    loading.value = false
  }
})
</script>
