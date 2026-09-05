import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { advanceIfDone, buildNavSteps, firstUnfinishedStep } from '../lib/navSteps'
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
  /** レジの手順で「購入済みにする」を出すためのチェック済み品目数 */
  checkedItemCount: number
  onToggleItem: (itemId: string, checked: boolean) => void
  /** レジの手順の「チェック済みN件を購入済みにする」を押したとき */
  onCheckout: () => void
  onClose: () => void
}

/**
 * ルートの全画面表示。地図を画面いっぱいに出し、「ナビ開始」すると
 * 区間 (地点から地点まで) を拡大して表示する。その地点の品目を全部チェックすると
 * 次の区間へ自動で進み、地図はなめらかに移動する。階をまたぐ区間では、階段・エレベーター
 * へ向かう中継の手順を挟む。
 */
export function RouteNav({
  open,
  store,
  categories,
  plan,
  itemById,
  doneStopOrders,
  checkedItemCount,
  onToggleItem,
  onCheckout,
  onClose,
}: RouteNavProps) {
  const steps = useMemo(() => buildNavSteps(plan, store), [plan, store])
  /** null = ナビ開始前 (全体表示) */
  const [stepIndex, setStepIndex] = useState<number | null>(null)

  // 開くたびに全体表示から始める
  useEffect(() => {
    if (open) setStepIndex(null)
  }, [open])

  // 「前」で買い終わった立ち寄りへ戻れるよう、この効果は手動でのページ送り (stepIndex の変化) では
  // 発火させず、品目のチェック状態が変わったとき (doneStopOrders の変化) だけ次へ進める。
  const stepIndexRef = useRef(stepIndex)
  useEffect(() => {
    stepIndexRef.current = stepIndex
  }, [stepIndex])

  useEffect(() => {
    const idx = stepIndexRef.current
    if (idx === null) return
    const next = advanceIfDone(steps, idx, doneStopOrders)
    if (next !== idx) setStepIndex(next)
  }, [doneStopOrders, steps])

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

  const heading = stop ? stop.shelfNames.join(' / ') : step?.kind === 'relay' ? step.label : 'レジへ'

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

      {/*
        地図とパネルの高さの分け方は styles.css 側で固定 (.navpanel { flex: 0 0 45% }) にしている。
        以前はパネルの高さが中身 (品目数・案内文・レジのボタンの有無) によって伸び縮みしていたため、
        手順が変わるたびに地図の表示領域自体も伸び縮みしてしまい、地図のカメラが移動先へ動く演出と
        重なって「一瞬だけ地図が広がって見える」不具合になっていた。
      */}
      <div className="navstage">
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
                <span className={`badge${step?.kind === 'relay' ? ' relay' : ''}`}>
                  {step?.kind === 'stop' ? step.stopOrder : step?.kind === 'relay' ? '⏩' : '⤷'}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="where">{heading}</div>
                  <span className="muted">
                    {stepIndex + 1} / {steps.length}
                  </span>
                </div>
              </div>

              {step?.kind === 'relay' && (
                <p className="muted" style={{ margin: '0 0 10px' }}>
                  この先で階が変わります。{step.label}向かってください。
                </p>
              )}

              {items.length > 0 && (
                <ul className="goods nav-goods" style={{ marginBottom: 10 }}>
                  {items.map((item) => (
                    <li
                      key={item.id}
                      className={item.checked ? 'done' : ''}
                      onClick={() => onToggleItem(item.id, !item.checked)}
                    >
                      <input
                        type="checkbox"
                        checked={item.checked}
                        onChange={(e) => onToggleItem(item.id, e.target.checked)}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`${item.text} をカゴに入れた`}
                      />
                      {item.text}
                    </li>
                  ))}
                </ul>
              )}

              {step?.kind === 'checkout' && (
                <button
                  type="button"
                  className="btn primary"
                  style={{ width: '100%', marginBottom: 10 }}
                  disabled={checkedItemCount === 0}
                  onClick={onCheckout}
                >
                  {checkedItemCount > 0
                    ? `チェック済み${checkedItemCount}件を購入済みにする`
                    : 'チェック済みの品目がありません'}
                </button>
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
      </div>
    </div>,
    document.body,
  )
}
