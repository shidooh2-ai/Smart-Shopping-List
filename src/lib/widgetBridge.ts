import { App as CapacitorApp } from '@capacitor/app'
import { Capacitor, registerPlugin } from '@capacitor/core'
import { useAppStore } from '../store/useAppStore'
import type { Category, ShoppingList } from '../types'

/**
 * ホーム画面ウィジェット (iOS) との橋渡し。実体は ios/App/App/WidgetBridgePlugin.swift。
 *
 * ウィジェットからは WKWebView の localStorage を読めないため、リストの内容を App Group の
 * 共有領域へ書き出す。逆にウィジェット上で付けたチェックは「未反映の変更」として積まれるので、
 * 起動時とフォアグラウンド復帰時に取り込む。
 *
 * App Group の entitlement が無い間 (無料のPersonal Team) はネイティブ側が available:false を
 * 返すので、この配線は何もしない。有効化の手順は
 * ios/App/ShoppingListWidget/ShoppingListWidget.swift の冒頭コメントを参照。
 */

export interface WidgetPendingChange {
  listId: string
  itemId: string
  checked: boolean
  at: number
}

interface WidgetBridgePluginApi {
  isAvailable(): Promise<{ available: boolean }>
  writeSnapshot(options: { json: string }): Promise<{ written: boolean }>
  readPendingChanges(): Promise<{ changes: WidgetPendingChange[] }>
  clearPendingChanges(): Promise<{ cleared: boolean }>
}

export const WidgetBridge = registerPlugin<WidgetBridgePluginApi>('WidgetBridge')

const WRITE_DEBOUNCE_MS = 800

let started = false

/** iPhoneアプリ (Capacitor/iOS) 上でのみ使う。Web版では常に false。 */
function isWidgetPlatform(): boolean {
  return Capacitor.getPlatform() === 'ios'
}

export interface WidgetSnapshot {
  updatedAt: number
  activeListId: string | null
  lists: Array<{
    id: string
    name: string
    color: string | null
    items: Array<{ id: string; text: string; checked: boolean; color: string | null }>
  }>
}

/**
 * ウィジェットへ渡すスナップショットを組み立てる (表示に必要な最小限だけ)。
 * この形は Swift 側 (ios/App/ShoppingListWidget/SharedSnapshot.swift の Snapshot) の
 * デコード対象そのものなので、変更するときは両方を合わせること。
 */
export function buildWidgetSnapshot(
  lists: ShoppingList[],
  categories: Category[],
  activeListId: string | null,
): WidgetSnapshot {
  const colorByCategory = new Map(categories.map((c) => [c.id, c.color]))
  return {
    updatedAt: Date.now(),
    activeListId,
    lists: lists.map((l) => ({
      id: l.id,
      name: l.name,
      color: l.color ?? null,
      items: l.items.map((i) => ({
        id: i.id,
        text: i.text,
        checked: i.checked,
        color: (i.categoryId ? colorByCategory.get(i.categoryId) : null) ?? null,
      })),
    })),
  }
}

function currentSnapshotJson(): string {
  const { lists, categories, activeListId } = useAppStore.getState()
  return JSON.stringify(buildWidgetSnapshot(lists, categories, activeListId))
}

/** ウィジェット上で付けたチェックをアプリ側に取り込む。 */
async function applyPendingChanges(): Promise<void> {
  const { changes } = await WidgetBridge.readPendingChanges()
  if (changes.length === 0) return
  const { lists, setItemChecked } = useAppStore.getState()
  for (const change of changes) {
    const list = lists.find((l) => l.id === change.listId)
    if (list?.items.some((i) => i.id === change.itemId)) {
      setItemChecked(change.listId, change.itemId, change.checked)
    }
  }
  await WidgetBridge.clearPendingChanges()
}

export function startWidgetBridge(): void {
  if (started || !isWidgetPlatform()) return
  started = true

  void (async () => {
    const { available } = await WidgetBridge.isAvailable().catch(() => ({ available: false }))
    if (!available) return

    await applyPendingChanges().catch(() => {})
    await WidgetBridge.writeSnapshot({ json: currentSnapshotJson() }).catch(() => {})

    void CapacitorApp.addListener('appStateChange', ({ isActive }) => {
      if (!isActive) return
      void applyPendingChanges().catch(() => {})
    })

    let timer: ReturnType<typeof setTimeout> | null = null
    let prevLists = useAppStore.getState().lists
    let prevCategories = useAppStore.getState().categories

    useAppStore.subscribe((state) => {
      if (state.lists === prevLists && state.categories === prevCategories) return
      prevLists = state.lists
      prevCategories = state.categories
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        void WidgetBridge.writeSnapshot({ json: currentSnapshotJson() }).catch(() => {})
      }, WRITE_DEBOUNCE_MS)
    })
  })()
}
