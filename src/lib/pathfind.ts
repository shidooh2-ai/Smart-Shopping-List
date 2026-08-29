import type { MapNode, Pos, StoreMap } from '../types'
import { NEIGHBORS, cellAt, getFloor, idx, isWalkable, posKey } from './grid'

/** 移動コストの設定。1マス歩く = 1。 */
export const COST = {
  /** 階段: 1フロア上下するごとのコスト */
  stairsPerLevel: 6,
  /** エレベーター: 待ち時間相当の固定コスト */
  elevatorBase: 8,
  /** エレベーター: 1フロアごとの追加コスト */
  elevatorPerLevel: 2,
}

export interface Graph {
  /** ノード番号 -> 座標 */
  positions: Pos[]
  /** posKey -> ノード番号 */
  index: Map<string, number>
  /** 隣接リスト [相手ノード, コスト] */
  adj: Array<Array<[number, number]>>
}

/** 全フロアの通行可能マスをつなぎ、階段/エレベーターで階をまたぐグラフを作る。 */
export function buildGraph(map: StoreMap): Graph {
  const positions: Pos[] = []
  const index = new Map<string, number>()

  for (const floor of map.floors) {
    for (let y = 0; y < floor.height; y++) {
      for (let x = 0; x < floor.width; x++) {
        if (!isWalkable(cellAt(floor, x, y))) continue
        const p: Pos = { floorId: floor.id, x, y }
        index.set(posKey(p), positions.length)
        positions.push(p)
      }
    }
  }

  const adj: Array<Array<[number, number]>> = positions.map(() => [])
  const link = (a: number, b: number, cost: number) => {
    adj[a].push([b, cost])
    adj[b].push([a, cost])
  }

  // 同一フロア内の上下左右接続
  for (const floor of map.floors) {
    for (let y = 0; y < floor.height; y++) {
      for (let x = 0; x < floor.width; x++) {
        const from = index.get(posKey({ floorId: floor.id, x, y }))
        if (from === undefined) continue
        for (const [dx, dy] of NEIGHBORS) {
          // 双方向リンクの重複を避けるため右と下だけ張る
          if (dx < 0 || dy < 0) continue
          const to = index.get(posKey({ floorId: floor.id, x: x + dx, y: y + dy }))
          if (to === undefined) continue
          link(from, to, 1)
        }
      }
    }
  }

  // 階段/エレベーターによる階間接続
  const levelOf = new Map(map.floors.map((f) => [f.id, f.level]))
  const groups = new Map<string, Array<{ node: MapNode; graphIdx: number }>>()
  const nodeCellIndex = new Map<string, number>()
  for (const floor of map.floors) {
    for (let y = 0; y < floor.height; y++) {
      for (let x = 0; x < floor.width; x++) {
        const c = floor.cells[idx(floor, x, y)]
        if (c && c.k === 'node') {
          const gi = index.get(posKey({ floorId: floor.id, x, y }))
          if (gi !== undefined) nodeCellIndex.set(c.nodeId, gi)
        }
      }
    }
  }
  for (const node of map.nodes) {
    if (node.kind !== 'stairs' && node.kind !== 'elevator') continue
    if (!node.groupId) continue
    const gi = nodeCellIndex.get(node.id)
    if (gi === undefined) continue
    const list = groups.get(node.groupId) ?? []
    list.push({ node, graphIdx: gi })
    groups.set(node.groupId, list)
  }

  for (const list of groups.values()) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i]
        const b = list[j]
        const la = levelOf.get(a.node.floorId)
        const lb = levelOf.get(b.node.floorId)
        if (la === undefined || lb === undefined || la === lb) continue
        const diff = Math.abs(la - lb)
        const isElevator = a.node.kind === 'elevator' || b.node.kind === 'elevator'
        const cost = isElevator
          ? COST.elevatorBase + COST.elevatorPerLevel * diff
          : COST.stairsPerLevel * diff
        link(a.graphIdx, b.graphIdx, cost)
      }
    }
  }

  return { positions, index, adj }
}

/** 単純な二分ヒープ (優先度付きキュー)。 */
class MinHeap {
  private heap: Array<[number, number]> = []
  get size() {
    return this.heap.length
  }
  push(cost: number, node: number) {
    const h = this.heap
    h.push([cost, node])
    let i = h.length - 1
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (h[parent][0] <= h[i][0]) break
      ;[h[parent], h[i]] = [h[i], h[parent]]
      i = parent
    }
  }
  pop(): [number, number] | undefined {
    const h = this.heap
    if (h.length === 0) return undefined
    const top = h[0]
    const last = h.pop()!
    if (h.length > 0) {
      h[0] = last
      let i = 0
      for (;;) {
        const l = 2 * i + 1
        const r = l + 1
        let smallest = i
        if (l < h.length && h[l][0] < h[smallest][0]) smallest = l
        if (r < h.length && h[r][0] < h[smallest][0]) smallest = r
        if (smallest === i) break
        ;[h[smallest], h[i]] = [h[i], h[smallest]]
        i = smallest
      }
    }
    return top
  }
}

export interface Distances {
  dist: Float64Array
  prev: Int32Array
}

/** source から全ノードへの最短距離と経路復元用の前ノードを求める。 */
export function dijkstra(graph: Graph, source: number): Distances {
  const n = graph.positions.length
  const dist = new Float64Array(n).fill(Infinity)
  const prev = new Int32Array(n).fill(-1)
  if (source < 0 || source >= n) return { dist, prev }
  dist[source] = 0
  const heap = new MinHeap()
  heap.push(0, source)
  while (heap.size > 0) {
    const top = heap.pop()!
    const [d, u] = top
    if (d > dist[u]) continue
    for (const [v, w] of graph.adj[u]) {
      const nd = d + w
      if (nd < dist[v]) {
        dist[v] = nd
        prev[v] = u
        heap.push(nd, v)
      }
    }
  }
  return { dist, prev }
}

/** dijkstra の結果から source -> target の経路を座標列として復元する。 */
export function reconstructPath(graph: Graph, from: Distances, target: number): Pos[] {
  if (target < 0 || !Number.isFinite(from.dist[target])) return []
  const out: number[] = []
  let cur = target
  while (cur !== -1) {
    out.push(cur)
    cur = from.prev[cur]
  }
  out.reverse()
  return out.map((i) => graph.positions[i])
}

/** 最も近い通行可能マスのノード番号を返す (見つからなければ -1)。 */
export function nearestWalkable(graph: Graph, map: StoreMap, pos: Pos): number {
  const direct = graph.index.get(posKey(pos))
  if (direct !== undefined) return direct
  const floor = getFloor(map, pos.floorId)
  if (!floor) return -1
  let best = -1
  let bestDist = Infinity
  for (let i = 0; i < graph.positions.length; i++) {
    const p = graph.positions[i]
    if (p.floorId !== pos.floorId) continue
    const d = Math.abs(p.x - pos.x) + Math.abs(p.y - pos.y)
    if (d < bestDist) {
      bestDist = d
      best = i
    }
  }
  return best
}
