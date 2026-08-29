import { describe, expect, it } from 'vitest'
import { DEFAULT_CATEGORIES } from '../data/categories'
import { MATCH_THRESHOLD, buildIndex, detectCategory } from './genre'

const index = buildIndex(DEFAULT_CATEGORIES)
const detect = (text: string, aliases: Record<string, string> = {}) =>
  detectCategory(text, DEFAULT_CATEGORIES, aliases, index)

describe('detectCategory', () => {
  const cases: Array<[string, string]> = [
    ['にんじん', 'veg'],
    ['キャベツ', 'veg'],
    ['ミニトマト', 'veg'],
    ['バナナ', 'fruit'],
    ['りんご 3個', 'fruit'],
    ['豚こま肉', 'meat'],
    ['鶏むね肉 2枚', 'meat'],
    ['ベーコン', 'meat'],
    ['刺身', 'fish'],
    ['塩鮭', 'fish'],
    ['食パン', 'bread'],
    ['牛乳', 'dairy'],
    ['たまご1パック', 'dairy'],
    ['とろけるチーズ', 'dairy'],
    ['絹ごし豆腐', 'chilled'],
    ['納豆', 'chilled'],
    ['冷凍餃子', 'frozen'],
    ['アイス', 'frozen'],
    ['醤油', 'season'],
    ['マヨネーズ', 'season'],
    ['カレールー', 'season'],
    ['小麦粉', 'dry'],
    ['スパゲッティ', 'dry'],
    ['ツナ缶', 'canned'],
    ['カップラーメン', 'noodle'],
    ['ポテトチップス', 'snack'],
    ['チョコレート', 'snack'],
    ['麦茶', 'drink'],
    ['野菜ジュース', 'drink'],
    ['ビール', 'alcohol'],
    ['トイレットペーパー', 'household'],
    ['食器用洗剤', 'detergent'],
    ['シャンプー', 'toiletry'],
    ['おむつ', 'baby'],
    ['ドッグフード', 'pet'],
    ['のど飴', 'medicine'],
    ['お米 5kg', 'rice'],
  ]

  for (const [text, expected] of cases) {
    it(`「${text}」→ ${expected}`, () => {
      const m = detect(text)
      expect(m?.categoryId).toBe(expected)
      expect(m!.score).toBeGreaterThanOrEqual(MATCH_THRESHOLD)
    })
  }

  it('表記ゆれを吸収する', () => {
    expect(detect('ぎゅうにゅう')?.categoryId).toBe(detect('牛乳')?.categoryId)
    expect(detect('ﾄﾏﾄ')?.categoryId).toBe('veg')
  })

  it('未知語は null を返す', () => {
    expect(detect('ぬるぽ')).toBeNull()
    expect(detect('')).toBeNull()
  })

  it('学習済みエイリアスが最優先される', () => {
    const m = detect('ぬるぽ', { ぬるぽ: 'snack' })
    expect(m?.categoryId).toBe('snack')
    expect(m?.reason).toBe('alias')
  })

  it('エイリアスの表記ゆれも効く', () => {
    const m = detect('ヌルポ 2個', { ぬるぽ: 'snack' })
    expect(m?.categoryId).toBe('snack')
  })

  it('存在しないカテゴリのエイリアスは無視する', () => {
    expect(detect('ぬるぽ', { ぬるぽ: 'no-such-category' })).toBeNull()
  })

  it('完全一致は確信度1', () => {
    const m = detect('キャベツ')
    expect(m?.reason).toBe('exact')
    expect(m?.score).toBe(1)
  })
})
