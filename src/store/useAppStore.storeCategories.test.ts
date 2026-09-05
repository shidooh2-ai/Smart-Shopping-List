import { beforeEach, describe, expect, it } from 'vitest'
import { encodeFloorCells } from '../lib/mapCodec'
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

describe('useAppStore: マップの書き出し用インポート (importStoreMap)', () => {
  const initial = useAppStore.getState()

  beforeEach(() => {
    useAppStore.setState(initial, true)
  })

  it('StoreMap そのものの形式を取り込める', () => {
    const source = useAppStore.getState().stores[0]
    const id = useAppStore.getState().importStoreMap({
      name: 'コピーした店舗',
      floors: source.floors.map((f) => encodeFloorCells(f, source.shelves, source.nodes)),
      shelves: source.shelves,
      nodes: source.nodes,
      cellMeters: 1.5,
    })
    expect(id).not.toBeNull()
    const imported = useAppStore.getState().stores.find((s) => s.id === id)!
    expect(imported.name).toBe('コピーした店舗')
    expect(imported.cellMeters).toBe(1.5)
    // 元の店舗とはIDが別 (取り込みは常に新規の店舗として追加する)
    expect(imported.id).not.toBe(source.id)
  })

  it('{ store: {...} } の封筒形式も取り込める', () => {
    const source = useAppStore.getState().stores[0]
    const id = useAppStore.getState().importStoreMap({
      app: 'smart-shopping-list',
      kind: 'store-map',
      store: {
        name: '封筒経由',
        floors: source.floors.map((f) => encodeFloorCells(f, source.shelves, source.nodes)),
        shelves: source.shelves,
        nodes: source.nodes,
        cellMeters: 1,
      },
    })
    const imported = useAppStore.getState().stores.find((s) => s.id === id)!
    expect(imported.name).toBe('封筒経由')
  })

  it('専用ジャンルも一緒に取り込める', () => {
    const source = useAppStore.getState().stores[0]
    const dedicated = [{ id: 'dedicated-1', name: '地域限定コーナー', color: '#123456', keywords: [] }]
    const id = useAppStore.getState().importStoreMap({
      name: 'ジャンル付き',
      floors: source.floors.map((f) => encodeFloorCells(f, source.shelves, source.nodes)),
      shelves: source.shelves,
      nodes: source.nodes,
      cellMeters: 1,
      categories: dedicated,
    })
    const imported = useAppStore.getState().stores.find((s) => s.id === id)!
    expect(imported.categories).toEqual(dedicated)
  })

  it('専用ジャンルが無い書き出し (マップのみ) も取り込める', () => {
    const source = useAppStore.getState().stores[0]
    const id = useAppStore.getState().importStoreMap({
      name: 'ジャンルなし',
      floors: source.floors.map((f) => encodeFloorCells(f, source.shelves, source.nodes)),
      shelves: source.shelves,
      nodes: source.nodes,
      cellMeters: 1,
    })
    const imported = useAppStore.getState().stores.find((s) => s.id === id)!
    expect(imported.categories).toBeUndefined()
  })

  it('形式が合わなければ null を返し、何も追加しない', () => {
    const before = useAppStore.getState().stores.length
    expect(useAppStore.getState().importStoreMap({ foo: 'bar' })).toBeNull()
    expect(useAppStore.getState().importStoreMap(null)).toBeNull()
    expect(useAppStore.getState().importStoreMap('not an object')).toBeNull()
    expect(useAppStore.getState().stores).toHaveLength(before)
  })
})
