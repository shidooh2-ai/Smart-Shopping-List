import { type CSSProperties, type ReactNode, useEffect, useState } from 'react'

export interface SheetProps {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
}

/**
 * 表示中の「実際に見えている領域」(VisualViewport)。
 * iOS Safari はアドレスバーの出入りで `position: fixed` の効く範囲が
 * CSS の vh/dvh とずれることがあり、シート下部が本文からはみ出して
 * 見えなくなる原因になる。VisualViewport API から得られる実測値を
 * 直接あてることで、CSS の丸め込みに頼らず常に画面ちょうどに合わせる。
 */
function useVisualViewport(active: boolean) {
  const [rect, setRect] = useState<{ top: number; height: number } | null>(null)

  useEffect(() => {
    if (!active) return
    const vv = window.visualViewport
    if (!vv) return
    const update = () => setRect({ top: vv.offsetTop, height: vv.height })
    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  }, [active])

  return rect
}

/** 画面下から出るモーダル。モバイルでの片手操作を想定。 */
export function Sheet({ open, title, onClose, children }: SheetProps) {
  const viewport = useVisualViewport(open)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const backdropStyle: CSSProperties = viewport
    ? { top: viewport.top, height: viewport.height }
    : {}

  return (
    <div
      className="sheet-backdrop"
      style={backdropStyle}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <header>
          <h3>{title}</h3>
          <button type="button" className="btn slim" onClick={onClose}>
            閉じる
          </button>
        </header>
        <div className="content">{children}</div>
      </div>
    </div>
  )
}
