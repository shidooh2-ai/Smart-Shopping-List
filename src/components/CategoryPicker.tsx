import type { Category } from '../types'
import { Sheet } from './Sheet'

export interface CategoryPickerProps {
  open: boolean
  title?: string
  /** 選択中のジャンル (複数選択時は配列) */
  selected: string[]
  categories: Category[]
  multiple?: boolean
  allowNone?: boolean
  onToggle: (categoryId: string | null) => void
  onClose: () => void
}

/** ジャンル選択シート。品目のジャンル指定と、棚の取り扱いジャンル設定の両方で使う。 */
export function CategoryPicker({
  open,
  title = 'ジャンルを選ぶ',
  selected,
  categories,
  multiple = false,
  allowNone = false,
  onToggle,
  onClose,
}: CategoryPickerProps) {
  return (
    <Sheet open={open} title={title} onClose={onClose}>
      {multiple && <p className="muted" style={{ marginTop: 0 }}>タップで追加／解除できます（複数選択可）</p>}
      <div className="picker">
        {allowNone && (
          <button
            type="button"
            aria-pressed={selected.length === 0}
            onClick={() => {
              onToggle(null)
              if (!multiple) onClose()
            }}
          >
            <span className="dot" style={{ background: 'var(--text-dim)' }} />
            未設定にする
          </button>
        )}
        {categories.map((c) => (
          <button
            key={c.id}
            type="button"
            aria-pressed={selected.includes(c.id)}
            onClick={() => {
              onToggle(c.id)
              if (!multiple) onClose()
            }}
          >
            <span className="dot" style={{ background: c.color }} />
            {c.name}
          </button>
        ))}
      </div>
    </Sheet>
  )
}
