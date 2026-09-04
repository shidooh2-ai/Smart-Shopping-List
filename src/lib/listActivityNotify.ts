import { LocalNotifications } from '@capacitor/local-notifications'
import { describeActivityEvent, notifiableEvents } from './listActivity'
import { hashToInt, isReminderSupported, requestReminderPermission } from './reminders'
import type { ListActivityEvent, ShoppingList } from '../types'

/**
 * 共有リストで他の人が加えた変更 (追加/削除/購入済みへ移動) を知らせるローカル通知。
 *
 * 「プッシュ」自体はネイティブ側 (CKSubscription + APNsのサイレント通知) が担い、
 * それをきっかけに JS が pullCloudShares() → 新着の変更を検出 → ここで即時通知、という
 * 流れになる。isReminderSupported/requestReminderPermission は名前こそ reminders.ts 由来だが、
 * どちらも「端末のローカル通知」という同じ仕組みを指すので、そのまま流用している。
 */
export async function notifyListActivity(list: ShoppingList, events: ListActivityEvent[]): Promise<void> {
  if (!isReminderSupported()) return
  const targets = notifiableEvents(list, events)
  if (targets.length === 0) return

  const granted = await requestReminderPermission()
  if (!granted) return

  await LocalNotifications.schedule({
    notifications: targets.map((event) => ({
      // 通知IDはイベントIDから安定に導く (同じ変更を二重に通知しない)
      id: hashToInt(event.id),
      title: list.name,
      body: describeActivityEvent(event),
      extra: { listId: list.id, activityId: event.id },
      // schedule を指定しない = できるだけ早く (即時) 配信する
    })),
  })
}
