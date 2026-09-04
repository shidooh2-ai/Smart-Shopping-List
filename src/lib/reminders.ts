import { Capacitor } from '@capacitor/core'
import { LocalNotifications, type ScheduleOptions } from '@capacitor/local-notifications'
import type { ListReminder, ShoppingList } from '../types'

/**
 * リストごとのリマインダー (ローカル通知)。
 *
 * ローカル通知はプッシュ通知と違って追加の資格 (有料のApple Developer Program) が要らないので、
 * 今のビルドでもそのまま動く。ただし通知を出せるのはiPhoneアプリ (Capacitor) のときだけで、
 * Web版ではブラウザを閉じている間の予約通知が実用にならないため何もしない。
 */

/** Capacitorの weekday は 1=日曜 〜 7=土曜。アプリ内部では 0=日曜 〜 6=土曜で持つ。 */
const CAPACITOR_WEEKDAY_OFFSET = 1

export const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土']

export function isReminderSupported(): boolean {
  return Capacitor.isNativePlatform()
}

/** 文字列から安定した正の整数を作る (FNV-1a)。通知IDはリストIDから毎回同じ値を導く必要がある。 */
function hashToInt(text: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return Math.abs(hash) % 1_000_000
}

/**
 * 通知IDを求める。同じリスト・同じ枠なら常に同じIDになるので、付け直すときに
 * 前の予約を確実に上書き/取り消しできる。slot は曜日 (0-6)、単発/毎日は 0。
 * Androidの int を超えないよう 1,000,000 * 10 + 9 に収める。
 */
export function notificationId(listId: string, slot = 0): number {
  return hashToInt(listId) * 10 + slot
}

/** そのリストが使いうる通知IDを全部返す (取り消し用)。 */
export function allNotificationIds(listId: string): number[] {
  return Array.from({ length: 7 }, (_, slot) => notificationId(listId, slot))
}

function parseTime(time: string): { hour: number; minute: number } | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time)
  if (!m) return null
  const hour = Number(m[1])
  const minute = Number(m[2])
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null
  return { hour, minute }
}

/**
 * リマインダー設定から、実際に予約する通知の一覧を組み立てる。
 * 通知を出さない場合 (無効・時刻が不正・曜日未選択・単発で日時が過去) は空配列。
 * 予約処理から切り離して単体テストできるようにしてある。
 */
export function buildNotifications(
  list: Pick<ShoppingList, 'id' | 'name' | 'reminder'>,
  now: Date = new Date(),
): ScheduleOptions['notifications'] {
  const reminder = list.reminder
  if (!reminder?.enabled) return []
  const parsed = parseTime(reminder.time)
  if (!parsed) return []
  const { hour, minute } = parsed

  const base = {
    title: list.name,
    body: '買い物リストを確認しましょう。',
    // タップしたときにどのリストの通知か分かるようにしておく
    extra: { listId: list.id },
  }

  if (reminder.repeat === 'once') {
    if (!reminder.date) return []
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(reminder.date)
    if (!m) return []
    const at = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), hour, minute, 0, 0)
    // 過ぎた日時は予約できない (OS側で即時通知されてしまうのを避ける)
    if (at.getTime() <= now.getTime()) return []
    return [{ ...base, id: notificationId(list.id), schedule: { at, allowWhileIdle: true } }]
  }

  if (reminder.repeat === 'daily') {
    return [
      {
        ...base,
        id: notificationId(list.id),
        schedule: { on: { hour, minute }, repeats: true, every: 'day', allowWhileIdle: true },
      },
    ]
  }

  const weekdays = [...new Set(reminder.weekdays ?? [])].filter((d) => d >= 0 && d <= 6).sort()
  return weekdays.map((weekday) => ({
    ...base,
    id: notificationId(list.id, weekday),
    schedule: {
      on: { weekday: weekday + CAPACITOR_WEEKDAY_OFFSET, hour, minute },
      repeats: true,
      every: 'week',
      allowWhileIdle: true,
    },
  }))
}

/** 通知の許可を求める。許可されたら true。 */
export async function requestReminderPermission(): Promise<boolean> {
  if (!isReminderSupported()) return false
  const current = await LocalNotifications.checkPermissions()
  if (current.display === 'granted') return true
  const result = await LocalNotifications.requestPermissions()
  return result.display === 'granted'
}

/**
 * 全リストのリマインダーを予約し直す。
 * いったん自分たちが使うIDの予約を消してから、有効なものだけ入れ直す
 * (設定変更・リスト削除・時刻変更のどれでも、この一本で正しい状態になる)。
 */
export async function syncReminders(lists: ShoppingList[]): Promise<void> {
  if (!isReminderSupported()) return

  const notifications = lists.flatMap((list) => buildNotifications(list))

  const pending = await LocalNotifications.getPending()
  const ours = new Set(lists.flatMap((list) => allNotificationIds(list.id)))
  const toCancel = pending.notifications.filter((n) => ours.has(n.id))
  if (toCancel.length > 0) {
    await LocalNotifications.cancel({ notifications: toCancel.map((n) => ({ id: n.id })) })
  }

  if (notifications.length === 0) return
  const granted = await requestReminderPermission()
  if (!granted) return
  await LocalNotifications.schedule({ notifications })
}

/** リマインダーの内容を日本語で1行にまとめる (設定画面の表示用)。 */
export function describeReminder(reminder: ListReminder | undefined): string {
  if (!reminder?.enabled) return 'オフ'
  if (reminder.repeat === 'once') {
    return reminder.date ? `${reminder.date} ${reminder.time} に1回` : '日付が未設定'
  }
  if (reminder.repeat === 'daily') return `毎日 ${reminder.time}`
  const weekdays = [...new Set(reminder.weekdays ?? [])].sort()
  if (weekdays.length === 0) return '曜日が未選択'
  return `毎週 ${weekdays.map((d) => WEEKDAY_LABELS[d]).join('・')} ${reminder.time}`
}
