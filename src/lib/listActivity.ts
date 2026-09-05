import { newId } from './id'
import type { ListActivityEvent, ListActivityKind, ListNotificationPrefs, ShoppingList } from '../types'

/** 履歴として持つ変更の件数の上限。CKRecordのJSONに乗せるので大きくしすぎない。 */
const ACTIVITY_LIMIT = 30

export const ACTIVITY_LABELS: Record<ListActivityKind, string> = {
  add: '追加',
  remove: '削除',
  purchase: '購入済みへ移動',
}

/** 新しい変更履歴を1件積む。上限を超えたら古いものから切り詰める。 */
export function appendActivity(
  activity: ListActivityEvent[] | undefined,
  kind: ListActivityKind,
  itemText: string,
  by: string | null,
): ListActivityEvent[] {
  const next = [...(activity ?? []), { id: newId('act'), kind, itemText, by, at: Date.now() }]
  return next.length > ACTIVITY_LIMIT ? next.slice(next.length - ACTIVITY_LIMIT) : next
}

/** 複数件をまとめて1つの変更として記録するときの説明文 ("牛乳" / "牛乳 他2件")。 */
export function summarizeItemTexts(texts: string[]): string {
  if (texts.length === 0) return ''
  if (texts.length === 1) return texts[0]
  return `${texts[0]} 他${texts.length - 1}件`
}

/**
 * pull で取得した最新のリストのうち、ローカルがまだ知らない変更履歴を返す。
 * id で比較するので、自分がこの端末で行った変更 (pullより前にローカルへ即時反映済み) は
 * 混ざらない。表示上の並びのため、古い順に返す。
 */
export function newActivitySince(local: ListActivityEvent[] | undefined, remote: ListActivityEvent[] | undefined): ListActivityEvent[] {
  if (!remote || remote.length === 0) return []
  const known = new Set((local ?? []).map((e) => e.id))
  return remote.filter((e) => !known.has(e.id))
}

/** そのリストで、指定した種類の通知が有効か。未設定 (共有直後など) はすべて有効。 */
export function isNotificationEnabled(prefs: ListNotificationPrefs | undefined, kind: ListActivityKind): boolean {
  if (!prefs) return true
  if (kind === 'add') return prefs.onAdd
  if (kind === 'remove') return prefs.onRemove
  return prefs.onPurchase
}

/** 通知の本文 ("たろうさんが「牛乳」を追加しました")。 */
export function describeActivityEvent(event: ListActivityEvent): string {
  const who = event.by ? `${event.by}さんが` : '誰かが'
  return `${who}「${event.itemText}」を${ACTIVITY_LABELS[event.kind]}しました`
}

/** 共有中のリストに絞って、通知対象イベントだけを残す (list単位でのpref適用込み)。 */
export function notifiableEvents(list: Pick<ShoppingList, 'notifications'>, events: ListActivityEvent[]): ListActivityEvent[] {
  return events.filter((e) => isNotificationEnabled(list.notifications, e.kind))
}

export interface Contribution {
  /** ニックネーム未設定の操作は「誰か」としてまとめる */
  by: string
  count: number
}

/**
 * 共有リストで「誰が何回購入操作をしたか」を集計する (ゲーム性の要素・貢献の可視化に使う)。
 * 変更履歴 (activity) は件数に上限があるので、あくまで直近の目安。件数の多い順に返す。
 */
export function purchaseContributions(
  activity: ListActivityEvent[] | undefined,
  sinceMs: number,
): Contribution[] {
  const counts = new Map<string, number>()
  for (const e of activity ?? []) {
    if (e.kind !== 'purchase' || e.at < sinceMs) continue
    const label = e.by ?? '誰か'
    counts.set(label, (counts.get(label) ?? 0) + 1)
  }
  return [...counts.entries()].map(([by, count]) => ({ by, count })).sort((a, b) => b.count - a.count)
}
