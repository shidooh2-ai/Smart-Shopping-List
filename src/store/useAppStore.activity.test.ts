import { beforeEach, describe, expect, it } from 'vitest'
import { useAppStore } from './useAppStore'

/**
 * リストの変更 (追加/削除/購入済みへ移動) が、共有相手への通知の元ネタになる
 * activity ログへ正しく積まれるかを確認する。実際の通知送信やCloudKit連携は含まない
 * (それらは lib/listActivity.test.ts / lib/reminders.test.ts で個別に検証済み)。
 */
describe('useAppStore: リストの変更履歴 (activity)', () => {
  const initial = useAppStore.getState()

  beforeEach(() => {
    useAppStore.setState(initial, true)
  })

  const activeList = () => {
    const { lists, activeListId } = useAppStore.getState()
    return lists.find((l) => l.id === activeListId)!
  }

  it('addItems は add イベントを積む', () => {
    useAppStore.getState().addItems(activeList().id, '牛乳、パン')
    const events = activeList().activity ?? []
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ kind: 'add', itemText: '牛乳 他1件' })
  })

  it('removeItem は remove イベントを積み、対象品目のテキストを記録する', () => {
    const list = activeList()
    useAppStore.getState().addItems(list.id, 'にんじん')
    const itemId = activeList().items[0].id
    useAppStore.getState().removeItem(list.id, itemId)
    const events = activeList().activity ?? []
    expect(events[events.length - 1]).toMatchObject({ kind: 'remove', itemText: 'にんじん' })
  })

  it('clearChecked はチェック済みの品目だけをまとめて remove イベントにする', () => {
    const list = activeList()
    useAppStore.getState().addItems(list.id, 'A、B、C')
    const items = activeList().items
    useAppStore.getState().setItemChecked(list.id, items[0].id, true)
    useAppStore.getState().setItemChecked(list.id, items[1].id, true)
    useAppStore.getState().clearChecked(list.id)

    expect(activeList().items.map((i) => i.text)).toEqual(['C'])
    const events = activeList().activity ?? []
    expect(events[events.length - 1]).toMatchObject({ kind: 'remove', itemText: 'A 他1件' })
  })

  it('チェックが無い状態での clearChecked はイベントを積まない', () => {
    const list = activeList()
    useAppStore.getState().addItems(list.id, 'A')
    const before = (activeList().activity ?? []).length
    useAppStore.getState().clearChecked(list.id)
    expect((activeList().activity ?? []).length).toBe(before)
  })

  it('markPurchased は purchase イベントを積む', () => {
    const list = activeList()
    useAppStore.getState().addItems(list.id, '卵')
    const itemId = activeList().items[0].id
    useAppStore.getState().markPurchased(list.id, [itemId])
    const events = activeList().activity ?? []
    expect(events[events.length - 1]).toMatchObject({ kind: 'purchase', itemText: '卵' })
  })

  it('ニックネーム設定時は、イベントの by にそれが記録される', () => {
    useAppStore.getState().setNickname('たろう')
    const list = activeList()
    useAppStore.getState().addItems(list.id, '牛乳')
    const events = activeList().activity ?? []
    expect(events[events.length - 1].by).toBe('たろう')
  })

  it('setListNotificationPrefs はそのリストの設定だけを変える', () => {
    const list = activeList()
    useAppStore.getState().setListNotificationPrefs(list.id, { onAdd: false, onRemove: true, onPurchase: false })
    expect(activeList().notifications).toEqual({ onAdd: false, onRemove: true, onPurchase: false })
  })
})
