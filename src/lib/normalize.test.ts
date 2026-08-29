import { describe, expect, it } from 'vitest'
import { diceCoefficient, katakanaToHiragana, normalize, splitItems } from './normalize'

describe('normalize', () => {
  it('カタカナをひらがなに揃える', () => {
    expect(normalize('ニンジン')).toBe('にんじん')
    expect(normalize('にんじん')).toBe('にんじん')
  })

  it('全角英数・半角カナを NFKC で揃える', () => {
    expect(normalize('ＴＯＭＡＴＯ')).toBe('tomato')
    expect(normalize('ﾆﾝｼﾞﾝ')).toBe('にんじん')
  })

  it('数量表記を落とす', () => {
    expect(normalize('たまご 1パック')).toBe('たまご')
    expect(normalize('牛乳2本')).toBe('牛乳')
    expect(normalize('トマト ×3')).toBe('とまと')
    expect(normalize('豚こま 300g')).toBe('豚こま')
    expect(normalize('2個 レモン')).toBe('れもん')
  })

  it('括弧書きと記号を落とす', () => {
    expect(normalize('牛乳（低脂肪）')).toBe('牛乳')
    expect(normalize('食パン・8枚')).toBe('食ぱん')
  })

  it('長音記号は残す', () => {
    expect(normalize('ビール')).toBe('びーる')
  })

  it('空文字を壊さない', () => {
    expect(normalize('   ')).toBe('')
    expect(normalize('')).toBe('')
  })
})

describe('katakanaToHiragana', () => {
  it('カタカナ以外はそのまま', () => {
    expect(katakanaToHiragana('豚バラ肉')).toBe('豚ばら肉')
  })
})

describe('diceCoefficient', () => {
  it('同一文字列は1', () => {
    expect(diceCoefficient('きゃべつ', 'きゃべつ')).toBe(1)
  })
  it('近い語ほど高い', () => {
    const close = diceCoefficient('とまと', 'みにとまと')
    const far = diceCoefficient('とまと', 'しゃんぷー')
    expect(close).toBeGreaterThan(far)
  })
})

describe('splitItems', () => {
  it('改行・読点・カンマで分割する', () => {
    expect(splitItems('牛乳\n卵、パン, バナナ')).toEqual(['牛乳', '卵', 'パン', 'バナナ'])
  })
  it('空行を落とす', () => {
    expect(splitItems('\n\n牛乳\n\n')).toEqual(['牛乳'])
  })
})
