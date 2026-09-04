import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { CloudSync, type CloudSyncItem } from '../lib/cloudSync'
import { cloneDefaultCategories } from '../data/categories'
import { PALETTE } from '../data/palette'
import { createSampleStore } from '../data/sampleStore'
import type { ThemeId } from '../data/themes'
import { aliasKey, buildIndex, detectCategory } from '../lib/genre'
import { idx, makeCells, pruneOrphans } from '../lib/grid'
import { newId } from '../lib/id'
import { splitItems } from '../lib/normalize'
import type {
  Category,
  Cell,
  CloudLink,
  Floor,
  MapNode,
  NodeKind,
  PurchasedItem,
  RoutePreference,
  Shelf,
  ShoppingItem,
  ShoppingList,
  StoreMap,
} from '../types'

/** 下段タブバーの3つの画面 */
export type Tab = 'list' | 'route' | 'settings'
/** 「設定」タブ内で切り替える画面。マップとジャンルの編集もここに含める */
export type SettingsView = 'settings' | 'map' | 'genre'

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
  /** リストから購入済みに移した品目 (日付ごとに確認できる履歴)。全リスト共通 */
  purchased: PurchasedItem[]
  /** 正規化テキスト -> ジャンルID。手動指定から学習する */
  aliases: Record<string, string>
  activeListId: string | null
  tab: Tab
  /** 「設定」タブ内で設定/マップ/ジャンルのどれを表示するか */
  settingsView: SettingsView
  /** 階をまたぐルート計算で階段/エレベーターのどちらを優先するか */
  routePreference: RoutePreference
  /** 自分のニックネーム。品目に「追加した人」として記録される (リスト共有時に使う) */
  nickname: string
  /** 画面ロック (自動スリープ) を無効化するか */
  screenWakeLockEnabled: boolean
  /** 画面の配色。'default' は端末のライト/ダーク設定に従う */
  theme: ThemeId
  /** storeId ごとの「元に戻す」用スナップショット (直近の操作が末尾)。保存はしない */
  mapHistory: Record<string, StoreMap[]>
  /** storeId ごとの「やり直す」用スナップショット (元に戻す操作で積む)。保存はしない */
  mapRedo: Record<string, StoreMap[]>

  setTab: (tab: Tab) => void
  setSettingsView: (view: SettingsView) => void
  setRoutePreference: (preference: RoutePreference) => void
  setNickname: (nickname: string) => void
  setScreenWakeLockEnabled: (enabled: boolean) => void
  setTheme: (theme: ThemeId) => void

  // --- 買い物リスト ---
  createList: (name?: string, color?: string) => string
  deleteList: (listId: string) => void
  updateList: (listId: string, patch: { name?: string; color?: string }) => void
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
  /** チェック済みの品目を購入済みリストへ移す (対象リストからは削除される) */
  markPurchased: (listId: string, itemIds: string[]) => void
  /** 購入済み品目の日付を編集する */
  updatePurchasedDate: (purchasedId: string, purchasedAt: number) => void
  deletePurchasedItem: (purchasedId: string) => void

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
  updateFloor: (
    storeId: string,
    floorId: string,
    patch: { name?: string; level?: number; backgroundImage?: string | null; backgroundOpacity?: number },
  ) => void
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
    layout: {
      width: number
      height: number
      cells: Cell[]
      shelves: Shelf[]
      nodes: MapNode[]
      backgroundImage?: string
    },
  ) => void
  /** 直前の paint / importFloorLayout 操作を1回取り消す */
  undoMap: (storeId: string) => void
  /** undoMap で取り消した操作を1回やり直す */
  redoMap: (storeId: string) => void
  cleanupMap: (storeId: string) => void

  replaceAll: (
    data: Partial<Pick<AppState, 'stores' | 'lists' | 'categories' | 'aliases' | 'purchased' | 'nickname'>>,
  ) => void

  // --- iCloud共有 (iPhoneアプリのみ) ---
  /** 店舗マップをiCloud経由で共有する (標準の共有シートが開く) */
  shareStore: (storeId: string) => Promise<void>
  /** 店舗マップの共有を停止する */
  unshareStore: (storeId: string) => Promise<void>
  /** 買い物リストをiCloud経由で共有する (標準の共有シートが開く) */
  shareList: (listId: string) => Promise<void>
  /** 買い物リストの共有を停止する */
  unshareList: (listId: string) => Promise<void>
  /**
   * 自分が共有したもの・共有されたものの最新状態を取得し、ローカルに反映する。
   * updatedAt を比較し、新しい方を採用する (簡易な最終更新優先のマージ)。
   */
  pullCloudShares: () => Promise<void>
  /** ローカルでの変更のうち、まだCloudKitへ送っていないものを送信する */
  pushCloudChanges: () => Promise<void>
}

function createInitialList(storeId: string | null, name?: string, color?: string): ShoppingList {
  const now = Date.now()
  return {
    id: newId('list'),
    name: name ?? '買い物リスト',
    color: color ?? PALETTE[0],
    storeId,
    items: [],
    createdAt: now,
    updatedAt: now,
  }
}

function initialState() {
  const store = createSampleStore()
  const list = createInitialList(store.id)
  return {
    stores: [store],
    lists: [list],
    categories: cloneDefaultCategories(),
    purchased: [] as PurchasedItem[],
    aliases: {} as Record<string, string>,
    activeListId: list.id,
    tab: 'list' as Tab,
    settingsView: 'settings' as SettingsView,
    routePreference: 'balanced' as RoutePreference,
    nickname: '',
    screenWakeLockEnabled: false,
    theme: 'default' as ThemeId,
    mapHistory: {} as Record<string, StoreMap[]>,
    mapRedo: {} as Record<string, StoreMap[]>,
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

/**
 * cloud のリンク情報だけを書き換える (updatedAt は変えない — cloudのリンク付け自体は
 * 「内容の編集」ではないため。ここでupdatedAtを更新すると、共有→即再送信のループになる)。
 * patch が undefined なら共有を解除する。
 */
function patchCloud<T extends { id: string; cloud?: CloudLink }>(
  list: T[],
  id: string,
  patch: CloudLink | Partial<CloudLink> | undefined,
): T[] {
  return list.map((item) => {
    if (item.id !== id) return item
    if (patch === undefined) {
      const { cloud: _drop, ...rest } = item
      return rest as T
    }
    return { ...item, cloud: { ...item.cloud, ...patch } as CloudLink }
  })
}

/** CloudKitへ送信するJSONには自分の cloud リンク情報 (recordIdなど) を含めない。 */
function stripCloud<T extends { cloud?: CloudLink }>(entity: T): T {
  const { cloud: _drop, ...rest } = entity
  return rest as T
}

/**
 * pull() で取得した1件を、自分の共有相手一覧 (list) にマージする。
 * 既に紐付いている項目があれば updatedAt が新しい方を採用し、無ければ新規に取り込む。
 * ローカルの方が新しい場合は内容はそのまま (pushCloudChanges が後で送信する)。
 */
function mergeCloudEntity<T extends { id: string; updatedAt: number; cloud?: CloudLink }>(
  list: T[],
  item: CloudSyncItem,
  parse: (json: string) => T,
): T[] {
  const cloudFromRemote: CloudLink = {
    recordId: item.recordId,
    owner: item.owner,
    lastPushedUpdatedAt: item.updatedAt,
    zoneOwnerName: item.zoneOwnerName,
  }
  const existingIndex = list.findIndex((e) => e.cloud?.recordId === item.recordId)
  if (existingIndex === -1) {
    return [...list, { ...stripCloud(parse(item.json)), cloud: cloudFromRemote }]
  }
  const existing = list[existingIndex]
  const next = [...list]
  if (item.updatedAt > existing.updatedAt) {
    next[existingIndex] = { ...stripCloud(parse(item.json)), cloud: cloudFromRemote }
  } else {
    next[existingIndex] = {
      ...existing,
      cloud: { ...existing.cloud, recordId: item.recordId, owner: item.owner, zoneOwnerName: item.zoneOwnerName } as CloudLink,
    }
  }
  return next
}

/** ローカルの変更をCloudKitへ送信する。オフライン等で失敗したら false を返し、次回また試す。 */
async function pushCloudEntity<T extends { cloud?: CloudLink; updatedAt: number }>(entity: T): Promise<boolean> {
  if (!entity.cloud) return false
  try {
    await CloudSync.push({
      recordId: entity.cloud.recordId,
      json: JSON.stringify(stripCloud(entity)),
      updatedAt: entity.updatedAt,
      owner: entity.cloud.owner,
      zoneOwnerName: entity.cloud.zoneOwnerName,
    })
    return true
  } catch {
    return false
  }
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      ...initialState(),

      setTab: (tab) => set({ tab }),
      setSettingsView: (settingsView) => set({ settingsView }),
      setRoutePreference: (routePreference) => set({ routePreference }),
      setNickname: (nickname) => set({ nickname }),
      setScreenWakeLockEnabled: (screenWakeLockEnabled) => set({ screenWakeLockEnabled }),
      setTheme: (theme) => set({ theme }),

      // --- 買い物リスト ---
      createList: (name, color) => {
        const { stores, lists } = get()
        const list = createInitialList(stores[0]?.id ?? null, name, color ?? PALETTE[lists.length % PALETTE.length])
        set((s) => ({ lists: [...s.lists, list], activeListId: list.id }))
        return list.id
      },

      deleteList: (listId) =>
        set((s) => {
          const lists = s.lists.filter((l) => l.id !== listId)
          const activeListId = s.activeListId === listId ? (lists[0]?.id ?? null) : s.activeListId
          return { lists, activeListId }
        }),

      updateList: (listId, patch) => set((s) => ({ lists: mapList(s.lists, listId, (l) => ({ ...l, ...patch })) })),

      setActiveList: (listId) => set({ activeListId: listId }),

      setListStore: (listId, storeId) =>
        set((s) => ({ lists: mapList(s.lists, listId, (l) => ({ ...l, storeId })) })),

      addItems: (listId, text) =>
        set((s) => {
          const index = buildIndex(s.categories)
          const now = Date.now()
          const addedBy = s.nickname.trim() || null
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
              addedBy,
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

      markPurchased: (listId, itemIds) =>
        set((s) => {
          const list = s.lists.find((l) => l.id === listId)
          if (!list) return {}
          const idSet = new Set(itemIds)
          const moving = list.items.filter((i) => idSet.has(i.id))
          if (moving.length === 0) return {}
          const now = Date.now()
          const newlyPurchased: PurchasedItem[] = moving.map((i) => ({
            id: newId('purchased'),
            text: i.text,
            categoryId: i.categoryId,
            purchasedAt: now,
            listName: list.name,
            addedBy: i.addedBy ?? null,
          }))
          return {
            purchased: [...s.purchased, ...newlyPurchased],
            lists: mapList(s.lists, listId, (l) => ({
              ...l,
              items: l.items.filter((i) => !idSet.has(i.id)),
            })),
          }
        }),

      updatePurchasedDate: (purchasedId, purchasedAt) =>
        set((s) => ({
          purchased: s.purchased.map((p) => (p.id === purchasedId ? { ...p, purchasedAt } : p)),
        })),

      deletePurchasedItem: (purchasedId) =>
        set((s) => ({ purchased: s.purchased.filter((p) => p.id !== purchasedId) })),

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
            floors: st.floors.map((f) => {
              if (f.id !== floorId) return f
              // backgroundImage: null は「削除」、未指定 (undefined) は「変更しない」の意味
              const { backgroundImage, ...rest } = patch
              return {
                ...f,
                ...rest,
                backgroundImage: backgroundImage === null ? undefined : (backgroundImage ?? f.backgroundImage),
              }
            }),
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
          // 新しい編集をしたら、それ以前の「取り消し」に対する「やり直し」は意味が無くなる
          const mapRedo = before ? { ...s.mapRedo, [storeId]: [] } : s.mapRedo
          return {
            mapHistory,
            mapRedo,
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
          const mapRedo = before ? { ...s.mapRedo, [storeId]: [] } : s.mapRedo
          return {
            mapHistory,
            mapRedo,
            stores: mapStore(s.stores, storeId, (st) => {
              const floor = st.floors.find((f) => f.id === floorId)
              if (!floor) return st
              const floors = st.floors.map((f) =>
                f.id === floorId
                  ? {
                      ...f,
                      width: layout.width,
                      height: layout.height,
                      cells: layout.cells,
                      backgroundImage: layout.backgroundImage ?? f.backgroundImage,
                      backgroundOpacity: f.backgroundOpacity ?? 0.35,
                    }
                  : f,
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
          const current = s.stores.find((st) => st.id === storeId)
          const redo = s.mapRedo[storeId] ?? []
          return {
            mapHistory: { ...s.mapHistory, [storeId]: hist.slice(0, -1) },
            mapRedo: current
              ? { ...s.mapRedo, [storeId]: [...redo.slice(-(MAP_HISTORY_LIMIT - 1)), current] }
              : s.mapRedo,
            stores: s.stores.map((st) => (st.id === storeId ? prev : st)),
          }
        }),

      redoMap: (storeId) =>
        set((s) => {
          const redo = s.mapRedo[storeId]
          if (!redo || redo.length === 0) return {}
          const next = redo[redo.length - 1]
          const current = s.stores.find((st) => st.id === storeId)
          const hist = s.mapHistory[storeId] ?? []
          return {
            mapRedo: { ...s.mapRedo, [storeId]: redo.slice(0, -1) },
            mapHistory: current
              ? { ...s.mapHistory, [storeId]: [...hist.slice(-(MAP_HISTORY_LIMIT - 1)), current] }
              : s.mapHistory,
            stores: s.stores.map((st) => (st.id === storeId ? next : st)),
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
            purchased: data.purchased ?? s.purchased,
            nickname: data.nickname ?? s.nickname,
            activeListId: lists.some((l) => l.id === s.activeListId) ? s.activeListId : (lists[0]?.id ?? null),
          }
        }),

      // --- iCloud共有 ---
      shareStore: async (storeId) => {
        const store = get().stores.find((st) => st.id === storeId)
        if (!store) return
        const { recordId } = await CloudSync.share({
          kind: 'store',
          localId: store.id,
          name: store.name,
          json: JSON.stringify(stripCloud(store)),
          updatedAt: store.updatedAt,
        })
        set((s) => ({
          stores: patchCloud(s.stores, storeId, { recordId, owner: true, lastPushedUpdatedAt: store.updatedAt }),
        }))
      },

      unshareStore: async (storeId) => {
        const store = get().stores.find((st) => st.id === storeId)
        if (!store?.cloud) return
        await CloudSync.unshare({
          recordId: store.cloud.recordId,
          owner: store.cloud.owner,
          zoneOwnerName: store.cloud.zoneOwnerName,
        })
        set((s) => ({ stores: patchCloud(s.stores, storeId, undefined) }))
      },

      shareList: async (listId) => {
        const list = get().lists.find((l) => l.id === listId)
        if (!list) return
        const { recordId } = await CloudSync.share({
          kind: 'list',
          localId: list.id,
          name: list.name,
          json: JSON.stringify(stripCloud(list)),
          updatedAt: list.updatedAt,
        })
        set((s) => ({
          lists: patchCloud(s.lists, listId, { recordId, owner: true, lastPushedUpdatedAt: list.updatedAt }),
        }))
      },

      unshareList: async (listId) => {
        const list = get().lists.find((l) => l.id === listId)
        if (!list?.cloud) return
        await CloudSync.unshare({
          recordId: list.cloud.recordId,
          owner: list.cloud.owner,
          zoneOwnerName: list.cloud.zoneOwnerName,
        })
        set((s) => ({ lists: patchCloud(s.lists, listId, undefined) }))
      },

      pullCloudShares: async () => {
        const { items } = await CloudSync.pull()
        set((s) => {
          let stores = s.stores
          let lists = s.lists
          for (const item of items) {
            if (item.kind === 'store') {
              stores = mergeCloudEntity(stores, item, (json) => JSON.parse(json) as StoreMap)
            } else {
              lists = mergeCloudEntity(lists, item, (json) => JSON.parse(json) as ShoppingList)
            }
          }
          return { stores, lists }
        })
      },

      pushCloudChanges: async () => {
        const { stores, lists } = get()
        for (const store of stores) {
          if (store.cloud && store.updatedAt > store.cloud.lastPushedUpdatedAt) {
            const ok = await pushCloudEntity(store)
            if (ok) set((s) => ({ stores: patchCloud(s.stores, store.id, { lastPushedUpdatedAt: store.updatedAt }) }))
          }
        }
        for (const list of lists) {
          if (list.cloud && list.updatedAt > list.cloud.lastPushedUpdatedAt) {
            const ok = await pushCloudEntity(list)
            if (ok) set((s) => ({ lists: patchCloud(s.lists, list.id, { lastPushedUpdatedAt: list.updatedAt }) }))
          }
        }
      },
    }),
    {
      name: 'smart-shopping-list',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: ({
        stores,
        lists,
        categories,
        aliases,
        activeListId,
        routePreference,
        purchased,
        nickname,
        screenWakeLockEnabled,
        theme,
      }) => ({
        stores,
        lists,
        categories,
        aliases,
        activeListId,
        routePreference,
        purchased,
        nickname,
        screenWakeLockEnabled,
        theme,
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
