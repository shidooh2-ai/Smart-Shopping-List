import { useState } from 'react'
import { Sheet } from './Sheet'

export interface AddStoreSheetProps {
  open: boolean
  onClose: () => void
  onCreate: (name: string) => void
  onCreateSample: () => void
}

/** 店舗を追加するシート。白紙の店舗名を入力するか、サンプル店舗をコピーする。 */
export function AddStoreSheet({ open, onClose, onCreate, onCreateSample }: AddStoreSheetProps) {
  const [name, setName] = useState('')

  const submit = () => {
    onCreate(name.trim() || '新しい店舗')
    setName('')
    onClose()
  }

  return (
    <Sheet open={open} title="店舗を追加" onClose={onClose}>
      <label className="field">
        <span>店舗名</span>
        <input
          type="text"
          value={name}
          placeholder="例: ○○スーパー △△店"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              e.preventDefault()
              submit()
            }
          }}
        />
      </label>
      <button type="button" className="btn primary" style={{ width: '100%' }} onClick={submit}>
        白紙のマップで作成
      </button>
      <p className="muted" style={{ textAlign: 'center', margin: '10px 0' }}>
        または
      </p>
      <button
        type="button"
        className="btn"
        style={{ width: '100%' }}
        onClick={() => {
          onCreateSample()
          setName('')
          onClose()
        }}
      >
        サンプル店舗を追加
      </button>
    </Sheet>
  )
}
