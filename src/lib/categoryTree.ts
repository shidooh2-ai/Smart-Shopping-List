import type { Category } from '../types'

export interface CategoryGroup {
  parent: Category
  children: Category[]
}

/**
 * カテゴリを親ジャンルごとにグルーピングする。
 * 親が存在しない (未設定、または参照先が削除済み) カテゴリはすべて独立した親として扱う。
 * 元の配列の並び順を保つ。
 */
export function groupCategories(categories: Category[]): CategoryGroup[] {
  const byId = new Map(categories.map((c) => [c.id, c]))
  const isTop = (c: Category) => !c.parentId || !byId.has(c.parentId)
  return categories
    .filter(isTop)
    .map((parent) => ({
      parent,
      children: categories.filter((c) => !isTop(c) && c.parentId === parent.id),
    }))
}

/** 指定カテゴリが (削除済み含めず) 他のカテゴリの親になっているか。 */
export function hasChildren(categoryId: string, categories: Category[]): boolean {
  return categories.some((c) => c.parentId === categoryId)
}
