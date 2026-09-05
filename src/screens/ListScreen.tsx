import { type UIEvent, useMemo, useRef, useState } from 'react'
import { CategoryPicker } from '../components/CategoryPicker'
import { CloudShareSection } from '../components/CloudShareSection'
import { PurchasedSheet } from '../components/PurchasedSheet'
import { Sheet } from '../components/Sheet'
import { PALETTE } from '../data/palette'
import { combinedCategories } from '../lib/genre'
import { purchaseContributions } from '../lib/listActivity'
import { WEEKDAY_LABELS, describeReminder, isReminderSupported } from '../lib/reminders'
import { computeStreak, computeTimeTrend } from '../lib/tripStats'
import { useActiveList, useAppStore, useListStore } from '../store/useAppStore'
import type { Category, CloudLink, ListNotificationPrefs, ListReminder, ReminderRepeat, ShoppingItem } from '../types'

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

const REPEAT_OPTIONS: Array<{ id: ReminderRepeat; label: string }> = [
  { id: 'once', label: '1回だけ' },
  { id: 'daily', label: '毎日' },
  { id: 'weekly', label: '毎週' },
]

/** リマインダーをオンにしたときの初期値 */
const DEFAULT_REMINDER: ListReminder = { enabled: true, time: '18:00', repeat: 'daily' }

/** 「リスト管理」シート内の表示状態。一覧か、既存/新規リストの名前・色編集か。 */
type ListSheetMode = { kind: 'menu' } | { kind: 'edit'; listId: string } | { kind: 'new' }

export function ListScreen() {
  const list = useActiveList()
  const globalCategories = useAppStore((s) => s.categories)
  const store = useListStore(list)
  const categories = useMemo(() => combinedCategories(globalCategories, store), [globalCategories, store])
  const lists = useAppStore((s) => s.lists)
  const tripHistory = useAppStore((s) => s.tripHistory)
  const {
    addItems,
    toggleItem,
    removeItem,
    renameItem,
    setItemCategory,
    clearChecked,
    uncheckAll,
    redetectCategories,
    markPurchased,
    createList,
    deleteList,
    updateList,
    setListReminder,
    setListNotificationPrefs,
    setActiveList,
    shareList,
    unshareList,
  } = useAppStore()

  const [draft, setDraft] = useState('')
  const [grouped, setGrouped] = useState(true)
  const [pickerItem, setPickerItem] = useState<string | null>(null)
  const [listSheetMode, setListSheetMode] = useState<ListSheetMode | null>(null)
  const [purchasedSheet, setPurchasedSheet] = useState(false)
  const [addSheet, setAddSheet] = useState(false)
  const [sheetDraft, setSheetDraft] = useState('')
  const [fabVisible, setFabVisible] = useState(true)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const sheetInputRef = useRef<HTMLTextAreaElement | null>(null)
  const lastScrollTop = useRef(0)

  const byId = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories])

  /**
   * 下へスクロール中は追加ボタンを引っ込め、上へ戻したときと先頭付近では出す。
   * 本文の上に常時かぶらないようにするための処理。
   */
  const onScreenScroll = (e: UIEvent<HTMLDivElement>) => {
    const top = e.currentTarget.scrollTop
    const delta = top - lastScrollTop.current
    if (Math.abs(delta) < 6) return
    lastScrollTop.current = top
    setFabVisible(delta < 0 || top < 40)
  }

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

  /** 右下の追加ボタンから開くシート。続けて何個も足せるよう、追加後も開いたままにする。 */
  const submitFromSheet = () => {
    if (!sheetDraft.trim()) return
    addItems(list.id, sheetDraft)
    setSheetDraft('')
    sheetInputRef.current?.focus()
  }

  const remaining = list.items.filter((i) => !i.checked).length
  const unresolved = list.items.filter((i) => !i.checked && !i.categoryId).length
  const checkedCount = list.items.length - remaining

  // 続けたくなる仕掛け: 何日連続で買い物したか・前回より速いか・(共有中なら)誰が貢献したか
  const streak = computeStreak(tripHistory)
  const timeTrend = computeTimeTrend(tripHistory, list.id)
  const contributions = list.cloud ? purchaseContributions(list.activity, Date.now() - WEEK_MS) : []
  const showStats = streak > 0 || timeTrend !== null || contributions.length > 0

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
    <div className="screen" onScroll={onScreenScroll}>
      <div className="card">
        <div className="row" style={{ marginBottom: 10 }}>
          <span
            style={{ width: 14, height: 14, borderRadius: '50%', background: list.color ?? 'var(--outline)', flex: 'none' }}
          />
          <strong style={{ flex: 1, minWidth: 0 }}>{list.name}</strong>
          <button type="button" className="btn slim" onClick={() => setPurchasedSheet(true)}>
            🧾 購入済み
          </button>
          <button type="button" className="btn slim" onClick={() => setListSheetMode({ kind: 'menu' })}>
            リスト管理
          </button>
        </div>
      </div>

      {showStats && (
        <div className="card">
          <div className="stats-row">
            {streak > 0 && (
              <span className="stat-pill">
                <span className="emoji">🔥</span>
                {streak}日連続
              </span>
            )}
            {timeTrend && (
              <span className="stat-pill">
                <span className="emoji">⏱</span>
                前回 {timeTrend.latestMinutes}分
                {timeTrend.deltaMinutes > 0
                  ? `（平均より${timeTrend.deltaMinutes}分速い）`
                  : timeTrend.deltaMinutes < 0
                    ? `（平均より${-timeTrend.deltaMinutes}分遅い）`
                    : '（平均と同じくらい）'}
              </span>
            )}
          </div>
          {contributions.length > 0 && (
            <>
              <p className="muted" style={{ margin: '10px 0 0' }}>
                今週の貢献
              </p>
              <ul className="contribution-list">
                {contributions.map((c) => (
                  <li key={c.by}>
                    <span className="count">{c.count}回</span>
                    {c.by === '誰か' ? c.by : `${c.by}さん`}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

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
        <p className="muted" style={{ margin: '8px 0 12px' }}>
          改行や読点で区切ると、まとめて追加できます。
        </p>

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
            <button
              type="button"
              className="btn slim"
              disabled={checkedCount === 0}
              onClick={() => markPurchased(list.id, list.items.filter((i) => i.checked).map((i) => i.id))}
            >
              まとめて購入済みにする
            </button>
            <button
              type="button"
              className="btn slim danger"
              disabled={checkedCount === 0}
              onClick={() => clearChecked(list.id)}
            >
              まとめて削除
            </button>
          </div>
        </div>
      )}

      {/* 画面上部の追加欄は親指から遠いので、片手で届く右下にも追加ボタンを置く。
          本文が読めなくならないよう、下方向へスクロール中は引っ込める。 */}
      <button
        type="button"
        className={`fab${fabVisible ? '' : ' hidden'}`}
        onClick={() => {
          setAddSheet(true)
          setFabVisible(true)
        }}
        aria-label="買うものを追加"
      >
        <span aria-hidden="true">＋</span>
      </button>

      <Sheet
        open={addSheet}
        title="買うものを追加"
        onClose={() => {
          setAddSheet(false)
          setSheetDraft('')
        }}
        footer={
          <button
            type="button"
            className="btn primary"
            style={{ width: '100%' }}
            onClick={submitFromSheet}
            disabled={!sheetDraft.trim()}
          >
            追加
          </button>
        }
      >
        <textarea
          ref={sheetInputRef}
          rows={2}
          autoFocus
          value={sheetDraft}
          placeholder="買うもの（例: 牛乳、にんじん 2本）"
          onChange={(e) => setSheetDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              submitFromSheet()
            }
          }}
        />
        <p className="muted" style={{ marginBottom: 0 }}>
          改行や読点で区切ると、まとめて追加できます。追加してもこの画面は開いたままなので、続けて入力できます。
        </p>
        {list.items.length > 0 && (
          <p className="muted" style={{ marginBottom: 0 }}>
            いま {list.items.length} 件（未購入 {remaining} 件）
          </p>
        )}
      </Sheet>

      <PurchasedSheet open={purchasedSheet} onClose={() => setPurchasedSheet(false)} categories={categories} />

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

      <Sheet
        open={listSheetMode !== null}
        title={
          listSheetMode?.kind === 'new' ? '新しいリストを作る' : listSheetMode?.kind === 'edit' ? 'リストの編集' : 'リスト管理'
        }
        onClose={() => setListSheetMode(null)}
      >
        {listSheetMode?.kind === 'menu' && (
          <>
            <ul className="list-rows">
              {lists.map((l) => (
                <li key={l.id}>
                  <button
                    type="button"
                    className="btn slim"
                    style={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      justifyContent: 'flex-start',
                      textAlign: 'left',
                    }}
                    aria-pressed={l.id === list.id}
                    onClick={() => {
                      setActiveList(l.id)
                      setListSheetMode(null)
                    }}
                  >
                    <span
                      style={{
                        width: 12,
                        height: 12,
                        borderRadius: '50%',
                        background: l.color ?? 'var(--outline)',
                        flex: 'none',
                      }}
                    />
                    {l.id === list.id ? '● ' : '　'}
                    {l.name}（{l.items.filter((i) => !i.checked).length}件）
                  </button>
                  <button
                    type="button"
                    className="btn slim"
                    onClick={() => setListSheetMode({ kind: 'edit', listId: l.id })}
                  >
                    編集
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
              onClick={() => setListSheetMode({ kind: 'new' })}
            >
              新しいリストを作る
            </button>
          </>
        )}

        {listSheetMode?.kind === 'edit' &&
          (() => {
            const target = lists.find((l) => l.id === listSheetMode.listId)
            if (!target) return null
            return (
              <ListEditForm
                key={target.id}
                initialName={target.name}
                initialColor={target.color ?? PALETTE[0]}
                cloud={target.cloud}
                initialReminder={target.reminder}
                initialNotificationPrefs={target.notifications}
                onShare={() => shareList(target.id)}
                onUnshare={() => unshareList(target.id)}
                onBack={() => setListSheetMode({ kind: 'menu' })}
                onSave={(name, color, reminder, notifications) => {
                  updateList(target.id, { name, color })
                  setListReminder(target.id, reminder)
                  setListNotificationPrefs(target.id, notifications)
                  setListSheetMode({ kind: 'menu' })
                }}
              />
            )
          })()}

        {listSheetMode?.kind === 'new' && (
          <ListEditForm
            initialName={`買い物リスト ${lists.length + 1}`}
            initialColor={PALETTE[lists.length % PALETTE.length]}
            onBack={() => setListSheetMode({ kind: 'menu' })}
            onSave={(name, color) => {
              // 新規作成時はまだ共有できないので、リマインダー・通知はここでは扱わない
              createList(name, color)
              setListSheetMode(null)
            }}
          />
        )}
      </Sheet>
    </div>
  )
}

const DEFAULT_NOTIFICATION_PREFS: ListNotificationPrefs = { onAdd: true, onRemove: true, onPurchase: true }

interface ListEditFormProps {
  initialName: string
  initialColor: string
  /** 既存リストの編集時のみ渡す (新規作成時は保存前なので共有・リマインダーは設定できない) */
  cloud?: CloudLink
  initialReminder?: ListReminder
  initialNotificationPrefs?: ListNotificationPrefs
  onShare?: () => Promise<void>
  onUnshare?: () => Promise<void>
  onBack: () => void
  onSave: (name: string, color: string, reminder: ListReminder | null, notifications: ListNotificationPrefs) => void
}

/** リストの名前・マークの色・リマインダー・通知・共有を編集するフォーム。新規作成・既存リストの編集の両方で使う。 */
function ListEditForm({
  initialName,
  initialColor,
  cloud,
  initialReminder,
  initialNotificationPrefs,
  onShare,
  onUnshare,
  onBack,
  onSave,
}: ListEditFormProps) {
  const [name, setName] = useState(initialName)
  const [color, setColor] = useState(initialColor)
  const [reminder, setReminder] = useState<ListReminder | null>(initialReminder ?? null)
  const [notifications, setNotifications] = useState<ListNotificationPrefs>(
    initialNotificationPrefs ?? DEFAULT_NOTIFICATION_PREFS,
  )
  // 共有と同じく、リマインダーも保存済みのリストにだけ設定できる
  const canEditReminder = onShare !== undefined
  // 他の人の変更通知は、実際に共有中のリストでなければ意味が無い
  const isShared = cloud != null

  return (
    <>
      <label className="field">
        <span>リスト名</span>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
      </label>

      <span className="muted">マークの色</span>
      <div className="row wrap" style={{ margin: '6px 0 14px' }}>
        {PALETTE.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={`色 ${c}`}
            onClick={() => setColor(c)}
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              background: c,
              border: color === c ? '3px solid var(--text)' : '1px solid var(--border)',
              cursor: 'pointer',
            }}
          />
        ))}
      </div>

      {canEditReminder && <ReminderEditor reminder={reminder} onChange={setReminder} />}

      {onShare && onUnshare && <CloudShareSection cloud={cloud} onShare={onShare} onUnshare={onUnshare} />}

      {isShared && <NotificationPrefsEditor prefs={notifications} onChange={setNotifications} />}

      <div className="row" style={{ gap: 8, marginTop: 4 }}>
        <button type="button" className="btn" onClick={onBack}>
          戻る
        </button>
        <button
          type="button"
          className="btn primary"
          style={{ flex: 1 }}
          disabled={!name.trim()}
          onClick={() => onSave(name.trim(), color, reminder, notifications)}
        >
          保存
        </button>
      </div>
    </>
  )
}

interface ReminderEditorProps {
  reminder: ListReminder | null
  onChange: (reminder: ListReminder | null) => void
}

/** リストごとのリマインダー設定 (オン/オフ・時刻・繰り返し方)。 */
function ReminderEditor({ reminder, onChange }: ReminderEditorProps) {
  const enabled = reminder?.enabled ?? false
  const current = reminder ?? DEFAULT_REMINDER
  const patch = (changes: Partial<ListReminder>) => onChange({ ...current, ...changes, enabled: true })

  const toggleWeekday = (day: number) => {
    const weekdays = new Set(current.weekdays ?? [])
    if (weekdays.has(day)) weekdays.delete(day)
    else weekdays.add(day)
    patch({ weekdays: [...weekdays].sort() })
  }

  return (
    <div style={{ margin: '14px 0' }}>
      <label className="settings-row">
        <span className="grow">
          <span className="title">リマインダー</span>
          <span className="muted">{describeReminder(reminder ?? undefined)}</span>
        </span>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onChange(e.target.checked ? { ...current, enabled: true } : null)}
          aria-label="リマインダー"
        />
      </label>

      {enabled && (
        <div style={{ marginTop: 10 }}>
          <div className="floortabs" style={{ marginBottom: 10 }}>
            {REPEAT_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                aria-pressed={current.repeat === opt.id}
                onClick={() => patch({ repeat: opt.id })}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {current.repeat === 'once' && (
            <label className="field">
              <span>日付</span>
              <input
                type="date"
                value={current.date ?? ''}
                onChange={(e) => patch({ date: e.target.value || undefined })}
              />
            </label>
          )}

          {current.repeat === 'weekly' && (
            <>
              <span className="muted">曜日</span>
              <div className="row wrap" style={{ margin: '6px 0 10px' }}>
                {WEEKDAY_LABELS.map((label, day) => (
                  <button
                    key={label}
                    type="button"
                    className="btn slim"
                    aria-pressed={(current.weekdays ?? []).includes(day)}
                    onClick={() => toggleWeekday(day)}
                    style={{
                      minWidth: 40,
                      padding: '0 10px',
                      background: (current.weekdays ?? []).includes(day) ? 'var(--accent-weak)' : undefined,
                      color: (current.weekdays ?? []).includes(day) ? 'var(--accent)' : undefined,
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </>
          )}

          <label className="field" style={{ marginBottom: 0 }}>
            <span>時刻</span>
            <input type="time" value={current.time} onChange={(e) => patch({ time: e.target.value })} />
          </label>

          {!isReminderSupported() && (
            <p className="muted" style={{ marginBottom: 0 }}>
              通知が届くのはiPhoneアプリのときだけです。設定はこのまま保存できます。
            </p>
          )}
        </div>
      )}
    </div>
  )
}

const NOTIFICATION_KINDS: Array<{ key: keyof ListNotificationPrefs; label: string }> = [
  { key: 'onAdd', label: '追加' },
  { key: 'onRemove', label: '削除' },
  { key: 'onPurchase', label: '購入済みへ移動' },
]

interface NotificationPrefsEditorProps {
  prefs: ListNotificationPrefs
  onChange: (prefs: ListNotificationPrefs) => void
}

/** 共有リストで他の人が変更したときの通知を、種類ごとにオン/オフする。 */
function NotificationPrefsEditor({ prefs, onChange }: NotificationPrefsEditorProps) {
  return (
    <div style={{ margin: '14px 0' }}>
      <span className="muted" style={{ display: 'block', marginBottom: 6 }}>
        他の人の変更を通知
      </span>
      {NOTIFICATION_KINDS.map(({ key, label }) => (
        <label key={key} className="settings-row" style={{ marginBottom: 6 }}>
          <span className="grow title">{label}</span>
          <input
            type="checkbox"
            checked={prefs[key]}
            onChange={(e) => onChange({ ...prefs, [key]: e.target.checked })}
            aria-label={`「${label}」の通知`}
          />
        </label>
      ))}
      {!isReminderSupported() && (
        <p className="muted" style={{ marginBottom: 0 }}>
          通知が届くのはiPhoneアプリのときだけです。設定はこのまま保存できます。
        </p>
      )}
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
        {item.addedBy && (
          <span className="muted" style={{ marginLeft: 8 }}>
            追加: {item.addedBy}
          </span>
        )}
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
