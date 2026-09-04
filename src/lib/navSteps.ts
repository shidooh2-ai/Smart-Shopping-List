import type { Pos, RoutePlan } from '../types'

/** 地図を寄せる範囲 (マス単位。x1/y1 も含む) */
export interface CellArea {
  x0: number
  y0: number
  x1: number
  y1: number
}

export interface NavStep {
  /** この区間の終点にある立ち寄り番号。レジへ向かう最後の区間は null */
  stopOrder: number | null
  /** 終点のあるフロア (区間の途中で階をまたぐ場合は、着いた先の階) */
  floorId: string
  /** その階を通る経路がちょうど収まる範囲 */
  area: CellArea
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

/**
 * ルートを「区間ごとのナビ手順」に分解する。
 *
 * plan.legs[i] は stops[i] へ向かう区間で、最後の区間はレジへ向かう (立ち寄り先は無い)。
 * 階をまたぐ区間では着いた先の階を表示したいので、終点の階と、その階を通る部分だけを
 * 寄せる範囲にする。
 */
export function buildNavSteps(plan: RoutePlan | null): NavStep[] {
  if (!plan) return []
  const steps: NavStep[] = []

  plan.legs.forEach((leg, i) => {
    if (leg.path.length === 0) return
    const stop = i < plan.stops.length ? plan.stops[i] : null
    const destination = leg.path[leg.path.length - 1]
    const floorId = stop?.pos.floorId ?? destination.floorId
    // 着いた先の階を通る部分だけを写す (別の階を歩いた分まで含めると、寄りが甘くなる)
    const onFloor = leg.path.filter((p) => p.floorId === floorId)
    steps.push({
      stopOrder: stop?.order ?? null,
      floorId,
      area: areaOf(onFloor.length > 0 ? onFloor : [destination]),
    })
  })

  return steps
}

/** 指定した立ち寄り番号の手順が何番目か (見つからなければ -1)。 */
export function stepIndexOfStop(steps: NavStep[], stopOrder: number): number {
  return steps.findIndex((s) => s.stopOrder === stopOrder)
}

/**
 * まだ買い終わっていない最初の手順を返す。
 * 全部終わっていれば最後の手順 (レジへ向かう区間) を返す。
 */
export function firstUnfinishedStep(steps: NavStep[], doneStopOrders: Set<number>): number {
  const index = steps.findIndex((s) => s.stopOrder !== null && !doneStopOrders.has(s.stopOrder))
  return index === -1 ? Math.max(0, steps.length - 1) : index
}
