import { useEffect, useMemo, useRef, useState } from 'react'
import { AddStoreSheet } from '../components/AddStoreSheet'
import { AiFloorPlanSheet } from '../components/AiFloorPlanSheet'
import { CategoryPicker } from '../components/CategoryPicker'
import { CloudShareSection } from '../components/CloudShareSection'
import { MapView } from '../components/MapView'
import { Sheet } from '../components/Sheet'
import { fileToBackgroundImage } from '../lib/aiFloorPlan'
import { cellAt, nodePos } from '../lib/grid'
import { newId } from '../lib/id'
import { NODE_STYLE } from '../lib/mapStyle'
import { type PaintTool, useAppStore } from '../store/useAppStore'
import type { NodeKind, StoreMap } from '../types'

type ToolId = 'select' | 'aisle' | 'wall' | 'shelf' | NodeKind

const TOOLS: Array<{ id: ToolId; label: string; swatch: string }> = [
  { id: 'select', label: '選択', swatch: 'transparent' },
  { id: 'shelf', label: '商品棚', swatch: '#9aa3ad' },
  { id: 'aisle', label: '通路', swatch: '#ffffff' },
  { id: 'wall', label: '壁', swatch: '#5b6068' },
  { id: 'entrance', label: '入口', swatch: NODE_STYLE.entrance.color },
  { id: 'checkout', label: 'レジ', swatch: NODE_STYLE.checkout.color },
  { id: 'stairs', label: '階段', swatch: NODE_STYLE.stairs.color },
  { id: 'elevator', label: 'EV', swatch: NODE_STYLE.elevator.color },
]

const isNodeTool = (t: ToolId): t is NodeKind =>
  t === 'entrance' || t === 'checkout' || t === 'stairs' || t === 'elevator'

const previewColorFor = (t: ToolId): string => {
  if (isNodeTool(t)) return NODE_STYLE[t].color
  if (t === 'wall') return '#5b6068'
  if (t === 'aisle') return '#c62828'
  return 'var(--accent)'
}

const hintFor = (t: ToolId): string => {
  if (t === 'select') return '棚や設備をタップすると設定できます。ドラッグで地図を動かせます。'
  if (isNodeTool(t)) return '置きたいマスを指で押さえたまま動かして位置を決め、離すと配置されます。'
  return 'ドラッグで範囲を囲み、指を離すとまとめて塗れます。1マスだけならタップでもOK。'
}

export function MapScreen() {
  const stores = useAppStore((s) => s.stores)
  const categories = useAppStore((s) => s.categories)
  const {
    createStore,
    addSampleStore,
    deleteStore,
    renameStore,
    setCellMeters,
    addFloor,
    updateFloor,
    resizeFloor,
    deleteFloor,
    updateShelf,
    deleteShelf,
    updateNode,
    paint,
    undoMap,
    redoMap,
    importFloorLayout,
    cleanupMap,
    shareStore,
    unshareStore,
  } = useAppStore()

  const [storeId, setStoreId] = useState<string | null>(stores[0]?.id ?? null)
  const [floorId, setFloorId] = useState<string | null>(null)
  const [tool, setTool] = useState<ToolId>('select')
  const [shelfId, setShelfId] = useState<string | null>(null)
  const [groupId, setGroupId] = useState<string | null>(null)
  const [shelfSheet, setShelfSheet] = useState<string | null>(null)
  const [nodeSheet, setNodeSheet] = useState<string | null>(null)
  const [floorSheet, setFloorSheet] = useState(false)
  const [storeSheet, setStoreSheet] = useState(false)
  const [addStoreSheet, setAddStoreSheet] = useState(false)
  const [catPicker, setCatPicker] = useState(false)
  const [aiSheet, setAiSheet] = useState(false)
  /** 背景画像と見比べるための、生成/編集したマップ側の一時的な不透明度 (保存はしない) */
  const [mapOverlayOpacity, setMapOverlayOpacity] = useState(1)
  const shelfRef = useRef<string | null>(null)
  const bgFileRef = useRef<HTMLInputElement | null>(null)

  const store: StoreMap | null = stores.find((s) => s.id === storeId) ?? stores[0] ?? null
  const floor = store ? (store.floors.find((f) => f.id === floorId) ?? store.floors[0]) : null
  const canUndo = useAppStore((s) => (store ? (s.mapHistory[store.id]?.length ?? 0) > 0 : false))
  const canRedo = useAppStore((s) => (store ? (s.mapRedo[store.id]?.length ?? 0) > 0 : false))

  const switchToStore = (id: string) => {
    setStoreId(id)
    setFloorId(null)
    setShelfId(null)
    shelfRef.current = null
  }

  // 編集を離れたら、マスを持たない棚やノードを片付ける
  useEffect(() => {
    return () => {
      if (store) cleanupMap(store.id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store?.id])

  const groups = useMemo(() => {
    if (!store || !isNodeTool(tool) || (tool !== 'stairs' && tool !== 'elevator')) return []
    const seen = new Map<string, number>()
    for (const n of store.nodes) {
      if (n.kind !== tool || !n.groupId) continue
      if (!seen.has(n.groupId)) seen.set(n.groupId, seen.size + 1)
    }
    return [...seen.entries()].map(([id, n]) => ({ id, label: `${NODE_STYLE[tool].label}${n}` }))
  }, [store, tool])

  if (!store || !floor) {
    return (
      <div className="screen">
        <div className="empty">
          店舗マップがありません。
          <div className="row" style={{ justifyContent: 'center', marginTop: 12 }}>
            <button type="button" className="btn primary" onClick={() => switchToStore(createStore('マイスーパー'))}>
              白紙から作る
            </button>
            <button type="button" className="btn" onClick={() => switchToStore(addSampleStore())}>
              サンプルを入れる
            </button>
          </div>
        </div>
      </div>
    )
  }

  const shelvesOnFloor = store.shelves.filter((s) => s.floorId === floor.id)
  const activeShelf = shelfSheet ? store.shelves.find((s) => s.id === shelfSheet) : null
  const activeNode = nodeSheet ? store.nodes.find((n) => n.id === nodeSheet) : null

  const handlePaint = (cells: Array<{ x: number; y: number }>) => {
    let payload: PaintTool
    if (tool === 'shelf') {
      // 新規棚のIDはここで払い出すだけ。実際の追加は paint() の中で塗りつぶしと
      // 同じ操作として行われるので、undo が1回で済む。
      let id = shelfRef.current
      if (!id) {
        id = newId('shelf')
        shelfRef.current = id
        setShelfId(id)
      }
      payload = { kind: 'shelf', shelfId: id }
    } else if (isNodeTool(tool)) {
      let gid = groupId ?? undefined
      if ((tool === 'stairs' || tool === 'elevator') && !gid) {
        gid = groups[0]?.id ?? `grp_${tool}_${Date.now().toString(36)}`
        setGroupId(gid)
      }
      payload = { kind: 'node', nodeKind: tool, name: NODE_STYLE[tool].label, groupId: gid }
    } else if (tool === 'aisle' || tool === 'wall') {
      payload = { kind: tool }
    } else {
      return
    }
    paint(store.id, floor.id, cells, payload)
  }

  const handleTapCell = (x: number, y: number) => {
    const cell = cellAt(floor, x, y)
    if (!cell) return
    if (cell.k === 'shelf') setShelfSheet(cell.shelfId)
    else if (cell.k === 'node') setNodeSheet(cell.nodeId)
  }

  const pickBackgroundImage = async (file: File) => {
    try {
      const dataUrl = await fileToBackgroundImage(file)
      updateFloor(store.id, floor.id, { backgroundImage: dataUrl, backgroundOpacity: floor.backgroundOpacity ?? 0.35 })
    } catch (e) {
      window.alert(`画像を読み込めませんでした: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return (
    <div className="screen">
      <div className="card">
        <div className="row">
          <select value={store.id} onChange={(e) => switchToStore(e.target.value)} style={{ flex: 1 }}>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <button type="button" className="btn slim" onClick={() => setAddStoreSheet(true)}>
            ＋ 追加
          </button>
          <button type="button" className="btn slim" onClick={() => setStoreSheet(true)}>
            店舗設定
          </button>
        </div>
      </div>

      <div className="card">
        <div className="floortabs">
          {store.floors.map((f) => (
            <button key={f.id} type="button" aria-pressed={f.id === floor.id} onClick={() => setFloorId(f.id)}>
              {f.name}
            </button>
          ))}
          <button type="button" onClick={() => setFloorId(addFloor(store.id))}>
            ＋階を追加
          </button>
          <button
            type="button"
            onClick={() => {
              const hasContent = store.shelves.some((s) => s.floorId === floor.id) || floor.cells.some((c) => c.k !== 'aisle')
              if (
                !hasContent ||
                window.confirm(`${floor.name} の内容を見取り図から作り直します。今の内容は上書きされます（後で「元に戻す」も使えます）。よろしいですか？`)
              ) {
                setAiSheet(true)
              }
            }}
          >
            📷 見取り図から作成
          </button>
          <button type="button" onClick={() => bgFileRef.current?.click()}>
            🖼 背景画像を設定
          </button>
          <button type="button" onClick={() => setFloorSheet(true)}>
            ⚙ {floor.name}の設定
          </button>
        </div>
        <input
          ref={bgFileRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void pickBackgroundImage(f)
            e.target.value = ''
          }}
        />

        <MapView
          store={store}
          floor={floor}
          categories={categories}
          onPaint={tool === 'select' ? undefined : handlePaint}
          paintMode={isNodeTool(tool) ? 'point' : 'area'}
          paintPreviewColor={previewColorFor(tool)}
          onTapCell={tool === 'select' ? handleTapCell : undefined}
          selectedShelfId={tool === 'shelf' ? shelfId : null}
          height={420}
          backgroundImage={floor.backgroundImage}
          backgroundOpacity={floor.backgroundOpacity ?? 0.35}
          overlayOpacity={floor.backgroundImage ? mapOverlayOpacity : 1}
        />

        {floor.backgroundImage && (
          <>
            <div className="row" style={{ marginTop: 10 }}>
              <span className="muted">背景画像の透明度</span>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round((floor.backgroundOpacity ?? 0.35) * 100)}
                onChange={(e) =>
                  updateFloor(store.id, floor.id, { backgroundOpacity: Number(e.target.value) / 100 })
                }
                style={{ flex: 1 }}
              />
              <span className="muted" style={{ minWidth: 36, textAlign: 'right' }}>
                {Math.round((floor.backgroundOpacity ?? 0.35) * 100)}%
              </span>
              <button
                type="button"
                className="btn slim"
                onClick={() => updateFloor(store.id, floor.id, { backgroundImage: null })}
              >
                背景を削除
              </button>
            </div>
            <div className="row" style={{ marginTop: 8 }}>
              <span className="muted">マップの不透明度（背景と見比べる）</span>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(mapOverlayOpacity * 100)}
                onChange={(e) => setMapOverlayOpacity(Number(e.target.value) / 100)}
                style={{ flex: 1 }}
              />
              <span className="muted" style={{ minWidth: 36, textAlign: 'right' }}>
                {Math.round(mapOverlayOpacity * 100)}%
              </span>
            </div>
          </>
        )}

        <p className="muted" style={{ margin: '8px 0 0' }}>
          {hintFor(tool)}
        </p>

        <div className="row" style={{ marginTop: 12, marginBottom: 2 }}>
          <h2 style={{ margin: 0 }}>ツール</h2>
          <span className="spacer" />
          <button type="button" className="btn slim" disabled={!canUndo} onClick={() => store && undoMap(store.id)}>
            ↶ 元に戻す
          </button>
          <button type="button" className="btn slim" disabled={!canRedo} onClick={() => store && redoMap(store.id)}>
            ↷ やり直す
          </button>
        </div>
        <div className="tools">
          {TOOLS.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-pressed={tool === t.id}
              onClick={() => {
                setTool(t.id)
                if (t.id !== 'shelf') {
                  shelfRef.current = null
                }
                if (t.id === 'shelf') {
                  shelfRef.current = null
                  setShelfId(null)
                }
                setGroupId(null)
              }}
            >
              <span className="swatch" style={{ background: t.swatch }} />
              {t.label}
            </button>
          ))}
        </div>

        {tool === 'shelf' && (
          <div style={{ marginTop: 10 }}>
            <span className="muted">塗る先の棚</span>
            <div className="row wrap" style={{ marginTop: 6 }}>
              <button
                type="button"
                className={`chip${shelfId === null ? ' selected' : ''}`}
                onClick={() => {
                  setShelfId(null)
                  shelfRef.current = null
                }}
              >
                ＋ 新しい棚
              </button>
              {shelvesOnFloor.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`chip${shelfId === s.id ? ' selected' : ''}`}
                  onClick={() => {
                    setShelfId(s.id)
                    shelfRef.current = s.id
                  }}
                >
                  {s.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {(tool === 'stairs' || tool === 'elevator') && (
          <div style={{ marginTop: 10 }}>
            <span className="muted">
              階をまたいで繋ぐグループ（同じグループ同士が行き来できます）
            </span>
            <div className="row wrap" style={{ marginTop: 6 }}>
              {groups.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  className={`chip${groupId === g.id ? ' selected' : ''}`}
                  onClick={() => setGroupId(g.id)}
                >
                  {g.label}
                </button>
              ))}
              <button
                type="button"
                className={`chip${groupId && !groups.some((g) => g.id === groupId) ? ' selected' : ''}`}
                onClick={() => setGroupId(`grp_${tool}_${Date.now().toString(36)}`)}
              >
                ＋ 新しいグループ
              </button>
            </div>
          </div>
        )}

        <div className="legend">
          <span>
            <i style={{ background: '#5b6068' }} />壁
          </span>
          <span>
            <i style={{ background: 'var(--surface)', border: '1px solid var(--border)' }} />
            通路
          </span>
          {categories.slice(0, 6).map((c) => (
            <span key={c.id}>
              <i style={{ background: c.color }} />
              {c.name}
            </span>
          ))}
        </div>
      </div>

      <div className="card">
        <h2>
          {floor.name} の棚（{shelvesOnFloor.length}）
        </h2>
        {shelvesOnFloor.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            「商品棚」ツールでマップを塗ると棚ができます。
          </p>
        ) : (
          <ul className="list-rows">
            {shelvesOnFloor.map((s) => (
              <li key={s.id}>
                <span className="grow">
                  <span className="title">{s.name}</span>
                  <span className="muted">
                    {s.categoryIds.length === 0
                      ? 'ジャンル未設定 — タップして設定'
                      : s.categoryIds
                          .map((id) => categories.find((c) => c.id === id)?.name ?? '?')
                          .join('、')}
                  </span>
                </span>
                <button type="button" className="btn slim accent" onClick={() => setShelfSheet(s.id)}>
                  編集
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* --- 棚の設定 --- */}
      <Sheet open={activeShelf != null} title="棚の設定" onClose={() => setShelfSheet(null)}>
        {activeShelf && (
          <>
            <label className="field">
              <span>棚の名前</span>
              <input
                type="text"
                value={activeShelf.name}
                onChange={(e) => updateShelf(store.id, activeShelf.id, { name: e.target.value })}
              />
            </label>
            <span className="muted">取り扱うジャンル</span>
            <div className="row wrap" style={{ margin: '6px 0 12px' }}>
              {activeShelf.categoryIds.length === 0 && <span className="chip unknown">未設定</span>}
              {activeShelf.categoryIds.map((id) => {
                const c = categories.find((cc) => cc.id === id)
                return (
                  <button
                    key={id}
                    type="button"
                    className="chip"
                    onClick={() =>
                      updateShelf(store.id, activeShelf.id, {
                        categoryIds: activeShelf.categoryIds.filter((x) => x !== id),
                      })
                    }
                  >
                    <span className="dot" style={{ background: c?.color ?? '#999' }} />
                    {c?.name ?? '不明'} ×
                  </button>
                )
              })}
            </div>
            <button type="button" className="btn" style={{ width: '100%' }} onClick={() => setCatPicker(true)}>
              ジャンルを選ぶ
            </button>
            <button
              type="button"
              className="btn danger"
              style={{ width: '100%', marginTop: 10 }}
              onClick={() => {
                deleteShelf(store.id, activeShelf.id)
                if (shelfRef.current === activeShelf.id) shelfRef.current = null
                setShelfSheet(null)
              }}
            >
              この棚を削除（マスは通路に戻ります）
            </button>
          </>
        )}
      </Sheet>

      <CategoryPicker
        open={catPicker}
        title="取り扱うジャンル"
        multiple
        categories={categories}
        selected={activeShelf?.categoryIds ?? []}
        onToggle={(cid) => {
          if (!activeShelf || !cid) return
          const has = activeShelf.categoryIds.includes(cid)
          updateShelf(store.id, activeShelf.id, {
            categoryIds: has
              ? activeShelf.categoryIds.filter((x) => x !== cid)
              : [...activeShelf.categoryIds, cid],
          })
        }}
        onClose={() => setCatPicker(false)}
      />

      {/* --- 設備の設定 --- */}
      <Sheet open={activeNode != null} title="設備の設定" onClose={() => setNodeSheet(null)}>
        {activeNode && (
          <>
            <label className="field">
              <span>名前</span>
              <input
                type="text"
                value={activeNode.name}
                onChange={(e) => updateNode(store.id, activeNode.id, { name: e.target.value })}
              />
            </label>
            <label className="field">
              <span>種類</span>
              <select
                value={activeNode.kind}
                onChange={(e) => updateNode(store.id, activeNode.id, { kind: e.target.value as NodeKind })}
              >
                {(Object.keys(NODE_STYLE) as NodeKind[]).map((k) => (
                  <option key={k} value={k}>
                    {NODE_STYLE[k].label}
                  </option>
                ))}
              </select>
            </label>
            {(activeNode.kind === 'stairs' || activeNode.kind === 'elevator') && (
              <label className="field">
                <span>接続グループ（同じグループの階同士が行き来できます）</span>
                <select
                  value={activeNode.groupId ?? ''}
                  onChange={(e) => updateNode(store.id, activeNode.id, { groupId: e.target.value || undefined })}
                >
                  <option value="">（未接続）</option>
                  {[
                    ...new Set(
                      store.nodes
                        .filter((n) => n.kind === activeNode.kind && n.groupId)
                        .map((n) => n.groupId as string),
                    ),
                  ].map((gid, i) => (
                    <option key={gid} value={gid}>
                      {NODE_STYLE[activeNode.kind].label}
                      {i + 1}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <p className="muted">
              このグループが置かれている階：
              {store.floors
                .filter((f) =>
                  store.nodes.some((n) => n.floorId === f.id && n.groupId && n.groupId === activeNode.groupId),
                )
                .map((f) => f.name)
                .join('、') || 'この階のみ'}
            </p>
            <button
              type="button"
              className="btn danger"
              style={{ width: '100%' }}
              onClick={() => {
                const p = nodePos(store, activeNode)
                if (p) paint(store.id, p.floorId, [{ x: p.x, y: p.y }], { kind: 'aisle' })
                setNodeSheet(null)
              }}
            >
              この設備を削除
            </button>
          </>
        )}
      </Sheet>

      {/* --- フロア設定 --- */}
      <Sheet open={floorSheet} title={`${floor.name} の設定`} onClose={() => setFloorSheet(false)}>
        <label className="field">
          <span>フロア名</span>
          <input
            type="text"
            value={floor.name}
            onChange={(e) => updateFloor(store.id, floor.id, { name: e.target.value })}
          />
        </label>
        <label className="field">
          <span>階数（地下はマイナス。階段の移動距離の計算に使います）</span>
          <input
            type="number"
            value={floor.level}
            onChange={(e) => updateFloor(store.id, floor.id, { level: Number(e.target.value) || 0 })}
          />
        </label>
        <div className="row">
          <label className="field" style={{ flex: 1 }}>
            <span>横のマス数</span>
            <input
              type="number"
              min={3}
              max={60}
              value={floor.width}
              onChange={(e) => resizeFloor(store.id, floor.id, Number(e.target.value), floor.height)}
            />
          </label>
          <label className="field" style={{ flex: 1 }}>
            <span>縦のマス数</span>
            <input
              type="number"
              min={3}
              max={60}
              value={floor.height}
              onChange={(e) => resizeFloor(store.id, floor.id, floor.width, Number(e.target.value))}
            />
          </label>
        </div>
        {store.floors.length > 1 && (
          <button
            type="button"
            className="btn danger"
            style={{ width: '100%' }}
            onClick={() => {
              deleteFloor(store.id, floor.id)
              setFloorId(null)
              setFloorSheet(false)
            }}
          >
            このフロアを削除
          </button>
        )}
      </Sheet>

      {/* --- 店舗設定 --- */}
      <Sheet open={storeSheet} title="店舗の設定" onClose={() => setStoreSheet(false)}>
        <label className="field">
          <span>店舗名</span>
          <input type="text" value={store.name} onChange={(e) => renameStore(store.id, e.target.value)} />
        </label>
        <label className="field">
          <span>1マスの実寸（m）— 距離と所要時間の目安に使います</span>
          <input
            type="number"
            step={0.1}
            min={0.2}
            value={store.cellMeters}
            onChange={(e) => setCellMeters(store.id, Number(e.target.value) || 1.2)}
          />
        </label>
        <CloudShareSection
          cloud={store.cloud}
          onShare={() => shareStore(store.id)}
          onUnshare={() => unshareStore(store.id)}
        />
        {stores.length > 1 && (
          <button
            type="button"
            className="btn danger"
            style={{ width: '100%', marginTop: 10 }}
            onClick={() => {
              deleteStore(store.id)
              setStoreId(null)
              setStoreSheet(false)
            }}
          >
            この店舗を削除
          </button>
        )}
      </Sheet>

      <AddStoreSheet
        open={addStoreSheet}
        onClose={() => setAddStoreSheet(false)}
        onCreate={(name) => switchToStore(createStore(name))}
        onCreateSample={() => switchToStore(addSampleStore())}
      />

      <AiFloorPlanSheet
        open={aiSheet}
        onClose={() => setAiSheet(false)}
        categories={categories}
        floorId={floor.id}
        onGenerated={(layout) => importFloorLayout(store.id, floor.id, layout)}
      />
    </div>
  )
}
