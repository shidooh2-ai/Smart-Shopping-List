import { useAppStore } from '../store/useAppStore'
import { isReminderSupported, syncReminders } from './reminders'

const SYNC_DEBOUNCE_MS = 800

let started = false

/**
 * リマインダーの「配線」— アプリ起動時に一度だけ呼ぶ (App.tsx から)。
 * リストの内容が変わるたびに、OSへの予約を今の設定に合わせ直す
 * (リマインダーの変更・リストの削除・リスト名の変更のいずれにも追随する)。
 */
export function startReminderBridge(): void {
  if (started || !isReminderSupported()) return
  started = true

  void syncReminders(useAppStore.getState().lists).catch(() => {})

  let timer: ReturnType<typeof setTimeout> | null = null
  let prevLists = useAppStore.getState().lists

  useAppStore.subscribe((state) => {
    if (state.lists === prevLists) return
    prevLists = state.lists
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      void syncReminders(useAppStore.getState().lists).catch(() => {})
    }, SYNC_DEBOUNCE_MS)
  })
}
