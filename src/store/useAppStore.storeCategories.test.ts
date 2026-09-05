import { beforeEach, describe, expect, it } from 'vitest'
import { useAppStore } from './useAppStore'

/**
 * 店舗専用ジャンル (StoreMap.categories) と、マップの書き出し/読み込みの検証。
 * 「マップと一緒にジャンルも配布できる」ようにするための仕組み。
 */
describe('useAppStore: 店舗専用ジャンル', () => {
  const initial = useAppStore.getState()

  beforeEach(() => {
    useAppStore.setState(initial, true)
  })

  const firstStore = () => useAppStore.getState().stores[0]

  it('addStoreCategory はその店舗にだけ専用ジャンルを追加する', () => {
    const store = firstStore()
    const id = useAppStore.getState().addStoreCategory(store.id, '地域限定コーナー', '#123456')
    const updated = useAppStore.getState().stores.find((s) => s.id === store.id)!
    expect(updated.categories).toEqual([{ id, name: '地域限定コーナー', color: '#123456', keywords: [] }])
    // グローバルなジャンル一覧には影響しない
    expect(useAppStore.getState().categories.some((c) => c.id === id)).toBe(false)
  })

  it('updateStoreCategory は名前・色・語彙を更新できる', () => {
    const store = firstStore()
    const { addStoreCategory, updateStoreCategory } = useAppStore.getState()
    const id = addStoreCategory(store.id, '仮の名前', '#000000')
    updateStoreCategory(store.id, id, { name: '本当の名前', keywords: ['ご当地'] })
    const updated = useAppStore.getState().stores.find((s) => s.id === store.id)!
    expect(updated.categories?.[0]).toMatchObject({ name: '本当の名前', keywords: ['ご当地'] })
  })

  it('deleteStoreCategory は棚の参照と品目のジャンルも外す', () => {
    const store = firstStore()
    const { addStoreCategory, deleteStoreCategory, createShelf, updateShelf, addItems, setItemCategory } =
      useAppStore.getState()
    const catId = addStoreCategory(store.id, '専用ジャンル', '#abcdef')
    const shelfId = createShelf(store.id, store.floors[0].id, 'テスト棚')
    updateShelf(store.id, shelfId, { categoryIds: [catId] })

    const list = useAppStore.getState().lists[0]
    addItems(list.id, 'テスト品目')
    const itemId = useAppStore.getState().lists[0].items.at(-1)!.id
    setItemCategory(list.id, itemId, catId)

    deleteStoreCategory(store.id, catId)

    const updatedStore = useAppStore.getState().stores.find((s) => s.id === store.id)!
    expect(updatedStore.categories).toEqual([])
    expect(updatedStore.shelves.find((s) => s.id === shelfId)?.categoryIds).toEqual([])
    const updatedItem = useAppStore.getState().lists[0].items.find((i) => i.id === itemId)
    expect(updatedItem?.categoryId).toBeNull()
  })

  it('店舗専用ジャンルの語彙は、その店舗のリストの品目自動判定に使われる', () => {
    const store = firstStore()
    const { addStoreCategory, updateStoreCategory, setListStore, addItems } = useAppStore.getState()
    const catId = addStoreCategory(store.id, '地域限定コーナー', '#123456')
    updateStoreCategory(store.id, catId, { keywords: ['ご当地みかん'] })

    const list = useAppStore.getState().lists[0]
    setListStore(list.id, store.id)
    addItems(list.id, 'ご当地みかん')

    const item = useAppStore.getState().lists[0].items.at(-1)!
    expect(item.categoryId).toBe(catId)
  })

  it('店舗を紐付けていないリストでは、他店舗の専用ジャンルは使われない', () => {
    const { createStore, addStoreCategory, updateStoreCategory, addItems } = useAppStore.getState()
    const otherStoreId = createStore('別の店舗')
    const catId = addStoreCategory(otherStoreId, '地域限定コーナー', '#123456')
    updateStoreCategory(otherStoreId, catId, { keywords: ['ぜったいまざらないひらがなのことば'] })

    const list = useAppStore.getState().lists[0] // storeId is unset by default
    addItems(list.id, 'ぜったいまざらないひらがなのことば')
    const item = useAppStore.getState().lists[0].items.at(-1)!
    expect(item.categoryId).not.toBe(catId)
  })
})
