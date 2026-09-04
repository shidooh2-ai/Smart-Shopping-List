import type { Pos, RouteLeg, RoutePlan, RoutePreference, RouteStop, ShoppingItem, StoreMap } from '../types'
import { getFloor, nodePos, posKey, shelfAccessCells, shelfCells } from './grid'
import { type Distances, type Graph, buildGraph, dijkstra, reconstructPath } from './pathfind'

/** 厳密解 (Held-Karp) を使う立ち寄り地点数の上限。これを超えると近似解に切り替える。 */
const EXACT_LIMIT = 12

interface Candidate {
  /** sources 配列内の添字 */
  src: number
  shelfId: string
}

interface Group {
  categoryId: string
  itemIds: string[]
  cands: Candidate[]
}

const emptyPlan = (): RoutePlan => ({
  stops: [],
  legs: [],
  totalDistance: 0,
  totalSteps: 0,
  start: null,
  goal: null,
  unresolvedItemIds: [],
  missingCategoryIds: [],
  unreachableCategoryIds: [],
})

/**
 * 買い物リストから店内の買い回りルートを組み立てる。
 *
 * 1. 未チェックの品目をジャンルごとにまとめる
 * 2. ジャンルを取り扱う棚の「前に立てるマス」を候補地点にする
 * 3. 入口→各ジャンル(1棚選択)→レジ を最短で回る順序を解く
 *    (集合TSP。12ジャンル以下は厳密解、それ以上は最近傍法+2-opt)
 */
export function planRoute(
  map: StoreMap,
  items: ShoppingItem[],
  preference: RoutePreference = 'balanced',
): RoutePlan {
  const plan = emptyPlan()
  const active = items.filter((i) => !i.checked)
  plan.unresolvedItemIds = active.filter((i) => !i.categoryId).map((i) => i.id)

  const graph = buildGraph(map, preference)
  if (graph.positions.length === 0) return plan

  // --- 出発地点と終了地点 ---
  const startPos = pickStart(map, graph)
  if (!startPos) return plan
  const startIdx = graph.index.get(posKey(startPos))
  if (startIdx === undefined) return plan
  plan.start = startPos

  const checkoutPositions: Pos[] = []
  for (const n of map.nodes) {
    if (n.kind !== 'checkout') continue
    const p = nodePos(map, n)
    if (p && graph.index.has(posKey(p))) checkoutPositions.push(p)
  }

  // --- ジャンルごとの候補地点 ---
  const byCategory = new Map<string, string[]>()
  for (const item of active) {
    if (!item.categoryId) continue
    const list = byCategory.get(item.categoryId) ?? []
    list.push(item.id)
    byCategory.set(item.categoryId, list)
  }
  if (byCategory.size === 0) return plan

  const sources: number[] = [startIdx]
  const sourceOf = new Map<number, number>([[startIdx, 0]])
  const addSource = (graphIdx: number): number => {
    const existing = sourceOf.get(graphIdx)
    if (existing !== undefined) return existing
    const s = sources.length
    sources.push(graphIdx)
    sourceOf.set(graphIdx, s)
    return s
  }
  const goalSrcs: Array<number | null> =
    checkoutPositions.length > 0
      ? checkoutPositions.map((p) => addSource(graph.index.get(posKey(p))!))
      : [null]

  const groups: Group[] = []
  for (const [categoryId, itemIds] of byCategory) {
    const shelves = map.shelves.filter((s) => s.categoryIds.includes(categoryId))
    if (shelves.length === 0) {
      plan.missingCategoryIds.push(categoryId)
      continue
    }
    const cands: Candidate[] = []
    const seen = new Set<number>()
    for (const shelf of shelves) {
      const access = bestAccessCell(map, shelf.id)
      if (!access) continue
      const gi = graph.index.get(posKey(access))
      if (gi === undefined) continue
      const src = addSource(gi)
      if (seen.has(src)) continue
      seen.add(src)
      cands.push({ src, shelfId: shelf.id })
    }
    if (cands.length === 0) {
      plan.missingCategoryIds.push(categoryId)
      continue
    }
    groups.push({ categoryId, itemIds, cands })
  }

  // --- 距離表 ---
  const from: Distances[] = sources.map((s) => dijkstra(graph, s))
  const D = (a: number, b: number) => from[a].dist[sources[b]]

  // 入口から到達できない候補は落とす
  const reachable: Group[] = []
  for (const g of groups) {
    const cands = g.cands.filter((c) => Number.isFinite(D(0, c.src)))
    if (cands.length === 0) {
      plan.unreachableCategoryIds.push(g.categoryId)
      continue
    }
    reachable.push({ ...g, cands })
  }
  if (reachable.length === 0) return plan

  // レジが複数あるときは、最後に寄るレジまで含めて総距離が最小になる組み合わせを選ぶ
  const tourCost = (seq: VisitChoice[], goal: number | null): number => {
    let total = 0
    let prev = 0
    for (const v of seq) {
      total += D(prev, v.src)
      prev = v.src
    }
    if (goal !== null) total += D(prev, goal)
    return total
  }

  let order: VisitChoice[] = []
  let goalSrc: number | null = null
  let bestCost = Infinity
  for (const gs of goalSrcs) {
    const candidateOrder = solveGroupTsp(reachable, D, 0, gs)
    if (candidateOrder.length === 0) continue
    const cost = tourCost(candidateOrder, gs)
    if (cost < bestCost) {
      bestCost = cost
      order = candidateOrder
      goalSrc = gs
    }
  }
  if (order.length === 0) return plan
  if (goalSrc !== null) plan.goal = graph.positions[sources[goalSrc]]

  // --- 立ち寄り地点の組み立て (同じマスに立つ連続ジャンルはまとめる) ---
  const rawStops = order.map(({ groupIndex, src }) => {
    const g = reachable[groupIndex]
    const cand = g.cands.find((c) => c.src === src) ?? g.cands[0]
    return { src: cand.src, shelfId: cand.shelfId, categoryId: g.categoryId, itemIds: g.itemIds }
  })

  const stops: RouteStop[] = []
  for (const raw of rawStops) {
    const pos = graph.positions[sources[raw.src]]
    const last = stops[stops.length - 1]
    if (last && posKey(last.pos) === posKey(pos)) {
      if (!last.shelfIds.includes(raw.shelfId)) {
        last.shelfIds.push(raw.shelfId)
        last.shelfNames.push(shelfName(map, raw.shelfId))
      }
      last.categoryIds.push(raw.categoryId)
      last.itemIds.push(...raw.itemIds)
      continue
    }
    stops.push({
      order: stops.length + 1,
      pos,
      shelfIds: [raw.shelfId],
      shelfNames: [shelfName(map, raw.shelfId)],
      floorName: getFloor(map, pos.floorId)?.name ?? '',
      categoryIds: [raw.categoryId],
      itemIds: [...raw.itemIds],
    })
  }
  stops.forEach((s, i) => {
    s.order = i + 1
  })
  plan.stops = stops

  // --- 区間ごとの経路 ---
  const waypoints: number[] = [0, ...rawStops.map((r) => r.src)]
  if (goalSrc !== null) waypoints.push(goalSrc)
  const dedupedWaypoints = waypoints.filter((s, i) => i === 0 || s !== waypoints[i - 1])

  for (let i = 0; i < dedupedWaypoints.length - 1; i++) {
    const a = dedupedWaypoints[i]
    const b = dedupedWaypoints[i + 1]
    const path = reconstructPath(graph, from[a], sources[b])
    const distance = D(a, b)
    if (!Number.isFinite(distance)) continue
    let steps = 0
    let floorChanges = 0
    for (let k = 1; k < path.length; k++) {
      if (path[k].floorId === path[k - 1].floorId) steps++
      else floorChanges++
    }
    plan.legs.push({
      from: graph.positions[sources[a]],
      to: graph.positions[sources[b]],
      path,
      distance,
      steps,
      floorChanges,
    })
  }
  plan.totalDistance = plan.legs.reduce((sum, l) => sum + l.distance, 0)
  plan.totalSteps = plan.legs.reduce((sum, l) => sum + l.steps, 0)

  return plan
}

function shelfName(map: StoreMap, shelfId: string): string {
  return map.shelves.find((s) => s.id === shelfId)?.name ?? '棚'
}

/** 入口ノード。無ければ最下階の通行可能マスを出発点にする。 */
function pickStart(map: StoreMap, graph: Graph): Pos | null {
  const entrance = map.nodes.find((n) => n.kind === 'entrance')
  if (entrance) {
    const p = nodePos(map, entrance)
    if (p && graph.index.has(posKey(p))) return p
  }
  const floors = [...map.floors].sort((a, b) => a.level - b.level)
  for (const f of floors) {
    const p = graph.positions.find((pp) => pp.floorId === f.id)
    if (p) return p
  }
  return graph.positions[0] ?? null
}

/** 棚の中心にいちばん近い「棚の前のマス」を選ぶ。 */
function bestAccessCell(map: StoreMap, shelfId: string): Pos | null {
  const shelf = map.shelves.find((s) => s.id === shelfId)
  if (!shelf) return null
  const access = shelfAccessCells(map, shelf)
  if (access.length === 0) return null
  const cells = shelfCells(map, shelf)
  if (cells.length === 0) return access[0]
  const cx = cells.reduce((a, c) => a + c.x, 0) / cells.length
  const cy = cells.reduce((a, c) => a + c.y, 0) / cells.length
  let best = access[0]
  let bestD = Infinity
  for (const a of access) {
    const d = (a.x - cx) ** 2 + (a.y - cy) ** 2
    if (d < bestD) {
      bestD = d
      best = a
    }
  }
  return best
}

export interface VisitChoice {
  groupIndex: number
  src: number
}

/**
 * 集合TSP: 各グループから1地点ずつ選び、start から (あれば goal まで) の総距離を最小化する。
 * グループ数が少ないときは Held-Karp で厳密解、多いときは最近傍法 + 2-opt。
 */
export function solveGroupTsp(
  groups: Group[],
  D: (a: number, b: number) => number,
  start: number,
  goal: number | null,
): VisitChoice[] {
  const G = groups.length
  if (G === 0) return []
  return G <= EXACT_LIMIT ? solveExact(groups, D, start, goal) : solveHeuristic(groups, D, start, goal)
}

function solveExact(
  groups: Group[],
  D: (a: number, b: number) => number,
  start: number,
  goal: number | null,
): VisitChoice[] {
  const G = groups.length
  const flat: VisitChoice[] = []
  groups.forEach((g, gi) => g.cands.forEach((c) => flat.push({ groupIndex: gi, src: c.src })))
  const F = flat.length
  const full = (1 << G) - 1
  const size = (full + 1) * F
  const dp = new Float64Array(size).fill(Infinity)
  const par = new Int32Array(size).fill(-1)

  flat.forEach((f, i) => {
    const d = D(start, f.src)
    const cell = (1 << f.groupIndex) * F + i
    if (d < dp[cell]) dp[cell] = d
  })

  for (let mask = 1; mask <= full; mask++) {
    for (let i = 0; i < F; i++) {
      const cur = dp[mask * F + i]
      if (!Number.isFinite(cur)) continue
      if ((mask & (1 << flat[i].groupIndex)) === 0) continue
      for (let j = 0; j < F; j++) {
        const gj = flat[j].groupIndex
        if (mask & (1 << gj)) continue
        const step = D(flat[i].src, flat[j].src)
        if (!Number.isFinite(step)) continue
        const nm = mask | (1 << gj)
        const nd = cur + step
        if (nd < dp[nm * F + j]) {
          dp[nm * F + j] = nd
          par[nm * F + j] = i
        }
      }
    }
  }

  let best = Infinity
  let bestI = -1
  for (let i = 0; i < F; i++) {
    const cur = dp[full * F + i]
    if (!Number.isFinite(cur)) continue
    const total = goal === null ? cur : cur + D(flat[i].src, goal)
    if (total < best) {
      best = total
      bestI = i
    }
  }
  if (bestI < 0) return []

  const out: VisitChoice[] = []
  let mask = full
  let i = bestI
  while (i !== -1) {
    out.push(flat[i])
    const p = par[mask * F + i]
    mask &= ~(1 << flat[i].groupIndex)
    i = p
  }
  out.reverse()
  return out
}

function solveHeuristic(
  groups: Group[],
  D: (a: number, b: number) => number,
  start: number,
  goal: number | null,
): VisitChoice[] {
  const remaining = new Set(groups.map((_, i) => i))
  let cur = start
  let seq: VisitChoice[] = []

  while (remaining.size > 0) {
    let bestG = -1
    let bestSrc = -1
    let bestD = Infinity
    for (const gi of remaining) {
      for (const c of groups[gi].cands) {
        const d = D(cur, c.src)
        if (d < bestD) {
          bestD = d
          bestG = gi
          bestSrc = c.src
        }
      }
    }
    if (bestG < 0) break
    remaining.delete(bestG)
    seq.push({ groupIndex: bestG, src: bestSrc })
    cur = bestSrc
  }

  const tourCost = (s: VisitChoice[]): number => {
    let total = 0
    let prev = start
    for (const v of s) {
      total += D(prev, v.src)
      prev = v.src
    }
    if (goal !== null) total += D(prev, goal)
    return total
  }

  // 2-opt (区間反転) で順序を改善し、その後で各グループの立ち位置を選び直す
  for (let round = 0; round < 4; round++) {
    let improved = false
    let bestCost = tourCost(seq)
    for (let i = 0; i < seq.length - 1; i++) {
      for (let j = i + 1; j < seq.length; j++) {
        const next = [...seq.slice(0, i), ...seq.slice(i, j + 1).reverse(), ...seq.slice(j + 1)]
        const cost = tourCost(next)
        if (cost < bestCost - 1e-9) {
          seq = next
          bestCost = cost
          improved = true
        }
      }
    }
    for (let i = 0; i < seq.length; i++) {
      const prev = i === 0 ? start : seq[i - 1].src
      const nxt = i === seq.length - 1 ? goal : seq[i + 1].src
      let bestSrc = seq[i].src
      let bestD = D(prev, bestSrc) + (nxt === null ? 0 : D(bestSrc, nxt))
      for (const c of groups[seq[i].groupIndex].cands) {
        const d = D(prev, c.src) + (nxt === null ? 0 : D(c.src, nxt))
        if (d < bestD - 1e-9) {
          bestD = d
          bestSrc = c.src
          improved = true
        }
      }
      seq[i] = { groupIndex: seq[i].groupIndex, src: bestSrc }
    }
    if (!improved) break
  }

  return seq
}

/** ルートの歩行距離(m)と所要時間の目安。 */
export function routeMetrics(plan: RoutePlan, cellMeters: number) {
  const meters = plan.totalSteps * cellMeters
  // 店内は寄り道込みで 1.0 m/s 程度。階移動は1回あたり30秒とみなす
  const floorChanges = plan.legs.reduce((s, l) => s + l.floorChanges, 0)
  const seconds = meters / 1.0 + floorChanges * 30
  return { meters: Math.round(meters), minutes: Math.max(1, Math.round(seconds / 60)), floorChanges }
}

export type { Group as RouteGroup, RouteLeg }
