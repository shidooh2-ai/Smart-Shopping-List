import { useMemo, useRef, useState } from 'react'
import { Sheet } from '../components/Sheet'
import { ViewSwitch } from '../components/ViewSwitch'
import { buildIndex, detectCategory } from '../lib/genre'
import { useAppStore } from '../store/useAppStore'
import type { Category } from '../types'

const STORE_VIEWS = [
  { id: 'map' as const, label: 'マップ' },
  { id: 'genre' as const, label: 'ジャンル' },
]

const PALETTE = [
  '#7cb342', '#ef6c00', '#d84315', '#0288d1', '#f9a825', '#a1887f', '#8d6e63', '#fdd835',
  '#4db6ac', '#4fc3f7', '#ff7043', '#bcaaa4', '#90a4ae', '#ffb300', '#ec407a', '#29b6f6',
  '#7e57c2', '#78909c', '#26a69a', '#ab47bc', '#f06292', '#6d4c41', '#66bb6a', '#5c6bc0',
]

export function GenreScreen() {
  const categories = useAppStore((s) => s.categories)
  const aliases = useAppStore((s) => s.aliases)
  const stores = useAppStore((s) => s.stores)
  const lists = useAppStore((s) => s.lists)
  const purchased = useAppStore((s) => s.purchased)
  const nickname = useAppStore((s) => s.nickname)
  const setStoreView = useAppStore((s) => s.setStoreView)
  const { addCategory, updateCategory, deleteCategory, resetCategories, forgetAlias, replaceAll } = useAppStore()

  const [editing, setEditing] = useState<string | null>(null)
  const [keyword, setKeyword] = useState('')
  const [probe, setProbe] = useState('')
  const [aliasSheet, setAliasSheet] = useState(false)
  const fileRef = useRef<HTMLInputElement | null>(null)

  const index = useMemo(() => buildIndex(categories), [categories])
  const probeResult = useMemo(
    () => (probe.trim() ? detectCategory(probe, categories, aliases, index) : null),
    [aliases, categories, index, probe],
  )

  const target: Category | null = editing ? (categories.find((c) => c.id === editing) ?? null) : null
  const aliasEntries = Object.entries(aliases)

  const exportData = () => {
    const payload = JSON.stringify(
      {
        app: 'smart-shopping-list',
        version: 1,
        exportedAt: new Date().toISOString(),
        stores,
        lists,
        categories,
        aliases,
        purchased,
        nickname,
      },
      null,
      2,
    )
    const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `shopping-route-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const importData = async (file: File) => {
    try {
      const data = JSON.parse(await file.text())
      if (!data || typeof data !== 'object') throw new Error('形式が違います')
      replaceAll({
        stores: Array.isArray(data.stores) ? data.stores : undefined,
        lists: Array.isArray(data.lists) ? data.lists : undefined,
        categories: Array.isArray(data.categories) ? data.categories : undefined,
        aliases: data.aliases && typeof data.aliases === 'object' ? data.aliases : undefined,
        purchased: Array.isArray(data.purchased) ? data.purchased : undefined,
        nickname: typeof data.nickname === 'string' ? data.nickname : undefined,
      })
      window.alert('読み込みました。')
    } catch (e) {
      window.alert(`読み込めませんでした: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return (
    <div className="screen">
      <ViewSwitch options={STORE_VIEWS} active="genre" onChange={setStoreView} />
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
          リスト・マップ・ジャンルはこの端末の中だけに保存されます。機種変更の前にバックアップしてください。
        </p>
        <div className="row wrap">
          <button type="button" className="btn slim" onClick={exportData}>
            書き出す（JSON）
          </button>
          <button type="button" className="btn slim" onClick={() => fileRef.current?.click()}>
            読み込む
          </button>
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
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void importData(f)
            e.target.value = ''
          }}
        />
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
