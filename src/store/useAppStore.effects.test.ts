import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { onEffect, type EffectKind } from '../lib/effectBus'
import { useAppStore } from './useAppStore'

/**
 * 「続けたくなる仕掛け」まわりの検証:
 * - チェック時のお祝いエフェクト発火 (lib/effectBus 経由)
 * - checkedAt の記録 (お買い物の所要時間の元データ)
 * - markPurchased による tripHistory (ストリーク・時短の元データ) の記録
 */
describe('useAppStore: エフェクト発火・お買い物の記録 (tripHistory)', () => {
  const initial = useAppStore.getState()

  let unsubscribe: (() => void) | null = null

  beforeEach(() => {
    useAppStore.setState(initial, true)
  })

  afterEach(() => {
    unsubscribe?.()
    unsubscribe = null
  })

  const activeList = () => {
    const { lists, activeListId } = useAppStore.getState()
    return lists.find((l) => l.id === activeListId)!
  }

  const collectEffects = (): EffectKind[] => {
    const fired: EffectKind[] = []
    unsubscribe = onEffect((kind) => fired.push(kind))
    return fired
  }

  it('setItemChecked で checked にすると check エフェクトが発火し、checkedAt が記録される', () => {
    const list = activeList()
    useAppStore.getState().addItems(list.id, 'A、B')
    const items = activeList().items
    const fired = collectEffects()

    useAppStore.getState().setItemChecked(list.id, items[0].id, true)

    expect(fired).toEqual(['check'])
    expect(activeList().items[0].checkedAt).toBeTypeOf('number')
  })

  it('リストの最後の1件をチェックすると complete エフェクトが発火する', () => {
    const list = activeList()
    useAppStore.getState().addItems(list.id, 'A、B')
    const items = activeList().items
    useAppStore.getState().setItemChecked(list.id, items[0].id, true)

    const fired = collectEffects()
    useAppStore.getState().setItemChecked(list.id, items[1].id, true)

    expect(fired).toEqual(['complete'])
  })

  it('チェックを外してもエフェクトは発火せず、checkedAt は消える', () => {
    const list = activeList()
    useAppStore.getState().addItems(list.id, 'A')
    const itemId = activeList().items[0].id
    useAppStore.getState().setItemChecked(list.id, itemId, true)

    const fired = collectEffects()
    useAppStore.getState().setItemChecked(list.id, itemId, false)

    expect(fired).toEqual([])
    expect(activeList().items[0].checkedAt).toBeUndefined()
  })

  it('既にチェック済みの品目に同じ値を渡しても何も起きない (二重発火しない)', () => {
    const list = activeList()
    useAppStore.getState().addItems(list.id, 'A')
    const itemId = activeList().items[0].id
    useAppStore.getState().setItemChecked(list.id, itemId, true)

    const fired = collectEffects()
    useAppStore.getState().setItemChecked(list.id, itemId, true)

    expect(fired).toEqual([])
  })

  it('toggleItem も同じくエフェクトを発火する', () => {
    const list = activeList()
    useAppStore.getState().addItems(list.id, 'A')
    const itemId = activeList().items[0].id
    const fired = collectEffects()

    useAppStore.getState().toggleItem(list.id, itemId)

    expect(fired).toEqual(['complete']) // 1件だけのリストなので、チェック=全部完了
  })

  it('markPurchased はお買い物の記録 (tripHistory) を1件積む', () => {
    const list = activeList()
    useAppStore.getState().addItems(list.id, '卵')
    const itemId = activeList().items[0].id
    useAppStore.getState().setItemChecked(list.id, itemId, true)

    useAppStore.getState().markPurchased(list.id, [itemId], { distanceMeters: 42 })

    const trips = useAppStore.getState().tripHistory
    expect(trips).toHaveLength(1)
    expect(trips[0]).toMatchObject({ listId: list.id, itemCount: 1, distanceMeters: 42 })
    expect(trips[0].durationMs).toBeTypeOf('number')
  })

  it('distanceMeters を渡さなければ null になる (リスト画面からの購入完了など)', () => {
    const list = activeList()
    useAppStore.getState().addItems(list.id, '卵')
    const itemId = activeList().items[0].id
    useAppStore.getState().setItemChecked(list.id, itemId, true)

    useAppStore.getState().markPurchased(list.id, [itemId])

    expect(useAppStore.getState().tripHistory[0].distanceMeters).toBeNull()
  })

  it('ニックネーム設定時は、記録の by にそれが記録される', () => {
    useAppStore.getState().setNickname('たろう')
    const list = activeList()
    useAppStore.getState().addItems(list.id, '卵')
    const itemId = activeList().items[0].id
    useAppStore.getState().setItemChecked(list.id, itemId, true)
    useAppStore.getState().markPurchased(list.id, [itemId])

    expect(useAppStore.getState().tripHistory[0].by).toBe('たろう')
  })

  it('setEffectTheme はエフェクトの着せ替えを保存する', () => {
    useAppStore.getState().setEffectTheme('fireworks')
    expect(useAppStore.getState().effectTheme).toBe('fireworks')
  })
})
