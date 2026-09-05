import { useMemo, useState } from 'react'
import { Sheet } from '../components/Sheet'
import { ViewSwitch } from '../components/ViewSwitch'
import { PALETTE } from '../data/palette'
import { buildIndex, detectCategory } from '../lib/genre'
import { useAppStore } from '../store/useAppStore'
import type { Category } from '../types'

const SETTINGS_VIEWS = [
  { id: 'settings' as const, label: '設定' },
  { id: 'map' as const, label: 'マップ' },
  { id: 'genre' as const, label: 'ジャンル' },
]

export function GenreScreen() {
  const categories = useAppStore((s) => s.categories)
  const aliases = useAppStore((s) => s.aliases)
  const setSettingsView = useAppStore((s) => s.setSettingsView)
  const { addCategory, updateCategory, deleteCategory, resetCategories, forgetAlias } = useAppStore()

  const [editing, setEditing] = useState<string | null>(null)
  const [keyword, setKeyword] = useState('')
  const [probe, setProbe] = useState('')
  const [aliasSheet, setAliasSheet] = useState(false)

  const index = useMemo(() => buildIndex(categories), [categories])
  const probeResult = useMemo(
    () => (probe.trim() ? detectCategory(probe, categories, aliases, index) : null),
    [aliases, categories, index, probe],
  )

  const target: Category | null = editing ? (categories.find((c) => c.id === editing) ?? null) : null
  const aliasEntries = Object.entries(aliases)

  return (
    <div className="screen">
      <ViewSwitch options={SETTINGS_VIEWS} active="genre" onChange={setSettingsView} />
      <div className="card">
        <h2>ジャンル判定を試す</h2>
        <input
          type="text"
          value={probe}
          placeholder="例: 冷凍うどん"
          onChange={(e) => setProbe(e.target.value)}
        />
        {probe.trim() && (
          <p className="muted" style={{ marginBottom: 0, marginTop: 8 }}>
            {probeResult ? (
              <>
                <span
                  className="dot"
                  style={{
                    display: 'inline-block',
                    width: 9,
                    height: 9,
                    borderRadius: '50%',
                    marginRight: 6,
                    background: categories.find((c) => c.id === probeResult.categoryId)?.color,
                  }}
                />
                <strong>{categories.find((c) => c.id === probeResult.categoryId)?.name}</strong>
                {' — 決め手: 「'}
                {probeResult.matchedKeyword}」／確信度 {Math.round(probeResult.score * 100)}%
              </>
            ) : (
              '該当なし。ジャンルの語彙に追加するか、リスト画面で手動指定すると次回から覚えます。'
            )}
          </p>
        )}
      </div>

      <div className="card">
        <div className="row" style={{ marginBottom: 8 }}>
          <h2 style={{ margin: 0 }}>商品ジャンル（{categories.length}）</h2>
          <span className="spacer" />
          <button
            type="button"
            className="btn slim"
            onClick={() => setEditing(addCategory('新しいジャンル', PALETTE[categories.length % PALETTE.length]))}
          >
            ＋ 追加
          </button>
        </div>
        <ul className="list-rows">
          {categories.map((c) => (
            <li key={c.id}>
              <span
                style={{ width: 30, height: 30, borderRadius: '50%', background: c.color, flex: 'none' }}
              />
              <span className="grow">
                <span className="title">{c.name}</span>
                <span className="muted">語彙 {c.keywords.length} 語</span>
              </span>
              <button type="button" className="btn slim accent" onClick={() => setEditing(c.id)}>
                編集
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="card">
        <h2>覚えた言い換え（{aliasEntries.length}）</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          リスト画面で手動でジャンルを選ぶと、その言葉を覚えて次回から自動判定します。
        </p>
        <button type="button" className="btn" style={{ width: '100%' }} onClick={() => setAliasSheet(true)}>
          一覧を見る
        </button>
      </div>

      <div className="card">
        <h2>データ</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          全体のバックアップの書き出し・読み込みは「設定」タブから行えます。
        </p>
        <button
          type="button"
          className="btn slim danger"
          onClick={() => {
            if (window.confirm('ジャンルを初期状態に戻します。追加・編集した語彙は失われます。よろしいですか？')) {
              resetCategories()
            }
          }}
        >
          ジャンルを初期化
        </button>
      </div>

      <Sheet open={target != null} title="ジャンルの編集" onClose={() => setEditing(null)}>
        {target && (
          <>
            <label className="field">
              <span>名前</span>
              <input
                type="text"
                value={target.name}
                onChange={(e) => updateCategory(target.id, { name: e.target.value })}
              />
            </label>

            <span className="muted">色</span>
            <div className="row wrap" style={{ margin: '6px 0 14px' }}>
              {PALETTE.map((color) => (
                <button
                  key={color}
                  type="button"
                  aria-label={`色 ${color}`}
                  onClick={() => updateCategory(target.id, { color })}
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 8,
                    background: color,
                    border: target.color === color ? '3px solid var(--text)' : '1px solid var(--border)',
                    cursor: 'pointer',
                  }}
                />
              ))}
            </div>

            <span className="muted">判定に使う語彙（{target.keywords.length}）</span>
            <div className="row" style={{ margin: '6px 0 8px' }}>
              <input
                type="text"
                value={keyword}
                placeholder="語を追加"
                onChange={(e) => setKeyword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing && keyword.trim()) {
                    e.preventDefault()
                    updateCategory(target.id, {
                      keywords: [...new Set([...target.keywords, keyword.trim()])],
                    })
                    setKeyword('')
                  }
                }}
              />
              <button
                type="button"
                className="btn"
                disabled={!keyword.trim()}
                onClick={() => {
                  updateCategory(target.id, { keywords: [...new Set([...target.keywords, keyword.trim()])] })
                  setKeyword('')
                }}
              >
                追加
              </button>
            </div>
            <div className="keywords">
              {target.keywords.map((kw) => (
                <span key={kw} className="kw">
                  {kw}
                  <button
                    type="button"
                    aria-label={`${kw} を削除`}
                    onClick={() =>
                      updateCategory(target.id, { keywords: target.keywords.filter((k) => k !== kw) })
                    }
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>

            <button
              type="button"
              className="btn danger"
              style={{ width: '100%', marginTop: 16 }}
              onClick={() => {
                if (window.confirm(`「${target.name}」を削除します。棚とリストからも外れます。`)) {
                  deleteCategory(target.id)
                  setEditing(null)
                }
              }}
            >
              このジャンルを削除
            </button>
          </>
        )}
      </Sheet>

      <Sheet open={aliasSheet} title="覚えた言い換え" onClose={() => setAliasSheet(false)}>
        {aliasEntries.length === 0 ? (
          <p className="muted">まだありません。</p>
        ) : (
          <ul className="list-rows">
            {aliasEntries.map(([key, catId]) => (
              <li key={key}>
                <span className="grow">
                  <span className="title">{key}</span>
                  <span className="muted">→ {categories.find((c) => c.id === catId)?.name ?? '（削除済み）'}</span>
                </span>
                <button type="button" className="btn slim danger" onClick={() => forgetAlias(key)}>
                  忘れる
                </button>
              </li>
            ))}
          </ul>
        )}
      </Sheet>
    </div>
  )
}
