import { describe, expect, it } from 'vitest'
import { DEFAULT_CATEGORIES } from '../data/categories'
import { newId } from './id'
import { pickGridSize, rasterizeFloorPlan } from './aiFloorPlan'
import type { FloorPlanResult } from './aiFloorPlan'

describe('pickGridSize', () => {
  it('横長の画像は横が長辺になる', () => {
    const g = pickGridSize(1600, 800)
    expect(g.width).toBe(30)
    expect(g.height).toBe(15)
  })

  it('縦長の画像は縦が長辺になる', () => {
    const g = pickGridSize(800, 1600)
    expect(g.height).toBe(30)
    expect(g.width).toBe(15)
  })

  it('極端な比率でも下限を割らない', () => {
    const g = pickGridSize(3000, 100)
    expect(g.height).toBeGreaterThanOrEqual(5)
  })
})

describe('rasterizeFloorPlan', () => {
  const floorId = newId('floor')

  it('壁・棚・通路・設備を正しいマスに焼き込む', () => {
    const result: FloorPlanResult = {
      zones: [
        { kind: 'wall', x0: 0, y0: 0, x1: 1, y1: 0.05 },
        { kind: 'shelf', x0: 0.1, y0: 0.2, x1: 0.4, y1: 0.4, label: 'キャベツ' },
        { kind: 'entrance', x0: 0.45, y0: 0.9, x1: 0.55, y1: 1 },
      ],
    }
    const floor = rasterizeFloorPlan(result, 10, 10, floorId, DEFAULT_CATEGORIES)
    expect(floor.width).toBe(10)
    expect(floor.height).toBe(10)
    expect(floor.cells).toHaveLength(100)

    // 壁の帯
    expect(floor.cells[0].k).toBe('wall')
    // 棚
    const shelfCellIdx = 3 * 10 + 2
    expect(floor.cells[shelfCellIdx].k).toBe('shelf')
    expect(floor.shelves).toHaveLength(1)
    expect(floor.shelves[0].name).toBe('キャベツ')
    // ラベルから野菜ジャンルを自動判定できる
    expect(floor.shelves[0].categoryIds).toContain('veg')

    // 入口ノードが1つ配置される
    expect(floor.nodes).toHaveLength(1)
    expect(floor.nodes[0].kind).toBe('entrance')
  })

  it('未指定の領域は通路のまま', () => {
    const result: FloorPlanResult = { zones: [] }
    const floor = rasterizeFloorPlan(result, 5, 5, floorId, DEFAULT_CATEGORIES)
    expect(floor.cells.every((c) => c.k === 'aisle')).toBe(true)
  })

  it('後の区画が前の区画を上書きする (棚の中の通路)', () => {
    const result: FloorPlanResult = {
      zones: [
        { kind: 'shelf', x0: 0, y0: 0, x1: 1, y1: 1, label: '雑貨' },
        { kind: 'aisle', x0: 0.4, y0: 0, x1: 0.6, y1: 1 },
      ],
    }
    const floor = rasterizeFloorPlan(result, 10, 10, floorId, DEFAULT_CATEGORIES)
    expect(floor.cells[0].k).toBe('shelf')
    expect(floor.cells[5].k).toBe('aisle')
  })

  it('同じ種類の設備が複数あれば連番になる', () => {
    const result: FloorPlanResult = {
      zones: [
        { kind: 'checkout', x0: 0.0, y0: 0.9, x1: 0.1, y1: 1 },
        { kind: 'checkout', x0: 0.9, y0: 0.9, x1: 1, y1: 1 },
      ],
    }
    const floor = rasterizeFloorPlan(result, 20, 20, floorId, DEFAULT_CATEGORIES)
    expect(floor.nodes.map((n) => n.name).sort()).toEqual(['レジ', 'レジ2'])
  })

  it('ラベルが無い棚には連番の名前を振る', () => {
    const result: FloorPlanResult = {
      zones: [
        { kind: 'shelf', x0: 0, y0: 0, x1: 0.2, y1: 0.2 },
        { kind: 'shelf', x0: 0.5, y0: 0.5, x1: 0.7, y1: 0.7 },
      ],
    }
    const floor = rasterizeFloorPlan(result, 10, 10, floorId, DEFAULT_CATEGORIES)
    expect(floor.shelves.map((s) => s.name)).toEqual(['棚1', '棚2'])
    expect(floor.shelves.every((s) => s.categoryIds.length === 0)).toBe(true)
  })
})
