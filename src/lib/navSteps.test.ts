import { describe, expect, it } from 'vitest'
import { createSampleStore } from '../data/sampleStore'
import type { RoutePlan, ShoppingItem } from '../types'
import { newId } from './id'
import { advanceIfDone, buildNavSteps, firstUnfinishedStep, stepIndexOfStop } from './navSteps'
import { planRoute } from './route'

const item = (text: string, categoryId: string): ShoppingItem => ({
  id: newId('item'),
  text,
  checked: false,
  categoryId,
  manual: false,
  confidence: 1,
  createdAt: Date.now(),
})

const sampleMap = () => createSampleStore()
const samplePlan = (map = sampleMap()): RoutePlan =>
  planRoute(map, [item('牛乳', 'dairy'), item('にんじん', 'veg'), item('ビール', 'alcohol')])

describe('buildNavSteps', () => {
  it('ルートが無ければ手順も無い', () => {
    expect(buildNavSteps(null, sampleMap())).toEqual([])
    expect(buildNavSteps(null)).toEqual([])
  })

  it('区間ごとに1手順を作り、最後はレジ向き (立ち寄り番号なし) になる', () => {
    const map = sampleMap()
    const plan = samplePlan(map)
    const steps = buildNavSteps(plan, map)

    // 階をまたぐ区間は「中継 (階段/エレベーターへ)」の1手順が追加で挟まる
    const floorCrossingLegs = plan.legs.filter((l) => l.floorChanges > 0).length
    expect(steps).toHaveLength(plan.legs.length + floorCrossingLegs)
    const stopSteps = steps.filter((s) => s.kind === 'stop')
    expect(stopSteps.map((s) => s.stopOrder)).toEqual(plan.stops.map((s) => s.order))
    expect(steps[steps.length - 1].kind).toBe('checkout')
    expect(steps[steps.length - 1].stopOrder).toBeNull()
  })

  it('寄せる範囲は、その区間の経路をすべて含む', () => {
    const map = sampleMap()
    const plan = samplePlan(map)
    const steps = buildNavSteps(plan, map)

    for (const step of steps) {
      expect(step.area.x0).toBeLessThanOrEqual(step.area.x1)
      expect(step.area.y0).toBeLessThanOrEqual(step.area.y1)
    }
  })

  it('階をまたぐ区間では、階段・エレベーターへ向かう中継手順が挟まり、着いた先の階を表示する', () => {
    const map = sampleMap()
    const plan = samplePlan(map)
    const steps = buildNavSteps(plan, map)
    // サンプル店舗では酒類が2Fにあるので、2Fへ向かう手順が含まれる
    const upstairs = plan.stops.find((s) => s.floorName === '2F')
    expect(upstairs).toBeDefined()
    const stepIndex = steps.findIndex((s) => s.stopOrder === upstairs?.order)
    expect(steps[stepIndex].floorId).toBe(upstairs?.pos.floorId)

    const relay = steps[stepIndex - 1]
    expect(relay.kind).toBe('relay')
    expect(relay.label).toMatch(/(階段|エレベーター)へ/)
    // 中継は1Fの経路 (乗り物に乗る前) を指す
    const oneF = map.floors.find((f) => f.name === '1F')!
    expect(relay.floorId).toBe(oneF.id)
  })

  it('立ち寄り地点の位置は、その手順の範囲に含まれる', () => {
    const map = sampleMap()
    const plan = samplePlan(map)
    for (const step of buildNavSteps(plan, map)) {
      if (step.stopOrder === null) continue
      const stop = plan.stops.find((s) => s.order === step.stopOrder)!
      expect(stop.pos.x).toBeGreaterThanOrEqual(step.area.x0)
      expect(stop.pos.x).toBeLessThanOrEqual(step.area.x1)
      expect(stop.pos.y).toBeGreaterThanOrEqual(step.area.y0)
      expect(stop.pos.y).toBeLessThanOrEqual(step.area.y1)
    }
  })
})

describe('stepIndexOfStop', () => {
  it('立ち寄り番号から手順の位置を引ける', () => {
    const map = sampleMap()
    const steps = buildNavSteps(samplePlan(map), map)
    expect(stepIndexOfStop(steps, 1)).toBe(0)
    expect(stepIndexOfStop(steps, 999)).toBe(-1)
  })
})

describe('firstUnfinishedStep', () => {
  it('まだ買い終わっていない最初の手順を返す', () => {
    const map = sampleMap()
    const steps = buildNavSteps(samplePlan(map), map)
    expect(firstUnfinishedStep(steps, new Set())).toBe(0)
    expect(firstUnfinishedStep(steps, new Set([1]))).toBe(1)
  })

  it('直前が中継 (階段・エレベーターへ) の立ち寄りなら、中継から案内を始める', () => {
    const map = sampleMap()
    const plan = samplePlan(map)
    const steps = buildNavSteps(plan, map)
    const upstairs = plan.stops.find((s) => s.floorName === '2F')!
    const otherStops = plan.stops.filter((s) => s.order !== upstairs.order).map((s) => s.order)
    const index = firstUnfinishedStep(steps, new Set(otherStops))
    expect(steps[index].kind).toBe('relay')
  })

  it('全部買い終わっていればレジへ向かう最後の手順を返す', () => {
    const map = sampleMap()
    const plan = samplePlan(map)
    const steps = buildNavSteps(plan, map)
    const allDone = new Set(plan.stops.map((s) => s.order))
    expect(firstUnfinishedStep(steps, allDone)).toBe(steps.length - 1)
  })

  it('手順が無ければ 0 を返す (範囲外を指さない)', () => {
    expect(firstUnfinishedStep([], new Set())).toBe(0)
  })
})

describe('advanceIfDone', () => {
  it('いま見ている立ち寄りを買い終わっていなければ動かない', () => {
    const map = sampleMap()
    const steps = buildNavSteps(samplePlan(map), map)
    expect(advanceIfDone(steps, 0, new Set())).toBe(0)
  })

  it('買い終わっていれば次の手順へ進む (中継やレジでは止まる)', () => {
    const map = sampleMap()
    const plan = samplePlan(map)
    const steps = buildNavSteps(plan, map)
    const first = plan.stops[0].order
    const next = advanceIfDone(steps, 0, new Set([first]))
    expect(next).toBe(1)
  })

  it('連続して買い終わった立ち寄りはまとめて読み飛ばすが、中継の手前で止まる', () => {
    const map = sampleMap()
    const plan = samplePlan(map)
    const steps = buildNavSteps(plan, map)
    const upstairsIndex = steps.findIndex((s) => s.kind === 'relay')
    // 中継の直前の立ち寄りまで、すべて買い終わったことにする
    const doneBeforeRelay = new Set(
      steps.slice(0, upstairsIndex).filter((s) => s.stopOrder !== null).map((s) => s.stopOrder!),
    )
    const next = advanceIfDone(steps, 0, doneBeforeRelay)
    expect(steps[next].kind).toBe('relay')
  })

  it('中継・レジの手順自体では進めない (品目が無いので買い終わる、が無い)', () => {
    const map = sampleMap()
    const steps = buildNavSteps(samplePlan(map), map)
    const relayIndex = steps.findIndex((s) => s.kind === 'relay')
    expect(advanceIfDone(steps, relayIndex, new Set())).toBe(relayIndex)
  })
})
