import { reactive } from 'vue'

export type ToastColor = 'success' | 'error' | 'warning' | 'info'

export interface ToastState {
  show: boolean
  text: string
  color: ToastColor
}

export function useToast() {
  const toast = reactive<ToastState>({ show: false, text: '', color: 'success' })
  function notify(text: string, color: ToastColor = 'success') {
    toast.text = text
    toast.color = color
    toast.show = true
  }
  return { toast, notify }
}
