import type { Category, Cell, MapNode, NodeKind, Shelf } from '../types'
import { buildIndex, detectCategory } from './genre'
import { newId } from './id'

const API_KEY_STORAGE_KEY = 'smart-shopping-list:gemini-api-key'

/** ユーザー自身の Google Gemini APIキーを端末内だけに保存する (サーバーには送らない)。 */
export function getStoredApiKey(): string {
  try {
    return localStorage.getItem(API_KEY_STORAGE_KEY) ?? ''
  } catch {
    return ''
  }
}

export function setStoredApiKey(key: string): void {
  try {
    if (key.trim()) localStorage.setItem(API_KEY_STORAGE_KEY, key.trim())
    else localStorage.removeItem(API_KEY_STORAGE_KEY)
  } catch {
    // localStorage が使えない環境では諦める (キー入力のたびに再入力させる)
  }
}

/**
 * AIに判定させる区画の種類。
 * 「壁」は含めない — 見取り図の写真は棚同士の間隔や通路が判別しづらいことが多く、
 * AIが壁を広めに判定すると通路まで壁扱いになってルートが作れなくなっていたため。
 * マス目は最初からすべて通路 (aisle) として作り、そこに商品棚を置いていく方式にして、
 * 生成直後から必ず通行可能な状態になるようにする (壁は手動編集ツールで後から追加できる)。
 */
export const ZONE_KINDS = ['shelf', 'aisle', 'entrance', 'checkout', 'stairs', 'elevator'] as const
export type ZoneKind = (typeof ZONE_KINDS)[number]

export interface FloorPlanZone {
  kind: ZoneKind
  x0: number
  y0: number
  x1: number
  y1: number
  label?: string
}

export interface FloorPlanResult {
  zones: FloorPlanZone[]
}

export interface RasterizedFloor {
  width: number
  height: number
  cells: Cell[]
  shelves: Shelf[]
  nodes: MapNode[]
}

const NODE_KIND_LABEL: Record<Exclude<ZoneKind, 'wall' | 'shelf' | 'aisle'>, string> = {
  entrance: '入口',
  checkout: 'レジ',
  stairs: '階段',
  elevator: 'エレベーター',
}

/** 長辺がこのマス数になるよう、画像の縦横比を保ったままグリッド解像度を決める。 */
export function pickGridSize(
  imageWidth: number,
  imageHeight: number,
  longSideCells = 30,
): { width: number; height: number } {
  const ratio = imageHeight / imageWidth
  const clamp = (n: number) => Math.max(5, Math.min(60, Math.round(n)))
  if (imageWidth >= imageHeight) {
    return { width: clamp(longSideCells), height: clamp(longSideCells * ratio) }
  }
  return { width: clamp(longSideCells / ratio), height: clamp(longSideCells) }
}

/**
 * 相対座標の区画一覧を実際のグリッドに焼き込み、Cell/Shelf/MapNode を作る。
 * 未指定の領域は通路 (aisle) のまま。
 */
export function rasterizeFloorPlan(
  result: FloorPlanResult,
  gridWidth: number,
  gridHeight: number,
  floorId: string,
  categories: Category[],
): RasterizedFloor {
  const cells: Cell[] = Array.from({ length: gridWidth * gridHeight }, () => ({ k: 'aisle' }) as Cell)
  const shelves: Shelf[] = []
  const nodes: MapNode[] = []
  const nodeCount: Partial<Record<ZoneKind, number>> = {}
  const index = buildIndex(categories)

  const toCellRange = (v0: number, v1: number, size: number) => {
    const a = Math.max(0, Math.min(size - 1, Math.round(Math.min(v0, v1) * size)))
    const b = Math.max(0, Math.min(size - 1, Math.round(Math.max(v0, v1) * size) - 1))
    return [a, Math.max(a, b)] as const
  }

  for (const zone of result.zones) {
    const [x0, x1] = toCellRange(zone.x0, zone.x1, gridWidth)
    const [y0, y1] = toCellRange(zone.y0, zone.y1, gridHeight)

    if (zone.kind === 'aisle') {
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          cells[y * gridWidth + x] = { k: 'aisle' }
        }
      }
      continue
    }

    if (zone.kind === 'shelf') {
      const label = zone.label?.trim()
      const n = shelves.length + 1
      const match = label ? detectCategory(label, categories, {}, index) : null
      const shelf: Shelf = {
        id: newId('shelf'),
        floorId,
        name: label || `棚${n}`,
        categoryIds: match ? [match.categoryId] : [],
      }
      shelves.push(shelf)
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          cells[y * gridWidth + x] = { k: 'shelf', shelfId: shelf.id }
        }
      }
      continue
    }

    // entrance / checkout / stairs / elevator: 中心1マスにだけノードを置く
    const cx = Math.round((x0 + x1) / 2)
    const cy = Math.round((y0 + y1) / 2)
    const at = cy * gridWidth + cx
    if (cells[at]?.k === 'node') continue
    const n = (nodeCount[zone.kind] ?? 0) + 1
    nodeCount[zone.kind] = n
    const kind = zone.kind as NodeKind
    const node: MapNode = {
      id: newId('node'),
      floorId,
      kind,
      name: zone.label?.trim() || (n > 1 ? `${NODE_KIND_LABEL[zone.kind]}${n}` : NODE_KIND_LABEL[zone.kind]),
    }
    nodes.push(node)
    cells[at] = { k: 'node', nodeId: node.id }
  }

  return { width: gridWidth, height: gridHeight, cells, shelves, nodes }
}

/** File を Claude API に渡せる base64 + メディアタイプに変換する。大きい画像は縮小する。 */
export async function fileToAnalyzableImage(
  file: File,
  maxSide = 1568,
): Promise<{ base64: string; mediaType: 'image/jpeg'; width: number; height: number }> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('画像を処理できませんでした。')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close?.()

  const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
  return { base64, mediaType: 'image/jpeg', width, height }
}

/**
 * マップ編集画面に薄く重ねて表示する背景用の縮小画像 (dataURL) を作る。
 * AI解析用の画像よりさらに小さく圧縮し、端末保存 (localStorage) の容量を抑える。
 */
export async function fileToBackgroundImage(file: File, maxSide = 900, quality = 0.6): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('画像を処理できませんでした。')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close?.()

  return canvas.toDataURL('image/jpeg', quality)
}
