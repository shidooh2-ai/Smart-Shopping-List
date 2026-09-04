import { describe, expect, it } from 'vitest'
import type { Category, ShoppingItem, ShoppingList } from '../types'
import { buildWidgetSnapshot } from './widgetBridge'

const item = (id: string, text: string, categoryId: string | null, checked = false): ShoppingItem => ({
  id,
  text,
  checked,
  categoryId,
  manual: false,
  confidence: 1,
  createdAt: 0,
})

const list = (id: string, name: string, items: ShoppingItem[], color?: string): ShoppingList => ({
  id,
  name,
  color,
  storeId: null,
  items,
  createdAt: 0,
  updatedAt: 0,
})

const categories: Category[] = [
  { id: 'veg', name: '野菜', color: '#7cb342', keywords: [] },
  { id: 'dairy', name: '乳製品・卵', color: '#fdd835', keywords: [] },
]

/**
 * ここで確認している形は Swift 側 (SharedSnapshot.swift の Snapshot / SharedList / SharedItem) が
 * そのままデコードする内容。片方だけ変えると、ウィジェットが黙って何も表示しなくなる。
 */
describe('buildWidgetSnapshot', () => {
  it('ウィジェットが必要とする項目だけを含める', () => {
    const snapshot = buildWidgetSnapshot(
      [list('l1', '買い物リスト', [item('i1', 'にんじん', 'veg')], '#ef6c00')],
      categories,
      'l1',
    )

    expect(snapshot.activeListId).toBe('l1')
    expect(snapshot.updatedAt).toBeGreaterThan(0)
    expect(snapshot.lists).toEqual([
      {
        id: 'l1',
        name: '買い物リスト',
        color: '#ef6c00',
        items: [{ id: 'i1', text: 'にんじん', checked: false, color: '#7cb342' }],
      },
    ])
  })

  it('ジャンルの色を引き当て、未設定なら null にする', () => {
    const snapshot = buildWidgetSnapshot(
      [list('l1', 'リスト', [item('i1', '牛乳', 'dairy'), item('i2', 'なぞの品', null)])],
      categories,
      'l1',
    )
    expect(snapshot.lists[0].items.map((i) => i.color)).toEqual(['#fdd835', null])
  })

  it('削除済みジャンルを参照している品目でも落ちない', () => {
    const snapshot = buildWidgetSnapshot([list('l1', 'リスト', [item('i1', '謎', 'deleted-cat')])], categories, 'l1')
    expect(snapshot.lists[0].items[0].color).toBeNull()
  })

  it('色未設定のリストは null になる (Swiftのオプショナルに合わせる)', () => {
    const snapshot = buildWidgetSnapshot([list('l1', 'リスト', [])], categories, null)
    expect(snapshot.lists[0].color).toBeNull()
    expect(snapshot.activeListId).toBeNull()
  })

  it('チェック状態をそのまま渡す', () => {
    const snapshot = buildWidgetSnapshot(
      [list('l1', 'リスト', [item('i1', '牛乳', 'dairy', true), item('i2', 'パン', null)])],
      categories,
      'l1',
    )
    expect(snapshot.lists[0].items.map((i) => i.checked)).toEqual([true, false])
  })

  it('全リストを渡す (ウィジェット側でどれを表示するか選べるようにするため)', () => {
    const snapshot = buildWidgetSnapshot(
      [list('l1', '平日', []), list('l2', '週末', [])],
      categories,
      'l2',
    )
    expect(snapshot.lists.map((l) => l.id)).toEqual(['l1', 'l2'])
  })
})
