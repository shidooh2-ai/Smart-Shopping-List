import type { Category, NodeKind } from '../types'

/** SVG 上での1マスの大きさ */
export const CELL = 24

export const NODE_STYLE: Record<NodeKind, { label: string; short: string; color: string }> = {
  entrance: { label: '入口', short: '入', color: '#2e7d32' },
  checkout: { label: 'レジ', short: 'レ', color: '#ef6c00' },
  stairs: { label: '階段', short: '階', color: '#5c6bc0' },
  elevator: { label: 'エレベーター', short: 'E', color: '#8e24aa' },
}

export const NO_CATEGORY_COLOR = '#9aa3ad'

/** 棚の表示色。取り扱いジャンルの1つ目の色を使う。 */
export function shelfColor(categoryIds: string[], categories: Category[]): string {
  for (const id of categoryIds) {
    const c = categories.find((cc) => cc.id === id)
    if (c) return c.color
  }
  return NO_CATEGORY_COLOR
}

/** 背景色に対して読みやすい文字色 (簡易輝度判定)。 */
export function readableText(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return '#ffffff'
  const v = parseInt(m[1], 16)
  const r = (v >> 16) & 255
  const g = (v >> 8) & 255
  const b = v & 255
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.62 ? '#1b1e21' : '#ffffff'
}
