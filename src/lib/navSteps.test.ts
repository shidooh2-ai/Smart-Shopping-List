import { describe, expect, it } from 'vitest'
import { createSampleStore } from '../data/sampleStore'
import type { RoutePlan, ShoppingItem } from '../types'
import { newId } from './id'
import { buildNavSteps, firstUnfinishedStep, stepIndexOfStop } from './navSteps'
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

const samplePlan = (): RoutePlan =>
  planRoute(createSampleStore(), [item('牛乳', 'dairy'), item('にんじん', 'veg'), item('ビール', 'alcohol')])

describe('buildNavSteps', () => {
  it('ルートが無ければ手順も無い', () => {
    expect(buildNavSteps(null)).toEqual([])
  })

  it('区間ごとに1手順を作り、最後はレジ向き (立ち寄り番号なし) になる', () => {
    const plan = samplePlan()
    const steps = buildNavSteps(plan)

    expect(steps).toHaveLength(plan.legs.length)
    expect(steps.slice(0, plan.stops.length).map((s) => s.stopOrder)).toEqual(plan.stops.map((s) => s.order))
    expect(steps[steps.length - 1].stopOrder).toBeNull()
  })

  it('寄せる範囲は、その区間の経路をすべて含む', () => {
    const plan = samplePlan()
    const steps = buildNavSteps(plan)

    steps.forEach((step, i) => {
      const onFloor = plan.legs[i].path.filter((p) => p.floorId === step.floorId)
      for (const p of onFloor) {
        expect(p.x).toBeGreaterThanOrEqual(step.area.x0)
        expect(p.x).toBeLessThanOrEqual(step.area.x1)
        expect(p.y).toBeGreaterThanOrEqual(step.area.y0)
        expect(p.y).toBeLessThanOrEqual(step.area.y1)
      }
    })
  })

  it('階をまたぐ区間では、着いた先の階を表示する', () => {
    const plan = samplePlan()
    const steps = buildNavSteps(plan)
    // サンプル店舗では酒類が2Fにあるので、2Fへ向かう手順が含まれる
    const upstairs = plan.stops.find((s) => s.floorName === '2F')
    expect(upstairs).toBeDefined()
    const step = steps.find((s) => s.stopOrder === upstairs?.order)
    expect(step?.floorId).toBe(upstairs?.pos.floorId)
  })

  it('立ち寄り地点の位置は、その手順の範囲に含まれる', () => {
    const plan = samplePlan()
    for (const step of buildNavSteps(plan)) {
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
    const steps = buildNavSteps(samplePlan())
    expect(stepIndexOfStop(steps, 1)).toBe(0)
    expect(stepIndexOfStop(steps, 999)).toBe(-1)
  })
})

describe('firstUnfinishedStep', () => {
  it('まだ買い終わっていない最初の手順を返す', () => {
    const steps = buildNavSteps(samplePlan())
    expect(firstUnfinishedStep(steps, new Set())).toBe(0)
    expect(firstUnfinishedStep(steps, new Set([1]))).toBe(1)
    expect(firstUnfinishedStep(steps, new Set([1, 2]))).toBe(2)
  })

  it('全部買い終わっていればレジへ向かう最後の手順を返す', () => {
    const plan = samplePlan()
    const steps = buildNavSteps(plan)
    const allDone = new Set(plan.stops.map((s) => s.order))
    expect(firstUnfinishedStep(steps, allDone)).toBe(steps.length - 1)
  })

  it('手順が無ければ 0 を返す (範囲外を指さない)', () => {
    expect(firstUnfinishedStep([], new Set())).toBe(0)
  })
})
