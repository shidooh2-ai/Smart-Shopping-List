import type { CSSProperties } from 'react'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { effectStyle } from '../data/effects'
import { onEffect, type EffectKind } from '../lib/effectBus'
import { useAppStore } from '../store/useAppStore'

interface Burst {
  id: number
  kind: EffectKind
}

let nextBurstId = 0

/**
 * 品目チェック・お買い物完了のお祝い演出。lib/effectBus.ts のイベントを受けて、
 * 画面全体に絵文字パーティクルを飛ばすだけの使い捨てレイヤー (状態には残らない)。
 * どんな見た目にするかは設定のエフェクト (着せ替え) に従う。
 */
export function EffectLayer() {
  const effectTheme = useAppStore((s) => s.effectTheme)
  const [bursts, setBursts] = useState<Burst[]>([])

  useEffect(() => {
    return onEffect((kind) => {
      const style = effectStyle(effectTheme)
      const count = kind === 'complete' ? style.completeCount : style.checkCount
      const hasMessage = kind === 'complete' && style.completeMessage
      if (count === 0 && !hasMessage) return
      const id = nextBurstId++
      setBursts((prev) => [...prev, { id, kind }])
      const lifetime = kind === 'complete' ? 1600 : 800
      setTimeout(() => {
        setBursts((prev) => prev.filter((b) => b.id !== id))
      }, lifetime)
    })
  }, [effectTheme])

  if (bursts.length === 0) return null

  return createPortal(
    <div className="effect-layer" aria-hidden="true">
      {bursts.map((b) => (
        <EffectBurst key={b.id} kind={b.kind} effectId={effectTheme} />
      ))}
    </div>,
    document.body,
  )
}

interface Particle {
  id: number
  emoji: string
  dx: number
  dy: number
  rot: number
  delay: number
  size: number
}

function makeParticles(emoji: string[], count: number, spread: number): Particle[] {
  if (emoji.length === 0) return []
  return Array.from({ length: count }, (_, i) => {
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.6
    const dist = spread * (0.6 + Math.random() * 0.6)
    return {
      id: i,
      emoji: emoji[i % emoji.length],
      dx: Math.cos(angle) * dist,
      dy: Math.sin(angle) * dist - spread * 0.3,
      rot: (Math.random() - 0.5) * 360,
      delay: Math.random() * 120,
      size: 18 + Math.random() * 14,
    }
  })
}

function EffectBurst({ kind, effectId }: { kind: EffectKind; effectId: Parameters<typeof effectStyle>[0] }) {
  const style = effectStyle(effectId)
  const isComplete = kind === 'complete'
  const [particles] = useState<Particle[]>(() =>
    isComplete
      ? makeParticles(style.completeEmoji, style.completeCount, 160)
      : makeParticles(style.checkEmoji, style.checkCount, 60),
  )

  return (
    <div className={`effect-burst${isComplete ? ' complete' : ''}`}>
      {particles.map((p) => (
        <span
          key={p.id}
          className="effect-particle"
          style={
            {
              '--dx': `${p.dx}px`,
              '--dy': `${p.dy}px`,
              '--rot': `${p.rot}deg`,
              animationDelay: `${p.delay}ms`,
              fontSize: p.size,
            } as CSSProperties
          }
        >
          {p.emoji}
        </span>
      ))}
      {isComplete && style.completeMessage && <div className="effect-toast">{style.completeMessage}</div>}
    </div>
  )
}
