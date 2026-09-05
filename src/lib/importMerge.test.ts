import { describe, expect, it } from 'vitest'
import { applyArrayMerge, applyRecordMerge, deepEqual, planArrayMerge, planRecordMerge } from './importMerge'

describe('deepEqual', () => {
  it('プリミティブ同士を比較できる', () => {
    expect(deepEqual(1, 1)).toBe(true)
    expect(deepEqual('a', 'b')).toBe(false)
    expect(deepEqual(null, null)).toBe(true)
    expect(deepEqual(null, undefined)).toBe(false)
  })

  it('オブジェクトはキーの並び順に関係なく比較する', () => {
    expect(deepEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true)
    expect(deepEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false)
  })

  it('配列は順番も含めて比較する', () => {
    expect(deepEqual([1, 2, 3], [1, 2, 3])).toBe(true)
    expect(deepEqual([1, 2, 3], [3, 2, 1])).toBe(false)
  })

  it('ネストした構造も比較できる', () => {
    expect(deepEqual({ a: [{ x: 1 }] }, { a: [{ x: 1 }] })).toBe(true)
    expect(deepEqual({ a: [{ x: 1 }] }, { a: [{ x: 2 }] })).toBe(false)
  })
})

interface Item {
  id: string
  name: string
}

describe('planArrayMerge / applyArrayMerge', () => {
  const existing: Item[] = [
    { id: '1', name: '青果' },
    { id: '2', name: '精肉' },
  ]

  it('新しいidは added に分類される', () => {
    const plan = planArrayMerge(existing, [{ id: '3', name: '鮮魚' }])
    expect(plan.added).toEqual([{ id: '3', name: '鮮魚' }])
    expect(plan.conflicts).toEqual([])
    expect(plan.unchanged).toEqual([])
  })

  it('同じidで内容が違うものは conflicts に分類される', () => {
    const plan = planArrayMerge(existing, [{ id: '2', name: '精肉コーナー' }])
    expect(plan.conflicts).toEqual([{ id: '2', name: '精肉コーナー' }])
    expect(plan.added).toEqual([])
  })

  it('同じidで内容も同じものは unchanged に分類され、上書き確認の対象にならない', () => {
    const plan = planArrayMerge(existing, [{ id: '2', name: '精肉' }])
    expect(plan.unchanged).toEqual([{ id: '2', name: '精肉' }])
    expect(plan.conflicts).toEqual([])
  })

  it('overwriteConflicts=false なら競合分は既存のまま、新規分だけ追加される', () => {
    const plan = planArrayMerge(existing, [
      { id: '2', name: '精肉コーナー' },
      { id: '3', name: '鮮魚' },
    ])
    const merged = applyArrayMerge(existing, plan, false)
    expect(merged).toEqual([
      { id: '1', name: '青果' },
      { id: '2', name: '精肉' }, // 上書きされていない
      { id: '3', name: '鮮魚' }, // 新規は追加される
    ])
  })

  it('overwriteConflicts=true なら競合分も読み込んだ内容で上書きされる', () => {
    const plan = planArrayMerge(existing, [{ id: '2', name: '精肉コーナー' }])
    const merged = applyArrayMerge(existing, plan, true)
    expect(merged).toEqual([
      { id: '1', name: '青果' },
      { id: '2', name: '精肉コーナー' },
    ])
  })

  it('既存の並び順を保ち、新規分は末尾に足す', () => {
    const plan = planArrayMerge(existing, [{ id: '0', name: '入口' }])
    const merged = applyArrayMerge(existing, plan, true)
    expect(merged.map((i) => i.id)).toEqual(['1', '2', '0'])
  })
})

describe('planRecordMerge / applyRecordMerge', () => {
  const existing = { 牛乳: 'dairy', パン: 'bread' }

  it('新しいキーは added に分類される', () => {
    const plan = planRecordMerge(existing, { 卵: 'egg' })
    expect(plan.added).toEqual([['卵', 'egg']])
  })

  it('同じキーで値が違うものは conflicts に分類される', () => {
    const plan = planRecordMerge(existing, { 牛乳: 'drink' })
    expect(plan.conflicts).toEqual([['牛乳', 'drink']])
  })

  it('同じキーで値も同じものは unchanged になる', () => {
    const plan = planRecordMerge(existing, { 牛乳: 'dairy' })
    expect(plan.unchanged).toEqual([['牛乳', 'dairy']])
  })

  it('overwriteConflicts の有無で適用結果が変わる', () => {
    const plan = planRecordMerge(existing, { 牛乳: 'drink', 卵: 'egg' })
    expect(applyRecordMerge(existing, plan, false)).toEqual({ 牛乳: 'dairy', パン: 'bread', 卵: 'egg' })
    expect(applyRecordMerge(existing, plan, true)).toEqual({ 牛乳: 'drink', パン: 'bread', 卵: 'egg' })
  })
})
