import { useCallback, useMemo, useRef, useState } from 'react'
import { idx } from '../lib/grid'
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

export function MapView({
  store,
  floor,
  categories,
  plan = null,
  activeStop = null,
  onPaint,
  paintMode = 'area',
  onTapCell,
  selectedShelfId = null,
  paintPreviewColor = 'var(--accent)',
  height = 320,
  backgroundImage,
  backgroundOpacity = 0.35,
}: MapViewProps) {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const pointers = useRef(new Map<number, Pointer>())
  const pinch = useRef<{ dist: number; cx: number; cy: number } | null>(null)
  const dragStart = useRef<CellPos | null>(null)
  const moved = useRef(false)
  const [view, setView] = useState({ scale: 1, tx: 0, ty: 0 })
  const [dragCell, setDragCell] = useState<CellPos | null>(null)

  const viewW = floor.width * CELL
  const viewH = floor.height * CELL

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
    const spanX = viewW * scale
    const spanY = viewH * scale
    const minTx = Math.min(0, viewW - spanX)
    const minTy = Math.min(0, viewH - spanY)
    return {
      scale,
      tx: Math.min(Math.max(v.tx, minTx), Math.max(0, viewW - spanX) || 0),
      ty: Math.min(Math.max(v.ty, minTy), Math.max(0, viewH - spanY) || 0),
    }
  }

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
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    moved.current = false
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      pinch.current = {
        dist: Math.hypot(a.x - b.x, a.y - b.y),
        cx: (a.x + b.x) / 2,
        cy: (a.y + b.y) / 2,
      }
      // 2本目の指が触れたら塗り操作は取り消してズームに切り替える
      dragStart.current = null
      setDragCell(null)
      return
    }
    if (onPaint) {
      const cell = toCell(e.clientX, e.clientY)
      if (cell) {
        dragStart.current = cell
        setDragCell(cell)
      }
    }
  }

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const prev = pointers.current.get(e.pointerId)
    if (!prev) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

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

    if (onPaint && dragStart.current) {
      const cell = toCell(e.clientX, e.clientY)
      if (cell) setDragCell(cell)
      return
    }

    if (onPaint) return

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
    const segs: string[] = []
    for (const leg of plan.legs) {
      let run: Pos[] = []
      const flush = () => {
        if (run.length >= 2) {
          segs.push(run.map((p) => `${(p.x + 0.5) * CELL},${(p.y + 0.5) * CELL}`).join(' '))
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
    }
    return segs
  }, [plan, floor.id])

  const stopsHere = plan?.stops.filter((s) => s.pos.floorId === floor.id) ?? []
  const startHere = plan?.start && plan.start.floorId === floor.id ? plan.start : null
  const goalHere = plan?.goal && plan.goal.floorId === floor.id ? plan.goal : null

  return (
    <>
    <div className="mapwrap" style={{ aspectRatio: `${viewW} / ${viewH}`, maxHeight: height }}>
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

          {routeSegments.map((pts, i) => (
            <polyline
              key={i}
              points={pts}
              fill="none"
              stroke="var(--accent)"
              strokeWidth={CELL * 0.28}
              strokeOpacity={0.55}
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
            <g key={s.order} style={{ pointerEvents: 'none' }}>
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
        onClick={() => setView({ scale: 1, tx: 0, ty: 0 })}
        aria-label="表示をリセット"
      >
        全体表示
      </button>
      <span className="muted" style={{ marginLeft: 'auto' }}>
        {Math.round(view.scale * 100)}%
      </span>
    </div>
    </>
  )
}
