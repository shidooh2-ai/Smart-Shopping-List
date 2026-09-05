/**
 * 品目チェック・お買い物完了のタイミングを、ストアの中から画面 (EffectLayer) へ伝える
 * だけの小さなイベントバス。Reactの外 (zustandのアクション) から発火できるように、
 * 状態としては持たず購読者に直接通知する。
 */
export type EffectKind = 'check' | 'complete'

type Listener = (kind: EffectKind) => void

const listeners = new Set<Listener>()

export function fireEffect(kind: EffectKind): void {
  for (const fn of listeners) fn(kind)
}

/** 戻り値を呼ぶと購読解除する。 */
export function onEffect(fn: Listener): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
