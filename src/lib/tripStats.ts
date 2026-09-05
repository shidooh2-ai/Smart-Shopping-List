import type { TripRecord } from '../types'

/** 端末のローカル日付での日付キー ("2026-9-5")。連続日数の判定に使う。 */
function dayKey(at: number): string {
  const d = new Date(at)
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000

/**
 * 「何日連続でお買い物したか」。今日の分がまだ無くても、昨日までの連続記録は0にしない
 * (日をまたいだ瞬間に消えてしまうと、その日の買い物を促す前に途切れて見えるため)。
 * 1日空くと連続記録は途切れる。
 */
export function computeStreak(trips: TripRecord[], now: number = Date.now()): number {
  if (trips.length === 0) return 0
  const days = new Set(trips.map((t) => dayKey(t.completedAt)))
  let cursor = now
  if (!days.has(dayKey(cursor))) {
    cursor -= ONE_DAY_MS
    if (!days.has(dayKey(cursor))) return 0
  }
  let streak = 0
  while (days.has(dayKey(cursor))) {
    streak++
    cursor -= ONE_DAY_MS
  }
  return streak
}

export interface TimeTrend {
  /** 直近の買い物にかかった分数 */
  latestMinutes: number
  /** 過去の平均より何分速かったか (プラスなら速くなった) */
  deltaMinutes: number
}

/**
 * 指定リストの「前回より何分速く回れたか」。所要時間を記録した買い物が2回以上ないと
 * 比較できないので null を返す。
 */
export function computeTimeTrend(trips: TripRecord[], listId: string): TimeTrend | null {
  const withDuration = trips
    .filter((t) => t.listId === listId && t.durationMs != null)
    .sort((a, b) => a.completedAt - b.completedAt)
  if (withDuration.length < 2) return null
  const latest = withDuration[withDuration.length - 1]
  const previous = withDuration.slice(0, -1)
  const avgPrevMs = previous.reduce((sum, t) => sum + (t.durationMs ?? 0), 0) / previous.length
  return {
    latestMinutes: Math.max(1, Math.round(latest.durationMs! / 60000)),
    deltaMinutes: Math.round((avgPrevMs - latest.durationMs!) / 60000),
  }
}
