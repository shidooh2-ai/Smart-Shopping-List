import type { Category, StoreMap } from '../types'
import { diceCoefficient, normalize } from './normalize'

export type MatchReason = 'alias' | 'exact' | 'contains' | 'similar'

export interface GenreMatch {
  categoryId: string
  /** 0..1 の確信度 */
  score: number
  reason: MatchReason
  /** 判定の決め手になった語 */
  matchedKeyword: string
}

/** これを下回る場合は「ジャンル未特定」として扱う */
export const MATCH_THRESHOLD = 0.5

export interface IndexEntry {
  categoryId: string
  keyword: string
  norm: string
}

/**
 * グローバルなジャンル一覧に、指定した店舗の専用ジャンルを加えたもの。
 * 品目のジャンル自動判定や棚のジャンル設定など、「その店舗の文脈で選べるジャンル」が
 * 必要な場面ではこれを使う (店舗が無い/専用ジャンルが無ければグローバルのみ)。
 */
export function combinedCategories(global: Category[], store?: StoreMap | null): Category[] {
  return store?.categories && store.categories.length > 0 ? [...global, ...store.categories] : global
}

/** カテゴリ配列から検索用インデックスを作る (カテゴリ名自身も語彙に含める)。 */
export function buildIndex(categories: Category[]): IndexEntry[] {
  const entries: IndexEntry[] = []
  const seen = new Set<string>()
  for (const c of categories) {
    for (const kw of [c.name, ...c.keywords]) {
      const norm = normalize(kw)
      if (!norm) continue
      const key = c.id + ' ' + norm
      if (seen.has(key)) continue
      seen.add(key)
      entries.push({ categoryId: c.id, keyword: kw, norm })
    }
  }
  return entries
}

function containScore(input: string, kw: string): number {
  // 日本語の複合語は末尾が主要部になりやすい (例: 塩鮭 -> 鮭, 野菜ジュース -> ジュース)
  const base = kw.length >= 2 ? 0.55 : 0.42
  const ratio = kw.length / input.length
  const tailBonus = input.endsWith(kw) ? 0.08 : 0
  return Math.min(0.97, base + 0.4 * ratio + tailBonus)
}

/**
 * 品目テキストから商品ジャンルを推定する。
 * 学習済みエイリアス > 完全一致 > 部分一致 > bigram類似度 の順に強い。
 * 閾値未満なら null (= ジャンル未特定)。
 */
export function detectCategory(
  text: string,
  categories: Category[],
  aliases: Record<string, string> = {},
  index?: IndexEntry[],
): GenreMatch | null {
  const input = normalize(text)
  if (!input) return null

  const valid = new Set(categories.map((c) => c.id))
  const aliased = aliases[input]
  if (aliased && valid.has(aliased)) {
    return { categoryId: aliased, score: 1, reason: 'alias', matchedKeyword: text.trim() }
  }

  const entries = index ?? buildIndex(categories)
  let best: GenreMatch | null = null
  const consider = (m: GenreMatch) => {
    if (best === null || m.score > best.score) best = m
  }

  for (const e of entries) {
    if (e.norm === input) {
      consider({ categoryId: e.categoryId, score: 1, reason: 'exact', matchedKeyword: e.keyword })
      continue
    }
    if (input.includes(e.norm)) {
      consider({
        categoryId: e.categoryId,
        score: containScore(input, e.norm),
        reason: 'contains',
        matchedKeyword: e.keyword,
      })
      continue
    }
    if (e.norm.length >= 3 && input.length >= 2 && e.norm.includes(input)) {
      consider({
        categoryId: e.categoryId,
        score: Math.min(0.9, 0.45 + 0.4 * (input.length / e.norm.length)),
        reason: 'contains',
        matchedKeyword: e.keyword,
      })
      continue
    }
    const dice = diceCoefficient(input, e.norm)
    if (dice >= 0.5) {
      consider({
        categoryId: e.categoryId,
        score: dice * 0.85,
        reason: 'similar',
        matchedKeyword: e.keyword,
      })
    }
  }

  if (best === null) return null
  const found: GenreMatch = best
  return found.score >= MATCH_THRESHOLD ? found : null
}

/** 学習用エイリアスのキー (正規化済みテキスト) を返す。 */
export function aliasKey(text: string): string {
  return normalize(text)
}
