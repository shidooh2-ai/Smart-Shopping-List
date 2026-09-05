import { newId } from './id'
import type { Category, Cell, Floor, MapNode, Shelf, StoreMap } from '../types'

/** [コード, 連続数]。コード: '.'=通路 '#'=壁 's<n>'=shelves配列のn番目 'n<n>'=nodes配列のn番目 */
export type CellRun = [string, number]

export type CompactFloor = Omit<Floor, 'cells'> & { runs: CellRun[] }

/**
 * フロアのマス目 (幅×高さ分の Cell が並んだ配列) は、書き出したJSONだと大半を
 * 通路・壁・棚が占め、同じ内容がマスの数だけ延々と繰り返される (例:
 * `{"k":"shelf","shelfId":"shelf_xxxxxxxxxxxxxxxx"}` を棚の面積分だけ並べる)。
 * shelves/nodes配列への参照を短い添字コードに置き換えたうえで、行優先の並びを
 * ランレングス圧縮 (同じコードの連続を [コード, 連続数] にまとめる) することで、
 * 配布・バックアップ用のJSONを大幅に小さくする。
 *
 * shelves/nodes は書き出し時に一緒に持ち歩く配列そのもの (店舗ごとに共有) を渡すこと。
 * 添字はその配列内での位置を指すため、書き出し・読み込みで同じ並びの配列を使う必要がある。
 */
export function encodeFloorCells(floor: Floor, shelves: Shelf[], nodes: MapNode[]): CompactFloor {
  const shelfIndex = new Map(shelves.map((s, i) => [s.id, i]))
  const nodeIndex = new Map(nodes.map((n, i) => [n.id, i]))

  const codeOf = (cell: Cell): string => {
    if (cell.k === 'aisle') return '.'
    if (cell.k === 'wall') return '#'
    if (cell.k === 'shelf') return `s${shelfIndex.get(cell.shelfId) ?? -1}`
    return `n${nodeIndex.get(cell.nodeId) ?? -1}`
  }

  const runs: CellRun[] = []
  for (const cell of floor.cells) {
    const code = codeOf(cell)
    const last = runs[runs.length - 1]
    if (last && last[0] === code) last[1]++
    else runs.push([code, 1])
  }

  const { cells: _cells, ...rest } = floor
  return { ...rest, runs }
}

/** encodeFloorCells の逆変換。shelves/nodes は書き出し時と同じ並びの配列を渡すこと。 */
export function decodeFloorCells(compact: CompactFloor, shelves: Shelf[], nodes: MapNode[]): Floor {
  const cells: Cell[] = []
  for (const [code, count] of compact.runs) {
    if (count <= 0) continue
    let cell: Cell
    if (code === '.') cell = { k: 'aisle' }
    else if (code === '#') cell = { k: 'wall' }
    else if (code[0] === 's') {
      const shelf = shelves[Number(code.slice(1))]
      if (!shelf) throw new Error(`不明な棚コードです: ${code}`)
      cell = { k: 'shelf', shelfId: shelf.id }
    } else if (code[0] === 'n') {
      const node = nodes[Number(code.slice(1))]
      if (!node) throw new Error(`不明な設備コードです: ${code}`)
      cell = { k: 'node', nodeId: node.id }
    } else {
      throw new Error(`不明なマスコードです: ${code}`)
    }
    // 同じ内容のマスなので、連続する分は同じオブジェクトを使い回してよい (Cellは書き換えない前提)
    for (let i = 0; i < count; i++) cells.push(cell)
  }
  const { runs: _runs, ...rest } = compact
  return { ...rest, cells }
}

/**
 * 配布用に書き出されたマップのJSON (マップ単体でも、封筒形式 `{ store: {...} }` でも、
 * 全体バックアップの stores[] の要素でも) を StoreMap に変換する。形式が合わなければ null。
 *
 * id はJSON内のものをそのまま使う (新しく振り直さない)。これにより、以前取り込んだ
 * 店舗と同じ id のマップを読み込んだときに「同じ店舗の更新」だと判定できる
 * (呼び出し側で id が既存と重複していないか確認し、統合するかどうかを決める)。
 */
export function decodeImportedStoreMap(data: unknown): StoreMap | null {
  if (!data || typeof data !== 'object') return null
  // 書き出し機能が付けた封筒 ({ store: {...} }) でも、StoreMap そのものでも受け付ける
  const envelope = data as { store?: unknown }
  const raw = (envelope.store && typeof envelope.store === 'object' ? envelope.store : data) as Partial<StoreMap>
  if (!Array.isArray(raw.floors) || !Array.isArray(raw.shelves) || !Array.isArray(raw.nodes)) return null
  const shelves = raw.shelves as Shelf[]
  const nodes = raw.nodes as MapNode[]
  const floors = raw.floors as unknown as CompactFloor[]
  const now = Date.now()
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : newId('store'),
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name : '読み込んだ店舗',
    floors: floors.map((f) => decodeFloorCells(f, shelves, nodes)),
    shelves,
    nodes,
    cellMeters: typeof raw.cellMeters === 'number' ? raw.cellMeters : 1.2,
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : now,
    updatedAt: now,
    categories: Array.isArray(raw.categories) ? (raw.categories as Category[]) : undefined,
  }
}
