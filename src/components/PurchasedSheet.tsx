import { useMemo, useState } from 'react'
import { useAppStore } from '../store/useAppStore'
import type { Category, PurchasedItem } from '../types'
import { Sheet } from './Sheet'

export interface PurchasedSheetProps {
  open: boolean
  onClose: () => void
  categories: Category[]
}

/** 購入日時(ローカル日付)を <input type="date"> の値 (YYYY-MM-DD) に変換する。 */
function toDateInputValue(ts: number): string {
  const d = new Date(ts)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** <input type="date"> の値 (YYYY-MM-DD) をタイムスタンプに変換する (正午固定でDST等の境界問題を避ける)。 */
function fromDateInputValue(value: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!m) return null
  const [, y, mo, d] = m
  return new Date(Number(y), Number(mo) - 1, Number(d), 12, 0, 0).getTime()
}

const dateGroupLabel = (ts: number) =>
  new Date(ts).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })

/** 購入済み品目を日付ごとに確認できるシート。日付ごとに折りたたみ、各品目の購入日は編集できる。 */
export function PurchasedSheet({ open, onClose, categories }: PurchasedSheetProps) {
  const purchased = useAppStore((s) => s.purchased)
  const { updatePurchasedDate, deletePurchasedItem } = useAppStore()
  /** 日付ごとの展開状態。未操作なら一番新しい日付だけ展開しておく。 */
  const [expandedOverride, setExpandedOverride] = useState<Record<string, boolean>>({})

  const byId = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories])

  const groups = useMemo(() => {
    const map = new Map<string, PurchasedItem[]>()
    const sorted = [...purchased].sort((a, b) => b.purchasedAt - a.purchasedAt)
    for (const p of sorted) {
      const key = toDateInputValue(p.purchasedAt)
      const list = map.get(key) ?? []
      list.push(p)
      map.set(key, list)
    }
    return [...map.entries()].sort(([a], [b]) => (a < b ? 1 : -1))
  }, [purchased])

  const isExpanded = (key: string, index: number) => expandedOverride[key] ?? index === 0
  const toggle = (key: string, index: number) =>
    setExpandedOverride((s) => ({ ...s, [key]: !isExpanded(key, index) }))

  return (
    <Sheet open={open} title="購入済み" onClose={onClose}>
      {groups.length === 0 ? (
        <p className="empty">まだありません。リスト画面の「まとめて購入済みにする」や、ルート画面の「レジへ」から移動できます。</p>
      ) : (
        groups.map(([dateKey, items], i) => {
          const expanded = isExpanded(dateKey, i)
          return (
            <div key={dateKey} style={{ marginBottom: 8 }}>
              <button
                type="button"
                className="group-toggle"
                aria-expanded={expanded}
                onClick={() => toggle(dateKey, i)}
              >
                <span className="chevron">{expanded ? '▾' : '▸'}</span>
                <span className="grow">{dateGroupLabel(items[0].purchasedAt)}</span>
                <span className="muted">{items.length}件</span>
              </button>
              {expanded && (
                <ul className="list-rows" style={{ marginTop: 8 }}>
                  {items.map((p) => {
                    const category = p.categoryId ? byId.get(p.categoryId) : null
                    return (
                      <li key={p.id}>
                        <span
                          className="dot"
                          style={{ width: 12, height: 12, borderRadius: '50%', background: category?.color ?? 'var(--outline)', flex: 'none' }}
                        />
                        <span className="grow">
                          <span className="title">{p.text}</span>
                          <span className="muted">
                            {category?.name ?? 'ジャンル未設定'}
                            {p.listName ? ` ・ ${p.listName}` : ''}
                          </span>
                        </span>
                        <input
                          type="date"
                          value={toDateInputValue(p.purchasedAt)}
                          onChange={(e) => {
                            const ts = fromDateInputValue(e.target.value)
                            if (ts !== null) updatePurchasedDate(p.id, ts)
                          }}
                          style={{ width: 150, flex: 'none' }}
                          aria-label={`${p.text} の購入日`}
                        />
                        <button
                          type="button"
                          className="remove"
                          onClick={() => deletePurchasedItem(p.id)}
                          aria-label={`${p.text} を購入済みから削除`}
                        >
                          ×
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )
        })
      )}
    </Sheet>
  )
}
