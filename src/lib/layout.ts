import type { Cell, Floor, MapNode, NodeKind, Shelf, StoreMap } from '../types'
import { newId } from './id'

export interface ShelfSpec {
  name: string
  categoryIds: string[]
}

export interface NodeSpec {
  kind: NodeKind
  name: string
  groupId?: string
}

export interface AsciiFloorSpec {
  name: string
  level: number
  /** '.' = 通路, '#' = 壁, その他は shelves / nodes のキー */
  rows: string[]
  shelves?: Record<string, ShelfSpec>
  nodes?: Record<string, NodeSpec>
}

/**
 * ASCII アートからフロアを組み立てる。サンプル店舗とテストの記述に使う。
 * 同じ文字が連続していなくても、1フロア内の同一文字は1つの棚として扱う。
 */
export function buildStoreFromAscii(
  name: string,
  specs: AsciiFloorSpec[],
  cellMeters = 1.2,
): StoreMap {
  const floors: Floor[] = []
  const shelves: Shelf[] = []
  const nodes: MapNode[] = []

  for (const spec of specs) {
    const height = spec.rows.length
    const width = Math.max(...spec.rows.map((r) => [...r].length))
    const floorId = newId('floor')
    const cells: Cell[] = new Array(width * height)
    const shelfIdByChar = new Map<string, string>()
    const nodeCount = new Map<string, number>()

    for (let y = 0; y < height; y++) {
      const chars = [...spec.rows[y]]
      for (let x = 0; x < width; x++) {
        const ch = chars[x] ?? '.'
        const at = y * width + x
        if (ch === '#') {
          cells[at] = { k: 'wall' }
          continue
        }
        const nodeSpec = spec.nodes?.[ch]
        if (nodeSpec) {
          const n = (nodeCount.get(ch) ?? 0) + 1
          nodeCount.set(ch, n)
          const id = newId('node')
          nodes.push({
            id,
            floorId,
            kind: nodeSpec.kind,
            name: n > 1 ? `${nodeSpec.name}${n}` : nodeSpec.name,
            groupId: nodeSpec.groupId,
          })
          cells[at] = { k: 'node', nodeId: id }
          continue
        }
        const shelfSpec = spec.shelves?.[ch]
        if (shelfSpec) {
          let shelfId = shelfIdByChar.get(ch)
          if (!shelfId) {
            shelfId = newId('shelf')
            shelfIdByChar.set(ch, shelfId)
            shelves.push({
              id: shelfId,
              floorId,
              name: shelfSpec.name,
              categoryIds: [...shelfSpec.categoryIds],
            })
          }
          cells[at] = { k: 'shelf', shelfId }
          continue
        }
        cells[at] = { k: 'aisle' }
      }
    }

    floors.push({ id: floorId, name: spec.name, level: spec.level, width, height, cells })
  }

  const now = Date.now()
  return { id: newId('store'), name, floors, shelves, nodes, cellMeters, createdAt: now, updatedAt: now }
}
