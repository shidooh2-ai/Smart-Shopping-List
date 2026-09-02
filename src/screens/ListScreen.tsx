import { useMemo, useRef, useState } from 'react'
import { AddStoreSheet } from '../components/AddStoreSheet'
import { CategoryPicker } from '../components/CategoryPicker'
import { CloudShareSection } from '../components/CloudShareSection'
import { Sheet } from '../components/Sheet'
import { useActiveList, useAppStore } from '../store/useAppStore'
import type { Category, ShoppingItem } from '../types'

export function ListScreen() {
  const list = useActiveList()
  const categories = useAppStore((s) => s.categories)
  const stores = useAppStore((s) => s.stores)
  const lists = useAppStore((s) => s.lists)
  const {
    addItems,
    toggleItem,
    removeItem,
    renameItem,
    setItemCategory,
    clearChecked,
    uncheckAll,
    redetectCategories,
    setListStore,
    createList,
    deleteList,
    renameList,
    setActiveList,
    setTab,
    createStore,
    addSampleStore,
    shareList,
    unshareList,
  } = useAppStore()

  const [draft, setDraft] = useState('')
  const [grouped, setGrouped] = useState(true)
  const [pickerItem, setPickerItem] = useState<string | null>(null)
  const [listSheet, setListSheet] = useState(false)
  const [addStoreSheet, setAddStoreSheet] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)

  const byId = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories])

  if (!list) {
    return (
      <div className="screen">
        <div className="empty">
          リストがありません。
          <br />
          <button type="button" className="btn primary" style={{ marginTop: 12 }} onClick={() => createList()}>
            リストを作る
          </button>
        </div>
      </div>
    )
  }

  const submit = () => {
    if (!draft.trim()) return
    addItems(list.id, draft)
    setDraft('')
    inputRef.current?.focus()
  }

  const remaining = list.items.filter((i) => !i.checked).length
  const unresolved = list.items.filter((i) => !i.checked && !i.categoryId).length

  const groups = useMemo(() => {
    if (!grouped) return [{ category: null as Category | null, items: list.items }]
    const out: Array<{ category: Category | null; items: ShoppingItem[] }> = []
    for (const c of categories) {
      const items = list.items.filter((i) => i.categoryId === c.id)
      if (items.length > 0) out.push({ category: c, items })
    }
    const rest = list.items.filter((i) => !i.categoryId || !byId.has(i.categoryId))
    if (rest.length > 0) out.push({ category: null, items: rest })
    return out
  }, [byId, categories, grouped, list.items])

  const editing = pickerItem ? list.items.find((i) => i.id === pickerItem) : null

  return (
    <div className="screen">
      <div className="card">
        <div className="row" style={{ marginBottom: 10 }}>
          <strong style={{ flex: 1, minWidth: 0 }}>{list.name}</strong>
          <button type="button" className="btn slim" onClick={() => setListSheet(true)}>
            リスト管理
          </button>
        </div>
        <span className="muted" style={{ display: 'block', marginBottom: 4 }}>
          買い物する店舗
        </span>
        <div className="row" style={{ marginBottom: 0 }}>
          <select
            value={list.storeId ?? ''}
            onChange={(e) => setListStore(list.id, e.target.value || null)}
            style={{ flex: 1 }}
          >
            <option value="">（未選択）</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <button type="button" className="btn slim" onClick={() => setAddStoreSheet(true)}>
            ＋ 追加
          </button>
        </div>
        {!list.storeId && (
          <p className="muted" style={{ marginBottom: 0, marginTop: 8 }}>
            店舗を選ぶとルートを作成できます。マップの作り方は
            <button type="button" className="btn slim" style={{ margin: '0 4px' }} onClick={() => setTab('map')}>
              マップ画面
            </button>
            から。
          </p>
        )}
      </div>

      <AddStoreSheet
        open={addStoreSheet}
        onClose={() => setAddStoreSheet(false)}
        onCreate={(name) => setListStore(list.id, createStore(name))}
        onCreateSample={() => setListStore(list.id, addSampleStore())}
      />

      <div className="card">
        <div className="additem">
          <textarea
            ref={inputRef}
            rows={1}
            value={draft}
            placeholder="買うもの（例: 牛乳、にんじん 2本）"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                submit()
              }
            }}
          />
          <button type="button" className="btn primary" onClick={submit} disabled={!draft.trim()}>
            追加
          </button>
        </div>
        <p className="muted" style={{ margin: '8px 0 0' }}>
          改行や読点で区切ると、まとめて追加できます。
        </p>
      </div>

      <div className="card">
        <div className="row" style={{ marginBottom: 6 }}>
          <h2 style={{ margin: 0 }}>
            未購入 {remaining} / 全 {list.items.length} 件
          </h2>
          <span className="spacer" />
          <button type="button" className="btn slim" onClick={() => setGrouped((v) => !v)}>
            {grouped ? '入力順' : 'ジャンル別'}
          </button>
        </div>

        {unresolved > 0 && (
          <div className="banner">
            ジャンル未設定が {unresolved} 件あります。タップして選ぶと次回から自動で判定します。
          </div>
        )}

        {list.items.length === 0 ? (
          <div className="empty">
            まだ何も入っていません。
            <br />
            「牛乳」「にんじん 2本」のように入力してください。
          </div>
        ) : (
          groups.map((g, gi) => (
            <div key={g.category?.id ?? `none-${gi}`}>
              {grouped && (
                <div className="group-head">
                  <span
                    className="dot"
                    style={{
                      width: 9,
                      height: 9,
                      borderRadius: '50%',
                      background: g.category?.color ?? 'var(--text-dim)',
                    }}
                  />
                  {g.category?.name ?? 'ジャンル未設定'}（{g.items.length}）
                </div>
              )}
              <ul className="items">
                {g.items.map((item) => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    category={item.categoryId ? (byId.get(item.categoryId) ?? null) : null}
                    onToggle={() => toggleItem(list.id, item.id)}
                    onRename={(t) => renameItem(list.id, item.id, t)}
                    onRemove={() => removeItem(list.id, item.id)}
                    onPickCategory={() => setPickerItem(item.id)}
                  />
                ))}
              </ul>
            </div>
          ))
        )}
      </div>

      {list.items.length > 0 && (
        <div className="card">
          <div className="row wrap">
            <button type="button" className="btn slim" onClick={() => redetectCategories(list.id)}>
              ジャンルを再判定
            </button>
            <button type="button" className="btn slim" onClick={() => uncheckAll(list.id)}>
              チェックを全部外す
            </button>
            <button type="button" className="btn slim danger" onClick={() => clearChecked(list.id)}>
              購入済みを削除
            </button>
          </div>
        </div>
      )}

      <CategoryPicker
        open={editing !== null && editing !== undefined}
        title={editing ? `「${editing.text}」のジャンル` : 'ジャンル'}
        categories={categories}
        selected={editing?.categoryId ? [editing.categoryId] : []}
        allowNone
        onToggle={(catId) => {
          if (editing) setItemCategory(list.id, editing.id, catId)
        }}
        onClose={() => setPickerItem(null)}
      />

      <Sheet open={listSheet} title="リスト管理" onClose={() => setListSheet(false)}>
        <label className="field">
          <span>このリストの名前</span>
          <input type="text" value={list.name} onChange={(e) => renameList(list.id, e.target.value)} />
        </label>
        <CloudShareSection
          cloud={list.cloud}
          onShare={() => shareList(list.id)}
          onUnshare={() => unshareList(list.id)}
        />
        <ul className="list-rows">
          {lists.map((l) => (
            <li key={l.id}>
              <button
                type="button"
                className="btn slim"
                style={{ flex: 1, justifyContent: 'flex-start', textAlign: 'left' }}
                aria-pressed={l.id === list.id}
                onClick={() => {
                  setActiveList(l.id)
                  setListSheet(false)
                }}
              >
                {l.id === list.id ? '● ' : '　'}
                {l.name}（{l.items.filter((i) => !i.checked).length}件）
              </button>
              {lists.length > 1 && (
                <button type="button" className="btn slim danger" onClick={() => deleteList(l.id)}>
                  削除
                </button>
              )}
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="btn primary"
          style={{ width: '100%', marginTop: 12 }}
          onClick={() => {
            createList(`買い物リスト ${lists.length + 1}`)
            setListSheet(false)
          }}
        >
          新しいリストを作る
        </button>
      </Sheet>
    </div>
  )
}

interface ItemRowProps {
  item: ShoppingItem
  category: Category | null
  onToggle: () => void
  onRename: (text: string) => void
  onRemove: () => void
  onPickCategory: () => void
}

function ItemRow({ item, category, onToggle, onRename, onRemove, onPickCategory }: ItemRowProps) {
  const [text, setText] = useState(item.text)
  const uncertain = !item.manual && item.confidence > 0 && item.confidence < 0.8

  return (
    <li className={`item${item.checked ? ' done' : ''}`}>
      <button
        type="button"
        className="swatch"
        style={{ background: category?.color ?? 'var(--outline)' }}
        onClick={onPickCategory}
        aria-label={category ? `ジャンル: ${category.name}` : 'ジャンルを選ぶ'}
      />
      <div className="body">
        <input
          className="name"
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => {
            const next = text.trim()
            if (next && next !== item.text) onRename(next)
            else setText(item.text)
          }}
        />
        <button
          type="button"
          className={`chip${category ? '' : ' unknown'}${uncertain ? ' guess' : ''}`}
          onClick={onPickCategory}
          title={uncertain ? '自動判定の確信度が低めです' : undefined}
        >
          {category ? category.name : 'ジャンル未設定'}
        </button>
      </div>
      <input
        className="check"
        type="checkbox"
        checked={item.checked}
        onChange={onToggle}
        aria-label={`${item.text} を購入済みにする`}
      />
      <button type="button" className="remove" onClick={onRemove} aria-label={`${item.text} を削除`}>
        ×
      </button>
    </li>
  )
}
