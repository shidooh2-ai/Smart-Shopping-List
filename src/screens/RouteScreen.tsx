import { useMemo, useState } from 'react'
import { MapView } from '../components/MapView'
import { planRoute, routeMetrics } from '../lib/route'
import { useActiveList, useAppStore, useListStore } from '../store/useAppStore'

export function RouteScreen() {
  const list = useActiveList()
  const store = useListStore(list)
  const categories = useAppStore((s) => s.categories)
  const setTab = useAppStore((s) => s.setTab)
  const setItemChecked = useAppStore((s) => s.setItemChecked)
  const [floorId, setFloorId] = useState<string | null>(null)
  const [activeStop, setActiveStop] = useState<number | null>(null)

  const plan = useMemo(() => (store && list ? planRoute(store, list.items) : null), [store, list])

  const byId = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories])
  const itemById = useMemo(() => new Map((list?.items ?? []).map((i) => [i.id, i])), [list])

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

  return (
    <div className="screen">
      {plan && plan.stops.length > 0 && metrics && (
        <div className="card">
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
              height={300}
            />
            <div className="legend">
              <span>
                <i style={{ background: '#2e7d32', borderRadius: '50%' }} />
                入口
              </span>
              <span>
                <i style={{ background: '#ef6c00' }} />
                レジ
              </span>
              <span>
                <i style={{ background: 'var(--accent)', borderRadius: '50%' }} />
                立ち寄り順
              </span>
            </div>
          </div>

          <div className="card">
            <h2>買い回りの順番</h2>
            {plan.stops.map((stop) => {
              const items = stop.itemIds.map((id) => itemById.get(id)).filter(Boolean)
              return (
                <div
                  key={stop.order}
                  className={`stop${activeStop === stop.order ? ' active' : ''}`}
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
              <div className="stop">
                <span className="badge" style={{ background: '#ef6c00' }}>
                  ⤷
                </span>
                <div className="where">レジへ</div>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="empty">
          {list.items.filter((i) => !i.checked).length === 0
            ? '買うものがありません。リストに追加してください。'
            : 'ルートを作れませんでした。マップに売り場（棚の取り扱いジャンル）が設定されているか確認してください。'}
        </div>
      )}
    </div>
  )
}
