import { getFloor, nodeAt } from './grid'
import type { Pos, RoutePlan, StoreMap } from '../types'

/** 地図を寄せる範囲 (マス単位。x1/y1 も含む) */
export interface CellArea {
  x0: number
  y0: number
  x1: number
  y1: number
}

export interface NavStep {
  /** 'stop' = 立ち寄り先、'relay' = 階段・エレベーターへの中継、'checkout' = レジへ */
  kind: 'stop' | 'relay' | 'checkout'
  /** kind==='stop' のときの立ち寄り番号。それ以外は null */
  stopOrder: number | null
  /** この区間の終点にある階 */
  floorId: string
  /** その階を通る経路がちょうど収まる範囲 */
  area: CellArea
  /** kind==='relay' のときの案内文 (例: "階段へ") */
  label?: string
}

function areaOf(points: Pos[]): CellArea {
  const first = points[0]
  return points.reduce<CellArea>(
    (acc, p) => ({
      x0: Math.min(acc.x0, p.x),
      y0: Math.min(acc.y0, p.y),
      x1: Math.max(acc.x1, p.x),
      y1: Math.max(acc.y1, p.y),
    }),
    { x0: first.x, y0: first.y, x1: first.x, y1: first.y },
  )
}

/** 経路を、フロアが変わるたびに区切った連続区間の並びにする。 */
function splitByFloor(path: Pos[]): Pos[][] {
  const runs: Pos[][] = []
  for (const p of path) {
    const last = runs[runs.length - 1]
    if (last && last[last.length - 1].floorId === p.floorId) last.push(p)
    else runs.push([p])
  }
  return runs
}

/**
 * ルートを「区間ごとのナビ手順」に分解する。
 *
 * plan.legs[i] は stops[i] へ向かう区間で、最後の区間はレジへ向かう (立ち寄り先は無い)。
 * 階をまたぐ区間は、フロアが変わるたびに区切って手順を分ける
 * (例: 1F入口→階段→2Fの棚、なら「階段へ」「棚へ」の2手順になる)。
 * 中継 (階段・エレベーターへ) の手順には案内文 (label) が付く。
 */
export function buildNavSteps(plan: RoutePlan | null, map: StoreMap | null = null): NavStep[] {
  if (!plan || !map) return []
  const steps: NavStep[] = []

  plan.legs.forEach((leg, i) => {
    if (leg.path.length === 0) return
    const stop = i < plan.stops.length ? plan.stops[i] : null
    const runs = splitByFloor(leg.path)

    runs.forEach((run, ri) => {
      const floorId = run[run.length - 1].floorId
      if (ri < runs.length - 1) {
        // このフロア内で最後にいる場所 (=階段・エレベーターの手前) から、乗り物の名前を引く
        const node = nodeAt(map, run[run.length - 1])
        steps.push({
          kind: 'relay',
          stopOrder: null,
          floorId,
          area: areaOf(run),
          label: node ? `${node.name}へ` : (getFloor(map, floorId)?.name ?? '') + 'の乗り場へ',
        })
        return
      }
      steps.push({
        kind: stop ? 'stop' : 'checkout',
        stopOrder: stop?.order ?? null,
        floorId,
        area: areaOf(run),
      })
    })
  })

  return steps
}

/** 指定した立ち寄り番号の手順が何番目か (見つからなければ -1)。 */
export function stepIndexOfStop(steps: NavStep[], stopOrder: number): number {
  return steps.findIndex((s) => s.stopOrder === stopOrder)
}

/**
 * まだ買い終わっていない最初の手順を返す。直前が中継 (階段・エレベーターへ) なら
 * そこから案内を始める。全部終わっていれば最後の手順 (レジへ向かう区間) を返す。
 */
export function firstUnfinishedStep(steps: NavStep[], doneStopOrders: Set<number>): number {
  const index = steps.findIndex((s) => s.kind === 'stop' && s.stopOrder !== null && !doneStopOrders.has(s.stopOrder))
  if (index === -1) return Math.max(0, steps.length - 1)
  if (index > 0 && steps[index - 1].kind === 'relay') return index - 1
  return index
}

/**
 * いま見ている手順の品目を買い終わっていたら、次の手順へ進める。
 * 通り道の中継地点 (階段・エレベーターへ) やレジは飛ばさずそこで止め、
 * 買い終わった立ち寄り先だけをまとめて読み飛ばす。
 */
export function advanceIfDone(steps: NavStep[], current: number, doneStopOrders: Set<number>): number {
  const step = steps[current]
  if (!step || step.kind !== 'stop' || step.stopOrder === null || !doneStopOrders.has(step.stopOrder)) return current
  let i = current + 1
  while (i < steps.length - 1) {
    const s = steps[i]
    if (s.kind === 'stop' && s.stopOrder !== null && doneStopOrders.has(s.stopOrder)) {
      i++
      continue
    }
    break
  }
  return i
}
