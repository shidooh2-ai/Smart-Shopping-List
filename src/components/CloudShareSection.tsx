import { useState } from 'react'
import { isCloudSyncSupported } from '../lib/cloudSync'
import type { CloudLink } from '../types'

export interface CloudShareSectionProps {
  cloud?: CloudLink
  onShare: () => Promise<void>
  onUnshare: () => Promise<void>
}

/** 店舗マップ・買い物リストの設定シートに埋め込む、iCloud共有の操作パネル。Web版では何も表示しない。 */
export function CloudShareSection({ cloud, onShare, onUnshare }: CloudShareSectionProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isCloudSyncSupported()) return null

  const run = (fn: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    fn()
      .catch((e: unknown) => {
        setError(
          e instanceof Error ? e.message : 'iCloudとの通信に失敗しました。iCloudにサインインしているか確認してください。',
        )
      })
      .finally(() => setBusy(false))
  }

  return (
    <div style={{ margin: '14px 0' }}>
      <span className="muted">iCloudで共有</span>
      {cloud ? (
        <div className="row" style={{ marginTop: 6 }}>
          <span className="chip">{cloud.owner ? '共有中（自分が共有元）' : '共有されています'}</span>
          <span className="spacer" />
          <button type="button" className="btn slim danger" disabled={busy} onClick={() => run(onUnshare)}>
            {cloud.owner ? '共有を停止' : '共有から離れる'}
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="btn"
          style={{ width: '100%', marginTop: 6 }}
          disabled={busy}
          onClick={() => run(onShare)}
        >
          {busy ? '準備中…' : '家族・友人と共有する'}
        </button>
      )}
      {error && (
        <div className="banner" style={{ marginTop: 6 }}>
          {error}
        </div>
      )}
    </div>
  )
}
