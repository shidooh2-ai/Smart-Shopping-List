/**
 * 画面のテーマ。実際の色は styles.css の [data-theme='...'] ブロックで定義する。
 * 'default' は端末 (OS) のライト/ダーク設定にそのまま従う。
 */
export type ThemeId = 'default' | 'dark' | 'ocean' | 'sakura' | 'forest' | 'mono'

export const THEMES: Array<{ id: ThemeId; label: string }> = [
  { id: 'default', label: 'デフォルト' },
  { id: 'dark', label: 'ダークモード' },
  { id: 'ocean', label: 'オーシャン' },
  { id: 'sakura', label: 'さくら' },
  { id: 'forest', label: 'フォレスト' },
  { id: 'mono', label: 'モノクロ' },
]

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && THEMES.some((t) => t.id === value)
}
