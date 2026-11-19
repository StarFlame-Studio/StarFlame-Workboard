export interface GridItem {
  key: string
  name: string
  type: 'homework' | 'time' | 'hitokoto' | 'attendance' | 'exam'
  content?: string
  order: number
  rowSpan?: number
  examId?: string
  data?: Record<string, number>
}
