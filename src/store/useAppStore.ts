import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { cloneDefaultCategories } from '../data/categories'
import { createSampleStore } from '../data/sampleStore'
import { aliasKey, buildIndex, detectCategory } from '../lib/genre'
import { idx, makeCells, pruneOrphans } from '../lib/grid'
import { newId } from '../lib/id'
import { splitItems } from '../lib/normalize'
import type {
  Category,
  Cell,
  Floor,
  MapNode,
  NodeKind,
  Shelf,
  ShoppingItem,
  ShoppingList,
  StoreMap,
} from '../types'

export type Tab = 'list' | 'route' | 'map' | 'genre'

export type PaintTool =
  | { kind: 'aisle' }
  | { kind: 'wall' }
  | { kind: 'shelf'; shelfId: string }
  | { kind: 'node'; nodeKind: NodeKind; name: string; groupId?: string }

/** 1回の描画操作で戻せる履歴の深さ */
const MAP_HISTORY_LIMIT = 20

export interface AppState {
  stores: StoreMap[]
  lists: ShoppingList[]
  categories: Category[]
  /** 正規化テキスト -> ジャンルID。手動指定から学習する */
  aliases: Record<string, string>
  activeListId: string | null
  tab: Tab
  /** storeId ごとの「元に戻す」用スナップショット (直近の操作が末尾)。保存はしない */
  mapHistory: Record<string, StoreMap[]>

  setTab: (tab: Tab) => void

  // --- 買い物リスト ---
  createList: (name?: string) => string
  deleteList: (listId: string) => void
  renameList: (listId: string, name: string) => void
  setActiveList: (listId: string) => void
  setListStore: (listId: string, storeId: string | null) => void
  addItems: (listId: string, text: string) => void
  toggleItem: (listId: string, itemId: string) => void
  setItemChecked: (listId: string, itemId: string, checked: boolean) => void
  removeItem: (listId: string, itemId: string) => void
  renameItem: (listId: string, itemId: string, text: string) => void
  setItemCategory: (listId: string, itemId: string, categoryId: string | null) => void
  clearChecked: (listId: string) => void
  uncheckAll: (listId: string) => void
  redetectCategories: (listId: string) => void

  // --- ジャンル ---
  addCategory: (name: string, color: string) => string
  updateCategory: (categoryId: string, patch: Partial<Omit<Category, 'id'>>) => void
  deleteCategory: (categoryId: string) => void
  resetCategories: () => void
  forgetAlias: (key: string) => void

  // --- 店舗マップ ---
  createStore: (name: string) => string
  addSampleStore: () => string
  deleteStore: (storeId: string) => void
  renameStore: (storeId: string, name: string) => void
  setCellMeters: (storeId: string, meters: number) => void
  addFloor: (storeId: string) => string
  updateFloor: (storeId: string, floorId: string, patch: { name?: string; level?: number }) => void
  resizeFloor: (storeId: string, floorId: string, width: number, height: number) => void
  deleteFloor: (storeId: string, floorId: string) => void
  createShelf: (storeId: string, floorId: string, name?: string) => string
  updateShelf: (storeId: string, shelfId: string, patch: Partial<Omit<Shelf, 'id' | 'floorId'>>) => void
  deleteShelf: (storeId: string, shelfId: string) => void
  updateNode: (storeId: string, nodeId: string, patch: Partial<Omit<MapNode, 'id' | 'floorId'>>) => void
  paint: (storeId: string, floorId: string, cells: Array<{ x: number; y: number }>, tool: PaintTool) => void
  /**
   * フロアの内容をまとめて置き換える (AIによる見取り図の自動生成などに使う)。
   * paint と同じ履歴に積まれ、1回のundoで元に戻せる。
   */
  importFloorLayout: (
    storeId: string,
    floorId: string,
    layout: { width: number; height: number; cells: Cell[]; shelves: Shelf[]; nodes: MapNode[] },
  ) => void
  /** 直前の paint / importFloorLayout 操作を1回取り消す */
  undoMap: (storeId: string) => void
  cleanupMap: (storeId: string) => void

  replaceAll: (data: Partial<Pick<AppState, 'stores' | 'lists' | 'categories' | 'aliases'>>) => void
}

function createInitialList(storeId: string | null): ShoppingList {
  const now = Date.now()
  return { id: newId('list'), name: '買い物リスト', storeId, items: [], createdAt: now, updatedAt: now }
}

function initialState() {
  const store = createSampleStore()
  const list = createInitialList(store.id)
  return {
    stores: [store],
    lists: [list],
    categories: cloneDefaultCategories(),
    aliases: {} as Record<string, string>,
    activeListId: list.id,
    tab: 'list' as Tab,
    mapHistory: {} as Record<string, StoreMap[]>,
  }
}

/** 指定リストを書き換えるヘルパー。updatedAt も更新する。 */
function mapList(
  lists: ShoppingList[],
  listId: string,
  fn: (list: ShoppingList) => ShoppingList,
): ShoppingList[] {
  return lists.map((l) => (l.id === listId ? { ...fn(l), updatedAt: Date.now() } : l))
}

function mapStore(stores: StoreMap[], storeId: string, fn: (s: StoreMap) => StoreMap): StoreMap[] {
  return stores.map((s) => (s.id === storeId ? { ...fn(s), updatedAt: Date.now() } : s))
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      ...initialState(),

      setTab: (tab) => set({ tab }),

      // --- 買い物リスト ---
      createList: (name) => {
        const stores = get().stores
        const list = createInitialList(stores[0]?.id ?? null)
        if (name) list.name = name
        set((s) => ({ lists: [...s.lists, list], activeListId: list.id }))
        return list.id
      },

      deleteList: (listId) =>
        set((s) => {
          const lists = s.lists.filter((l) => l.id !== listId)
          const activeListId = s.activeListId === listId ? (lists[0]?.id ?? null) : s.activeListId
          return { lists, activeListId }
        }),

      renameList: (listId, name) => set((s) => ({ lists: mapList(s.lists, listId, (l) => ({ ...l, name })) })),

      setActiveList: (listId) => set({ activeListId: listId }),

      setListStore: (listId, storeId) =>
        set((s) => ({ lists: mapList(s.lists, listId, (l) => ({ ...l, storeId })) })),

      addItems: (listId, text) =>
        set((s) => {
          const index = buildIndex(s.categories)
          const now = Date.now()
          const created: ShoppingItem[] = splitItems(text).map((raw, i) => {
            const match = detectCategory(raw, s.categories, s.aliases, index)
            return {
              id: newId('item'),
              text: raw,
              checked: false,
              categoryId: match?.categoryId ?? null,
              manual: false,
              confidence: match?.score ?? 0,
              createdAt: now + i,
            }
          })
          if (created.length === 0) return {}
          return { lists: mapList(s.lists, listId, (l) => ({ ...l, items: [...l.items, ...created] })) }
        }),

      toggleItem: (listId, itemId) =>
        set((s) => ({
          lists: mapList(s.lists, listId, (l) => ({
            ...l,
            items: l.items.map((i) => (i.id === itemId ? { ...i, checked: !i.checked } : i)),
          })),
        })),

      setItemChecked: (listId, itemId, checked) =>
        set((s) => ({
          lists: mapList(s.lists, listId, (l) => ({
            ...l,
            items: l.items.map((i) => (i.id === itemId ? { ...i, checked } : i)),
          })),
        })),

      removeItem: (listId, itemId) =>
        set((s) => ({
          lists: mapList(s.lists, listId, (l) => ({ ...l, items: l.items.filter((i) => i.id !== itemId) })),
        })),

      renameItem: (listId, itemId, text) =>
        set((s) => {
          const index = buildIndex(s.categories)
          return {
            lists: mapList(s.lists, listId, (l) => ({
              ...l,
              items: l.items.map((i) => {
                if (i.id !== itemId) return i
                if (i.manual) return { ...i, text }
                const match = detectCategory(text, s.categories, s.aliases, index)
                return {
                  ...i,
                  text,
                  categoryId: match?.categoryId ?? null,
                  confidence: match?.score ?? 0,
                }
              }),
            })),
          }
        }),

      setItemCategory: (listId, itemId, categoryId) =>
        set((s) => {
          const list = s.lists.find((l) => l.id === listId)
          const item = list?.items.find((i) => i.id === itemId)
          const aliases = { ...s.aliases }
          if (item) {
            // 手動で選んだジャンルは次回以降の自動判定に反映する
            const key = aliasKey(item.text)
            if (key) {
              if (categoryId) aliases[key] = categoryId
              else delete aliases[key]
            }
          }
          return {
            aliases,
            lists: mapList(s.lists, listId, (l) => ({
              ...l,
              items: l.items.map((i) =>
                i.id === itemId ? { ...i, categoryId, manual: categoryId !== null, confidence: 1 } : i,
              ),
            })),
          }
        }),

      clearChecked: (listId) =>
        set((s) => ({
          lists: mapList(s.lists, listId, (l) => ({ ...l, items: l.items.filter((i) => !i.checked) })),
        })),

      uncheckAll: (listId) =>
        set((s) => ({
          lists: mapList(s.lists, listId, (l) => ({
            ...l,
            items: l.items.map((i) => ({ ...i, checked: false })),
          })),
        })),

      redetectCategories: (listId) =>
        set((s) => {
          const index = buildIndex(s.categories)
          return {
            lists: mapList(s.lists, listId, (l) => ({
              ...l,
              items: l.items.map((i) => {
                if (i.manual) return i
                const match = detectCategory(i.text, s.categories, s.aliases, index)
                return { ...i, categoryId: match?.categoryId ?? null, confidence: match?.score ?? 0 }
              }),
            })),
          }
        }),

      // --- ジャンル ---
      addCategory: (name, color) => {
        const id = newId('cat')
        set((s) => ({ categories: [...s.categories, { id, name, color, keywords: [] }] }))
        return id
      },

      updateCategory: (categoryId, patch) =>
        set((s) => ({
          categories: s.categories.map((c) => (c.id === categoryId ? { ...c, ...patch } : c)),
        })),

      deleteCategory: (categoryId) =>
        set((s) => ({
          categories: s.categories.filter((c) => c.id !== categoryId),
          // 参照が残らないよう、棚と品目からも外す
          stores: s.stores.map((st) => ({
            ...st,
            shelves: st.shelves.map((sh) => ({
              ...sh,
              categoryIds: sh.categoryIds.filter((id) => id !== categoryId),
            })),
          })),
          lists: s.lists.map((l) => ({
            ...l,
            items: l.items.map((i) => (i.categoryId === categoryId ? { ...i, categoryId: null, manual: false } : i)),
          })),
          aliases: Object.fromEntries(Object.entries(s.aliases).filter(([, v]) => v !== categoryId)),
        })),

      resetCategories: () => set({ categories: cloneDefaultCategories() }),

      forgetAlias: (key) =>
        set((s) => {
          const aliases = { ...s.aliases }
          delete aliases[key]
          return { aliases }
        }),

      // --- 店舗マップ ---
      createStore: (name) => {
        const now = Date.now()
        const floorId = newId('floor')
        const store: StoreMap = {
          id: newId('store'),
          name,
          floors: [{ id: floorId, name: '1F', level: 1, width: 16, height: 20, cells: makeCells(16, 20) }],
          shelves: [],
          nodes: [],
          cellMeters: 1.2,
          createdAt: now,
          updatedAt: now,
        }
        set((s) => ({ stores: [...s.stores, store] }))
        return store.id
      },

      addSampleStore: () => {
        const store = createSampleStore()
        set((s) => ({ stores: [...s.stores, store] }))
        return store.id
      },

      deleteStore: (storeId) =>
        set((s) => ({
          stores: s.stores.filter((st) => st.id !== storeId),
          lists: s.lists.map((l) => (l.storeId === storeId ? { ...l, storeId: null } : l)),
        })),

      renameStore: (storeId, name) => set((s) => ({ stores: mapStore(s.stores, storeId, (st) => ({ ...st, name })) })),

      setCellMeters: (storeId, meters) =>
        set((s) => ({
          stores: mapStore(s.stores, storeId, (st) => ({ ...st, cellMeters: Math.max(0.2, meters) })),
        })),

      addFloor: (storeId) => {
        const id = newId('floor')
        set((s) => ({
          stores: mapStore(s.stores, storeId, (st) => {
            const base = st.floors[st.floors.length - 1]
            const level = st.floors.reduce((max, f) => Math.max(max, f.level), 0) + 1
            const width = base?.width ?? 16
            const height = base?.height ?? 20
            const floor: Floor = { id, name: `${level}F`, level, width, height, cells: makeCells(width, height) }
            return { ...st, floors: [...st.floors, floor] }
          }),
        }))
        return id
      },

      updateFloor: (storeId, floorId, patch) =>
        set((s) => ({
          stores: mapStore(s.stores, storeId, (st) => ({
            ...st,
            floors: st.floors.map((f) => (f.id === floorId ? { ...f, ...patch } : f)),
          })),
        })),

      resizeFloor: (storeId, floorId, width, height) =>
        set((s) => ({
          stores: mapStore(s.stores, storeId, (st) => {
            const floors = st.floors.map((f) => {
              if (f.id !== floorId) return f
              const w = Math.max(3, Math.min(60, Math.round(width)))
              const h = Math.max(3, Math.min(60, Math.round(height)))
              const cells: Cell[] = new Array(w * h)
              for (let y = 0; y < h; y++) {
                for (let x = 0; x < w; x++) {
                  cells[y * w + x] = x < f.width && y < f.height ? f.cells[idx(f, x, y)] : { k: 'aisle' }
                }
              }
              return { ...f, width: w, height: h, cells }
            })
            return pruneOrphans({ ...st, floors })
          }),
        })),

      deleteFloor: (storeId, floorId) =>
        set((s) => ({
          stores: mapStore(s.stores, storeId, (st) => {
            if (st.floors.length <= 1) return st
            return pruneOrphans({ ...st, floors: st.floors.filter((f) => f.id !== floorId) })
          }),
        })),

      createShelf: (storeId, floorId, name) => {
        const id = newId('shelf')
        set((s) => ({
          stores: mapStore(s.stores, storeId, (st) => {
            const n = st.shelves.filter((sh) => sh.floorId === floorId).length + 1
            const shelf: Shelf = { id, floorId, name: name ?? `棚${n}`, categoryIds: [] }
            return { ...st, shelves: [...st.shelves, shelf] }
          }),
        }))
        return id
      },

      updateShelf: (storeId, shelfId, patch) =>
        set((s) => ({
          stores: mapStore(s.stores, storeId, (st) => ({
            ...st,
            shelves: st.shelves.map((sh) => (sh.id === shelfId ? { ...sh, ...patch } : sh)),
          })),
        })),

      deleteShelf: (storeId, shelfId) =>
        set((s) => ({
          stores: mapStore(s.stores, storeId, (st) => ({
            ...st,
            shelves: st.shelves.filter((sh) => sh.id !== shelfId),
            floors: st.floors.map((f) => ({
              ...f,
              cells: f.cells.map((c) => (c.k === 'shelf' && c.shelfId === shelfId ? { k: 'aisle' } : c)),
            })),
          })),
        })),

      updateNode: (storeId, nodeId, patch) =>
        set((s) => ({
          stores: mapStore(s.stores, storeId, (st) => ({
            ...st,
            nodes: st.nodes.map((n) => (n.id === nodeId ? { ...n, ...patch } : n)),
          })),
        })),

      paint: (storeId, floorId, cells, tool) =>
        set((s) => {
          const before = s.stores.find((st) => st.id === storeId)
          const mapHistory = before
            ? {
                ...s.mapHistory,
                [storeId]: [...(s.mapHistory[storeId] ?? []).slice(-(MAP_HISTORY_LIMIT - 1)), before],
              }
            : s.mapHistory
          return {
            mapHistory,
            stores: mapStore(s.stores, storeId, (st) => {
              const floor = st.floors.find((f) => f.id === floorId)
              if (!floor) return st
              const nextCells = [...floor.cells]
              const addedNodes: MapNode[] = []
              // 新規棚 (まだ st.shelves に無い shelfId) は、塗りつぶしと同じ操作としてここで作る。
              // createShelf を別呼び出しにすると、その分だけ undo 履歴が余計に増えてしまうため。
              let shelves = st.shelves
              if (tool.kind === 'shelf' && !shelves.some((sh) => sh.id === tool.shelfId)) {
                const n = shelves.filter((sh) => sh.floorId === floorId).length + 1
                shelves = [...shelves, { id: tool.shelfId, floorId, name: `棚${n}`, categoryIds: [] }]
              }
              for (const { x, y } of cells) {
                if (x < 0 || y < 0 || x >= floor.width || y >= floor.height) continue
                const at = y * floor.width + x
                if (tool.kind === 'shelf') {
                  nextCells[at] = { k: 'shelf', shelfId: tool.shelfId }
                } else if (tool.kind === 'node') {
                  const existing = nextCells[at]
                  if (existing.k === 'node') continue
                  const id = newId('node')
                  addedNodes.push({
                    id,
                    floorId,
                    kind: tool.nodeKind,
                    name: tool.name,
                    groupId: tool.groupId,
                  })
                  nextCells[at] = { k: 'node', nodeId: id }
                } else {
                  nextCells[at] = { k: tool.kind }
                }
              }
              const floors = st.floors.map((f) => (f.id === floorId ? { ...f, cells: nextCells } : f))
              const withNodes = { ...st, floors, shelves, nodes: [...st.nodes, ...addedNodes] }
              const pruned = pruneOrphans(withNodes)
              // 塗り始めたばかりの空の棚は残す
              const keep = tool.kind === 'shelf' ? shelves.find((sh) => sh.id === tool.shelfId) : undefined
              if (keep && !pruned.shelves.some((sh) => sh.id === keep.id)) {
                return { ...pruned, shelves: [...pruned.shelves, keep] }
              }
              return pruned
            }),
          }
        }),

      importFloorLayout: (storeId, floorId, layout) =>
        set((s) => {
          const before = s.stores.find((st) => st.id === storeId)
          const mapHistory = before
            ? {
                ...s.mapHistory,
                [storeId]: [...(s.mapHistory[storeId] ?? []).slice(-(MAP_HISTORY_LIMIT - 1)), before],
              }
            : s.mapHistory
          return {
            mapHistory,
            stores: mapStore(s.stores, storeId, (st) => {
              const floor = st.floors.find((f) => f.id === floorId)
              if (!floor) return st
              const floors = st.floors.map((f) =>
                f.id === floorId ? { ...f, width: layout.width, height: layout.height, cells: layout.cells } : f,
              )
              const shelves = [...st.shelves.filter((sh) => sh.floorId !== floorId), ...layout.shelves]
              const nodes = [...st.nodes.filter((n) => n.floorId !== floorId), ...layout.nodes]
              return pruneOrphans({ ...st, floors, shelves, nodes })
            }),
          }
        }),

      undoMap: (storeId) =>
        set((s) => {
          const hist = s.mapHistory[storeId]
          if (!hist || hist.length === 0) return {}
          const prev = hist[hist.length - 1]
          return {
            mapHistory: { ...s.mapHistory, [storeId]: hist.slice(0, -1) },
            stores: s.stores.map((st) => (st.id === storeId ? prev : st)),
          }
        }),

      cleanupMap: (storeId) => set((s) => ({ stores: mapStore(s.stores, storeId, (st) => pruneOrphans(st)) })),

      replaceAll: (data) =>
        set((s) => {
          const stores = data.stores ?? s.stores
          const lists = data.lists ?? s.lists
          return {
            stores,
            lists,
            categories: data.categories ?? s.categories,
            aliases: data.aliases ?? s.aliases,
            activeListId: lists.some((l) => l.id === s.activeListId) ? s.activeListId : (lists[0]?.id ?? null),
          }
        }),
    }),
    {
      name: 'smart-shopping-list',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: ({ stores, lists, categories, aliases, activeListId }) => ({
        stores,
        lists,
        categories,
        aliases,
        activeListId,
      }),
    },
  ),
)

/** 現在選択中のリスト (無ければ null)。 */
export function useActiveList(): ShoppingList | null {
  return useAppStore((s) => s.lists.find((l) => l.id === s.activeListId) ?? s.lists[0] ?? null)
}

/** 指定リストが対象にしている店舗マップ。 */
export function useListStore(list: ShoppingList | null): StoreMap | null {
  return useAppStore((s) => {
    if (!list) return null
    return s.stores.find((st) => st.id === list.storeId) ?? null
  })
}
