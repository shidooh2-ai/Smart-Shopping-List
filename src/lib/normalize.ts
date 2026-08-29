/** 全角/半角・カタカナ/ひらがな・数量表記のゆれを吸収して比較用の文字列にする。 */

const KATAKANA_START = 0x30a1
const KATAKANA_END = 0x30f6

/** カタカナをひらがなに変換する (長音符「ー」はそのまま残す)。 */
export function katakanaToHiragana(input: string): string {
  let out = ''
  for (const ch of input) {
    const code = ch.codePointAt(0)!
    out += code >= KATAKANA_START && code <= KATAKANA_END ? String.fromCodePoint(code - 0x60) : ch
  }
  return out
}

const UNITS = [
  '個', '本', '袋', 'パック', '枚', '缶', '箱', '束', '玉', '尾', '切れ', '切', '片', '房', '株',
  '丁', '杯', '人前', 'セット', '入り', '入', 'ケース', 'ダース', '膳', '足', '巻', 'ロール',
  '錠', '包', 'パウチ', 'g', 'kg', 'mg', 'ml', 'l', 'cc', 'グラム', 'キロ', 'リットル', 'コ', 'ヶ', 'ケ',
].join('|')

const QTY_TAIL = new RegExp(`(?:[×x*]?\\s*\\d+(?:\\.\\d+)?\\s*(?:${UNITS})?)+$`, 'i')
const QTY_HEAD = new RegExp(`^(?:\\d+(?:\\.\\d+)?\\s*(?:${UNITS})\\s*)+`, 'i')
const BRACKETS = /[(（【\[][^)）】\]]*[)）】\]]/g
const PUNCT = /[\s　、。,.・「」『』!！?？:：;；'"“”‘’\-_/\\|+~=@#$%^&*]/g

/**
 * 表記ゆれを吸収した比較用キーを返す。
 * NFKC 正規化 → 括弧書き除去 → 数量表記除去 → 記号除去 → ひらがな化。
 */
export function normalize(text: string): string {
  let s = (text ?? '').normalize('NFKC').toLowerCase().trim()
  s = s.replace(BRACKETS, ' ')
  s = s.trim().replace(QTY_HEAD, '').replace(QTY_TAIL, '')
  s = s.replace(PUNCT, '')
  s = katakanaToHiragana(s)
  return s.trim()
}

/** 文字bigram集合。1文字語はその文字自身を要素にする。 */
export function bigrams(s: string): Set<string> {
  const chars = [...s]
  if (chars.length <= 1) return new Set(chars)
  const set = new Set<string>()
  for (let i = 0; i < chars.length - 1; i++) set.add(chars[i] + chars[i + 1])
  return set
}

/** Dice 係数 (0..1)。表記の近さを測る。 */
export function diceCoefficient(a: string, b: string): number {
  if (!a || !b) return 0
  if (a === b) return 1
  const A = bigrams(a)
  const B = bigrams(b)
  if (A.size === 0 || B.size === 0) return 0
  let hit = 0
  for (const g of A) if (B.has(g)) hit++
  return (2 * hit) / (A.size + B.size)
}

/**
 * 入力欄のテキストを品目ごとに分割する。
 * 改行・読点・カンマ区切りに対応し、空要素は落とす。
 */
export function splitItems(text: string): string[] {
  return text
    .split(/[\n\r、,，]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}
