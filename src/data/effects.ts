/**
 * 品目チェック・お買い物完了時のお祝いエフェクト。テーマと同じく着せ替えできる。
 * 実際の見た目 (絵文字・数・完了時のメッセージ) は components/EffectLayer.tsx が
 * この設定を使って描画する。
 */
export type EffectId = 'default' | 'confetti' | 'sparkle' | 'fireworks' | 'minimal'

export interface EffectStyle {
  id: EffectId
  label: string
  /** 品目を1つチェックしたときに飛ばす絵文字 (空なら何も出さない) */
  checkEmoji: string[]
  /** チェックしたときの絵文字の数 */
  checkCount: number
  /** リストを全部買い終えたときに飛ばす絵文字 */
  completeEmoji: string[]
  /** 買い終えたときの絵文字の数 */
  completeCount: number
  /** 買い終えたときに中央に出すメッセージ (nullなら出さない) */
  completeMessage: string | null
}

export const EFFECTS: EffectStyle[] = [
  {
    id: 'default',
    label: 'ひかえめ',
    checkEmoji: ['✓'],
    checkCount: 1,
    completeEmoji: ['🎉', '✨'],
    completeCount: 12,
    completeMessage: 'お買い物完了！',
  },
  {
    id: 'confetti',
    label: '紙吹雪',
    checkEmoji: ['🎊'],
    checkCount: 3,
    completeEmoji: ['🎉', '🎊', '✨', '🎈'],
    completeCount: 28,
    completeMessage: 'お買い物完了！',
  },
  {
    id: 'sparkle',
    label: 'きらめき',
    checkEmoji: ['✨'],
    checkCount: 4,
    completeEmoji: ['✨', '💫', '⭐'],
    completeCount: 24,
    completeMessage: 'コンプリート！',
  },
  {
    id: 'fireworks',
    label: '花火',
    checkEmoji: ['💥'],
    checkCount: 3,
    completeEmoji: ['🎆', '🎇', '✨'],
    completeCount: 22,
    completeMessage: '花火だ！お買い物完了！',
  },
  {
    id: 'minimal',
    label: 'エフェクトなし',
    checkEmoji: [],
    checkCount: 0,
    completeEmoji: [],
    completeCount: 0,
    completeMessage: 'お買い物完了',
  },
]

export function isEffectId(value: unknown): value is EffectId {
  return typeof value === 'string' && EFFECTS.some((e) => e.id === value)
}

export function effectStyle(id: EffectId): EffectStyle {
  return EFFECTS.find((e) => e.id === id) ?? EFFECTS[0]
}
