import { useMemo, useState } from 'react'
import { MapView } from '../components/MapView'
import { planRoute, routeMetrics } from '../lib/route'
import { useActiveList, useAppStore, useListStore } from '../store/useAppStore'
import type { RoutePreference, ShoppingItem } from '../types'

const PREFERENCE_OPTIONS: Array<{ id: RoutePreference; label: string }> = [
  { id: 'balanced', label: 'バランス' },
  { id: 'stairs', label: '階段優先' },
  { id: 'elevator', label: 'エレベーター優先' },
]

export function RouteScreen() {
  const list = useActiveList()
  const store = useListStore(list)
  const categories = useAppStore((s) => s.categories)
  const setTab = useAppStore((s) => s.setTab)
  const setItemChecked = useAppStore((s) => s.setItemChecked)
  const markPurchased = useAppStore((s) => s.markPurchased)
  const routePreference = useAppStore((s) => s.routePreference)
  const setRoutePreference = useAppStore((s) => s.setRoutePreference)
  const [floorId, setFloorId] = useState<string | null>(null)
  const [activeStop, setActiveStop] = useState<number | null>(null)

  const plan = useMemo(
    () => (store && list ? planRoute(store, list.items, routePreference) : null),
    [store, list, routePreference],
  )

  const byId = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories])
  const itemById = useMemo(() => new Map((list?.items ?? []).map((i) => [i.id, i])), [list])

  /** 立ち寄り先の品目が全部チェック済みなら「買い終わった」として薄く表示する (経路自体は変えない) */
  const doneStopOrders = useMemo(() => {
    const set = new Set<number>()
    for (const stop of plan?.stops ?? []) {
      if (stop.itemIds.length > 0 && stop.itemIds.every((id) => itemById.get(id)?.checked)) {
        set.add(stop.order)
      }
    }
    return set
  }, [plan, itemById])

  if (!list) return <div className="screen"><div className="empty">リストがありません。</div></div>

  if (!store) {
    return (
      <div className="screen">
        <div className="empty">
          このリストには店舗が設定されていません。
          <br />
          <button type="button" className="btn primary" style={{ marginTop: 12 }} onClick={() => setTab('list')}>
            リスト画面で店舗を選ぶ
          </button>
        </div>
      </div>
    )
  }

  const shownFloor =
    store.floors.find((f) => f.id === floorId) ??
    store.floors.find((f) => f.id === (plan?.stops.find((s) => s.order === activeStop)?.pos.floorId ?? plan?.stops[0]?.pos.floorId)) ??
    store.floors.find((f) => f.id === plan?.start?.floorId) ??
    store.floors[0]

  const metrics = plan ? routeMetrics(plan, store.cellMeters) : null
  const catName = (id: string) => byId.get(id)?.name ?? '不明なジャンル'

  const unresolved = plan?.unresolvedItemIds ?? []
  const missing = plan?.missingCategoryIds ?? []
  const unreachable = plan?.unreachableCategoryIds ?? []

  // ルートに含められない品目も、理由つきで一覧には出しておく (チェック済みでも消さず、薄く表示する)。
  const unresolvedItems = list.items.filter((i) => !i.categoryId)
  const byCategoryItems = (categoryIds: string[]) =>
    list.items.filter((i) => i.categoryId && categoryIds.includes(i.categoryId))
  const missingItems = byCategoryItems(missing)
  const unreachableItems = byCategoryItems(unreachable)

  const hasStairs = store.nodes.some((n) => n.kind === 'stairs')
  const hasElevator = store.nodes.some((n) => n.kind === 'elevator')
  const showPreference = store.floors.length > 1 && hasStairs && hasElevator

  const checkedItemIds = list.items.filter((i) => i.checked).map((i) => i.id)
  const checkoutToPurchased = () => {
    if (checkedItemIds.length === 0) return
    if (window.confirm(`チェックした ${checkedItemIds.length} 件を購入済みにします。よろしいですか？`)) {
      markPurchased(list.id, checkedItemIds)
    }
  }

  /** ルートに含められない品目の行。灰色の破線表示のまま、チェック(購入)はできるようにする。 */
  const renderUnroutedRow = (item: ShoppingItem, dotColor: string, reason: string) => (
    <li key={item.id} className={`unrouted${item.checked ? ' done' : ''}`}>
      <input
        type="checkbox"
        checked={item.checked}
        onChange={(e) => setItemChecked(list.id, item.id, e.target.checked)}
        aria-label={`${item.text} を購入済みにする`}
      />
      <span className="dot" style={{ background: dotColor }} />
      <span className="grow">
        <span className="title">{item.text}</span>
        <span className="muted">{reason}</span>
      </span>
    </li>
  )

  return (
    <div className="screen">
      {showPreference && (
        <div className="card">
          <h2>階段・エレベーターの優先</h2>
          <div className="floortabs" style={{ marginBottom: 0 }}>
            {PREFERENCE_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                aria-pressed={routePreference === opt.id}
                onClick={() => setRoutePreference(opt.id)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {plan && plan.stops.length > 0 && metrics && (
        <div className="card metrics-card">
          <div className="metrics">
            <div>
              <strong>{plan.stops.length}</strong>
              <span>立ち寄り</span>
            </div>
            <div>
              <strong>{metrics.meters}</strong>
              <span>歩く距離 (m)</span>
            </div>
            <div>
              <strong>{metrics.minutes}</strong>
              <span>目安 (分)</span>
            </div>
          </div>
          {metrics.floorChanges > 0 && (
            <p className="muted" style={{ marginBottom: 0, marginTop: 8 }}>
              階の移動が {metrics.floorChanges} 回あります。
            </p>
          )}
        </div>
      )}

      {(unresolved.length > 0 || missing.length > 0 || unreachable.length > 0) && (
        <div className="card">
          {unresolved.length > 0 && (
            <div className="banner">
              ジャンル未設定の {unresolved.length} 件はルートに含まれていません：
              {unresolved.map((id) => itemById.get(id)?.text).filter(Boolean).join('、')}
            </div>
          )}
          {missing.length > 0 && (
            <div className="banner">
              このマップに売り場が無いジャンル：{missing.map(catName).join('、')}
              <br />
              マップ画面で、該当する棚に取り扱いジャンルを追加してください。
            </div>
          )}
          {unreachable.length > 0 && (
            <div className="banner">
              入口からたどり着けない売り場があります：{unreachable.map(catName).join('、')}
              <br />
              通路がつながっているかマップを確認してください。
            </div>
          )}
        </div>
      )}

      {plan && plan.stops.length > 0 && shownFloor ? (
        <>
          <div className="card">
            {store.floors.length > 1 && (
              <div className="floortabs">
                {store.floors.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    aria-pressed={f.id === shownFloor.id}
                    onClick={() => setFloorId(f.id)}
                  >
                    {f.name}
                    {plan.stops.some((s) => s.pos.floorId === f.id)
                      ? `（${plan.stops.filter((s) => s.pos.floorId === f.id).length}）`
                      : ''}
                  </button>
                ))}
              </div>
            )}
            <MapView
              store={store}
              floor={shownFloor}
              categories={categories}
              plan={plan}
              activeStop={activeStop}
              doneStopOrders={doneStopOrders}
              height={300}
            />
            <div className="legend">
              <span>
                <i style={{ background: 'var(--accent)', borderRadius: '50%' }} />
                入口
              </span>
              <span>
                <i style={{ background: '#ef6c00' }} />
                レジ
              </span>
              <span>
                <i style={{ background: 'var(--coral)', borderRadius: '50%' }} />
                立ち寄り順
              </span>
            </div>
          </div>

          <div className="card stops-card">
            <h2>買い回りの順番</h2>
            {plan.stops.map((stop) => {
              const items = stop.itemIds.map((id) => itemById.get(id)).filter(Boolean)
              return (
                <div
                  key={stop.order}
                  className={`stop${activeStop === stop.order ? ' active' : ''}${doneStopOrders.has(stop.order) ? ' done' : ''}`}
                  onClick={() => {
                    setActiveStop(stop.order)
                    setFloorId(stop.pos.floorId)
                  }}
                >
                  <span className="badge">{stop.order}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="where">
                      {store.floors.length > 1 && <span className="muted">{stop.floorName} </span>}
                      {stop.shelfNames.join(' / ')}
                    </div>
                    <div className="row wrap" style={{ gap: 4, marginTop: 3 }}>
                      {stop.categoryIds.map((cid) => (
                        <span key={cid} className="chip" style={{ cursor: 'default' }}>
                          <span className="dot" style={{ background: byId.get(cid)?.color ?? '#999' }} />
                          {catName(cid)}
                        </span>
                      ))}
                    </div>
                    <ul className="goods">
                      {items.map((item) => (
                        <li key={item!.id} className={item!.checked ? 'done' : ''}>
                          <input
                            type="checkbox"
                            checked={item!.checked}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => setItemChecked(list.id, item!.id, e.target.checked)}
                            aria-label={`${item!.text} をカゴに入れた`}
                          />
                          {item!.text}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )
            })}
            {plan.goal && (
              <button
                type="button"
                className="stop checkout-btn"
                disabled={checkedItemIds.length === 0}
                onClick={checkoutToPurchased}
              >
                <span className="badge" style={{ background: '#ef6c00' }}>
                  ⤷
                </span>
                <div className="where">
                  レジへ
                  {checkedItemIds.length > 0 && (
                    <span className="muted"> ・ チェック済み{checkedItemIds.length}件を購入済みにする</span>
                  )}
                </div>
              </button>
            )}
          </div>
        </>
      ) : (
        <div className="empty">
          {list.items.length === 0
            ? '買うものがありません。リストに追加してください。'
            : 'ルートを作れませんでした。マップに売り場（棚の取り扱いジャンル）が設定されているか確認してください。'}
        </div>
      )}

      {(unresolvedItems.length > 0 || missingItems.length > 0 || unreachableItems.length > 0) && (
        <div className="card">
          <h2>ルートに含まれていない品目</h2>
          <ul className="list-rows">
            {unresolvedItems.map((item) =>
              renderUnroutedRow(item, 'var(--outline)', '理由: ジャンル未設定'),
            )}
            {missingItems.map((item) =>
              renderUnroutedRow(
                item,
                byId.get(item.categoryId!)?.color ?? 'var(--outline)',
                `${catName(item.categoryId!)} ・ 理由: この店舗に売り場がありません`,
              ),
            )}
            {unreachableItems.map((item) =>
              renderUnroutedRow(
                item,
                byId.get(item.categoryId!)?.color ?? 'var(--outline)',
                `${catName(item.categoryId!)} ・ 理由: 入口からたどり着けません`,
              ),
            )}
          </ul>
        </div>
      )}
    </div>
  )
}
