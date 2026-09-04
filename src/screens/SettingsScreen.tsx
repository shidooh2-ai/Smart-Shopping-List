import { useState } from 'react'
import { ViewSwitch } from '../components/ViewSwitch'
import { THEMES } from '../data/themes'
import { isWakeLockSupported } from '../lib/wakeLock'
import { useAppStore } from '../store/useAppStore'

const SETTINGS_VIEWS = [
  { id: 'settings' as const, label: '設定' },
  { id: 'map' as const, label: 'マップ' },
  { id: 'genre' as const, label: 'ジャンル' },
]

export function SettingsScreen() {
  const nickname = useAppStore((s) => s.nickname)
  const setNickname = useAppStore((s) => s.setNickname)
  const screenWakeLockEnabled = useAppStore((s) => s.screenWakeLockEnabled)
  const setScreenWakeLockEnabled = useAppStore((s) => s.setScreenWakeLockEnabled)
  const setSettingsView = useAppStore((s) => s.setSettingsView)
  const theme = useAppStore((s) => s.theme)
  const setTheme = useAppStore((s) => s.setTheme)
  const [name, setName] = useState(nickname)
  const wakeLockSupported = isWakeLockSupported()

  return (
    <div className="screen">
      <ViewSwitch options={SETTINGS_VIEWS} active="settings" onChange={setSettingsView} />
      <div className="card">
        <h2>ニックネーム</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          リストに品目を追加すると、このニックネームが「追加した人」として品目に表示されます。
        </p>
        <input
          type="text"
          value={name}
          placeholder="例: たろう"
          onChange={(e) => setName(e.target.value)}
          onBlur={() => setNickname(name.trim())}
        />
      </div>

      <div className="card">
        <h2>テーマ</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          「デフォルト」は端末のライト／ダーク設定に合わせて自動で切り替わります。
        </p>
        <div className="theme-grid">
          {THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-pressed={theme === t.id}
              onClick={() => setTheme(t.id)}
            >
              <span className="theme-preview" data-theme={t.id === 'default' ? undefined : t.id}>
                <i style={{ background: 'var(--surface)', border: '1px solid var(--border)' }} />
                <i style={{ background: 'var(--accent)' }} />
                <i style={{ background: 'var(--coral)' }} />
              </span>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <h2>画面表示</h2>
        <label className="settings-row">
          <span className="grow">
            <span className="title">画面ロックを無効化</span>
            <span className="muted">
              有効にすると、このアプリを開いている間は画面が自動で暗くなりません。買い物中の利用を想定しています。
            </span>
          </span>
          <input
            type="checkbox"
            checked={screenWakeLockEnabled}
            disabled={!wakeLockSupported}
            onChange={(e) => setScreenWakeLockEnabled(e.target.checked)}
            aria-label="画面ロックを無効化"
          />
        </label>
        {!wakeLockSupported && (
          <p className="muted" style={{ marginBottom: 0 }}>
            この端末・ブラウザでは対応していません。
          </p>
        )}
      </div>

      <div className="card">
        <h2>他のユーザーとの共有</h2>
        <p className="muted" style={{ marginTop: 0, marginBottom: 0 }}>
          iCloud経由でリストや店舗マップを共有する機能は準備中です。有料のApple Developer
          Programへの登録が必要なため、現在は無効になっています。有効になると、共有相手が追加した品目にも上のニックネームが表示されます。
        </p>
      </div>
    </div>
  )
}
