import { defineStore } from 'pinia'
import type { BoardBootstrap } from '@starflame/shared'
import { putData } from '@/lib/api'
import { ds, loadBoard, syncModeFromSettings } from '@/lib/dataSource'
import { setTimeSyncClass } from '@/lib/serverTime'

function todayString(): string {
  const now = new Date()
  const offset = now.getTimezoneOffset() * 60000
  return new Date(now.getTime() - offset).toISOString().slice(0, 10)
}

export const useBoardStore = defineStore('board', {
  state: () => ({
    loading: false,
    loaded: false,
    error: '',
    date: todayString(),
    data: null as BoardBootstrap | null,
  }),
  getters: {
    subjects: (state) => state.data?.subjects ?? [],
    students: (state) => state.data?.students ?? [],
    notices: (state) => state.data?.notices ?? [],
    exams: (state) => state.data?.exams ?? [],
    homeworkMap: (state) => {
      const map: Record<string, { content: string; version: number }> = {}
      for (const item of state.data?.homework ?? []) {
        map[item.subjectId] = { content: item.content, version: item.version }
      }
      return map
    },
  },
  actions: {
    async refresh(date?: string) {
      const target = date ?? this.date
      this.loading = true
      this.error = ''
      try {
        const result = await loadBoard(target)
        this.data = result
        this.date = result.date
        this.loaded = true
        // 让时间同步知道当前班级，才能读到班级里配置的时间源
        if (result.class?.id) setTimeSyncClass(result.class.id)
        // 仅以云端的设置为准；读的是本机快照时不要用它反推模式
        if (!ds.usingCache) syncModeFromSettings(result.settings)
      } catch (error) {
        this.error = error instanceof Error ? error.message : '加载失败'
      } finally {
        this.loading = false
      }
    },
    async saveHomework(subjectId: string, content: string, version?: number) {
      const result = await putData<{ id: string; version: number; content: string }>('/board/homework', {
        subjectId,
        date: this.date,
        content,
        version,
      })
      if (this.data) {
        const list = this.data.homework.filter((item) => item.subjectId !== subjectId)
        list.push({
          id: result.id,
          subjectId,
          content: result.content,
          dueDate: this.date,
          status: 'published',
          version: result.version,
          updatedAt: new Date().toISOString(),
        })
        this.data.homework = list
      }
      return result
    },
  },
})
