import { describe, expect, it } from 'vitest'
import type { TripRecord } from '../types'
import { computeStreak, computeTimeTrend } from './tripStats'

const DAY = 24 * 60 * 60 * 1000

const trip = (overrides: Partial<TripRecord>): TripRecord => ({
  id: 't1',
  listId: 'l1',
  listName: 'リスト',
  completedAt: Date.now(),
  durationMs: null,
  distanceMeters: null,
  itemCount: 1,
  by: null,
  ...overrides,
})

describe('computeStreak', () => {
  it('買い物履歴が無ければ0', () => {
    expect(computeStreak([])).toBe(0)
  })

  it('今日買い物していれば1以上', () => {
    const now = Date.now()
    expect(computeStreak([trip({ completedAt: now })], now)).toBe(1)
  })

  it('3日連続なら3', () => {
    const now = Date.now()
    const trips = [
      trip({ id: 'a', completedAt: now }),
      trip({ id: 'b', completedAt: now - DAY }),
      trip({ id: 'c', completedAt: now - 2 * DAY }),
    ]
    expect(computeStreak(trips, now)).toBe(3)
  })

  it('今日はまだでも昨日買い物していれば連続記録は途切れない', () => {
    const now = Date.now()
    const trips = [trip({ completedAt: now - DAY }), trip({ id: 'b', completedAt: now - 2 * DAY })]
    expect(computeStreak(trips, now)).toBe(2)
  })

  it('1日空くと連続記録は途切れる', () => {
    const now = Date.now()
    const trips = [trip({ completedAt: now - 3 * DAY })]
    expect(computeStreak(trips, now)).toBe(0)
  })

  it('同じ日に複数回買い物しても1日としてカウントする', () => {
    const now = Date.now()
    const trips = [trip({ id: 'a', completedAt: now }), trip({ id: 'b', completedAt: now - 1000 })]
    expect(computeStreak(trips, now)).toBe(1)
  })
})

describe('computeTimeTrend', () => {
  it('所要時間つきの記録が1件以下なら null', () => {
    expect(computeTimeTrend([trip({ durationMs: 600_000 })], 'l1')).toBeNull()
    expect(computeTimeTrend([], 'l1')).toBeNull()
  })

  it('前回より速ければ deltaMinutes がプラスになる', () => {
    const trips = [
      trip({ id: 'a', listId: 'l1', completedAt: 1000, durationMs: 10 * 60_000 }),
      trip({ id: 'b', listId: 'l1', completedAt: 2000, durationMs: 8 * 60_000 }),
    ]
    const trend = computeTimeTrend(trips, 'l1')
    expect(trend).toEqual({ latestMinutes: 8, deltaMinutes: 2 })
  })

  it('前回より遅ければ deltaMinutes がマイナスになる', () => {
    const trips = [
      trip({ id: 'a', listId: 'l1', completedAt: 1000, durationMs: 8 * 60_000 }),
      trip({ id: 'b', listId: 'l1', completedAt: 2000, durationMs: 10 * 60_000 }),
    ]
    const trend = computeTimeTrend(trips, 'l1')
    expect(trend).toEqual({ latestMinutes: 10, deltaMinutes: -2 })
  })

  it('直近の記録は完了日時が最新のもの (登録順ではない)', () => {
    const trips = [
      trip({ id: 'a', listId: 'l1', completedAt: 2000, durationMs: 5 * 60_000 }),
      trip({ id: 'b', listId: 'l1', completedAt: 1000, durationMs: 20 * 60_000 }),
    ]
    const trend = computeTimeTrend(trips, 'l1')
    expect(trend?.latestMinutes).toBe(5)
  })

  it('他のリストの記録は混ぜない', () => {
    const trips = [
      trip({ id: 'a', listId: 'l2', completedAt: 1000, durationMs: 10 * 60_000 }),
      trip({ id: 'b', listId: 'l1', completedAt: 2000, durationMs: 8 * 60_000 }),
    ]
    expect(computeTimeTrend(trips, 'l1')).toBeNull()
  })

  it('所要時間が記録されていない (durationMs: null) 履歴は無視する', () => {
    const trips = [
      trip({ id: 'a', listId: 'l1', completedAt: 1000, durationMs: null }),
      trip({ id: 'b', listId: 'l1', completedAt: 2000, durationMs: 8 * 60_000 }),
    ]
    expect(computeTimeTrend(trips, 'l1')).toBeNull()
  })
})
