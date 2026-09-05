import type { CSSProperties } from 'react'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { type EffectId, effectStyle } from '../data/effects'
import { onEffect, type EffectKind } from '../lib/effectBus'
import { useAppStore } from '../store/useAppStore'
import { AcornArt, BalloonArt, ConfettiArt, GlintArt, LeafArt, PetalArt, ShellArt, SparkArt, SquirrelArt } from './effectArt'

interface Burst {
  id: number
  kind: EffectKind
  /** 発生時点の設定。演出中に着せ替えても、出ている分は途中で変わらない */
  effectId: EffectId
  /** 発生時点の画面の高さ (px)。落下/上昇の距離に使う */
  screenHeight: number
}

let nextBurstId = 0

/** 同時に出せる演出の数。連続でチェックしても増え続けないよう頭打ちにする */
const MAX_BURSTS = 6

const rand = (min: number, max: number) => min + Math.random() * (max - min)
const pick = <T,>(values: T[], i: number) => values[i % values.length]

/**
 * 品目チェック・お買い物完了のお祝い演出。lib/effectBus.ts のイベントを受けて、
 * 選んでいるエフェクトに応じた絵柄 (effectArt.tsx のSVG) を画面全体に降らせる/上げる。
 * クリックを奪わない使い捨てのレイヤーで、状態としては残らない。
 */
export function EffectLayer() {
  const effectTheme = useAppStore((s) => s.effectTheme)
  const [bursts, setBursts] = useState<Burst[]>([])

  useEffect(() => {
    return onEffect((kind) => {
      const style = effectStyle(effectTheme)
      const count = kind === 'complete' ? style.completeCount : style.checkCount
      const hasMessage = kind === 'complete' && style.completeMessage !== null
      if (count === 0 && !hasMessage) return

      const id = nextBurstId++
      const burst: Burst = { id, kind, effectId: effectTheme, screenHeight: window.innerHeight }
      setBursts((prev) => [...prev, burst].slice(-MAX_BURSTS))
      const lifetime = kind === 'complete' ? style.completeDurationMs : style.checkDurationMs
      setTimeout(() => setBursts((prev) => prev.filter((b) => b.id !== id)), lifetime)
    })
  }, [effectTheme])

  if (bursts.length === 0) return null

  return createPortal(
    <div className="effect-layer" aria-hidden="true">
      {bursts.map((b) => (
        <EffectScene key={b.id} burst={b} />
      ))}
    </div>,
    document.body,
  )
}

function EffectScene({ burst }: { burst: Burst }) {
  const style = effectStyle(burst.effectId)
  const isComplete = burst.kind === 'complete'
  const count = isComplete ? style.completeCount : style.checkCount

  return (
    <>
      {burst.effectId === 'petals' && <PetalScene count={count} burst={burst} />}
      {burst.effectId === 'confetti' && <FallingScene count={count} burst={burst} />}
      {burst.effectId === 'balloons' && <BalloonScene count={count} burst={burst} />}
      {burst.effectId === 'fireworks' && <FireworkScene count={count} burst={burst} isComplete={isComplete} />}
      {burst.effectId === 'squirrel' && <SquirrelScene count={count} burst={burst} isComplete={isComplete} />}
      {burst.effectId === 'default' && <GlintScene count={count} burst={burst} />}
      {isComplete && style.completeMessage && <div className="effect-toast">{style.completeMessage}</div>}
    </>
  )
}

interface Falling {
  id: number
  color: string
  left: number
  size: number
  delay: number
  duration: number
  drift: number
  spin: number
  swayDuration: number
}

/** 上から落ちてくる紙吹雪。落下と横ゆれを入れ子にして自然な軌跡にする。 */
function FallingScene({ count, burst }: { count: number; burst: Burst }) {
  const colors = effectStyle(burst.effectId).colors
  const [pieces] = useState<Falling[]>(() =>
    Array.from({ length: count }, (_, i) => ({
      id: i,
      color: pick(colors, i),
      left: rand(0, 100),
      size: rand(8, 14),
      delay: rand(0, 700),
      duration: rand(1600, 2600),
      drift: rand(-60, 60),
      spin: rand(-540, 540),
      swayDuration: rand(700, 1400),
    })),
  )

  return (
    <>
      {pieces.map((p) => (
        <span
          key={p.id}
          className="effect-fall"
          style={
            {
              left: `${p.left}%`,
              '--fall': `${burst.screenHeight + 80}px`,
              '--drift': `${p.drift}px`,
              animationDelay: `${p.delay}ms`,
              animationDuration: `${p.duration}ms`,
            } as CSSProperties
          }
        >
          <span
            className="effect-sway"
            style={
              {
                '--spin': `${p.spin}deg`,
                animationDuration: `${p.swayDuration}ms`,
              } as CSSProperties
            }
          >
            <ConfettiArt color={p.color} size={p.size} />
          </span>
        </span>
      ))}
    </>
  )
}

interface Petal {
  id: number
  color: string
  left: number
  size: number
  delay: number
  duration: number
  /** 落ちながら左右に振れる位置 (20/40/60/80/100%地点)。符号を交互にしてジグザグにする */
  d1: number
  d2: number
  d3: number
  d4: number
  d5: number
  spinDuration: number
}

/**
 * 桜の花びら。左右に大きくジグザグしながら落ち、内側では花びら自身が
 * くるくると裏表を見せるように回転する (葉っぱが「ひらひら」舞う動き)。
 */
function PetalScene({ count, burst }: { count: number; burst: Burst }) {
  const colors = effectStyle(burst.effectId).colors
  const [petals] = useState<Petal[]>(() =>
    Array.from({ length: count }, (_, i) => {
      const amp = rand(30, 60)
      const dir = i % 2 === 0 ? 1 : -1
      return {
        id: i,
        color: pick(colors, i),
        left: rand(0, 100),
        size: rand(14, 24),
        delay: rand(0, 800),
        duration: rand(2800, 4400),
        d1: dir * amp * rand(0.6, 1),
        d2: -dir * amp * rand(0.8, 1.2),
        d3: dir * amp * rand(0.7, 1.1),
        d4: -dir * amp * rand(0.5, 0.9),
        d5: dir * amp * rand(0.15, 0.4),
        spinDuration: rand(500, 950),
      }
    }),
  )

  return (
    <>
      {petals.map((p) => (
        <span
          key={p.id}
          className="effect-petal-fall"
          style={
            {
              left: `${p.left}%`,
              '--fall': `${burst.screenHeight + 80}px`,
              '--d1': `${p.d1}px`,
              '--d2': `${p.d2}px`,
              '--d3': `${p.d3}px`,
              '--d4': `${p.d4}px`,
              '--d5': `${p.d5}px`,
              animationDelay: `${p.delay}ms`,
              animationDuration: `${p.duration}ms`,
            } as CSSProperties
          }
        >
          <span className="effect-petal-spin" style={{ animationDuration: `${p.spinDuration}ms` } as CSSProperties}>
            <PetalArt color={p.color} size={p.size} />
          </span>
        </span>
      ))}
    </>
  )
}

/** 下から昇っていく風船。 */
function BalloonScene({ count, burst }: { count: number; burst: Burst }) {
  const colors = effectStyle(burst.effectId).colors
  const [balloons] = useState(() =>
    Array.from({ length: count }, (_, i) => ({
      id: i,
      color: pick(colors, i),
      left: rand(4, 92),
      size: rand(22, 40),
      delay: rand(0, 900),
      duration: rand(2000, 2900),
      swayDuration: rand(1200, 2000),
      sway: rand(10, 26),
    })),
  )

  return (
    <>
      {balloons.map((b) => (
        <span
          key={b.id}
          className="effect-rise"
          style={
            {
              left: `${b.left}%`,
              '--rise': `${burst.screenHeight + 160}px`,
              animationDelay: `${b.delay}ms`,
              animationDuration: `${b.duration}ms`,
            } as CSSProperties
          }
        >
          <span
            className="effect-balloon-sway"
            style={{ '--sway': `${b.sway}px`, animationDuration: `${b.swayDuration}ms` } as CSSProperties}
          >
            <BalloonArt color={b.color} size={b.size} />
          </span>
        </span>
      ))}
    </>
  )
}

const RISE_MS = 720
/** 外周の火の粉の数。内側にも一回り小さいものを重ねて、開いたときの密度を出す */
const OUTER_SPARKS = 26
const INNER_SPARKS = 12

/** 打ち上げ花火。下から玉が昇り、頂点で火の粉が放射状に開いて落ちる。 */
function FireworkScene({ count, burst, isComplete }: { count: number; burst: Burst; isComplete: boolean }) {
  const colors = effectStyle(burst.effectId).colors
  const [shells] = useState(() =>
    Array.from({ length: count }, (_, i) => {
      const color = pick(colors, i)
      const accent = pick(colors, i + 2)
      const spread = rand(120, 190)
      const ring = (n: number, scale: number, sizeRange: [number, number], offset: number) =>
        Array.from({ length: n }, (_, s) => {
          const angle = (Math.PI * 2 * s) / n + offset + rand(-0.1, 0.1)
          const dist = spread * scale * rand(0.75, 1)
          return {
            id: `${scale}-${s}`,
            color: s % 5 === 0 ? accent : color,
            dx: Math.cos(angle) * dist,
            dy: Math.sin(angle) * dist,
            angle: (angle * 180) / Math.PI,
            size: rand(sizeRange[0], sizeRange[1]),
          }
        })
      return {
        id: i,
        color,
        left: rand(12, 88),
        // 画面の上寄り (14%〜44%) で開かせる
        top: rand(0.14, 0.44) * burst.screenHeight,
        // 続けざまに打ち上がるよう、間隔を詰めて順番に上げる
        delay: i * 240 + rand(0, 160),
        sparks: [...ring(OUTER_SPARKS, 1, [3.5, 5.5], 0), ...ring(INNER_SPARKS, 0.55, [2.5, 4], 0.26)],
      }
    }),
  )

  return (
    <>
      {/* 花火は暗い空でこそ映えるので、買い終えたときは画面をふわっと暗くする */}
      {isComplete && <span className="effect-nightsky" />}
      {shells.map((shell) => (
        <span key={shell.id} className="effect-shell-origin" style={{ left: `${shell.left}%`, top: shell.top }}>
          <span
            className="effect-shell"
            style={
              {
                '--rise': `${burst.screenHeight - shell.top + 40}px`,
                animationDelay: `${shell.delay}ms`,
                animationDuration: `${RISE_MS}ms`,
              } as CSSProperties
            }
          >
            <ShellArt color={shell.color} size={9} />
          </span>
          {shell.sparks.map((s) => (
            <span
              key={s.id}
              className="effect-spark"
              style={
                {
                  '--dx': `${s.dx}px`,
                  '--dy': `${s.dy}px`,
                  '--angle': `${s.angle}deg`,
                  animationDelay: `${shell.delay + RISE_MS}ms`,
                } as CSSProperties
              }
            >
              <SparkArt color={s.color} size={s.size} />
            </span>
          ))}
          <span
            className="effect-flash"
            style={{ background: `radial-gradient(circle, ${shell.color} 0%, transparent 70%)`, animationDelay: `${shell.delay + RISE_MS}ms` }}
          />
        </span>
      ))}
    </>
  )
}

/**
 * 「リス太」テーマ。チェック時はリス太の趣味である「どんぐり集め」らしく、
 * どんぐりが軽くポンと弾んで消える。買い終えたときはリス太本人が真ん中に登場し、
 * 周りにどんぐりと葉っぱが舞い落ちる (「ぜんぶそろったリス」のお祝いポーズ)。
 */
function SquirrelScene({ count, burst, isComplete }: { count: number; burst: Burst; isComplete: boolean }) {
  if (!isComplete) return <AcornPopScene count={count} burst={burst} />

  return (
    <>
      <AcornLeafShower count={count} burst={burst} />
      <SquirrelSparkles burst={burst} />
      <span className="effect-mascot">
        <SquirrelArt size={128} />
      </span>
    </>
  )
}

/** どんぐりが軽く弾んで消える (品目チェック用)。 */
function AcornPopScene({ count, burst }: { count: number; burst: Burst }) {
  const [acorns] = useState(() =>
    Array.from({ length: count }, (_, i) => ({
      id: i,
      left: rand(24, 76),
      top: rand(0.34, 0.58) * burst.screenHeight,
      size: rand(18, 26),
      delay: rand(0, 180),
    })),
  )

  return (
    <>
      {acorns.map((a) => (
        <span
          key={a.id}
          className="effect-acorn-pop"
          style={{ left: `${a.left}%`, top: a.top, animationDelay: `${a.delay}ms` } as CSSProperties}
        >
          <AcornArt size={a.size} />
        </span>
      ))}
    </>
  )
}

/** リス太の周りに舞い落ちるどんぐりと葉っぱ。落下の仕組みは花びら・紙吹雪と共通のものを使う。 */
function AcornLeafShower({ count, burst }: { count: number; burst: Burst }) {
  const [pieces] = useState(() =>
    Array.from({ length: count }, (_, i) => ({
      id: i,
      kind: i % 2 === 0 ? ('acorn' as const) : ('leaf' as const),
      left: rand(4, 96),
      size: rand(14, 22),
      delay: rand(0, 900),
      duration: rand(1900, 2800),
      drift: rand(-50, 50),
      spin: rand(-320, 320),
      swayDuration: rand(800, 1500),
    })),
  )

  return (
    <>
      {pieces.map((p) => (
        <span
          key={p.id}
          className="effect-fall"
          style={
            {
              left: `${p.left}%`,
              '--fall': `${burst.screenHeight + 80}px`,
              '--drift': `${p.drift}px`,
              animationDelay: `${p.delay}ms`,
              animationDuration: `${p.duration}ms`,
            } as CSSProperties
          }
        >
          <span
            className="effect-sway"
            style={{ '--spin': `${p.spin}deg`, animationDuration: `${p.swayDuration}ms` } as CSSProperties}
          >
            {p.kind === 'acorn' ? <AcornArt size={p.size} /> : <LeafArt size={p.size} />}
          </span>
        </span>
      ))}
    </>
  )
}

/** リス太の周りで瞬く、小さなきらめき。 */
function SquirrelSparkles({ burst }: { burst: Burst }) {
  const colors = effectStyle(burst.effectId).colors
  const [glints] = useState(() =>
    Array.from({ length: 5 }, (_, i) => ({
      id: i,
      color: pick(colors, i),
      left: rand(28, 72),
      top: rand(0.24, 0.56) * burst.screenHeight,
      size: rand(9, 16),
      delay: rand(150, 700),
      lift: rand(30, 70),
    })),
  )

  return (
    <>
      {glints.map((g) => (
        <span
          key={g.id}
          className="effect-glint"
          style={
            {
              left: `${g.left}%`,
              top: g.top,
              '--lift': `${-g.lift}px`,
              animationDelay: `${g.delay}ms`,
            } as CSSProperties
          }
        >
          <GlintArt color={g.color} size={g.size} />
        </span>
      ))}
    </>
  )
}

/** 「ひかえめ」用。光の粒が中央付近でふわっと浮かんで消える。 */
function GlintScene({ count, burst }: { count: number; burst: Burst }) {
  const colors = effectStyle(burst.effectId).colors
  const [glints] = useState(() =>
    Array.from({ length: count }, (_, i) => ({
      id: i,
      color: pick(colors, i),
      left: rand(15, 85),
      top: rand(0.3, 0.62) * burst.screenHeight,
      size: rand(10, 22),
      delay: rand(0, 350),
      lift: rand(40, 110),
    })),
  )

  return (
    <>
      {glints.map((g) => (
        <span
          key={g.id}
          className="effect-glint"
          style={
            {
              left: `${g.left}%`,
              top: g.top,
              '--lift': `${-g.lift}px`,
              animationDelay: `${g.delay}ms`,
            } as CSSProperties
          }
        >
          <GlintArt color={g.color} size={g.size} />
        </span>
      ))}
    </>
  )
}
