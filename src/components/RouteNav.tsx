import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { buildNavSteps, firstUnfinishedStep } from '../lib/navSteps'
import type { Category, RoutePlan, ShoppingItem, StoreMap } from '../types'
import { MapView } from './MapView'

export interface RouteNavProps {
  open: boolean
  store: StoreMap
  categories: Category[]
  plan: RoutePlan
  /** 立ち寄り先の品目を引くための一覧 */
  itemById: Map<string, ShoppingItem>
  /** 品目が全部チェック済みの立ち寄り番号 */
  doneStopOrders: Set<number>
  onToggleItem: (itemId: string, checked: boolean) => void
  onClose: () => void
}

/**
 * ルートの全画面表示。地図を画面いっぱいに出し、「ナビ開始」すると
 * 区間 (地点から地点まで) を拡大して表示する。その地点の品目を全部チェックすると
 * 次の区間へ自動で進み、地図はなめらかに移動する。
 */
export function RouteNav({
  open,
  store,
  categories,
  plan,
  itemById,
  doneStopOrders,
  onToggleItem,
  onClose,
}: RouteNavProps) {
  const steps = useMemo(() => buildNavSteps(plan), [plan])
  /** null = ナビ開始前 (全体表示) */
  const [stepIndex, setStepIndex] = useState<number | null>(null)

  // 開くたびに全体表示から始める
  useEffect(() => {
    if (open) setStepIndex(null)
  }, [open])

  // 買い終わった地点は飛ばして次の区間へ進む
  useEffect(() => {
    if (stepIndex === null) return
    const current = steps[stepIndex]
    if (!current || current.stopOrder === null) return
    if (doneStopOrders.has(current.stopOrder)) {
      const next = firstUnfinishedStep(steps, doneStopOrders)
      if (next !== stepIndex) setStepIndex(next)
    }
  }, [doneStopOrders, stepIndex, steps])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const navigating = stepIndex !== null
  const step = navigating ? steps[stepIndex] : null
  const stop = step?.stopOrder != null ? plan.stops.find((s) => s.order === step.stopOrder) : null
  const floor = store.floors.find((f) => f.id === step?.floorId) ?? store.floors[0]
  const items = (stop?.itemIds ?? []).map((id) => itemById.get(id)).filter((i): i is ShoppingItem => i != null)

  const go = (delta: number) => {
    if (stepIndex === null) return
    setStepIndex(Math.min(steps.length - 1, Math.max(0, stepIndex + delta)))
  }

  // タブバーなどのスタッキングに巻き込まれないよう、body直下に描画する
  return createPortal(
    <div className="navscreen" role="dialog" aria-modal="true" aria-label="ルートの全画面表示">
      <header>
        <strong>{store.name}</strong>
        <span className="muted">{floor?.name}</span>
        <span className="spacer" />
        <button type="button" className="btn slim" onClick={onClose}>
          閉じる
        </button>
      </header>

      <div className="navmap">
        {floor && (
          <MapView
            store={store}
            floor={floor}
            categories={categories}
            plan={plan}
            activeStop={step?.stopOrder ?? null}
            doneStopOrders={doneStopOrders}
            focusArea={step?.area ?? null}
            fullBleed
            showZoomBar={false}
          />
        )}
      </div>

      <div className="navpanel">
        {!navigating ? (
          <>
            <p className="muted" style={{ margin: '0 0 10px' }}>
              全体を表示しています。ナビを開始すると、地点ごとに拡大して案内します。
            </p>
            <button
              type="button"
              className="btn primary"
              style={{ width: '100%' }}
              onClick={() => setStepIndex(firstUnfinishedStep(steps, doneStopOrders))}
              disabled={steps.length === 0}
            >
              ナビ開始
            </button>
          </>
        ) : (
          <>
            <div className="row" style={{ marginBottom: 8 }}>
              <span className="badge">{step?.stopOrder ?? '⤷'}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="where">{stop ? stop.shelfNames.join(' / ') : 'レジへ'}</div>
                <span className="muted">
                  {stepIndex + 1} / {steps.length}
                </span>
              </div>
            </div>

            {items.length > 0 && (
              <ul className="goods" style={{ marginBottom: 10 }}>
                {items.map((item) => (
                  <li key={item.id} className={item.checked ? 'done' : ''}>
                    <input
                      type="checkbox"
                      checked={item.checked}
                      onChange={(e) => onToggleItem(item.id, e.target.checked)}
                      aria-label={`${item.text} をカゴに入れた`}
                    />
                    {item.text}
                  </li>
                ))}
              </ul>
            )}

            <div className="row">
              <button type="button" className="btn slim" onClick={() => go(-1)} disabled={stepIndex === 0}>
                ◀ 前
              </button>
              <button
                type="button"
                className="btn slim"
                onClick={() => go(1)}
                disabled={stepIndex >= steps.length - 1}
              >
                次 ▶
              </button>
              <span className="spacer" />
              <button type="button" className="btn slim" onClick={() => setStepIndex(null)}>
                全体表示
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}
