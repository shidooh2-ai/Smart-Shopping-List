import { beforeEach, describe, expect, it, vi } from 'vitest'

// vi.mock は呼び出し位置に関わらずファイル先頭へ巻き上げられるため、
// 参照する変数は vi.hoisted() で先に用意しておく必要がある。
const { pullMock, notifyMock } = vi.hoisted(() => ({ pullMock: vi.fn(), notifyMock: vi.fn() }))

vi.mock('../lib/cloudSync', () => ({
  CloudSync: { pull: pullMock },
  isCloudSyncSupported: () => false,
}))

vi.mock('../lib/listActivityNotify', () => ({
  notifyListActivity: notifyMock,
}))

import { useAppStore } from './useAppStore'
import type { ShoppingList } from '../types'

/**
 * pullCloudShares は3つのことを同時にやる必要がある:
 *   1. リモートの方が新しければ内容を採用する (既存のマージ規則)
 *   2. ローカルがまだ知らない activity だけを「他の人の変更」として通知する
 *   3. 通知の有効/無効 (notifications) は端末ローカルの設定なので、リモートで上書きしない
 * この3つが噛み合っているかは個々の純粋関数のテストだけでは分からないため、
 * ストアの pullCloudShares を実際に呼んで確認する。
 */
describe('pullCloudShares: 共有リストの変更検出と通知', () => {
  const initial = useAppStore.getState()

  beforeEach(() => {
    useAppStore.setState(initial, true)
    pullMock.mockReset()
    notifyMock.mockReset().mockResolvedValue(undefined)
  })

  const sharedList = (overrides: Partial<ShoppingList> = {}): ShoppingList => ({
    id: 'list_shared',
    name: '共有リスト',
    storeId: null,
    items: [],
    createdAt: 0,
    updatedAt: 1000,
    activity: [{ id: 'act_1', kind: 'add', itemText: '牛乳', by: 'たろう', at: 1000 }],
    cloud: { recordId: 'rec1', owner: true, lastPushedUpdatedAt: 1000, zoneOwnerName: 'me' },
    ...overrides,
  })

  const pullReturns = (remote: ShoppingList) => {
    pullMock.mockResolvedValue({
      items: [
        {
          recordId: 'rec1',
          zoneOwnerName: 'me',
          kind: 'list',
          name: remote.name,
          localId: remote.id,
          json: JSON.stringify(remote),
          updatedAt: remote.updatedAt,
          owner: true,
        },
      ],
    })
  }

  it('リモートの方が新しければ採用し、ローカルがまだ知らない変更だけを通知する', async () => {
    useAppStore.setState({ lists: [sharedList()] })
    pullReturns({
      ...sharedList(),
      updatedAt: 2000,
      activity: [
        { id: 'act_1', kind: 'add', itemText: '牛乳', by: 'たろう', at: 1000 },
        { id: 'act_2', kind: 'remove', itemText: 'パン', by: 'はなこ', at: 2000 },
      ],
    })

    await useAppStore.getState().pullCloudShares()

    expect(useAppStore.getState().lists[0].updatedAt).toBe(2000)
    expect(notifyMock).toHaveBeenCalledTimes(1)
    const [listArg, eventsArg] = notifyMock.mock.calls[0]
    expect(listArg.id).toBe('list_shared')
    expect(eventsArg.map((e: { id: string }) => e.id)).toEqual(['act_2'])
  })

  it('ローカルの方が新しければ内容を上書きせず、通知もしない', async () => {
    useAppStore.setState({ lists: [sharedList({ updatedAt: 5000 })] })
    pullReturns({
      ...sharedList(),
      updatedAt: 2000,
      activity: [...sharedList().activity!, { id: 'act_2', kind: 'remove', itemText: 'パン', by: 'はなこ', at: 2000 }],
    })

    await useAppStore.getState().pullCloudShares()

    expect(useAppStore.getState().lists[0].updatedAt).toBe(5000)
    expect(notifyMock).not.toHaveBeenCalled()
  })

  it('通知設定 (notifications) は端末ローカルのものが保たれ、リモートで上書きされない', async () => {
    const local = sharedList({ notifications: { onAdd: false, onRemove: true, onPurchase: true } })
    useAppStore.setState({ lists: [local] })
    pullReturns({ ...sharedList(), updatedAt: 2000 })

    await useAppStore.getState().pullCloudShares()

    expect(useAppStore.getState().lists[0].notifications).toEqual({
      onAdd: false,
      onRemove: true,
      onPurchase: true,
    })
  })

  it('新着の変更が無ければ通知を呼ばない', async () => {
    useAppStore.setState({ lists: [sharedList()] })
    pullReturns({ ...sharedList(), updatedAt: 2000 })

    await useAppStore.getState().pullCloudShares()

    expect(notifyMock).not.toHaveBeenCalled()
  })
})
