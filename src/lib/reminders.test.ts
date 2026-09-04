import { describe, expect, it } from 'vitest'
import type { ListReminder } from '../types'
import { allNotificationIds, buildNotifications, describeReminder, notificationId } from './reminders'

const list = (reminder?: ListReminder) => ({ id: 'list_1', name: '買い物リスト', reminder })
const now = new Date(2026, 8, 4, 12, 0, 0) // 2026-09-04 12:00 (金)

describe('notificationId', () => {
  it('同じリスト・同じ枠なら毎回同じIDになる (付け直しで前の予約を確実に上書きできる)', () => {
    expect(notificationId('list_1', 3)).toBe(notificationId('list_1', 3))
  })

  it('リストが違えばIDも違う', () => {
    expect(notificationId('list_1')).not.toBe(notificationId('list_2'))
  })

  it('曜日ごとに別のIDになる', () => {
    const ids = allNotificationIds('list_1')
    expect(new Set(ids).size).toBe(7)
  })

  it('Androidの int に収まる正の整数になる', () => {
    for (const id of allNotificationIds('list_1')) {
      expect(Number.isInteger(id)).toBe(true)
      expect(id).toBeGreaterThanOrEqual(0)
      expect(id).toBeLessThan(2 ** 31 - 1)
    }
  })
})

describe('buildNotifications', () => {
  it('リマインダーが無い・オフなら何も予約しない', () => {
    expect(buildNotifications(list(), now)).toEqual([])
    expect(buildNotifications(list({ enabled: false, time: '18:00', repeat: 'daily' }), now)).toEqual([])
  })

  it('毎日: 指定時刻に日次で繰り返す', () => {
    const [n] = buildNotifications(list({ enabled: true, time: '18:30', repeat: 'daily' }), now)
    expect(n.title).toBe('買い物リスト')
    expect(n.schedule).toEqual({ on: { hour: 18, minute: 30 }, repeats: true, every: 'day', allowWhileIdle: true })
  })

  it('毎週: 選んだ曜日ごとに1件ずつ、Capacitorの weekday (1=日) に変換する', () => {
    const notifications = buildNotifications(
      list({ enabled: true, time: '09:05', repeat: 'weekly', weekdays: [0, 6] }),
      now,
    )
    expect(notifications).toHaveLength(2)
    expect(notifications.map((n) => (n.schedule as { on: { weekday: number } }).on.weekday)).toEqual([1, 7])
    expect(new Set(notifications.map((n) => n.id)).size).toBe(2)
  })

  it('毎週で曜日が未選択なら予約しない', () => {
    expect(buildNotifications(list({ enabled: true, time: '09:00', repeat: 'weekly', weekdays: [] }), now)).toEqual([])
  })

  it('1回だけ: 指定日時ちょうどに予約する', () => {
    const [n] = buildNotifications(
      list({ enabled: true, time: '07:00', repeat: 'once', date: '2026-09-05' }),
      now,
    )
    expect((n.schedule as { at: Date }).at).toEqual(new Date(2026, 8, 5, 7, 0, 0, 0))
  })

  it('1回だけ: 過ぎた日時は予約しない (即座に通知されてしまうのを防ぐ)', () => {
    const passed = buildNotifications(list({ enabled: true, time: '07:00', repeat: 'once', date: '2026-09-04' }), now)
    expect(passed).toEqual([])
  })

  it('1回だけ: 日付が未設定なら予約しない', () => {
    expect(buildNotifications(list({ enabled: true, time: '07:00', repeat: 'once' }), now)).toEqual([])
  })

  it('時刻の形式が不正なら予約しない', () => {
    expect(buildNotifications(list({ enabled: true, time: '25:00', repeat: 'daily' }), now)).toEqual([])
    expect(buildNotifications(list({ enabled: true, time: '', repeat: 'daily' }), now)).toEqual([])
  })
})

describe('describeReminder', () => {
  it('設定内容を日本語で説明する', () => {
    expect(describeReminder(undefined)).toBe('オフ')
    expect(describeReminder({ enabled: false, time: '18:00', repeat: 'daily' })).toBe('オフ')
    expect(describeReminder({ enabled: true, time: '18:00', repeat: 'daily' })).toBe('毎日 18:00')
    expect(describeReminder({ enabled: true, time: '08:00', repeat: 'once', date: '2026-09-05' })).toBe(
      '2026-09-05 08:00 に1回',
    )
    expect(describeReminder({ enabled: true, time: '10:00', repeat: 'weekly', weekdays: [1, 3] })).toBe(
      '毎週 月・水 10:00',
    )
  })

  it('未入力の項目があることを伝える', () => {
    expect(describeReminder({ enabled: true, time: '08:00', repeat: 'once' })).toBe('日付が未設定')
    expect(describeReminder({ enabled: true, time: '08:00', repeat: 'weekly', weekdays: [] })).toBe('曜日が未選択')
  })
})
