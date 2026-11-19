<template>
  <div>
    <div class="d-flex flex-wrap align-center ga-2 mb-4">
      <v-btn size="small" variant="text" prepend-icon="mdi-arrow-left" @click="goClasses">返回班级列表</v-btn>
      <v-divider vertical class="mx-1" />
      <SfSkeleton v-if="booting" w="150px" h="20px" radius="8px" />
      <div v-else class="text-h6 font-weight-medium">{{ className || '班级看板' }}</div>
      <v-chip v-if="classInfo?.grade" size="x-small" variant="tonal">{{ classInfo.grade }}</v-chip>
      <v-chip v-if="classInfo?.school" size="x-small" variant="tonal">{{ classInfo.school }}</v-chip>
      <v-spacer />
      <v-btn size="small" variant="text" prepend-icon="mdi-content-copy" @click="copyClassId">复制班级 ID</v-btn>
      <v-btn size="small" variant="tonal" prepend-icon="mdi-refresh" :loading="reloading" @click="reload">刷新</v-btn>
    </div>

    <v-alert v-if="missingClass" type="warning" variant="tonal" class="mb-4">
      缺少班级参数，请从「班级」列表点击「进入看板」。
    </v-alert>
    <v-alert v-else-if="error" type="error" variant="tonal" class="mb-4">{{ error }}</v-alert>

    <template v-if="!missingClass">
      <!-- 首屏骨架：tabs 条 -->
      <v-card v-if="booting" variant="outlined" class="mb-4" style="padding: 8px 12px">
        <div class="sf-skel-row" style="gap: 18px">
          <SfSkeleton v-for="n in 6" :key="'tab-skel-' + n" w="64px" h="34px" radius="10px" />
        </div>
      </v-card>

      <v-card v-else variant="outlined" class="mb-4">
        <v-tabs v-model="tab" density="comfortable" show-arrows>
          <v-tab v-for="item in visibleTabs" :key="item.key" :value="item.key" :prepend-icon="item.icon">{{ item.title }}</v-tab>
        </v-tabs>
      </v-card>

      <!-- 首屏骨架：内容块 -->
      <div v-if="booting" class="sf-skel-stack" style="gap: 16px">
        <div class="sf-skel-surface sf-skel-tile">
          <div class="sf-skel-tile__head">
            <SfSkeleton circle :w="18" />
            <SfSkeleton w="32%" h="14px" radius="6px" />
            <SfSkeleton w="70px" h="26px" radius="9px" style="margin-left: auto" />
          </div>
          <SfSkeleton w="100%" h="148px" radius="12px" />
        </div>
        <div class="sf-skel-surface sf-skel-tile">
          <SfSkeleton w="26%" h="13px" radius="6px" />
          <SfSkeleton w="100%" h="90px" radius="12px" />
        </div>
      </div>

      <v-window v-else v-model="tab" :key="windowKey">
        <v-window-item value="homework">
          <class-homework-tab v-if="tab === 'homework'" :class-id="classId" />
        </v-window-item>
        <v-window-item value="exam">
          <class-exam-tab v-if="tab === 'exam'" :class-id="classId" />
        </v-window-item>
        <v-window-item value="settings">
          <class-settings-tab v-if="tab === 'settings'" :class-id="classId" />
        </v-window-item>
        <v-window-item value="subject">
          <class-subject-tab v-if="tab === 'subject'" :class-id="classId" />
        </v-window-item>
        <v-window-item value="roster">
          <class-student-tab v-if="tab === 'roster'" :class-id="classId" />
        </v-window-item>
        <v-window-item value="notice">
          <class-notice-tab v-if="tab === 'notice'" :class-id="classId" />
        </v-window-item>
        <v-window-item value="cards">
          <class-custom-card-tab v-if="tab === 'cards'" :class-id="classId" />
        </v-window-item>
        <v-window-item value="attendance">
          <class-attendance-tab v-if="tab === 'attendance'" :class-id="classId" />
        </v-window-item>
        <v-window-item value="access">
          <class-access-code-tab v-if="tab === 'access'" :class-id="classId" />
        </v-window-item>
      </v-window>
    </template>

    <ToastBar :toast="toast" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ApiError } from '../lib/api'
import { getBootstrap } from '../lib/boardApi'
import { useToast } from '../composables/useToast'
import { useAuthStore } from '../stores/auth'
import ToastBar from '../components/class/ToastBar.vue'
import ClassHomeworkTab from '../components/class/ClassHomeworkTab.vue'
import ClassExamTab from '../components/class/ClassExamTab.vue'
import ClassSettingsTab from '../components/class/ClassSettingsTab.vue'
import ClassSubjectTab from '../components/class/ClassSubjectTab.vue'
import ClassStudentTab from '../components/class/ClassStudentTab.vue'
import ClassNoticeTab from '../components/class/ClassNoticeTab.vue'
import ClassCustomCardTab from '../components/class/ClassCustomCardTab.vue'
import ClassAttendanceTab from '../components/class/ClassAttendanceTab.vue'
import ClassAccessCodeTab from '../components/class/ClassAccessCodeTab.vue'
import SfSkeleton from '../components/skeleton/SfSkeleton.vue'

const TABS = [
  { key: 'homework', title: '作业', icon: 'mdi-notebook-edit-outline' },
  { key: 'exam', title: '考试', icon: 'mdi-calendar-clock-outline' },
  { key: 'settings', title: '设置', icon: 'mdi-cog-outline' },
  { key: 'subject', title: '科目', icon: 'mdi-book-open-variant' },
  { key: 'roster', title: '花名册', icon: 'mdi-account-multiple-outline' },
  { key: 'notice', title: '通知', icon: 'mdi-bullhorn-outline' },
  { key: 'cards', title: '自定义卡片', icon: 'mdi-card-plus-outline' },
  { key: 'attendance', title: '考勤', icon: 'mdi-clipboard-check-outline' },
  { key: 'access', title: '授权码', icon: 'mdi-key-chain-variant' },
]

const auth = useAuthStore()
const canAdmin = computed(() => auth.user?.role === 'owner' || auth.user?.role === 'admin')
/** 教师账号只能看业务 Tab，授权码管理仅管理员可见 */
const visibleTabs = computed(() => (canAdmin.value ? TABS : TABS.filter((item) => item.key !== 'access')))

const { toast, notify } = useToast()
const classId = ref(new URLSearchParams(window.location.search).get('classId') ?? '')
const missingClass = ref(!classId.value)
/** 首屏班级信息未到位时的骨架开关（只影响加载态视觉，不改变数据流） */
const booting = ref(Boolean(classId.value))
const tab = ref('homework')
const windowKey = ref(0)
const classInfo = ref<{ name: string; grade?: string | null; school?: string | null } | null>(null)
const className = ref('')
const error = ref('')
const reloading = ref(false)

function goClasses() {
  window.location.href = '/classes.html'
}

async function loadClass() {
  if (!classId.value) {
    booting.value = false
    return
  }
  try {
    const data = await getBootstrap(classId.value)
    classInfo.value = data.class
    className.value = data.class.name
    document.title = data.class.name + ' · 星焰作业板管理后台'
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : '加载班级信息失败'
  } finally {
    booting.value = false
  }
}

async function reload() {
  reloading.value = true
  error.value = ''
  await loadClass()
  windowKey.value += 1
  reloading.value = false
}

async function copyClassId() {
  try {
    await navigator.clipboard.writeText(classId.value)
    notify('班级 ID 已复制')
  } catch {
    notify('复制失败，请手动复制', 'error')
  }
}

onMounted(loadClass)
</script>
