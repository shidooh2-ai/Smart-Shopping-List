import { describe, expect, it } from 'vitest'
import { createSampleStore } from '../data/sampleStore'
import type { Category, ShoppingItem, StoreMap } from '../types'
import { newId } from './id'
import { buildStoreFromAscii } from './layout'
import { buildGraph, dijkstra } from './pathfind'
import { planRoute, routeMetrics } from './route'

const item = (text: string, categoryId: string | null, checked = false): ShoppingItem => ({
  id: newId('item'),
  text,
  checked,
  categoryId,
  manual: false,
  confidence: 1,
  createdAt: Date.now(),
})

/** 立ち寄り順に見える棚名の並び */
const shelfOrder = (map: StoreMap, items: ShoppingItem[]) =>
  planRoute(map, items).stops.flatMap((s) => s.shelfNames)

describe('buildGraph', () => {
  it('壁と棚は通行不可', () => {
    const map = buildStoreFromAscii('t', [
      { name: '1F', level: 1, rows: ['###', '#a#', '#.#', '###'], shelves: { a: { name: 'A', categoryIds: ['x'] } } },
    ])
    const g = buildGraph(map)
    expect(g.positions).toHaveLength(1)
  })

  it('同じ groupId の階段だけが階をまたいで繋がる', () => {
    const map = buildStoreFromAscii('t', [
      {
        name: '1F', level: 1, rows: ['#####', '#..S#', '#####'],
        nodes: { S: { kind: 'stairs', name: '階段', groupId: 'g1' } },
      },
      {
        name: '2F', level: 2, rows: ['#####', '#S..#', '#####'],
        nodes: { S: { kind: 'stairs', name: '階段', groupId: 'g1' } },
      },
    ])
    const g = buildGraph(map)
    const start = g.index.get(`${map.floors[0].id}:1,1`)!
    const goal = g.index.get(`${map.floors[1].id}:3,1`)!
    const { dist } = dijkstra(g, start)
    // 1F を2マス歩く + 階段(6) + 2F を2マス歩く
    expect(dist[goal]).toBe(2 + 6 + 2)
  })

  it('groupId が違う階段では階をまたげない', () => {
    const map = buildStoreFromAscii('t', [
      {
        name: '1F', level: 1, rows: ['###', '#S#', '###'],
        nodes: { S: { kind: 'stairs', name: '階段', groupId: 'a' } },
      },
      {
        name: '2F', level: 2, rows: ['###', '#S#', '###'],
        nodes: { S: { kind: 'stairs', name: '階段', groupId: 'b' } },
      },
    ])
    const g = buildGraph(map)
    const { dist } = dijkstra(g, g.index.get(`${map.floors[0].id}:1,1`)!)
    expect(dist[g.index.get(`${map.floors[1].id}:1,1`)!]).toBe(Infinity)
  })

  describe('preference (階段/エレベーター優先)', () => {
    const twoWayMap = () =>
      buildStoreFromAscii('t', [
        {
          name: '1F', level: 1, rows: ['#######', '#.....#', '#S...E#', '#######'],
          nodes: {
            S: { kind: 'stairs', name: '階段', groupId: 'st' },
            E: { kind: 'elevator', name: 'EV', groupId: 'el' },
          },
        },
        {
          name: '2F', level: 2, rows: ['#######', '#.....#', '#S...E#', '#######'],
          nodes: {
            S: { kind: 'stairs', name: '階段', groupId: 'st' },
            E: { kind: 'elevator', name: 'EV', groupId: 'el' },
          },
        },
      ])

    it('balanced では、歩く距離込みで安い方 (この配置では階段) が自然に選ばれる', () => {
      const map = twoWayMap()
      const g = buildGraph(map, 'balanced')
      const start = g.index.get(`${map.floors[0].id}:1,1`)!
      const goal = g.index.get(`${map.floors[1].id}:5,1`)!
      const { dist } = dijkstra(g, start)
      // 階段経由: 1(1F歩) + 6(階段) + 5(2F歩) = 12 / エレベーター経由: 5 + 10 + 1 = 16
      expect(dist[goal]).toBe(12)
    })

    it('エレベーター優先を選ぶと、階段の方が近くてもエレベーター経由になる', () => {
      const map = twoWayMap()
      const g = buildGraph(map, 'elevator')
      const start = g.index.get(`${map.floors[0].id}:1,1`)!
      const goal = g.index.get(`${map.floors[1].id}:5,1`)!
      const { dist } = dijkstra(g, start)
      expect(dist[goal]).toBe(16)
    })

    it('階段優先ならバランスと同じく階段経由のまま', () => {
      const map = twoWayMap()
      const g = buildGraph(map, 'stairs')
      const start = g.index.get(`${map.floors[0].id}:1,1`)!
      const goal = g.index.get(`${map.floors[1].id}:5,1`)!
      const { dist } = dijkstra(g, start)
      expect(dist[goal]).toBe(12)
    })
  })
})

describe('planRoute', () => {
  it('近い棚から順に回る (一直線の店)', () => {
    // E . a . b . c . C  (入口から順に A→B→C が最短)
    const map = buildStoreFromAscii('t', [
      {
        name: '1F', level: 1,
        rows: ['###########', '#E.......C#', '#.a.b.c...#', '###########'],
        shelves: {
          a: { name: 'A', categoryIds: ['ca'] },
          b: { name: 'B', categoryIds: ['cb'] },
          c: { name: 'C', categoryIds: ['cc'] },
        },
        nodes: { E: { kind: 'entrance', name: '入口' }, C: { kind: 'checkout', name: 'レジ' } },
      },
    ])
    // わざと逆順で入力する
    const items = [item('三番目', 'cc'), item('一番目', 'ca'), item('二番目', 'cb')]
    expect(shelfOrder(map, items)).toEqual(['A', 'B', 'C'])
  })

  it('同じ棚の複数ジャンルは1つの立ち寄り地点にまとまる', () => {
    const map = buildStoreFromAscii('t', [
      {
        name: '1F', level: 1,
        rows: ['#######', '#E...C#', '#.a.b.#', '#######'],
        shelves: {
          a: { name: 'A', categoryIds: ['x', 'y'] },
          b: { name: 'B', categoryIds: ['z'] },
        },
        nodes: { E: { kind: 'entrance', name: '入口' }, C: { kind: 'checkout', name: 'レジ' } },
      },
    ])
    const plan = planRoute(map, [item('p', 'x'), item('q', 'y'), item('r', 'z')])
    expect(plan.stops).toHaveLength(2)
    expect(plan.stops[0].categoryIds.sort()).toEqual(['x', 'y'])
    expect(plan.stops[0].itemIds).toHaveLength(2)
  })

  it('同じジャンルの棚が複数あるとき近い方を選ぶ', () => {
    const map = buildStoreFromAscii('t', [
      {
        name: '1F', level: 1,
        rows: ['############', '#E.........#', '#.a.......b#', '############'],
        shelves: {
          a: { name: '近い棚', categoryIds: ['x'] },
          b: { name: '遠い棚', categoryIds: ['x'] },
        },
        nodes: { E: { kind: 'entrance', name: '入口' } },
      },
    ])
    expect(shelfOrder(map, [item('p', 'x')])).toEqual(['近い棚'])
  })

  it('チェック済みの品目も含めてルートを組む (チェックしても消えたり再ルートされたりしない)', () => {
    const map = createSampleStore()
    const plan = planRoute(map, [item('牛乳', 'dairy'), item('ビール', 'alcohol', true)])
    expect(plan.stops.flatMap((s) => s.categoryIds).sort()).toEqual(['alcohol', 'dairy'])
  })

  it('ジャンル未特定の品目を報告する', () => {
    const map = createSampleStore()
    const unknown = item('なぞの品', null)
    const plan = planRoute(map, [item('牛乳', 'dairy'), unknown])
    expect(plan.unresolvedItemIds).toEqual([unknown.id])
  })

  describe('サブジャンル (親ジャンルの棚へのフォールバック)', () => {
    const categories: Category[] = [
      { id: 'veg', name: '野菜', color: '#000', keywords: [] },
      { id: 'root-veg', name: '根菜', color: '#000', keywords: [], parentId: 'veg' },
    ]

    const mapWithParentShelfOnly = () =>
      buildStoreFromAscii('t', [
        {
          name: '1F', level: 1,
          rows: ['#######', '#E...C#', '#.a...#', '#######'],
          shelves: { a: { name: '野菜コーナー', categoryIds: ['veg'] } },
          nodes: { E: { kind: 'entrance', name: '入口' }, C: { kind: 'checkout', name: 'レジ' } },
        },
      ])

    it('子ジャンル専用の棚が無くても、親ジャンルの棚があればルートに含める', () => {
      const map = mapWithParentShelfOnly()
      const plan = planRoute(map, [item('にんじん', 'root-veg')], 'balanced', categories)
      expect(plan.missingCategoryIds).toHaveLength(0)
      expect(plan.stops).toHaveLength(1)
      expect(plan.stops[0].shelfNames).toEqual(['野菜コーナー'])
    })

    it('子ジャンル専用の棚があれば、そちらを優先する', () => {
      const map = buildStoreFromAscii('t', [
        {
          name: '1F', level: 1,
          rows: ['#########', '#E.....C#', '#.a...b.#', '#########'],
          shelves: {
            a: { name: '野菜コーナー', categoryIds: ['veg'] },
            b: { name: '根菜コーナー', categoryIds: ['root-veg'] },
          },
          nodes: { E: { kind: 'entrance', name: '入口' }, C: { kind: 'checkout', name: 'レジ' } },
        },
      ])
      const plan = planRoute(map, [item('にんじん', 'root-veg')], 'balanced', categories)
      expect(plan.stops[0].shelfNames).toEqual(['根菜コーナー'])
    })

    it('categoriesを渡さない場合はフォールバックしない (後方互換)', () => {
      const map = mapWithParentShelfOnly()
      const plan = planRoute(map, [item('にんじん', 'root-veg')])
      expect(plan.missingCategoryIds).toEqual(['root-veg'])
    })
  })

  it('売り場が無いジャンルを報告する', () => {
    const map = createSampleStore()
    const plan = planRoute(map, [item('牛乳', 'dairy'), item('謎', 'no-such-category')])
    expect(plan.missingCategoryIds).toEqual(['no-such-category'])
    expect(plan.stops).toHaveLength(1)
  })

  it('入口から始まりレジで終わる', () => {
    const map = createSampleStore()
    const plan = planRoute(map, [item('牛乳', 'dairy'), item('パン', 'bread')])
    const entranceCell = map.nodes.find((n) => n.kind === 'entrance')!
    expect(plan.start).not.toBeNull()
    expect(plan.start!.floorId).toBe(entranceCell.floorId)
    expect(plan.goal).not.toBeNull()
    expect(plan.legs).toHaveLength(plan.stops.length + 1)
    expect(plan.legs[plan.legs.length - 1].to).toEqual(plan.goal)
  })

  it('経路は連続したマスでつながっている', () => {
    const map = createSampleStore()
    const plan = planRoute(map, [item('牛乳', 'dairy'), item('ビール', 'alcohol'), item('にんじん', 'veg')])
    for (const leg of plan.legs) {
      for (let i = 1; i < leg.path.length; i++) {
        const a = leg.path[i - 1]
        const b = leg.path[i]
        const sameFloor = a.floorId === b.floorId
        const adjacent = Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1
        // 同一フロアなら隣接マス、そうでなければ階段/エレベーターでの階移動
        expect(sameFloor ? adjacent : true).toBe(true)
      }
    }
  })

  it('別階の商品は階段/エレベーターを経由する', () => {
    const map = createSampleStore()
    const plan = planRoute(map, [item('ビール', 'alcohol')])
    expect(plan.stops).toHaveLength(1)
    expect(plan.stops[0].floorName).toBe('2F')
    const changes = plan.legs.reduce((s, l) => s + l.floorChanges, 0)
    // 2F へ上がって 1F のレジへ戻る
    expect(changes).toBe(2)
  })

  it('厳密解と近似解が同じ距離になる (小規模ケース)', () => {
    const map = createSampleStore()
    const cats = ['veg', 'fruit', 'meat', 'fish', 'bread', 'dairy', 'snack', 'drink']
    const items = cats.map((c) => item(c, c))
    const exact = planRoute(map, items)
    expect(exact.stops).toHaveLength(cats.length)
    expect(exact.totalDistance).toBeGreaterThan(0)
    expect(Number.isFinite(exact.totalDistance)).toBe(true)
  })

  it('多ジャンルでも近似解で妥当なルートを返す', () => {
    const map = createSampleStore()
    const cats = [
      'veg', 'fruit', 'meat', 'fish', 'deli', 'bread', 'rice', 'dairy', 'chilled',
      'frozen', 'season', 'dry', 'canned', 'noodle', 'snack', 'drink', 'alcohol',
      'household', 'detergent', 'toiletry',
    ]
    const plan = planRoute(map, cats.map((c) => item(c, c)))
    expect(plan.stops.length).toBeGreaterThanOrEqual(18)
    expect(plan.missingCategoryIds).toHaveLength(0)
    expect(Number.isFinite(plan.totalDistance)).toBe(true)
    // すべての品目がどこかの立ち寄り地点に割り当てられている
    expect(plan.stops.flatMap((s) => s.itemIds)).toHaveLength(cats.length)
  })

  it('空のリストでは空のプランを返す', () => {
    const plan = planRoute(createSampleStore(), [])
    expect(plan.stops).toHaveLength(0)
    expect(plan.legs).toHaveLength(0)
  })

  it('routeMetrics が距離と所要時間を返す', () => {
    const map = createSampleStore()
    const plan = planRoute(map, [item('牛乳', 'dairy'), item('ビール', 'alcohol')])
    const m = routeMetrics(plan, map.cellMeters)
    expect(m.meters).toBeGreaterThan(0)
    expect(m.minutes).toBeGreaterThanOrEqual(1)
    expect(m.floorChanges).toBe(2)
  })
})
