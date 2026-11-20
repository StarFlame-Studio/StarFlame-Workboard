<template>
  <template v-if="bg.enabled && bg.url">
    <div class="bg-image" :style="bgImageStyle" />
    <div class="bg-overlay" :style="bgOverlayStyle" />
  </template>

  <v-app-bar class="no-select" elevation="2" :height="isMobile ? 56 : 64">
    <v-app-bar-title class="board-title">
      <span class="board-brand">
        <img class="board-logo" :src="logoUrl" alt="星焰作业板" />
      </span>
      <span class="board-headings">
        <span v-if="showBrandLine" class="board-overline">星焰作业板</span>
        <span class="board-heading">{{ compact ? className || '星焰作业板' : titleText }}</span>
      </span>
    </v-app-bar-title>

    <v-spacer />

    <template #append>
      <v-chip v-if="session.isGuest" class="mx-2" color="warning" prepend-icon="mdi-account-outline" variant="tonal">
        游客只读
      </v-chip>
      <v-chip v-else-if="isReadOnly" class="mx-2" color="warning" prepend-icon="mdi-lock-alert" variant="tonal">
        只读
      </v-chip>

      <v-chip v-if="className && !compact" class="mx-2" color="primary" prepend-icon="mdi-google-classroom" variant="tonal">
        {{ className }}
      </v-chip>

      <v-chip
        v-if="!compact && offlineUi.status === 'offline'"
        class="mx-2"
        color="warning"
        prepend-icon="mdi-cloud-off-outline"
        variant="tonal"
        @click="onOfflineChip"
      >
        离线缓存<span v-if="ds.pending > 0"> · {{ ds.pending }} 条待同步</span>
      </v-chip>

      <v-chip
        v-else-if="!compact && offlineUi.status === 'syncing'"
        class="mx-2"
        color="info"
        prepend-icon="mdi-cloud-sync-outline"
        variant="tonal"
      >
        同步中…<span v-if="ds.pending > 0"> （剩 {{ ds.pending }} 条）</span>
      </v-chip>

      <v-chip
        v-else-if="!compact && offlineUi.status === 'synced'"
        class="mx-2"
        color="success"
        prepend-icon="mdi-cloud-check-outline"
        variant="tonal"
      >
        已同步 {{ offlineUi.syncedCount }} 项
      </v-chip>

      <v-chip
        v-else-if="!compact && ds.mode === 'local'"
        class="mx-2"
        color="warning"
        prepend-icon="mdi-harddisk"
        variant="tonal"
        @click="localDialog = true"
      >
        本地模式<span v-if="ds.pending > 0"> · {{ ds.pending }} 条待同步</span>
      </v-chip>

      <v-chip
        v-if="isMobile && (offlineUi.status === 'offline' || ds.mode === 'local')"
        class="mx-1"
        color="warning"
        prepend-icon="mdi-cloud-off-outline"
        size="small"
        variant="tonal"
        @click="onOfflineChip"
      >
        {{ offlineUi.status === 'offline' ? '离线' : '本地' }}
      </v-chip>

      <template v-if="ds.mode !== 'local' && !ds.offline">
        <v-tooltip :text="realtimeTooltip" location="bottom">
          <template #activator="{ props }">
            <v-icon v-bind="props" class="realtime-icon" :color="statusTone" size="small">
              {{ realtimeOnline ? 'mdi-access-point' : 'mdi-access-point-off' }}
            </v-icon>
          </template>
        </v-tooltip>
        <span v-if="!compact" class="latency-text mr-2" :class="latencyClass">{{ latencyText }}</span>
      </template>

      <v-tooltip v-if="!compact" :text="isDark ? '切换到亮色模式' : '切换到暗色模式'" location="bottom">
        <template #activator="{ props }">
          <v-btn
            v-bind="props"
            aria-label="切换深色/浅色模式"
            class="theme-toggle mr-1"
            title="切换深色/浅色模式"
            :icon="isDark ? 'mdi-weather-night' : 'mdi-weather-sunny'"
            variant="text"
            @click="onToggleTheme"
          />
        </template>
      </v-tooltip>

      <v-tooltip v-if="!compact" :text="layoutMode === 'wall' ? '切换为经典布局' : '切换为作业墙布局'" location="bottom">
        <template #activator="{ props }">
          <v-btn
            v-bind="props"
            aria-label="切换作业墙/经典布局"
            class="mr-1"
            title="切换布局"
            :icon="layoutMode === 'wall' ? 'mdi-view-grid-outline' : 'mdi-view-dashboard-variant-outline'"
            variant="text"
            @click="toggleLayout"
          />
        </template>
      </v-tooltip>

      <v-menu v-if="compact" location="bottom end">
        <template #activator="{ props }">
          <v-btn v-bind="props" class="mr-1" aria-label="更多操作" title="更多操作" icon="mdi-dots-vertical" variant="text" />
        </template>
        <v-list density="compact">
          <v-list-item :prepend-icon="isDark ? 'mdi-weather-sunny' : 'mdi-weather-night'" :title="isDark ? '切换到亮色模式' : '切换到暗色模式'" @click="onToggleTheme" />
          <v-list-item :prepend-icon="layoutMode === 'wall' ? 'mdi-view-grid-outline' : 'mdi-view-dashboard-variant-outline'" :title="layoutMode === 'wall' ? '切换为经典布局' : '切换为作业墙布局'" @click="toggleLayout" />
          <v-list-item v-if="!isReadOnly" prepend-icon="mdi-bullhorn-outline" title="发送通知" @click="notifyOpen = true" />
        </v-list>
      </v-menu>
      <v-btn v-if="compact && !isReadOnly" aria-label="发送通知" class="mr-1" icon="mdi-bullhorn-outline" title="发送通知" variant="tonal" @click="notifyOpen = true" />
      <v-btn v-else-if="!isReadOnly" class="mr-2" prepend-icon="mdi-chat" variant="tonal" @click="notifyOpen = true">发送通知</v-btn>
      <v-btn aria-label="通知" icon="mdi-bell" title="通知" variant="text" @click="noticeDrawer = true" />
      <v-btn aria-label="设置" icon="mdi-cog" title="设置" variant="text" @click="go('settings')" />
    </template>
  </v-app-bar>

  <v-main v-if="!dataReady">
    <v-card v-if="board.error" class="mx-auto load-fail mt-6" max-width="460" variant="tonal">
      <v-card-title class="text-subtitle-1">看板加载失败</v-card-title>
      <v-card-text class="sf-body">
        网络有点慢或者服务器暂时不可达，已自动重试过几次仍没成功。
        <div class="load-fail-detail">{{ board.error }}</div>
      </v-card-text>
      <v-card-actions>
        <v-btn :loading="board.loading" color="primary" variant="elevated" @click="retryLoad">重新加载</v-btn>
      </v-card-actions>
    </v-card>
    <board-skeleton v-else />
  </v-main>

  <v-main v-if="dataReady">
  <template v-if="layoutMode === 'wall'">
    <v-container class="wall-window no-select" fluid>
      <div class="wall">
        <aside class="wall-rail">
          <time-card
            v-if="showTime"
            class="wall-rail-time"
            :bell="bellOffsetConfig"
            :use12h="clock12h"
            :weekly="weeklySchedule"
          />

          <div
            v-if="!isMobile && showAttendance && board.students.length > 0"
            class="wall-att"
            @click="attDialogOpen = true"
          >
            <div class="wall-att-head">
              <v-icon color="primary" size="small">mdi-account-group</v-icon>
              <span>出勤统计</span>
            </div>
            <div class="wall-att-num">
              <strong>{{ wallPresent }}</strong>
              <span>/ {{ board.students.length }}</span>
            </div>
            <div class="wall-att-meta">
              <span v-if="attendance.absent > 0" class="text-error">请假 {{ attendance.absent }}</span>
              <span v-if="attendance.lateCount > 0" class="text-warning">迟到 {{ attendance.lateCount }}</span>
              <span v-if="attendance.absent === 0 && attendance.lateCount === 0" class="text-success">全勤</span>
            </div>
          </div>

          <div v-if="visibleExams.length > 0" class="wall-rail-exams">
            <concise-exam-card
              v-for="exam in visibleExams"
              :key="'wall-exam-' + exam.id"
              class="wall-rail-exam"
              :content-style="contentStyle"
              :exam="exam"
              :subjects="board.subjects"
              @open="openExamDetail"
            />
          </div>

          <hitokoto-card v-if="showHitokoto" class="wall-rail-hitokoto" />
        </aside>

        <section class="wall-main">
          <div v-if="wallNotices.length > 0" class="wall-notices">
            <v-card
              v-for="notification in wallNotices"
              :key="notification.id"
              class="wall-notice"
              :color="notification.level === 'urgent' ? 'error' : 'primary'"
              variant="tonal"
              @click="openNotice(notification)"
            >
              <v-card-text class="d-flex align-center py-1">
                <v-icon class="mr-2" size="small">
                  {{ notification.level === 'urgent' ? 'mdi-alert' : 'mdi-bullhorn-outline' }}
                </v-icon>
                <marquee-text class="wall-notice-line">
                  <span class="wall-notice-title">{{ notification.title || '通知' }}</span>
                  <span class="wall-notice-text">{{ notification.content }}</span>
                </marquee-text>
                <v-icon class="ml-1" size="small">mdi-chevron-right</v-icon>
              </v-card-text>
            </v-card>
          </div>

          <div class="wall-grid">
            <article
              v-for="card in wallCards"
              :key="card.key"
              class="wall-card"
              :class="{ 'is-empty': !card.content }"
              @click="openEditorById(card.key)"
            >
              <header class="wall-card-head">
                <span class="wall-dot" :style="{ background: card.color }" />
                <span class="wall-name">{{ card.name }}</span>
                <v-spacer />
                <v-icon v-if="card.content" class="wall-edit" size="x-small">mdi-pencil-outline</v-icon>
              </header>
              <div class="wall-body" :style="contentStyle">
                <template v-if="card.content">
                  <div v-for="(line, i) in card.lines" :key="i" class="wall-line">{{ line }}</div>
                </template>
                <span v-else class="wall-placeholder">今日暂无作业</span>
              </div>
            </article>
          </div>

          <div v-if="emptyCustomCards.length > 0 && !isReadOnly" class="wall-foot">
            <span class="wall-foot-label">自定义卡片</span>
            <v-chip
              v-for="card in emptyCustomCards"
              :key="card.id"
              color="primary"
              size="small"
              variant="tonal"
              @click="openEditorById('custom-' + card.id)"
            >
              <v-icon start size="small">mdi-plus</v-icon>{{ card.title }}
            </v-chip>
          </div>
        </section>
      </div>

      <home-actions
        :is-fullscreen="isFullscreen"
        :show-anti-screen-burn-card="showAntiBurnCardSetting"
        :show-exam-schedule-button="showExamButtonSetting"
        :show-fullscreen-button="showFullscreenButtonSetting"
        :show-list-card-button="showListCardSetting"
        :show-random-picker-button="randomPickerEnabled"
        :show-transfer-button="true"
        :synced="!board.loading"
        @open-exam-picker="examPickerOpen = true"
        @open-list="go('list')"
        @open-random-picker="randomOpen = true"
        @open-transfer="openTransfer"
        @toggle-fullscreen="toggleFullscreen"
      />

      <pwa-install-card v-if="!isDesktop && !hidePwaCardSetting" />
    </v-container>
  </template>

  <div v-else class="d-flex">
    <v-container class="main-window flex-grow-1 no-select bloom-container" fluid>
      <!-- 与下方 homework-grid 同一条左/右基线，故不使用 v-row/v-col（负 margin 会外扩 12px） -->
      <div v-if="wallNotices.length > 0" class="notice-grid">
        <v-card
          v-for="notification in wallNotices"
          :key="notification.id"
          :color="notification.level === 'urgent' ? 'error' : 'primary'"
          class="notice-card cursor-pointer"
          variant="tonal"
          @click="openNotice(notification)"
        >
          <v-card-text class="d-flex align-center py-3 notice-card-body">
            <v-icon class="mr-2" size="small">
              {{ notification.level === 'urgent' ? 'mdi-alert' : 'mdi-bullhorn-outline' }}
            </v-icon>
            <marquee-text class="notice-line">
              <span class="text-h6 font-weight-bold">{{ notification.title || '通知' }}</span>
              <span class="ml-4 text-body-2">{{ notification.content }}</span>
            </marquee-text>
            <v-btn class="ml-1" icon="mdi-chevron-right" variant="text" />
          </v-card-text>
        </v-card>
      </div>

      <homework-grid
        :bell="bellOffsetConfig"
        :card-hover-effect="cardHoverSetting"
        :clock12h="clock12h"
        :content-style="contentStyle"
        :dynamic-sort="dynamicSortSetting"
        :empty-subject-display="emptySubjectDisplay"
        :enhanced-touch="enhancedTouchSetting"
        :exams="board.exams"
        :font-scale="fontScale / 28"
        :highlighted-cards="highlightedCards"
        :is-editing-disabled="!board.loaded || isReadOnly"
        :is-mobile="isMobile"
        :is-read-only="isReadOnly"
        :sorted-items="sortedItems"
        :subjects="board.subjects"
        :weekly="weeklySchedule"
        :unused-custom="emptyCustomCards.map((item) => ({ id: item.id, title: item.title }))"
        :unused-subjects="unusedSubjects"
        @open-attendance="attDialogOpen = true"
        @open-dialog="openEditorById"
        @open-exam="openExamDetail"
      />

      <home-actions
        :is-fullscreen="isFullscreen"
        :show-anti-screen-burn-card="showAntiBurnCardSetting"
        :show-exam-schedule-button="showExamButtonSetting"
        :show-fullscreen-button="showFullscreenButtonSetting"
        :show-list-card-button="showListCardSetting"
        :show-random-picker-button="randomPickerEnabled"
        :show-transfer-button="true"
        :synced="!board.loading"
        @open-exam-picker="examPickerOpen = true"
        @open-list="go('list')"
        @open-random-picker="randomOpen = true"
        @open-transfer="openTransfer"
        @toggle-fullscreen="toggleFullscreen"
      />

      <pwa-install-card v-if="!isDesktop && !hidePwaCardSetting" />
    </v-container>

    <attendance-sidebar
      v-if="!isMobile && showAttendance"
      :attendance="attendance"
      :is-editing-disabled="board.loading"
      :late-is-present="lateIsPresentSetting"
      :student-list="board.students"
      @click="attDialogOpen = true"
    />
  </div>
  </v-main>

  <homework-edit-dialog
    ref="editorRef"
    v-model="editorOpen"
    :auto-save="autoSaveSetting"
    :auto-save-prompt-text="autoSavePromptText"
    :block-past-auto-save="blockNonTodayAutoSaveSetting"
    :initial-content="editorContent"
    :is-editing-past-data="!isToday"
    :current-date-string="board.date"
    :is-mobile="isMobile"
    :manual-save-prompt-text="manualSavePromptText"
    :show-paste-buttons="showPasteButtonsSetting"
    :show-quick-tools="showQuickToolsSetting"
    :template-data="homeworkTemplate"
    :title="editorTitle"
    @save="saveHomework"
  />

  <attendance-management-dialog
    v-model="attDialogOpen"
    :date="board.date"
    :students="board.students"
    @saved="refreshAttendance"
  />

  <floating-toolbar
    :copy-to-today-loading="copyLoading"
    :is-today="isToday"
    :loading="board.loading"
    :selected-date="selectedDateObj"
    @copy-to-today="copyToToday"
    @date-select="handleDateSelect"
    @next-day="shiftDay(1)"
    @prev-day="shiftDay(-1)"
    @refresh="board.refresh()"
    @zoom="zoom"
  />

  <random-picker
    v-model="randomOpen"
    :attendance="attendanceStatus"
    :default-count="randomDefaultCountSetting"
    :default-exclude-absent="randomExcludeAbsentDefault"
    :default-exclude-excluded="randomExcludeExcludedSetting"
    :default-exclude-late="randomExcludeLateSetting"
    :default-mode="randomPickerModeSetting"
    :max-number="randomMaxNumberSetting"
    :min-number="randomMinNumberSetting"
    :spin-animation="randomAnimationSetting"
    :students="board.students"
  />

  <urgent-notification-dialog v-model="notifyOpen" @sent="onNoticeSent" />

  <homework-transfer-dialog v-model="transferOpen" />

  <notice-read-dialog
    :marking="markingNoticeRead"
    :notice="readingNotice"
    :queue-total="noticeReadQueue.length"
    @read="confirmNoticeRead"
  />

  <exam-board-picker
    v-model="examPickerOpen"
    :checked-ids="examCardIds"
    :exams="board.exams"
    @update:checked-ids="saveExamCardIds"
    @open-full-page="go('exams')"
  />

  <exam-config-dialog
    :model-value="examDetailOpen"
    :exam="examDetail"
    :subjects="board.subjects"
    @update:model-value="closeExamDetail"
    @saved="onExamSaved"
    @deleted="onExamDeleted"
  />

  <v-navigation-drawer v-model="noticeDrawer" location="right" temporary width="420">
    <v-list-item subtitle="新通知会自动弹窗，需点击「我已阅读」才会关闭" title="通知" />
    <v-divider />
    <v-list v-if="board.notices.length">
      <v-list-item v-for="item in board.notices" :key="item.id" @click="openNotice(item)">
        <template #prepend>
          <v-icon :color="item.level === 'urgent' ? 'error' : 'primary'">
            {{ item.level === 'urgent' ? 'mdi-alert' : 'mdi-bullhorn-outline' }}
          </v-icon>
        </template>
        <v-list-item-title class="d-flex align-center">
          <span class="text-truncate">{{ item.title || '通知' }}</span>
          <v-chip v-if="!item.readAt" class="ml-2" color="error" size="x-small" variant="flat">未读</v-chip>
        </v-list-item-title>
        <v-list-item-subtitle class="text-truncate">{{ item.content || '（无正文）' }}</v-list-item-subtitle>
        <template #append>
          <v-chip size="x-small" variant="tonal">已读 {{ item.readCount ?? 0 }}</v-chip>
        </template>
      </v-list-item>
    </v-list>
    <div v-else class="pa-6 text-medium-emphasis">暂无通知</div>
  </v-navigation-drawer>

  <v-dialog v-model="detailOpen" max-width="700" scrollable>
    <v-card v-if="activeNotice" class="rounded-xl">
      <v-card-title class="d-flex align-center pa-4 text-h5">
        <span :class="activeNotice.level === 'urgent' ? 'text-error' : ''" class="font-weight-bold">
          {{ activeNotice.level === 'urgent' ? '强调通知' : '通知详情' }}
        </span>
        <v-spacer />
        <v-btn icon="mdi-close" variant="text" @click="detailOpen = false" />
      </v-card-title>
      <v-divider />
      <v-card-text class="pa-6">
        <div class="text-h4 font-weight-medium mb-4" style="line-height: 1.5">{{ activeNotice.title || '通知' }}</div>
        <div class="text-subtitle-1 text-grey">{{ activeNotice.content }}</div>
      </v-card-text>
      <v-divider />
      <v-card-actions class="pa-4">
        <v-spacer />
        <v-btn color="primary" size="x-large" variant="elevated" class="px-8" @click="detailOpen = false">关闭</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <v-dialog v-model="localDialog" max-width="480">
    <v-card>
      <v-card-title class="text-h6">本地缓存模式</v-card-title>
      <v-card-text class="text-body-2">
        <div>当前看板只读取本机缓存数据，不会联网刷新。</div>
        <div class="mt-2">待同步改动：<strong>{{ ds.pending }}</strong> 条</div>
      </v-card-text>
      <v-card-actions>
        <v-btn variant="text" @click="localDialog = false">关闭</v-btn>
        <v-btn v-if="ds.needsOnlineLoad" prepend-icon="mdi-cloud-download-outline" variant="tonal" @click="loadOnline">立即在线加载</v-btn>
        <v-btn v-else-if="ds.pending > 0" variant="text" @click="discardLocal">丢弃改动</v-btn>
        <v-spacer />
        <v-btn :disabled="ds.pending === 0" :loading="localSyncing" color="primary" variant="elevated" @click="syncLocal">
          立即同步
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <v-snackbar v-model="snack.show" :color="snack.color" :timeout="2400">{{ snack.text }}</v-snackbar>
  <a
    class="icp-beian"
    href="https://beian.miit.gov.cn/"
    rel="noopener noreferrer"
    target="_blank"
    title="工业和信息化部政务服务平台 ICP/IP地址/域名信息备案管理系统"
  >粤ICP备2026147155号-2</a>

</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useDisplay } from 'vuetify'
import type { ExamItem, NoticeItem, SubjectInfo } from '@starflame/shared'
import { getData, patchData, postData } from '@/lib/api'
import { playTone, unlockAudioOnFirstGesture } from '@/lib/soundPresets'
import { ensureNoticePermission, sendSystemNotice } from '@/lib/systemNotify'
import { connectRealtime, disconnectRealtime, onBoardChange, onLatency, onRealtimeStatus } from '@/lib/realtime'
import { captureSnapshot, discardPending, ds, flushPending } from '@/lib/dataSource'
import { initOffline, offlineUi, retryNow, setOfflineNotify, setOfflineReloadHandler } from '@/lib/offline'
import { applyTheme, currentTheme, toggleTheme, type ThemeMode } from '@/lib/theme'
import { navigate, type PageName } from '@/lib/nav'
import { useSessionStore } from '@/stores/session'
import { useBoardStore } from '@/stores/board'
import HomeworkGrid from '@/components/home/HomeworkGrid.vue'
import logoUrl from '@/assets/logo.svg'
import MarqueeText from '@/components/home/MarqueeText.vue'
import TimeCard from '@/components/TimeCard.vue'
import HitokotoCard from '@/components/HitokotoCard.vue'
import ConciseExamCard from '@/components/home/ConciseExamCard.vue'
import type { GridItem } from '@/types/board'
import HomeActions from '@/components/home/HomeActions.vue'
import AttendanceSidebar from '@/components/attendance/AttendanceSidebar.vue'
import AttendanceManagementDialog from '@/components/attendance/AttendanceManagementDialog.vue'
import HomeworkEditDialog from '@/components/HomeworkEditDialog.vue'
import FloatingToolbar from '@/components/FloatingToolbar.vue'
import RandomPicker from '@/components/RandomPicker.vue'
import PwaInstallCard from '@/components/PwaInstallCard.vue'
import UrgentNotificationDialog from '@/components/UrgentNotificationDialog.vue'
import HomeworkTransferDialog from '@/components/home/HomeworkTransferDialog.vue'
import NoticeReadDialog from '@/components/NoticeReadDialog.vue'
import ExamBoardPicker from '@/components/ExamBoardPicker.vue'
import BoardSkeleton from '@/components/skeleton/BoardSkeleton.vue'
import ExamConfigDialog from '@/components/home/ExamConfigDialog.vue'
import { consumeSettingsDirty } from '@/lib/settingsDirty'
import { syncUpdateSchedule } from '@/lib/updateScheduleSync'
import { deviceMode, isMobileUi } from '@/lib/deviceMode'
import { isDesktop, toggleFullscreen as platformToggleFullscreen } from '@/lib/platform'
import { readBellOffsetConfig } from '@/lib/bellOffset'
import {
  backgroundSetting,
  boolSetting,
  fontSizeSetting,
  intSetting,
  randomExcludeAbsentSetting as readRandomExcludeAbsent,
  randomModeSetting as readRandomMode,
  stringSetting,
} from '@/lib/settingsCompat'

const session = useSessionStore()

function go(page: PageName): void {
  navigate(page)
}
const board = useBoardStore()

const editorOpen = ref(false)
const attDialogOpen = ref(false)
const randomOpen = ref(false)
const notifyOpen = ref(false)
const examPickerOpen = ref(false)
// 点击首页考试卡片 → 打开该考试的详情浏览弹窗
const examDetailOpen = ref(false)
const examDetailId = ref<string | null>(null)
const examDetail = computed<ExamItem | null>(
  () => board.exams.find((exam) => exam.id === examDetailId.value) ?? null,
)
const noticeDrawer = ref(false)
const editorKind = ref<'subject' | 'custom'>('subject')
const detailOpen = ref(false)
const activeNotice = ref<NoticeItem | null>(null)
const editorTitle = ref('编辑作业')
const editorContent = ref('')
const editorSubjectId = ref('')
const editorRef = ref<InstanceType<typeof HomeworkEditDialog> | null>(null)

// ---------- 看板正文字号（本地记忆，刷新/重开后保持上次调整值） ----------
const FONT_SIZE_KEY = 'sf.fontSize'
const FONT_SIZE_MIN = 14
const FONT_SIZE_MAX = 96
const FONT_SIZE_DEFAULT = 28

function clampFontSize(value: number): number {
  if (!Number.isFinite(value)) return FONT_SIZE_DEFAULT
  return Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, Math.round(value)))
}

function readStoredFontSize(): number {
  try {
    const raw = localStorage.getItem(FONT_SIZE_KEY)
    if (!raw) return FONT_SIZE_DEFAULT
    return clampFontSize(Number(raw))
  } catch {
    return FONT_SIZE_DEFAULT
  }
}

const fontSize = ref<number>(readStoredFontSize())

watch(fontSize, (value) => {
  try {
    localStorage.setItem(FONT_SIZE_KEY, String(value))
  } catch {
    /* 隐私模式等写入失败时忽略，不影响当前显示 */
  }
})
const copyLoading = ref(false)

const selectedDateObj = computed(() => new Date(board.date + 'T00:00:00'))
const isFullscreen = ref(false)
const isMobile = ref(false)
// 浏览器窗口变窄时 isMobile（设备模式判定）不一定为 true，头部另按 Vuetify 断点收敛
const { smAndDown } = useDisplay()
const compact = computed(() => isMobile.value || smAndDown.value)

/**
 * 顶栏左侧品牌行「星焰作业板」：只在桌面模式与一体机模式下显示，
 * 手机/平板布局顶栏空间紧张，不显示。
 */
const showBrandLine = computed(() => deviceMode.value === 'desktop' || deviceMode.value === 'terminal')
const pwaPrompt = ref<{ prompt: () => Promise<void> } | null>(null)
const highlightedCards = ref<Record<string, boolean>>({})
const snack = reactive({ show: false, text: '', color: 'success' })

const attendance = ref({
  absent: 0,
  excluded: 0,
  lateCount: 0,
  absentNames: [] as string[],
  lateNames: [] as string[],
})

const attendanceStatus = ref<Record<string, string>>({})
const knownNoticeIds = new Set<string>()
let noticeBaselineReady = false

/** 待确认已读的通知队列：新通知依次弹出，必须点「我已阅读」才会关闭 */
const noticeReadQueue = ref<NoticeItem[]>([])
const markingNoticeRead = ref(false)
const readingNotice = computed<NoticeItem | null>(() => noticeReadQueue.value[0] ?? null)

function enqueueUnreadNotices(items: NoticeItem[]): void {
  // 已读弹窗只在「一体机」授权码的设备上弹出；老师 / 学生 / 家长设备只收系统通知
  if (session.role !== 'terminal') return
  for (const item of items) {
    if (item.readAt) continue
    if (noticeReadQueue.value.some((queued) => queued.id === item.id)) continue
    noticeReadQueue.value.push(item)
  }
}

/** 写回服务端「已读」，同时同步本地读状态 */
async function markNoticeRead(item: NoticeItem): Promise<void> {
  const result = await postData<{ id: string; readAt: string | null; readCount: number }>(
    '/board/notices/' + item.id + '/read',
    {},
  )
  const readAt = result.readAt ?? new Date().toISOString()
  const target = board.data?.notices?.find((row) => row.id === item.id)
  if (target) {
    target.readAt = readAt
    target.readCount = result.readCount ?? (target.readCount ?? 0) + 1
  }
  item.readAt = readAt
  item.readCount = result.readCount ?? (item.readCount ?? 0) + 1
}

/** 弹窗里的「我已阅读」 */
async function confirmNoticeRead(): Promise<void> {
  const item = readingNotice.value
  if (!item || markingNoticeRead.value) return
  markingNoticeRead.value = true
  try {
    await markNoticeRead(item)
  } catch {
    // 离线或写失败也允许关闭弹窗，避免卡住大屏
  } finally {
    markingNoticeRead.value = false
    noticeReadQueue.value = noticeReadQueue.value.filter((queued) => queued.id !== item.id)
  }
}

/** 轮询/实时收到新通知时：自动弹窗 + 系统通知 + 提示音 */
function handleFreshNotices(): void {
  const notices = board.notices ?? []
  if (!noticeBaselineReady) {
    for (const item of notices) knownNoticeIds.add(item.id)
    noticeBaselineReady = true
    return
  }

  const fresh = notices.filter((item) => !knownNoticeIds.has(item.id))
  if (fresh.length === 0) return

  for (const item of fresh) knownNoticeIds.add(item.id)

  enqueueUnreadNotices(fresh)
  for (const item of fresh) {
    sendSystemNotice(
      item.level === 'urgent' ? '加急通知 · ' + item.title : '班级通知 · ' + item.title,
      item.content || '点击查看通知详情',
      item.level === 'urgent',
    )
  }

  if (settings.value['notification.enabled'] === false) return
  if (isReadOnly.value) return

  const volume = Number(settings.value['notification.volume'] ?? 70) / 100
  const hasUrgent = fresh.some((item) => item.level === 'urgent')
  const soundId = String(
    hasUrgent
      ? settings.value['notification.urgentSound'] ?? 'alert'
      : settings.value['notification.singleSound'] ?? 'ding',
  )

  try {
    playTone(soundId, volume, hasUrgent)
  } catch {
    // 浏览器可能拦截自动播放
  }
}

let refreshTimer: number | undefined
let stopRealtime: (() => void) | undefined
let stopStatus: (() => void) | undefined
const realtimeOnline = ref(false)
const latency = ref<number | null>(null)
let stopLatency: (() => void) | undefined

/** 通道延迟文案：未连接显示离线，探测失败显示破折号 */
const latencyText = computed(() => {
  if (!realtimeOnline.value) return '离线'
  if (latency.value === null) return '—'
  return latency.value + ' ms'
})

/** 同步状态与延迟共用的颜色档位：正常绿 / 偏慢黄 / 过慢红 */
const statusTone = computed<'success' | 'warning' | 'error'>(() => {
  if (!realtimeOnline.value || latency.value === null) return 'warning'
  if (latency.value < 150) return 'success'
  if (latency.value < 400) return 'warning'
  return 'error'
})

const latencyClass = computed(() => 'text-' + statusTone.value)

const realtimeTooltip = computed(() => {
  if (!realtimeOnline.value) return '实时同步已断开，正在重连'
  return latency.value === null ? '已连接实时同步' : '已连接实时同步 · 延迟 ' + latency.value + ' ms'
})

const localDialog = ref(false)
const localSyncing = ref(false)

/** 本地模式待同步操作 */
async function syncLocal(): Promise<void> {
  if (localSyncing.value) return
  localSyncing.value = true
  try {
    const result = await flushPending()
    snack.text = result.remaining > 0 ? '仍有 ' + result.remaining + ' 条未能同步' : '已同步 ' + result.synced + ' 条本地改动'
    snack.color = result.remaining > 0 ? 'warning' : 'success'
    snack.show = true
    if (result.remaining === 0) {
      localDialog.value = false
      await board.refresh()
    }
  } catch {
    snack.text = '同步失败，请检查网络'
    snack.color = 'error'
    snack.show = true
  } finally {
    localSyncing.value = false
  }
}

/** 离线 chip：有网络时立即重试同步，否则解释当前状态 */
async function onOfflineChip(): Promise<void> {
  // 先主动探测一次：网络其实正常时点一下就立刻回到在线
  await retryNow()
  if (offlineUi.status === 'offline' || offlineUi.needsManualRetry) {
    if (offlineUi.needsManualRetry || ds.pending > 0) return
    snack.text = '当前处于离线缓存模式，网络恢复后会自动同步'
    snack.color = 'warning'
    snack.show = true
  }
}

function discardLocal(): void {
  discardPending()
  snack.text = '已丢弃本地改动'
  snack.color = 'success'
  snack.show = true
  localDialog.value = false
}

/** 本地模式缺少快照时，在线抓一次再刷新 */
async function loadOnline(): Promise<void> {
  const snapshot = await captureSnapshot()
  if (!snapshot) {
    snack.text = '抓取失败，请检查网络'
    snack.color = 'error'
    snack.show = true
    return
  }
  await board.refresh()
}

// 兜底轮询：即使 socket 断了也不会长期不更新（5 分钟一次，仅用作保险）
const FALLBACK_INTERVAL = 5 * 60 * 1000

const dataReady = computed(() => board.loaded)

/** 首屏加载失败时的手动重试（自动重试已在 dataSource 内做了两轮） */
async function retryLoad(): Promise<void> {
  await board.refresh()
  if (board.loaded) void refreshAttendance()
}

/** 看板布局：wall = 作业墙（新），classic = 经典网格 */
type LayoutMode = 'wall' | 'classic'
const LAYOUT_KEY = 'sf.boardLayout'
// 默认经典布局；用户手动切换后记住选择
const layoutMode = ref<LayoutMode>(
  localStorage.getItem(LAYOUT_KEY) === 'wall' ? 'wall' : 'classic',
)

function toggleLayout(): void {
  layoutMode.value = layoutMode.value === 'wall' ? 'classic' : 'wall'
  localStorage.setItem(LAYOUT_KEY, layoutMode.value)
}
/** 首页通知只展示「置顶」通知（未置顶的仅在发布时弹窗提醒）；
 *  桌面端一行两条（最多 4 条），移动端单列（最多 2 条） */
const wallNotices = computed(() =>
  (board.notices ?? []).filter((item) => item.pinned).slice(0, isMobile.value ? 2 : 4),
)

const className = computed(() => session.classInfo?.name ?? '')
const isReadOnly = computed(() => Boolean(session.device?.isReadOnly))
// 随机点名入口常显：只有班级设置里明确关闭时才隐藏（花名册为空时由弹窗内部提示）
const randomPickerFeature = computed(() => boolSetting(settings.value, 'randomPicker.enabled', true))
const randomPickerEnabled = computed(
  () => randomPickerFeature.value && boolSetting(settings.value, 'display.showRandomButton', true),
)
const studentNames = computed(() => board.students.map((item) => item.name))

const settings = computed(() => (board.data?.settings ?? {}) as Record<string, unknown>)

// 作息时间表 -> 桌面主进程：上课时段暂停静默更新（网页端为空操作）
watch(
  settings,
  (value) => syncUpdateSchedule(value),
  { deep: true, immediate: true },
)

/**
 * 同步「手机布局」开关：
 * - 一体机模式（含手动覆盖）永远用桌面布局；
 * - 班级设置里勾了「强制使用一体机UI模式」时，小屏也用桌面布局；
 * - 其他情况按视口宽度（已考虑桌面端 15% 缩放）判断。
 */
function syncIsMobile(): void {
  const forced = settings.value['display.forceDesktopMode'] === true
  isMobile.value = isMobileUi.value && !forced
}

watch([isMobileUi, () => settings.value['display.forceDesktopMode']], syncIsMobile, { immediate: true })
const clock12h = computed(() => Boolean(settings.value.clock12h))
const emptySubjectDisplay = computed(() =>
  stringSetting(settings.value, 'display.emptySubjectDisplay', 'button'),
)
// 正文字号：设置页的 font.size 优先，旧键 fontScale（相对 28px 的倍数）兜底
const settingFontSize = computed(() => fontSizeSetting(settings.value))
const fontScale = computed(() => settingFontSize.value)

/** 云端字号只在首次拿到班级设置时套用一次，之后用户用浮动工具栏缩放的结果（本机）优先 */
const fontSizeAppliedFromSettings = ref(false)
watch(
  settingFontSize,
  (value) => {
    if (fontSizeAppliedFromSettings.value || !board.data) return
    fontSizeAppliedFromSettings.value = true
    // 只有班级明确配置了非默认字号时才覆盖本机缩放记忆
    if (value === FONT_SIZE_DEFAULT) return
    const next = clampFontSize(value)
    if (next !== fontSize.value) fontSize.value = next
  },
  { immediate: true },
)

// ---------- 显示类设置 ----------
const showTimeCardSetting = computed(() => boolSetting(settings.value, 'timeCard.enabled', true))
const showHitokotoSetting = computed(() => boolSetting(settings.value, 'hitokoto.enabled', true))
const showRandomButtonSetting = computed(() =>
  boolSetting(settings.value, 'display.showRandomButton', true),
)
const showFullscreenButtonSetting = computed(() =>
  boolSetting(settings.value, 'display.showFullscreenButton', true),
)
const showExamButtonSetting = computed(() =>
  boolSetting(settings.value, 'display.showExamScheduleButton', true),
)
const showListCardSetting = computed(() => boolSetting(settings.value, 'display.showListCard', true))
const showAntiBurnCardSetting = computed(() =>
  boolSetting(settings.value, 'display.showAntiScreenBurnCard', true),
)
const showQuickToolsSetting = computed(() =>
  boolSetting(settings.value, 'display.showQuickTools', true),
)
const showPasteButtonsSetting = computed(() =>
  boolSetting(settings.value, 'display.showPasteButtons', true),
)
const dynamicSortSetting = computed(() => boolSetting(settings.value, 'display.dynamicSort', true))
const cardHoverSetting = computed(() =>
  boolSetting(settings.value, 'display.cardHoverEffect', true),
)
const enhancedTouchSetting = computed(() =>
  boolSetting(settings.value, 'display.enhancedTouchMode', true),
)
const hidePwaCardSetting = computed(() => boolSetting(settings.value, 'pwa.hideInstallCard', false))
/** 迟到学生是否计入「实到」 */
const lateIsPresentSetting = computed(() =>
  boolSetting(settings.value, 'display.lateStudentsArePresent', false),
)

// ---------- 随机点名设置 ----------
const randomPickerModeSetting = computed(() => readRandomMode(settings.value))
const randomExcludeAbsentDefault = computed(() => readRandomExcludeAbsent(settings.value))
const randomExcludeExcludedSetting = computed(() =>
  boolSetting(settings.value, 'randomPicker.excludeExcluded', true),
)
const randomDefaultCountSetting = computed(() =>
  intSetting(settings.value, 'randomPicker.defaultCount', 1, 1, 20),
)
const randomMinNumberSetting = computed(() =>
  intSetting(settings.value, 'randomPicker.minNumber', 1, 1, 99),
)
const randomMaxNumberSetting = computed(() =>
  intSetting(settings.value, 'randomPicker.maxNumber', 60, 1, 200),
)
const randomExcludeLateSetting = computed(() =>
  boolSetting(settings.value, 'randomPicker.excludeLate', false),
)
const randomAnimationSetting = computed(() =>
  boolSetting(settings.value, 'randomPicker.animation', true),
)

// 手机屏幕窄，按比例缩小作业字号（桌面/大屏保持用户设定值）
const mobileFontScale = 0.62
const contentStyle = computed(() => ({
  fontSize: (isMobile.value ? Math.round(fontSize.value * mobileFontScale) : fontSize.value) + 'px',
}))

// 每周作息（用于时间卡的放学倒计时）
// ---------- 亮暗主题 ----------
const themeMode = ref<ThemeMode>(currentTheme())
const isDark = computed(() => themeMode.value === 'dark')

/** 用户点击切换：带圆形扩散动画（只写本机，不同步云端） */
function onToggleTheme(event: MouseEvent | KeyboardEvent): void {
  const point = 'clientX' in event ? { x: event.clientX, y: event.clientY } : undefined
  const next = toggleTheme(point)
  themeMode.value = next
}

// 课铃偏移：时间卡的时钟与作息文字不变，只有放学倒计时跟随课铃提前/延后
const bellOffsetConfig = computed(() => readBellOffsetConfig(settings.value))

const weeklySchedule = computed<
  Record<string, { start: string; end: string; endBoarding?: string | null } | null>
>(() => {
  const raw = settings.value['schedule.weekly']
  return raw && typeof raw === 'object'
    ? (raw as Record<string, { start: string; end: string; endBoarding?: string | null } | null>)
    : {}
})

// 背景设置（图片 + 模糊 + 遮罩）
// 背景：新键 background.* 优先，旧键 bgEnabled/bgUrl/… 兜底
const bg = computed(() => backgroundSetting(settings.value))

const bgImageStyle = computed(() => ({
  backgroundImage: 'url(' + bg.value.url + ')',
  filter: 'blur(' + bg.value.blur + 'px)',
}))

const bgOverlayStyle = computed(() => ({
  backgroundColor: 'rgba(0,0,0,' + bg.value.opacity / 100 + ')',
}))

// 作业模板（课本 / 页码 / 快捷操作），存在班级 settings 里
const homeworkTemplate = computed(() => {
  const raw = settings.value.homeworkTemplate
  return raw && typeof raw === 'object' ? (raw as Record<string, never>) : null
})

// ---------- 作业编辑相关设置 ----------
const autoSaveSetting = computed(() => boolSetting(settings.value, 'edit.autoSave', false))
const blockNonTodayAutoSaveSetting = computed(() =>
  boolSetting(settings.value, 'edit.blockNonTodayAutoSave', true),
)
const confirmNonTodaySaveSetting = computed(() =>
  boolSetting(settings.value, 'edit.confirmNonTodaySave', true),
)
const blockPastDataEditSetting = computed(() =>
  boolSetting(settings.value, 'edit.blockPastDataEdit', false),
)
// 修改历史作业前先重新拉取，避免覆盖其他设备刚保存的内容
const refreshBeforeEditSetting = computed(() =>
  boolSetting(settings.value, 'edit.refreshBeforeEdit', true),
)

const autoSavePromptText = computed(() =>
  stringSetting(settings.value, 'edit.autoSavePromptText', '内容会自动保存，关闭对话框即生效'),
)
const manualSavePromptText = computed(() =>
  stringSetting(settings.value, 'edit.manualSavePromptText', '修改后请点击保存'),
)

function formatDate(d: Date): string {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return yyyy + mm + dd
}

/**
 * 把 Date 转成本机日历日期字符串 yyyy-mm-dd。
 * 不能用 toISOString()：那是 UTC 日期，东八区 00:00 会被算成前一天，
 * 跨时区/夏令时切换时会让「上一天/下一天」跳到错误日期甚至原地不动。
 */
function toDateString(d: Date): string {
  const raw = formatDate(d)
  return raw.slice(0, 4) + '-' + raw.slice(4, 6) + '-' + raw.slice(6, 8)
}

/** 解析 yyyy-mm-dd（按本机日历零点），非法时回退到今天 */
function parseDateString(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return new Date()
}

const isToday = computed(() => board.date.replace(/-/g, '') === formatDate(new Date()))

const titleText = computed(() => {
  // 班级名已在右侧 chip 展示，这里只放日期语义，避免长标题被省略号截断
  const current = board.date ? board.date.replace(/-/g, '') : ''
  if (!current) return '今天的作业'
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  if (current === formatDate(today)) return '今天的作业'
  if (current === formatDate(yesterday)) return '昨天的作业'
  return board.date + ' 的作业'
})

const homeworkBySubject = computed(() => {
  const map: Record<string, { content: string; version: number }> = {}
  for (const item of board.data?.homework ?? []) {
    if (item.content && item.content.trim()) {
      map[item.subjectId] = { content: item.content, version: item.version }
    }
  }
  return map
})

const sortedItems = computed<GridItem[]>(() => {
  const items: GridItem[] = []

  if (isMobile.value && board.students.length > 0) {
    items.push({
      key: 'attendance-card',
      name: '出勤统计',
      type: 'attendance',
      order: -1,
      data: {
        total: board.students.length,
        present: board.students.length - attendance.value.absent - attendance.value.excluded,
        absent: attendance.value.absent,
        late: attendance.value.lateCount,
      },
    })
  }

  if (settings.value.showExam !== false) {
    for (const exam of visibleExams.value) {
      if (!exam.subjects || exam.subjects.length === 0) continue
      items.push({
        key: 'exam-' + exam.id,
        name: exam.title,
        type: 'exam',
        examId: exam.id,
        order: -100,
      })
    }
  }

  for (const subject of board.subjects) {
    const record = homeworkBySubject.value[subject.id]
    if (!record) continue
    const lineCount = record.content.split('\n').filter((line) => line.trim()).length
    items.push({
      key: subject.id,
      name: subject.name,
      type: 'homework',
      content: record.content,
      order: subject.sortIndex,
      rowSpan: 100 + lineCount * 24,
    })
  }

  for (const card of filledCustomCards.value) {
    const lineCount = card.content.split('\n').filter((line) => line.trim()).length
    items.push({
      key: 'custom-' + card.id,
      name: card.title,
      type: 'homework',
      content: card.content,
      order: 100 + card.sortIndex,
      rowSpan: 100 + lineCount * 24,
    })
  }

  if (showTimeCardSetting.value) {
    items.push({ key: 'time-card', name: '时间', type: 'time', order: 9997 })
  }
  if (showHitokotoSetting.value) {
    items.push({ key: 'hitokoto-card', name: '一言', type: 'hitokoto', order: 9998 })
  }

  return items.sort((a, b) => a.order - b.order)
})

const unusedSubjects = computed<SubjectInfo[]>(() =>
  board.subjects.filter((subject) => !homeworkBySubject.value[subject.id]),
)

interface CustomCard {
  id: string
  title: string
  content: string
  sortIndex: number
}

const customCards = computed<CustomCard[]>(() => {
  const raw = (board.data as unknown as { customCards?: CustomCard[] } | null)?.customCards
  return Array.isArray(raw) ? raw : []
})

// 手动选择要展示在看板上的考试配置
const examCardIds = computed<string[]>(() => {
  const raw = settings.value.examCardIds
  return Array.isArray(raw) ? (raw as string[]) : []
})

const visibleExams = computed(() => {
  const ids = examCardIds.value
  if (ids.length === 0) return []
  return board.exams.filter((exam) => ids.includes(exam.id))
})

function openExamDetail(id: string): void {
  if (!id) return
  examDetailId.value = id
  examDetailOpen.value = true
}

function closeExamDetail(open: boolean): void {
  examDetailOpen.value = open
  if (!open) examDetailId.value = null
}

async function onExamSaved(): Promise<void> {
  await board.refresh()
  snack.text = '考试配置已保存'
  snack.color = 'success'
  snack.show = true
}

async function onExamDeleted(): Promise<void> {
  examDetailId.value = null
  await board.refresh()
  snack.text = '考试配置已删除'
  snack.color = 'success'
  snack.show = true
}

async function saveExamCardIds(ids: string[]): Promise<void> {
  try {
    await patchData('/board/settings', { settings: { examCardIds: ids } })
    if (board.data) {
      board.data.settings = { ...(board.data.settings ?? {}), examCardIds: ids }
    }
  } catch (error) {
    notify(error instanceof Error ? error.message : '保存失败', 'error')
  }
}

const filledCustomCards = computed(() => customCards.value.filter((item) => item.content.trim()))
const emptyCustomCards = computed(() => customCards.value.filter((item) => !item.content.trim()))

/** 作业墙：所有启用科目 + 有内容的自定义卡片，按排序拼接 */
const SUBJECT_FALLBACK_COLORS = [
  '#f4511e',
  '#ff8a1f',
  '#2e9e63',
  '#2f7fd1',
  '#8e5cf7',
  '#e5484d',
  '#0ea5a5',
  '#c29a19',
]

const wallCards = computed(() => {
  const cards: Array<{ key: string; name: string; color: string; content: string; lines: string[]; order: number }> = []
  board.subjects.forEach((subject, index) => {
    const record = homeworkBySubject.value[subject.id]
    const content = record?.content?.trim() ?? ''
    cards.push({
      key: subject.id,
      name: subject.name,
      color: subject.color || SUBJECT_FALLBACK_COLORS[index % SUBJECT_FALLBACK_COLORS.length]!,
      content,
      lines: content ? content.split('\n') : [],
      order: subject.sortIndex,
    })
  })
  for (const card of filledCustomCards.value) {
    const content = card.content.trim()
    cards.push({
      key: 'custom-' + card.id,
      name: card.title,
      color: 'var(--brand-2, #f4511e)',
      content,
      lines: content ? content.split('\n') : [],
      order: 100 + card.sortIndex,
    })
  }
  return cards.sort((a, b) => a.order - b.order)
})

const showTime = computed(() => showTimeCardSetting.value)
const showAttendance = computed(() => boolSetting(settings.value, 'display.showAttendance', false))
const showHitokoto = computed(() => showHitokotoSetting.value)
const wallPresent = computed(() => {
  const late = lateIsPresentSetting.value ? 0 : attendance.value.lateCount
  return Math.max(0, board.students.length - attendance.value.absent - attendance.value.excluded - late)
})

async function openEditorById(key: string): Promise<void> {
  if (isReadOnly.value) {
    notify('当前设备为只读模式', 'warning')
    return
  }
  // 「修改前先刷新」：先拉一次最新数据，避免用过期的版本覆盖其他设备的修改
  if (refreshBeforeEditSetting.value && board.loaded && !board.loading) {
    await board.refresh()
  }
  // 「只能修改当天的作业」：历史日期直接拒绝
  if (!isToday.value && blockPastDataEditSetting.value) {
    notify('班级设置只允许修改当天的作业，历史数据不可编辑', 'warning')
    return
  }

  if (key.startsWith('custom-')) {
    const cardId = key.slice(7)
    const card = customCards.value.find((item) => item.id === cardId)
    if (!card) return
    editorKind.value = 'custom'
    editorSubjectId.value = card.id
    editorTitle.value = card.title
    editorContent.value = card.content
    editorOpen.value = true
    setTimeout(() => editorRef.value?.focus(), 150)
    return
  }

  const subject = board.subjects.find((item) => item.id === key)
  if (!subject) return
  editorKind.value = 'subject'
  editorSubjectId.value = subject.id
  editorTitle.value = subject.name
  editorContent.value = homeworkBySubject.value[key]?.content ?? ''
  editorOpen.value = true
  setTimeout(() => editorRef.value?.focus(), 150)
}

// 首页已不再提供「新建自定义卡片」入口（改由设置/后台的自定义卡片管理）
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function addCustomCard(): Promise<void> {
  if (isReadOnly.value) {
    notify('当前设备为只读模式', 'warning')
    return
  }
  const title = window.prompt('自定义卡片名称（例如：通知事项、值日表）')
  if (!title || !title.trim()) return
  try {
    await postData('/board/custom-cards', { title: title.trim() })
    await board.refresh()
    notify('已添加「' + title.trim() + '」')
  } catch (error) {
    notify(error instanceof Error ? error.message : '添加失败', 'error')
  }
}

async function saveHomework(content: string): Promise<void> {
  if (!editorSubjectId.value) return
  const next = content.trim()

  // 修改历史作业时二次确认（班级设置「修改历史作业时弹确认框」）
  if (
    !isToday.value &&
    confirmNonTodaySaveSetting.value &&
    next !== editorContent.value.trim() &&
    !window.confirm('即将修改 ' + board.date + ' 的历史作业，确定要保存吗？')
  ) {
    return
  }

  // 空内容且原本也空：直接关闭，不发请求
  if (!next && !editorContent.value.trim()) {
    editorOpen.value = false
    return
  }

  try {
    editorRef.value?.setSaving(true)
    if (editorKind.value === 'custom') {
      await patchData('/board/custom-cards/' + editorSubjectId.value, { content: next })
      await board.refresh()
    } else if (next) {
      await board.saveHomework(editorSubjectId.value, next)
    } else {
      // 清空作业
      await board.saveHomework(editorSubjectId.value, '')
    }
    editorRef.value?.setSaving(false)
    editorOpen.value = false
    notify(next ? '已保存' : '已清空')
  } catch (error) {
    const message = error instanceof Error ? error.message : '保存失败'
    editorRef.value?.setError(message)
  }
}

function onNoticeSent(): void {
  notify('通知已发送')
  void board.refresh()
}

async function refreshAttendance(): Promise<void> {
  try {
    const result = await getData<{ records: Array<{ studentId: string; status: string }> }>('/board/attendance', {
      date: board.date,
    })
    const map: Record<string, string> = {}
    for (const record of result.records) map[record.studentId] = record.status
    attendanceStatus.value = map
    const nameOf = new Map(board.students.map((item) => [item.id, item.name]))
    const absentNames: string[] = []
    const lateNames: string[] = []
    let excluded = 0
    for (const record of result.records) {
      const name = nameOf.get(record.studentId)
      if (!name) continue
      if (record.status === 'absent') absentNames.push(name)
      if (record.status === 'late') lateNames.push(name)
      if (record.status === 'excluded') excluded += 1
    }
    attendance.value = {
      absent: absentNames.length,
      excluded,
      lateCount: lateNames.length,
      absentNames,
      lateNames,
    }
  } catch {
    attendance.value = { absent: 0, excluded: 0, lateCount: 0, absentNames: [], lateNames: [] }
  }
}

async function switchDate(target: string): Promise<void> {
  // 同一天重复点击不必再发请求，避免离线模式下来回空转
  if (!target || target === board.date) return
  await board.refresh(target)
  if (board.error) {
    notify('切换到 ' + target + ' 失败：' + board.error, 'error')
    return
  }
  // 出勤数据是按日期取的，切日期后必须重新拉一次，否则统计还停在上一天
  await refreshAttendance()
  if (board.date !== target) {
    // 数据层已尽力保证日期，这里再兜一层，避免界面停在旧日期
    notify('无法切换到 ' + target, 'warning')
  }
}

function shiftDay(delta: number): void {
  const base = parseDateString(board.date)
  base.setDate(base.getDate() + delta)
  void switchDate(toDateString(base))
}

function handleDateSelect(value: unknown): void {
  if (value === null || value === undefined) return
  const raw = value instanceof Date ? value : parseDateString(String(value).slice(0, 10))
  if (Number.isNaN(raw.getTime())) return
  void switchDate(toDateString(raw))
}

async function copyToToday(): Promise<void> {
  if (copyLoading.value) return
  copyLoading.value = true
  const target = toDateString(new Date())
  try {
    await switchDate(target)
    if (!board.error) notify('已切换到今天')
  } finally {
    copyLoading.value = false
  }
}

function zoom(direction: 'up' | 'out'): void {
  const step = 2
  const next = direction === 'up' ? fontSize.value + step : fontSize.value - step
  const clamped = clampFontSize(next)
  if (clamped !== fontSize.value) fontSize.value = clamped
}

async function toggleFullscreen(): Promise<void> {
  try {
    // 桌面端交给 Electron 原生窗口全屏，网页端仍是 Fullscreen API（由平台层分流）
    isFullscreen.value = await platformToggleFullscreen()
  } catch {
    notify('当前环境不支持全屏', 'warning')
  }
}

async function installPwa(): Promise<void> {
  try {
    await pwaPrompt.value?.prompt()
    pwaPrompt.value = null
  } catch {
    notify('安装失败', 'error')
  }
}

function openNotice(item: NoticeItem): void {
  activeNotice.value = item
  detailOpen.value = true
  if (!item.readAt) void markNoticeRead(item).catch(() => undefined)
}

/** 首页功能按钮「导入导出」→ 设置页的作业导入导出 */
/** 首页「导入导出」按钮：直接弹出导入 / 导出对话框 */
const transferOpen = ref(false)
function openTransfer(): void {
  transferOpen.value = true
}

function notify(text: string, color = 'success'): void {
  snack.text = text
  snack.color = color
  snack.show = true
}

/** 设置页刚改过云端设置时，进看板强制刷新一次，确保全部生效 */
async function applyPendingSettingsRefresh(): Promise<void> {
  if (!consumeSettingsDirty()) return
  await board.refresh()
  await refreshAttendance()
  handleFreshNotices()
  snack.text = '设置已更新'
  snack.color = 'success'
  snack.show = true
}

function onPageShow(event: PageTransitionEvent): void {
  // 浏览器后退恢复页面（bfcache）时不会重新挂载，这里补一次刷新
  if (event.persisted) void applyPendingSettingsRefresh()
}

function onBeforeInstall(event: Event): void {
  event.preventDefault()
  pwaPrompt.value = event as unknown as { prompt: () => Promise<void> }
}

onMounted(async () => {
  syncIsMobile()
  unlockAudioOnFirstGesture()
  window.addEventListener('resize', syncIsMobile)
  window.addEventListener('beforeinstallprompt', onBeforeInstall)
  window.addEventListener('pageshow', onPageShow)

  // ---------- 断网自动离线 ----------
  setOfflineNotify((text, color) => {
    snack.text = text
    snack.color = color ?? 'warning'
    snack.show = true
  })
  setOfflineReloadHandler(() => {
    void board.refresh()
    void refreshAttendance()
  })
  initOffline()

  if (!session.classInfo) {
    try {
      await session.loadMe()
    } catch {
      // 拦截器会跳转绑定页
    }
  }
  await board.refresh()
  await refreshAttendance()
  handleFreshNotices()
  await applyPendingSettingsRefresh()
  // 心跳由全局 presence 模块统一维持（页面可见期间每 45 秒一次），这里不再单独发送
  void ensureNoticePermission()
  window.addEventListener('pointerdown', () => { void ensureNoticePermission() }, { once: true })

  // ---------- 实时同步 ----------
  connectRealtime()

  stopLatency = onLatency((ms) => {
    latency.value = ms
  })
  stopStatus = onRealtimeStatus((online) => {
    realtimeOnline.value = online
  })

  // 收到服务端广播立即刷新对应数据，做到「改完即变」
  stopRealtime = onBoardChange(async (event) => {
    if (event.actor && event.actor === session.device?.id) {
      // 自己刚写的，本地已更新，无需重复拉取
    }
    if (event.scope === 'homework' || event.scope === 'notice' || event.scope === 'exam' || event.scope === 'students' || event.scope === 'settings') {
      await board.refresh()
      handleFreshNotices()
    }
    if (event.scope === 'attendance' || event.scope === 'students') {
      await refreshAttendance()
    }
  })

  // 兜底轮询：socket 断开或不支持时，5 分钟同步一次
  refreshTimer = window.setInterval(async () => {
    if (realtimeOnline.value) return
    await board.refresh()
    handleFreshNotices()
    void refreshAttendance()
  }, FALLBACK_INTERVAL)
})

onBeforeUnmount(() => {
  if (refreshTimer) window.clearInterval(refreshTimer)
  stopRealtime?.()
  stopStatus?.()
  stopLatency?.()
  disconnectRealtime()
  window.removeEventListener('beforeinstallprompt', onBeforeInstall)
  window.removeEventListener('pageshow', onPageShow)
  setOfflineNotify(null)
  setOfflineReloadHandler(null)
})
</script>

<style scoped>
.icp-beian {
  position: fixed;
  right: 10px;
  bottom: 6px;
  z-index: 4;
  padding: 2px 8px;
  border-radius: 8px;
  color: var(--text-3, rgba(0, 0, 0, .45));
  font-size: 12px;
  line-height: 1.6;
  text-decoration: none;
  background: color-mix(in srgb,var(--bg-card, #fff) 72%,transparent);
  transition: color .15s ease,background .15s ease;
}

.icp-beian:hover {
  color: var(--brand-2, #f4511e);
  text-decoration: underline;
}

@media(max-width:600px) {
  .icp-beian {
    right: 6px;
    bottom: 2px;
    font-size: 11px;
  }
}

.load-fail {
  margin-top: 6vh;
}

.load-fail-detail {
  margin-top: 8px;
  color: var(--text-3, rgba(0, 0, 0, .45));
  font-size: 13px;
  word-break: break-all;
}

/* 品牌区：logo 外包一层暖色光环，尺寸固定避免被 flex 拉伸 */
.board-brand {
  position: relative;
  box-sizing: border-box;
  flex: 0 0 auto;
  width: 34px;
  height: 34px;
  padding: 2px;
  margin-right: 11px;
  border-radius: 11px;
  display: inline-grid;
  place-items: center;
  background: radial-gradient(circle at 30% 20%, rgba(255, 165, 58, .3), rgba(244, 81, 30, .12));
  border: 1px solid rgba(255, 138, 61, .3);
  box-shadow: 0 4px 14px rgba(244, 81, 30, .22), inset 0 1px 0 rgba(255, 233, 220, .18);
  isolation: isolate;
  -webkit-backface-visibility: hidden;
}

.board-brand::after {
  content: '';
  position: absolute;
  inset: -3px;
  border-radius: 13px;
  background: radial-gradient(circle, rgba(255, 138, 61, .26), transparent 68%);
  opacity: .9;
  z-index: -1;
  pointer-events: none;
}

.board-logo {
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  border-radius: 8px;
  display: block;
  object-fit: contain;
}

.board-title {
  flex: 0 0 auto!important;
  min-width: 0!important;
  display: flex;
  align-items: center;
  font-size: 17px!important;
  font-weight: 700!important;
  letter-spacing: 0!important;
}

/* Vuetify 的标题占位层是块级 div，内部 inline 元素按基线对齐，
   logo 与两行文字会被整体压到下方，顶栏顶部因此留出一大块空白。
   改成 flex 居中后再让子元素垂直居中对齐。 */
.board-title :deep(.v-toolbar-title__placeholder) {
  display: flex;
  align-items: center;
  min-height: 100%;
}

.board-headings {
  min-width: 0;
  /* 必须是 inline-flex：display:flex 会变成块级元素把 logo 挤到上一行 */
  display: inline-flex;
  flex-direction: column;
  justify-content: center;
  line-height: 1.1;
}

/* 品牌行：桌面 / 一体机模式下显示在「今天的作业」上方 */
.board-overline {
  font-size: 9px;
  font-weight: 600;
  line-height: 1.1;
  letter-spacing: .14em;
  color: var(--brand-2, #f4511e);
  opacity: .85;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.board-heading {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  line-height: 1.2;
}

@media(max-width:600px) {
  .board-title {
    font-size: 15px!important;
  }

  /* 窄屏也保留品牌标识，只是缩小一号，避免顶栏左侧空掉 */
  .board-brand {
    width: 28px;
    height: 28px;
    padding: 1.5px;
    margin-right: 8px;
    border-radius: 9px;
  }

  .board-brand::after {
    inset: -2px;
    border-radius: 11px;
  }

  .board-logo {
    border-radius: 7px;
  }

  .v-app-bar .v-toolbar__append {
    margin-inline-end: 4px;
  }
}

.bg-image,.bg-overlay {
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
}

.bg-image {
  background-size: cover;
  background-position: center;
  transform: scale(1.05);
}

.bg-overlay {
  background: #000;
}

.main-window {
  overflow-y: auto;
  max-height: calc(100vh - 64px);
  padding-bottom: 110px;
}

.wall-window {
  max-height: calc(100vh - 64px);
  overflow-y: auto;
  padding: 12px 16px 108px;
}

.wall {
  display: grid;
  grid-template-columns: minmax(260px,22%) minmax(0,1fr);
  gap: 14px;
  align-items: stretch;
  min-height: calc(100vh - 244px);
}

.wall-rail {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
}

.wall-rail-time {
  flex: 0 0 auto;
}

.wall-rail-exams {
  display: flex;
  flex: 0 1 auto;
  flex-direction: column;
  gap: 12px;
  max-height: 55%;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.wall-rail-exam {
  flex: 0 0 auto;
  height: auto!important;
}

.wall-rail-hitokoto {
  flex: 1 1 auto;
  height: auto!important;
  min-height: 96px;
  max-height: 240px;
  overflow: hidden;
}

.wall-att {
  flex: 0 0 auto;
  border: 1px solid var(--border, rgba(255, 255, 255, .08));
  border-radius: var(--r-lg, 22px);
  background: var(--bg-card, rgba(255, 255, 255, .04));
  padding: 12px 16px;
  cursor: pointer;
  transition: transform .2s var(--ease-spring, ease),box-shadow .2s ease;
}

.wall-att:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md, 0 8px 24px rgba(0, 0, 0, .18));
}

.wall-att-head {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-3, #8a8078);
  letter-spacing: .04em;
}

.wall-att-num {
  display: flex;
  align-items: baseline;
  gap: 4px;
  margin-top: 2px;
  font-variant-numeric: tabular-nums;
}

.wall-att-num strong {
  font-size: 26px;
  font-weight: 700;
  line-height: 1.1;
}

.wall-att-num span {
  font-size: 13px;
  color: var(--text-3, #8a8078);
}

.wall-att-meta {
  display: flex;
  gap: 10px;
  margin-top: 2px;
  font-size: 12px;
}

.wall-main {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
}

.wall-notices {
  display: grid;
  grid-template-columns: repeat(2,minmax(0,1fr));
  gap: 6px 12px;
  flex: 0 0 auto;
}

.wall-notice .v-card-text {
  padding: 9px 16px!important;
  min-height: 0!important;
}

.wall-notice .wall-notice-title {
  font-size: 15px;
}

@media(max-width:900px) {
  .wall-notices {
    grid-template-columns: minmax(0,1fr);
  }
}

.wall-notice-line,.notice-line {
  min-width: 0;
}

.notice-grid {
  display: grid;
  grid-template-columns: repeat(2,minmax(0,1fr));
  gap: 8px 16px;
  padding-inline: 8px;
  margin-bottom: 8px;
}

.notice-grid>.notice-card:only-child {
  grid-column: 1 / -1;
}

@media(max-width:900px) {
  .notice-grid {
    grid-template-columns: minmax(0,1fr);
  }
}

.notice-card .v-card-text {
  padding: 10px 16px!important;
  min-height: 0!important;
}

.notice-card .v-btn {
  width: 32px!important;
  height: 32px!important;
  min-width: 32px!important;
}

.notice-card-body {
  gap: 4px;
}

.wall-notice {
  cursor: pointer;
}

.wall-notice-title {
  font-weight: 700;
  white-space: nowrap;
}

.wall-notice-text {
  margin-left: 10px;
  opacity: .85;
  font-size: 13px;
}

.wall-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill,minmax(220px,1fr));
  grid-auto-rows: minmax(120px,1fr);
  gap: 12px;
  flex: 1 1 auto;
  min-height: 0;
  align-content: start;
}

.wall-card {
  display: flex;
  flex-direction: column;
  min-height: 120px;
  padding: 12px 14px;
  border: 1px solid var(--border, rgba(255, 255, 255, .08));
  border-radius: var(--r-lg, 22px);
  background: var(--bg-card, rgba(255, 255, 255, .04));
  box-shadow: var(--shadow-sm, 0 2px 8px rgba(0, 0, 0, .12));
  cursor: pointer;
  overflow: hidden;
  transition: transform .2s var(--ease-spring, ease),box-shadow .2s ease;
}

.wall-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md, 0 8px 24px rgba(0, 0, 0, .2));
}

.wall-card.is-empty {
  border-style: dashed;
  opacity: .55;
}

.wall-card-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.wall-dot {
  width: 9px;
  height: 9px;
  flex: none;
  border-radius: 50%;
}

.wall-name {
  font-size: 15px;
  font-weight: 700;
  letter-spacing: .02em;
}

.wall-edit {
  opacity: 0;
  transition: opacity .2s ease;
}

.wall-card:hover .wall-edit {
  opacity: .55;
}

.wall-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  line-height: 1.55;
  color: var(--text-2, rgba(255, 255, 255, .78));
  word-break: break-word;
}

.wall-line {
  white-space: pre-wrap;
}

.wall-placeholder {
  color: var(--text-3, #8a8078);
  font-size: 13px;
}

.wall-foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
}

.wall-foot-label {
  font-size: 12px;
  color: var(--text-3, #8a8078);
  letter-spacing: .04em;
}

@media(max-width:900px) {
  .wall {
    grid-template-columns: minmax(0,1fr);
  }

  .wall-rail {
    order: 2;
  }

  .wall-main {
    order: 1;
  }

  .wall-grid {
    grid-template-columns: repeat(auto-fill,minmax(160px,1fr));
  }
}

.latency-text {
  min-width: 44px;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  letter-spacing: .02em;
  text-align: left;
}
</style>
