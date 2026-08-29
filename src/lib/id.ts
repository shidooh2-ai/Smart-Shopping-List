let counter = 0

/** 衝突しにくい短いIDを作る (端末内で完結するため簡易実装で十分)。 */
export function newId(prefix: string): string {
  counter = (counter + 1) % 100000
  const rand = Math.random().toString(36).slice(2, 8)
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${rand}`
}
