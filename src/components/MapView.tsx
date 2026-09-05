import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { idx } from '../lib/grid'
import type { CellArea } from '../lib/navSteps'
import { CELL, NODE_STYLE, readableText, shelfColor } from '../lib/mapStyle'
import type { Category, Floor, Pos, RoutePlan, StoreMap } from '../types'

export interface MapViewProps {
  store: StoreMap
  floor: Floor
  categories: Category[]
  /** ルートを重ねて表示する */
  plan?: RoutePlan | null
  /** 強調表示する立ち寄り番号 */
  activeStop?: number | null
  /** 立ち寄り先の品目が全部チェック済みの立ち寄り番号。マーカーとルート線を薄く表示する */
  doneStopOrders?: Set<number>
  /**
   * 塗りつぶし操作。指定するとドラッグで矩形を選び、指を離した時点で
   * まとめて塗る (未指定ならドラッグは地図の移動)。
   */
  onPaint?: (cells: Array<{ x: number; y: number }>) => void
  /**
   * 'area': ドラッグした範囲をまとめて塗る (棚・通路・壁向け)。
   * 'point': 指を置いた位置に1マスだけ配置し、離すまで位置を調整できる (設備向け)。
   */
  paintMode?: 'area' | 'point'
  /** マスのタップ (塗りつぶし無効時のみ発火) */
  onTapCell?: (x: number, y: number) => void
  /** 枠線を強調する棚 */
  selectedShelfId?: string | null
  /** ドラッグ中のプレビュー色 (塗りつぶし有効時) */
  paintPreviewColor?: string
  height?: number
  /** 編集の参考として薄く重ねる背景画像 (dataURL) */
  backgroundImage?: string
  /** 背景画像の不透明度 0..1 */
  backgroundOpacity?: number
  /**
   * 棚・壁・設備など、生成/編集したマップ側の不透明度 0..1。
   * 背景画像と見比べられるよう、背景画像の透明度とは別に下げられるようにする。
   */
  overlayOpacity?: number
  /** 高さを親要素いっぱいに広げる (全画面ナビ用)。指定すると height は無視する */
  fullBleed?: boolean
  /** 拡大縮小バーを表示するか */
  showZoomBar?: boolean
  /**
   * この範囲 (マス単位) がちょうど収まるよう、なめらかに寄せる。
   * 手動で操作するとその時点で寄せは止まる。
   */
  focusArea?: CellArea | null
}

interface Pointer {
  x: number
  y: number
}

interface CellPos {
  x: number
  y: number
}

const MIN_SCALE = 0.6
const MAX_SCALE = 6
const EMPTY_DONE_SET: Set<number> = new Set()

export function MapView({
  store,
  floor,
  categories,
  plan = null,
  activeStop = null,
  doneStopOrders = EMPTY_DONE_SET,
  onPaint,
  paintMode = 'area',
  onTapCell,
  selectedShelfId = null,
  paintPreviewColor = 'var(--accent)',
  height = 320,
  backgroundImage,
  backgroundOpacity = 0.35,
  overlayOpacity = 1,
  fullBleed = false,
  showZoomBar = true,
  focusArea = null,
}: MapViewProps) {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const pointers = useRef(new Map<number, Pointer>())
  const pinch = useRef<{ dist: number; cx: number; cy: number } | null>(null)
  const dragStart = useRef<CellPos | null>(null)
  const moved = useRef(false)
  const [view, setView] = useState({ scale: 1, tx: 0, ty: 0 })
  const [dragCell, setDragCell] = useState<CellPos | null>(null)
  const viewRef = useRef(view)
  viewRef.current = view
  const animation = useRef<number | null>(null)

  const wrapRef = useRef<HTMLDivElement | null>(null)
  const [boxRatio, setBoxRatio] = useState<number | null>(null)

  /** 地図そのものの大きさ (SVG座標) */
  const mapW = floor.width * CELL
  const mapH = floor.height * CELL

  // 全画面表示では、SVGの表示領域を画面と同じ縦横比にして上下の余白 (レターボックス) を無くす。
  // こうしないと、縦長の画面では地図が中央に小さく収まってしまい、文字が読みにくいままになる。
  useEffect(() => {
    const el = wrapRef.current
    if (!fullBleed || !el) return
    const measure = () => {
      if (el.clientWidth > 0) setBoxRatio(el.clientHeight / el.clientWidth)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [fullBleed])

  /** 表示領域の大きさ (SVG座標)。通常表示では地図と同じ */
  const viewW = mapW
  const viewH = fullBleed && boxRatio ? mapW * boxRatio : mapH

  /** クライアント座標を地図座標 (マス単位) に変換する */
  const toCell = useCallback(
    (clientX: number, clientY: number) => {
      const svg = svgRef.current
      if (!svg) return null
      const rect = svg.getBoundingClientRect()
      const sx = ((clientX - rect.left) / rect.width) * viewW
      const sy = ((clientY - rect.top) / rect.height) * viewH
      const mx = (sx - view.tx) / view.scale
      const my = (sy - view.ty) / view.scale
      const x = Math.floor(mx / CELL)
      const y = Math.floor(my / CELL)
      if (x < 0 || y < 0 || x >= floor.width || y >= floor.height) return null
      return { x, y }
    },
    [floor.height, floor.width, view.scale, view.tx, view.ty, viewH, viewW],
  )

  const clamp = (v: { scale: number; tx: number; ty: number }) => {
    const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale))
    const spanX = mapW * scale
    const spanY = mapH * scale
    // 地図が表示領域より大きいときは端が内側に入らないように、
    // 小さいときは表示領域からはみ出さないように収める
    const loX = Math.min(0, viewW - spanX)
    const hiX = Math.max(0, viewW - spanX)
    const loY = Math.min(0, viewH - spanY)
    const hiY = Math.max(0, viewH - spanY)
    return {
      scale,
      tx: Math.min(Math.max(v.tx, loX), hiX),
      ty: Math.min(Math.max(v.ty, loY), hiY),
    }
  }

  /** 地図全体がちょうど収まる表示 */
  const fitAll = useCallback(() => {
    const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.min(viewW / mapW, viewH / mapH)))
    return { scale, tx: (viewW - mapW * scale) / 2, ty: (viewH - mapH * scale) / 2 }
  }, [mapH, mapW, viewH, viewW])

  const stopAnimation = useCallback(() => {
    if (animation.current !== null) {
      cancelAnimationFrame(animation.current)
      animation.current = null
    }
  }, [])

  /** 現在の表示から目標の表示へ、イージングを効かせてなめらかに動かす。 */
  const animateTo = useCallback(
    (target: { scale: number; tx: number; ty: number }, durationMs = 620) => {
      stopAnimation()
      const from = viewRef.current
      const started = performance.now()
      const step = (now: number) => {
        const t = Math.min(1, (now - started) / durationMs)
        // easeInOutCubic — 動き出しと止まりが緩やかで、地図の移動が追いやすい
        const e = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
        setView({
          scale: from.scale + (target.scale - from.scale) * e,
          tx: from.tx + (target.tx - from.tx) * e,
          ty: from.ty + (target.ty - from.ty) * e,
        })
        animation.current = t < 1 ? requestAnimationFrame(step) : null
      }
      animation.current = requestAnimationFrame(step)
    },
    [stopAnimation],
  )

  /** dragStart〜dragCell の矩形に含まれる全マスを返す (point モードなら1マスのみ)。 */
  const rectCells = (a: CellPos, b: CellPos): CellPos[] => {
    if (paintMode === 'point') return [b]
    const x0 = Math.min(a.x, b.x)
    const x1 = Math.max(a.x, b.x)
    const y0 = Math.min(a.y, b.y)
    const y1 = Math.max(a.y, b.y)
    const cells: CellPos[] = []
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) cells.push({ x, y })
    }
    return cells
  }

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    // 触った時点で自動の寄せは中断し、手の操作を優先する
    stopAnimation()

    if (onPaint) {
      // 配置ツール (選択ツール以外) では拡大縮小・移動を一切行わない。
      // 塗り操作中に2本目以降の指が触れても無視し、ピンチ扱いにしない
      // (実機で片手指1本のつもりでも余分なpointerイベントが入り、
      //  誤ってピンチと判定されて操作不能になることがあったため)。
      if (dragStart.current) return
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
      moved.current = false
      const cell = toCell(e.clientX, e.clientY)
      if (cell) {
        dragStart.current = cell
        setDragCell(cell)
      }
      return
    }

    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    moved.current = false
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      pinch.current = {
        dist: Math.hypot(a.x - b.x, a.y - b.y),
        cx: (a.x + b.x) / 2,
        cy: (a.y + b.y) / 2,
      }
      return
    }
  }

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const prev = pointers.current.get(e.pointerId)
    if (!prev) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (onPaint) {
      // 配置ツールでは常に最初の指だけを塗り操作として追従させ、拡大縮小・移動はしない。
      if (!dragStart.current) return
      const dx = e.clientX - prev.x
      const dy = e.clientY - prev.y
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) moved.current = true
      const cell = toCell(e.clientX, e.clientY)
      if (cell) setDragCell(cell)
      return
    }

    if (pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()]
      const dist = Math.hypot(a.x - b.x, a.y - b.y)
      const cx = (a.x + b.x) / 2
      const cy = (a.y + b.y) / 2
      const start = pinch.current
      if (start && start.dist > 0) {
        const svg = svgRef.current
        if (!svg) return
        const rect = svg.getBoundingClientRect()
        const ratio = dist / start.dist
        setView((v) => {
          const scale = v.scale * ratio
          // 2本指の中点を固定したまま拡大縮小する
          const px = ((cx - rect.left) / rect.width) * viewW
          const py = ((cy - rect.top) / rect.height) * viewH
          const k = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale)) / v.scale
          return clamp({
            scale: v.scale * k,
            tx: px - (px - v.tx) * k + (cx - start.cx) * (viewW / rect.width),
            ty: py - (py - v.ty) * k + (cy - start.cy) * (viewH / rect.height),
          })
        })
      }
      pinch.current = { dist, cx, cy }
      moved.current = true
      return
    }

    const dx = e.clientX - prev.x
    const dy = e.clientY - prev.y
    if (Math.abs(dx) > 1 || Math.abs(dy) > 1) moved.current = true

    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    setView((v) => clamp({ ...v, tx: v.tx + dx * (viewW / rect.width), ty: v.ty + dy * (viewH / rect.height) }))
  }

  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    const had = pointers.current.get(e.pointerId)
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) pinch.current = null

    if (onPaint && dragStart.current && had) {
      const end = toCell(e.clientX, e.clientY) ?? dragCell ?? dragStart.current
      onPaint(rectCells(dragStart.current, end))
    }
    dragStart.current = null
    setDragCell(null)

    if (!onPaint && onTapCell && had && !moved.current) {
      const cell = toCell(e.clientX, e.clientY)
      if (cell) onTapCell(cell.x, cell.y)
    }
  }

  const zoomBy = (k: number) =>
    setView((v) =>
      clamp({
        scale: v.scale * k,
        tx: viewW / 2 - (viewW / 2 - v.tx) * k,
        ty: viewH / 2 - (viewH / 2 - v.ty) * k,
      }),
    )

  // 寄せる範囲が変わるたび、その範囲がちょうど収まる位置・倍率へ動かす。
  // 依存配列に入れるため、範囲は数値をつないだ文字列で比較する。
  const focusKey = focusArea ? `${focusArea.x0},${focusArea.y0},${focusArea.x1},${focusArea.y1}` : null
  // 表示中の階をまたいだ移動 (階段・エレベーターの中継など) では、直前の階の座標のまま
  // なめらかに動かそうとすると、切り替わった直後の1〜2フレームだけ別の階のマスを
  // 誤った位置で描画してしまい、何も描かれていない場所 (背景の白) が一瞬映ってしまう。
  // 階が変わったときだけはアニメーションさせず、瞬時に正しい位置へ合わせる。
  const lastFloorId = useRef(floor.id)
  useEffect(() => {
    const floorChanged = lastFloorId.current !== floor.id
    lastFloorId.current = floor.id
    if (floorChanged) stopAnimation()
    const moveTo = floorChanged ? setView : animateTo

    if (!focusArea) {
      // 全画面で寄せ先が無いときは地図全体を表示する
      if (fullBleed && boxRatio) moveTo(fitAll())
      return
    }
    const pad = CELL * 0.9
    const x = focusArea.x0 * CELL - pad
    const y = focusArea.y0 * CELL - pad
    const w = (focusArea.x1 - focusArea.x0 + 1) * CELL + pad * 2
    const h = (focusArea.y1 - focusArea.y0 + 1) * CELL + pad * 2
    const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.min(viewW / w, viewH / h)))
    moveTo(
      clamp({
        scale,
        tx: viewW / 2 - (x + w / 2) * scale,
        ty: viewH / 2 - (y + h / 2) * scale,
      }),
    )
    return stopAnimation
    // focusKey は focusArea の中身そのもの。clamp/animateTo は毎回同じ動作をする
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey, viewW, viewH, fullBleed, boxRatio, floor.id])

  // --- 描画データ ---
  /** 棚名を、その棚の形に収まるサイズ・向きで置く */
  const shelfLabels = useMemo(() => {
    const box = new Map<string, { x0: number; y0: number; x1: number; y1: number }>()
    for (let y = 0; y < floor.height; y++) {
      for (let x = 0; x < floor.width; x++) {
        const c = floor.cells[idx(floor, x, y)]
        if (!c || c.k !== 'shelf') continue
        const b = box.get(c.shelfId)
        if (!b) box.set(c.shelfId, { x0: x, y0: y, x1: x, y1: y })
        else {
          b.x0 = Math.min(b.x0, x)
          b.y0 = Math.min(b.y0, y)
          b.x1 = Math.max(b.x1, x)
          b.y1 = Math.max(b.y1, y)
        }
      }
    }
    return [...box.entries()].map(([shelfId, b]) => {
      const shelf = store.shelves.find((s) => s.id === shelfId)
      const name = shelf?.name ?? ''
      const w = b.x1 - b.x0 + 1
      const h = b.y1 - b.y0 + 1
      // 縦長の棚は文字を縦向きに回す
      const rotate = h > w
      const along = (rotate ? h : w) * CELL * 0.92
      const across = (rotate ? w : h) * CELL
      let fontSize = Math.min(CELL * 0.42, across * 0.6, along / Math.max(1, name.length))
      fontSize = Math.max(fontSize, CELL * 0.24)
      const maxChars = Math.max(1, Math.floor(along / fontSize))
      return {
        shelfId,
        text: name.length > maxChars ? `${name.slice(0, Math.max(1, maxChars - 1))}…` : name,
        cx: ((b.x0 + b.x1 + 1) / 2) * CELL,
        cy: ((b.y0 + b.y1 + 1) / 2) * CELL,
        fontSize,
        rotate,
      }
    })
  }, [floor, store.shelves])

  const routeSegments = useMemo(() => {
    if (!plan) return []
    const segs: Array<{ points: string; done: boolean }> = []
    plan.legs.forEach((leg, i) => {
      // legs[i] は stops[i] へ向かう区間 (立ち寄り先の品目が全部チェック済みなら薄く表示する)
      const destStop = i < plan.stops.length ? plan.stops[i] : null
      const done = destStop != null && doneStopOrders.has(destStop.order)
      let run: Pos[] = []
      const flush = () => {
        if (run.length >= 2) {
          segs.push({ points: run.map((p) => `${(p.x + 0.5) * CELL},${(p.y + 0.5) * CELL}`).join(' '), done })
        }
        run = []
      }
      for (const p of leg.path) {
        if (p.floorId !== floor.id) {
          flush()
          continue
        }
        run.push(p)
      }
      flush()
    })
    return segs
  }, [plan, floor.id, doneStopOrders])

  const stopsHere = plan?.stops.filter((s) => s.pos.floorId === floor.id) ?? []
  const startHere = plan?.start && plan.start.floorId === floor.id ? plan.start : null
  const goalHere = plan?.goal && plan.goal.floorId === floor.id ? plan.goal : null

  return (
    <>
    <div
      ref={wrapRef}
      className={`mapwrap${fullBleed ? ' full' : ''}`}
      style={fullBleed ? undefined : { aspectRatio: `${viewW} / ${viewH}`, maxHeight: height }}
    >
      <svg
        ref={svgRef}
        viewBox={`0 0 ${viewW} ${viewH}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ height: '100%', width: '100%' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        role="img"
        aria-label={`${store.name} ${floor.name} のマップ`}
      >
        <g transform={`translate(${view.tx} ${view.ty}) scale(${view.scale})`}>
          <rect x={0} y={0} width={viewW} height={viewH} fill="var(--surface)" />

          {backgroundImage && (
            <image
              href={backgroundImage}
              xlinkHref={backgroundImage}
              x={0}
              y={0}
              width={viewW}
              height={viewH}
              opacity={backgroundOpacity}
              preserveAspectRatio="none"
              style={{ pointerEvents: 'none' }}
            />
          )}

          <g opacity={overlayOpacity}>
          {floor.cells.map((cell, i) => {
            const x = (i % floor.width) * CELL
            const y = Math.floor(i / floor.width) * CELL
            if (cell.k === 'wall') {
              return <rect key={i} x={x} y={y} width={CELL} height={CELL} fill="#5b6068" />
            }
            if (cell.k === 'shelf') {
              const shelf = store.shelves.find((s) => s.id === cell.shelfId)
              const fill = shelf ? shelfColor(shelf.categoryIds, categories) : '#9aa3ad'
              return (
                <rect
                  key={i}
                  x={x}
                  y={y}
                  width={CELL}
                  height={CELL}
                  fill={fill}
                  stroke={selectedShelfId === cell.shelfId ? '#111' : 'rgba(0,0,0,0.18)'}
                  strokeWidth={selectedShelfId === cell.shelfId ? 2 : 0.5}
                />
              )
            }
            if (cell.k === 'node') {
              const node = store.nodes.find((n) => n.id === cell.nodeId)
              const style = node ? NODE_STYLE[node.kind] : null
              return (
                <g key={i}>
                  <rect x={x} y={y} width={CELL} height={CELL} fill={style?.color ?? '#777'} />
                  <text
                    x={x + CELL / 2}
                    y={y + CELL / 2}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={CELL * 0.5}
                    fill="#fff"
                    fontWeight={700}
                  >
                    {style?.short ?? '?'}
                  </text>
                </g>
              )
            }
            return (
              <rect
                key={i}
                x={x}
                y={y}
                width={CELL}
                height={CELL}
                fill={backgroundImage ? 'none' : 'var(--surface)'}
                stroke="var(--border)"
                strokeWidth={0.4}
              />
            )
          })}

          {shelfLabels.map((l) => {
            const shelf = store.shelves.find((s) => s.id === l.shelfId)
            const bg = shelf ? shelfColor(shelf.categoryIds, categories) : '#9aa3ad'
            return (
              <text
                key={l.shelfId}
                x={l.cx}
                y={l.cy}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={l.fontSize}
                fontWeight={700}
                fill={readableText(bg)}
                transform={l.rotate ? `rotate(-90 ${l.cx} ${l.cy})` : undefined}
                style={{ pointerEvents: 'none' }}
              >
                {l.text}
              </text>
            )
          })}
          </g>

          {routeSegments.map((seg, i) => (
            <polyline
              key={i}
              points={seg.points}
              fill="none"
              stroke="var(--accent)"
              strokeWidth={CELL * 0.28}
              strokeOpacity={seg.done ? 0.18 : 0.55}
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ pointerEvents: 'none' }}
            />
          ))}

          {startHere && (
            <circle
              cx={(startHere.x + 0.5) * CELL}
              cy={(startHere.y + 0.5) * CELL}
              r={CELL * 0.28}
              fill="#2e7d32"
              stroke="#fff"
              strokeWidth={1.5}
              style={{ pointerEvents: 'none' }}
            />
          )}
          {goalHere && (
            <rect
              x={(goalHere.x + 0.22) * CELL}
              y={(goalHere.y + 0.22) * CELL}
              width={CELL * 0.56}
              height={CELL * 0.56}
              fill="#ef6c00"
              stroke="#fff"
              strokeWidth={1.5}
              style={{ pointerEvents: 'none' }}
            />
          )}

          {dragStart.current && dragCell && paintMode === 'point' && (
            <rect
              x={dragCell.x * CELL}
              y={dragCell.y * CELL}
              width={CELL}
              height={CELL}
              fill={paintPreviewColor}
              fillOpacity={0.55}
              stroke={paintPreviewColor}
              strokeWidth={2}
              style={{ pointerEvents: 'none' }}
            />
          )}
          {dragStart.current && dragCell && paintMode === 'area' && (
            <rect
              x={Math.min(dragStart.current.x, dragCell.x) * CELL}
              y={Math.min(dragStart.current.y, dragCell.y) * CELL}
              width={(Math.abs(dragStart.current.x - dragCell.x) + 1) * CELL}
              height={(Math.abs(dragStart.current.y - dragCell.y) + 1) * CELL}
              fill={paintPreviewColor}
              fillOpacity={0.35}
              stroke={paintPreviewColor}
              strokeWidth={2}
              style={{ pointerEvents: 'none' }}
            />
          )}

          {stopsHere.map((s) => (
            <g key={s.order} opacity={doneStopOrders.has(s.order) ? 0.35 : 1} style={{ pointerEvents: 'none' }}>
              <circle
                cx={(s.pos.x + 0.5) * CELL}
                cy={(s.pos.y + 0.5) * CELL}
                r={CELL * (activeStop === s.order ? 0.52 : 0.42)}
                fill={activeStop === s.order ? '#111' : 'var(--coral)'}
                stroke="#fff"
                strokeWidth={1.6}
              />
              <text
                x={(s.pos.x + 0.5) * CELL}
                y={(s.pos.y + 0.5) * CELL}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={CELL * 0.48}
                fontWeight={700}
                fill="#fff"
              >
                {s.order}
              </text>
            </g>
          ))}
        </g>
      </svg>

    </div>
    {showZoomBar && (
    <div className="zoombar">
      <button type="button" className="btn slim" onClick={() => zoomBy(1 / 1.4)} aria-label="縮小">
        −
      </button>
      <button type="button" className="btn slim" onClick={() => zoomBy(1.4)} aria-label="拡大">
        ＋
      </button>
      <button
        type="button"
        className="btn slim"
        onClick={() => setView(fullBleed ? fitAll() : { scale: 1, tx: 0, ty: 0 })}
        aria-label="表示をリセット"
      >
        全体表示
      </button>
      <span className="muted" style={{ marginLeft: 'auto' }}>
        {Math.round(view.scale * 100)}%
      </span>
    </div>
    )}
    </>
  )
}
