import { deleteData, getData, postData } from './api'

/** 后台通知记录（跨班级） */
export interface AdminNotice {
  id: string
  classId: string
  className: string | null
  title: string
  content: string
  level: 'info' | 'urgent'
  pinned: boolean
  /** 发布时是否弹窗提醒（与 pinned 至少开启一项） */
  popup: boolean
  publishAt: string
  expireAt: string | null
  createdAt: string
}

export interface NoticeListResult {
  items: AdminNotice[]
  total: number
  page: number
  pageSize: number
}

/** 后台通知表单：与普通通知的设置项保持一致 */
export interface AdminNoticeInput {
  title: string
  content: string
  level: 'info' | 'urgent'
  pinned: boolean
  popup: boolean
  expireAt?: string | null
}

export function listAdminNotices(params: { page?: number; pageSize?: number; keyword?: string; classId?: string }) {
  return getData<NoticeListResult>('/admin/notices', params)
}

export function deleteAdminNotice(id: string) {
  return deleteData('/admin/notices/' + id)
}

/** 批量删除已发送的通知（一次最多 200 条） */
export function deleteAdminNotices(ids: string[]) {
  return postData<{ deleted: number; ids: string[]; missing: number }>('/admin/notices/delete-batch', { ids })
}

/** 群发：同一份内容发到多个班级 */
export function broadcastNotice(classIds: string[], input: AdminNoticeInput) {
  return postData<{ created: number; classIds: string[] }>('/admin/notices/broadcast', { classIds, ...input })
}

/** 批量：每个班级一条独立内容 */
export function batchSendNotices(items: Array<AdminNoticeInput & { classId: string }>) {
  return postData<{ created: number }>('/admin/notices/batch', { items })
}