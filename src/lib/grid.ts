import type { Cell, Floor, MapNode, Pos, Shelf, StoreMap } from '../types'

export const idx = (floor: Floor, x: number, y: number) => y * floor.width + x

export const inBounds = (floor: Floor, x: number, y: number) =>
  x >= 0 && y >= 0 && x < floor.width && y < floor.height

export function cellAt(floor: Floor, x: number, y: number): Cell | null {
  if (!inBounds(floor, x, y)) return null
  return floor.cells[idx(floor, x, y)] ?? { k: 'aisle' }
}

/** 通行できるマスか (棚と壁は通行不可、通路とノードは通行可)。 */
export function isWalkable(cell: Cell | null): boolean {
  return cell !== null && (cell.k === 'aisle' || cell.k === 'node')
}

export const NEIGHBORS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
]

export const posKey = (p: Pos) => `${p.floorId}:${p.x},${p.y}`

export function makeCells(width: number, height: number): Cell[] {
  return Array.from({ length: width * height }, () => ({ k: 'aisle' }) as Cell)
}

export function getFloor(map: StoreMap, floorId: string): Floor | undefined {
  return map.floors.find((f) => f.id === floorId)
}

/** 指定の棚が占めるマスをすべて返す。 */
export function shelfCells(map: StoreMap, shelf: Shelf): Pos[] {
  const floor = getFloor(map, shelf.floorId)
  if (!floor) return []
  const out: Pos[] = []
  for (let y = 0; y < floor.height; y++) {
    for (let x = 0; x < floor.width; x++) {
      const c = floor.cells[idx(floor, x, y)]
      if (c && c.k === 'shelf' && c.shelfId === shelf.id) out.push({ floorId: floor.id, x, y })
    }
  }
  return out
}

/** 棚に接する通行可能マス (=その棚の前に立てる場所) を返す。 */
export function shelfAccessCells(map: StoreMap, shelf: Shelf): Pos[] {
  const floor = getFloor(map, shelf.floorId)
  if (!floor) return []
  const seen = new Set<string>()
  const out: Pos[] = []
  for (const cell of shelfCells(map, shelf)) {
    for (const [dx, dy] of NEIGHBORS) {
      const nx = cell.x + dx
      const ny = cell.y + dy
      if (!inBounds(floor, nx, ny)) continue
      if (!isWalkable(cellAt(floor, nx, ny))) continue
      const key = `${nx},${ny}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ floorId: floor.id, x: nx, y: ny })
    }
  }
  return out
}

export function nodePos(map: StoreMap, node: MapNode): Pos | null {
  const floor = getFloor(map, node.floorId)
  if (!floor) return null
  for (let y = 0; y < floor.height; y++) {
    for (let x = 0; x < floor.width; x++) {
      const c = floor.cells[idx(floor, x, y)]
      if (c && c.k === 'node' && c.nodeId === node.id) return { floorId: floor.id, x, y }
    }
  }
  return null
}

/** nodePos の逆引き。指定の位置にある設備 (階段・エレベーターなど) を返す。 */
export function nodeAt(map: StoreMap, pos: Pos): MapNode | null {
  const floor = getFloor(map, pos.floorId)
  if (!floor) return null
  const c = cellAt(floor, pos.x, pos.y)
  if (!c || c.k !== 'node') return null
  return map.nodes.find((n) => n.id === c.nodeId) ?? null
}

/** マップ上に配置されていない棚/ノードを取り除いた整合状態を返す。 */
export function pruneOrphans(map: StoreMap): StoreMap {
  const usedShelves = new Set<string>()
  const usedNodes = new Set<string>()
  for (const f of map.floors) {
    for (const c of f.cells) {
      if (c.k === 'shelf') usedShelves.add(c.shelfId)
      else if (c.k === 'node') usedNodes.add(c.nodeId)
    }
  }
  return {
    ...map,
    shelves: map.shelves.filter((s) => usedShelves.has(s.id)),
    nodes: map.nodes.filter((n) => usedNodes.has(n.id)),
  }
}
