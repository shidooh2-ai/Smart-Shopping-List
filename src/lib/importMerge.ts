/**
 * データの読み込み (JSONインポート) を「置き換え」ではなく「統合」にするための
 * 汎用ヘルパー。id を持つ配列 (店舗・リスト・ジャンルなど) と、語のエイリアス表
 * (Record<string, string>) の2種類を扱う。
 *
 * 使い方は2段階:
 *   1. planXxxMerge(既存, 読み込んだもの) で「新規に追加されるもの」「idが重複していて
 *      内容も違うもの (=競合)」「重複しているが内容が同じもの (=変化なし、無視してよい)」
 *      に仕分ける。ここではまだ何も変更しない。
 *   2. 競合が1件でもあれば呼び出し側で確認ダイアログを出し、上書きするかどうかを
 *      applyXxxMerge に渡す。
 */

/** JSONとして表現できる値同士を、キーの並び順に関係なく比較する。 */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
    return a.every((v, i) => deepEqual(v, b[i]))
  }
  const aKeys = Object.keys(a as Record<string, unknown>)
  const bKeys = Object.keys(b as Record<string, unknown>)
  if (aKeys.length !== bKeys.length) return false
  return aKeys.every((k) => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
}

export interface MergePlan<T> {
  /** 既存に無い id なので、そのまま追加してよいもの */
  added: T[]
  /** 既存と id が同じで、内容が違うもの。上書きするかどうかの確認が要る */
  conflicts: T[]
  /** 既存と id が同じで、内容も同じもの (実質変化なし) */
  unchanged: T[]
}

/** id をキーに、既存の配列と読み込んだ配列を見比べて仕分ける。 */
export function planArrayMerge<T extends { id: string }>(existing: T[], incoming: T[]): MergePlan<T> {
  const byId = new Map(existing.map((e) => [e.id, e]))
  const plan: MergePlan<T> = { added: [], conflicts: [], unchanged: [] }
  for (const item of incoming) {
    const current = byId.get(item.id)
    if (!current) plan.added.push(item)
    else if (deepEqual(current, item)) plan.unchanged.push(item)
    else plan.conflicts.push(item)
  }
  return plan
}

/**
 * planArrayMerge の結果を実際に適用する。overwriteConflicts が false なら競合分は
 * 既存のまま残し (スキップ)、新規追加分だけを取り込む。並び順は既存を保ったまま、
 * 新規分を末尾に足す。
 */
export function applyArrayMerge<T extends { id: string }>(
  existing: T[],
  plan: MergePlan<T>,
  overwriteConflicts: boolean,
): T[] {
  const byId = new Map(existing.map((e) => [e.id, e]))
  for (const item of plan.added) byId.set(item.id, item)
  if (overwriteConflicts) for (const item of plan.conflicts) byId.set(item.id, item)
  const order = [...existing.map((e) => e.id), ...plan.added.map((a) => a.id)]
  return order.map((id) => byId.get(id)).filter((v): v is T => v != null)
}

export interface RecordMergePlan {
  added: Array<[string, string]>
  conflicts: Array<[string, string]>
  unchanged: Array<[string, string]>
}

/** Record<string,string> (語のエイリアス表など) 版の planArrayMerge。 */
export function planRecordMerge(existing: Record<string, string>, incoming: Record<string, string>): RecordMergePlan {
  const plan: RecordMergePlan = { added: [], conflicts: [], unchanged: [] }
  for (const [key, value] of Object.entries(incoming)) {
    if (!(key in existing)) plan.added.push([key, value])
    else if (existing[key] === value) plan.unchanged.push([key, value])
    else plan.conflicts.push([key, value])
  }
  return plan
}

export function applyRecordMerge(
  existing: Record<string, string>,
  plan: RecordMergePlan,
  overwriteConflicts: boolean,
): Record<string, string> {
  const merged = { ...existing }
  for (const [key, value] of plan.added) merged[key] = value
  if (overwriteConflicts) for (const [key, value] of plan.conflicts) merged[key] = value
  return merged
}
