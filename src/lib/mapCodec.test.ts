import { describe, expect, it } from 'vitest'
import { decodeFloorCells, encodeFloorCells } from './mapCodec'
import type { Cell, Floor, MapNode, Shelf } from '../types'

const shelves: Shelf[] = [
  { id: 'shelf_a', floorId: 'floor_1', name: '青果', categoryIds: ['veg'] },
  { id: 'shelf_b', floorId: 'floor_1', name: '精肉', categoryIds: ['meat'] },
]
const nodes: MapNode[] = [{ id: 'node_a', floorId: 'floor_1', kind: 'checkout', name: 'レジ' }]

function floorWithCells(cells: Cell[], width: number, height: number): Floor {
  return { id: 'floor_1', name: '1F', level: 1, width, height, cells }
}

describe('mapCodec: encodeFloorCells / decodeFloorCells', () => {
  it('encode -> decode で元のマス目がそのまま復元される', () => {
    const cells: Cell[] = [
      { k: 'wall' },
      { k: 'aisle' },
      { k: 'shelf', shelfId: 'shelf_a' },
      { k: 'shelf', shelfId: 'shelf_a' },
      { k: 'node', nodeId: 'node_a' },
      { k: 'shelf', shelfId: 'shelf_b' },
    ]
    const floor = floorWithCells(cells, 6, 1)
    const compact = encodeFloorCells(floor, shelves, nodes)
    const decoded = decodeFloorCells(compact, shelves, nodes)
    expect(decoded.cells).toEqual(cells)
    // cells 以外のフィールド (id/name/level/width/height) はそのまま保たれる
    expect(decoded).toMatchObject({ id: 'floor_1', name: '1F', level: 1, width: 6, height: 1 })
  })

  it('backgroundImage など任意フィールドも保たれる', () => {
    const floor: Floor = {
      ...floorWithCells([{ k: 'aisle' }], 1, 1),
      backgroundImage: 'data:image/png;base64,xxx',
      backgroundOpacity: 0.5,
    }
    const decoded = decodeFloorCells(encodeFloorCells(floor, shelves, nodes), shelves, nodes)
    expect(decoded.backgroundImage).toBe('data:image/png;base64,xxx')
    expect(decoded.backgroundOpacity).toBe(0.5)
  })

  it('連続する同じマスはランレングス圧縮でまとめられる', () => {
    const cells: Cell[] = [
      ...Array.from({ length: 20 }, (): Cell => ({ k: 'aisle' })),
      ...Array.from({ length: 15 }, (): Cell => ({ k: 'shelf', shelfId: 'shelf_a' })),
      { k: 'wall' },
    ]
    const compact = encodeFloorCells(floorWithCells(cells, 36, 1), shelves, nodes)
    // 36マスが、たった3つの run (通路20連続・棚15連続・壁1) にまとまる
    expect(compact.runs).toEqual([
      ['.', 20],
      ['s0', 15],
      ['#', 1],
    ])
  })

  it('棚・設備の参照は shelves/nodes 配列の添字で表す (実IDそのものは書き出さない)', () => {
    const cells: Cell[] = [
      { k: 'shelf', shelfId: 'shelf_b' }, // shelves配列の1番目
      { k: 'node', nodeId: 'node_a' }, // nodes配列の0番目
    ]
    const compact = encodeFloorCells(floorWithCells(cells, 2, 1), shelves, nodes)
    expect(compact.runs).toEqual([
      ['s1', 1],
      ['n0', 1],
    ])
    // 実際のID文字列はどこにも出てこない
    expect(JSON.stringify(compact)).not.toContain('shelf_b')
  })

  it('壊れた棚コード (存在しない添字) を読み込もうとするとエラーになる', () => {
    const compact = { ...floorWithCells([], 1, 1), runs: [['s5', 1]] as [string, number][] }
    expect(() => decodeFloorCells(compact, shelves, nodes)).toThrow()
  })

  it('不明なマスコードを読み込もうとするとエラーになる', () => {
    const compact = { ...floorWithCells([], 1, 1), runs: [['?', 1]] as [string, number][] }
    expect(() => decodeFloorCells(compact, shelves, nodes)).toThrow()
  })
})
