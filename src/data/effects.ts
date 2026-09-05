/**
 * 品目チェック・お買い物完了時のお祝いエフェクト。テーマと同じく着せ替えできる。
 *
 * 種類ごとに「絵柄」と「動き」が違う (花びらは上から舞い散り、風船は下から昇り、
 * 花火は打ち上がってから開く)。絵柄は components/effectArt.tsx のSVG、
 * 動きは components/EffectLayer.tsx と styles.css のキーフレームが担当し、
 * このファイルは粒の数・色・長さといったパラメータだけを持つ。
 *
 * 品目を1つチェックしたときの演出 (checkCount) は今のところ全種類 0 にして無効化している
 * (チェックのたびに画面が賑やかになりすぎるとの声があったため)。買い終えたときの演出
 * (completeCount) だけは種類ごとに残るので、無効化する前の数値は checkCount にそのまま
 * 残してある — 再度有効にしたくなったときのために。
 */
export type EffectId = 'default' | 'confetti' | 'petals' | 'balloons' | 'fireworks' | 'squirrel' | 'minimal'

export interface EffectStyle {
  id: EffectId
  label: string
  /** 設定画面での一言説明 */
  description: string
  /** 品目を1つチェックしたときの粒の数。今のところ全種類0 (無効) */
  checkCount: number
  /** リストを全部買い終えたときの粒の数 (花火は「発」の数) */
  completeCount: number
  /** 演出が消えるまでの長さ (ms)。動きが終わる前に消えないよう、動きより少し長くする */
  checkDurationMs: number
  completeDurationMs: number
  /** 絵柄に使う色。粒ごとにこの中から選ぶ */
  colors: string[]
  /** 買い終えたときに中央に出すメッセージ (nullなら出さない) */
  completeMessage: string | null
}

export const EFFECTS: EffectStyle[] = [
  {
    id: 'default',
    label: 'ひかえめ',
    description: '光の粒がふわっと浮かびます',
    checkCount: 0,
    completeCount: 14,
    checkDurationMs: 1200,
    completeDurationMs: 2200,
    colors: ['#ffd76a', '#fff0b8', '#ffffff', '#ffe08a'],
    completeMessage: 'お買い物完了！',
  },
  {
    id: 'confetti',
    label: '紙吹雪',
    description: '上から紙吹雪がひらひら落ちてきます',
    checkCount: 0,
    completeCount: 44,
    checkDurationMs: 1800,
    completeDurationMs: 3200,
    colors: ['#ff6b6b', '#ffd166', '#06d6a0', '#4d96ff', '#c77dff', '#ff9f1c'],
    completeMessage: 'お買い物完了！',
  },
  {
    id: 'petals',
    label: '花びら',
    description: '桜の花びらが舞い散ります',
    checkCount: 0,
    completeCount: 30,
    checkDurationMs: 2400,
    completeDurationMs: 3600,
    colors: ['#f8bbd0', '#f48fb1', '#fce4ec', '#f06292', '#ffcdd2'],
    completeMessage: 'お買い物完了！',
  },
  {
    id: 'balloons',
    label: '風船',
    description: '下から風船がふわふわ上がっていきます',
    checkCount: 0,
    completeCount: 14,
    checkDurationMs: 2600,
    completeDurationMs: 3600,
    colors: ['#ef5350', '#42a5f5', '#ffca28', '#66bb6a', '#ab47bc', '#ff7043'],
    completeMessage: 'お買い物完了！',
  },
  {
    id: 'fireworks',
    label: '花火',
    description: '花火が数発打ち上がります',
    checkCount: 0,
    completeCount: 6,
    checkDurationMs: 1800,
    completeDurationMs: 3600,
    colors: ['#ffd166', '#ff6b6b', '#4dd0e1', '#c77dff', '#69f0ae', '#ff9f1c'],
    completeMessage: '花火だ！お買い物完了！',
  },
  {
    id: 'squirrel',
    label: 'リス太',
    description: 'アプリのキャラクター「リス太」が、どんぐりを集めてお祝いします',
    checkCount: 0,
    completeCount: 12,
    checkDurationMs: 900,
    completeDurationMs: 3000,
    // 絵柄自体はキャラクターの固定色を使うので、ここはキラキラの色だけに使う
    colors: ['#ffd76a', '#9caf7d', '#f0a992', '#fff0b8'],
    completeMessage: 'ぜんぶそろったリス！',
  },
  {
    id: 'minimal',
    label: 'エフェクトなし',
    description: '完了メッセージだけを控えめに出します',
    checkCount: 0,
    completeCount: 0,
    checkDurationMs: 0,
    completeDurationMs: 1600,
    colors: [],
    completeMessage: 'お買い物完了',
  },
]

export function isEffectId(value: unknown): value is EffectId {
  return typeof value === 'string' && EFFECTS.some((e) => e.id === value)
}

export function effectStyle(id: EffectId): EffectStyle {
  return EFFECTS.find((e) => e.id === id) ?? EFFECTS[0]
}
