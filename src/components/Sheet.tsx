import { type ReactNode, useEffect } from 'react'

export interface SheetProps {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
}

/** 画面下から出るモーダル。モバイルでの片手操作を想定。 */
export function Sheet({ open, title, onClose, children }: SheetProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="sheet-backdrop"
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
