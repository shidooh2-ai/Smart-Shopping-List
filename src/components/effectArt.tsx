/**
 * お祝いエフェクトの絵柄。絵文字だと端末のフォント任せで形も色も揃わないため、
 * すべてこのファイルのSVGで描いている (色は effects.ts のパレットから受け取る)。
 *
 * どれも「1粒ぶん」の絵で、実際の動き (落ちる/昇る/開く) は EffectLayer.tsx が付ける。
 */

interface ArtProps {
  color: string
  size: number
}

/** 桜の花びら。上側に切れ込みのある、先の丸い5弁桜の1枚。 */
export function PetalArt({ color, size }: ArtProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 23.2C4.2 18.4 1.6 10.4 6.6 4.2 8.6 1.7 10.4 3.8 12 6.6c1.6-2.8 3.4-4.9 5.4-2.4 5 6.2 2.4 14.2-5.4 19z"
        fill={color}
      />
      {/* 中心側の陰。のっぺりしないよう、根元だけ少し濃くする */}
      <path d="M12 23.2c-3.3-2-5.6-4.6-6.6-7.5 2.4 2.6 4.6 4.4 6.6 5.4z" fill="#000" opacity="0.08" />
      <path d="M12 7.4c.7 3.6.7 8.6 0 14.4" stroke="#fff" strokeWidth="0.8" opacity="0.45" fill="none" />
    </svg>
  )
}

/** 風船。本体・結び目・ゆれる糸まで1つの絵にしてある。 */
export function BalloonArt({ color, size }: ArtProps) {
  const height = size * 1.6
  return (
    <svg width={size} height={height} viewBox="0 0 24 38" aria-hidden="true">
      <ellipse cx="12" cy="13" rx="9.2" ry="11.6" fill={color} />
      {/* 光沢。左上から当たる光を想定 */}
      <ellipse cx="8.4" cy="8.4" rx="2.6" ry="4" fill="#fff" opacity="0.4" transform="rotate(-25 8.4 8.4)" />
      <path d="M10.3 24.2h3.4L12 27.4z" fill={color} />
      <path d="M10.3 24.2h3.4L12 27.4z" fill="#000" opacity="0.15" />
      <path d="M12 27.4c2 2.2-2 3.8 0 6.2 1.4 1.6-.6 2.6-.6 4" stroke={color} strokeWidth="0.9" fill="none" opacity="0.75" />
    </svg>
  )
}

/** 紙吹雪の1片。ひらひら感を出すため、まっすぐな長方形ではなく波打たせている。 */
export function ConfettiArt({ color, size }: ArtProps) {
  return (
    <svg width={size} height={size * 1.3} viewBox="0 0 12 16" aria-hidden="true">
      <path d="M1 1.4C4 0.2 8 2 11 1v13.6c-3 1.2-7-.6-10 .4z" fill={color} />
      <path d="M6 1.6v13.4" stroke="#000" strokeWidth="0.6" opacity="0.12" />
    </svg>
  )
}

/** 光の粒 (4方向にのびるきらめき)。「ひかえめ」と花火の火の粉に使う。 */
export function GlintArt({ color, size }: ArtProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 0c1.1 8.3 3.7 11 12 12-8.3 1.1-10.9 3.7-12 12-1.1-8.3-3.7-10.9-12-12C8.3 10.9 10.9 8.3 12 0z" fill={color} />
    </svg>
  )
}

/** 花火の火の粉。飛ぶ方向に尾を引いた形。 */
export function SparkArt({ color, size }: ArtProps) {
  return (
    <svg width={size * 3} height={size} viewBox="0 0 18 6" aria-hidden="true">
      <defs>
        <linearGradient id={`spark-${color.replace('#', '')}`} x1="0" x2="1">
          <stop offset="0" stopColor={color} stopOpacity="0" />
          <stop offset="1" stopColor={color} stopOpacity="1" />
        </linearGradient>
      </defs>
      <path d="M0 3 15 0.6a2.4 2.4 0 010 4.8z" fill={`url(#spark-${color.replace('#', '')})`} />
      <circle cx="15.4" cy="3" r="2.6" fill={color} />
    </svg>
  )
}

/** 設定画面のエフェクト選択に出す見本 (静止画)。実際の絵柄をそのまま小さく並べる。 */
export function EffectPreview({ id, colors }: { id: string; colors: string[] }) {
  if (id === 'petals') {
    return (
      <>
        <span style={{ transform: 'rotate(-25deg)' }}>
          <PetalArt color={colors[0]} size={18} />
        </span>
        <span style={{ transform: 'rotate(15deg) translateY(4px)' }}>
          <PetalArt color={colors[3] ?? colors[0]} size={22} />
        </span>
        <span style={{ transform: 'rotate(40deg)' }}>
          <PetalArt color={colors[1] ?? colors[0]} size={15} />
        </span>
      </>
    )
  }
  if (id === 'confetti') {
    return (
      <>
        <span style={{ transform: 'rotate(-30deg)' }}>
          <ConfettiArt color={colors[0]} size={11} />
        </span>
        <span style={{ transform: 'rotate(12deg)' }}>
          <ConfettiArt color={colors[2] ?? colors[0]} size={13} />
        </span>
        <span style={{ transform: 'rotate(-8deg)' }}>
          <ConfettiArt color={colors[3] ?? colors[0]} size={10} />
        </span>
        <span style={{ transform: 'rotate(35deg)' }}>
          <ConfettiArt color={colors[1] ?? colors[0]} size={12} />
        </span>
      </>
    )
  }
  if (id === 'balloons') {
    return (
      <>
        <span style={{ transform: 'rotate(-8deg)' }}>
          <BalloonArt color={colors[0]} size={17} />
        </span>
        <span style={{ transform: 'rotate(6deg) translateY(3px)' }}>
          <BalloonArt color={colors[1] ?? colors[0]} size={21} />
        </span>
        <span style={{ transform: 'rotate(-4deg)' }}>
          <BalloonArt color={colors[3] ?? colors[0]} size={15} />
        </span>
      </>
    )
  }
  if (id === 'fireworks') {
    // 開いた花火を1発、静止画として描く
    return (
      <span style={{ position: 'relative', width: 40, height: 40 }}>
        {Array.from({ length: 10 }, (_, i) => {
          const angle = (360 / 10) * i
          return (
            <span
              key={i}
              style={{
                position: 'absolute',
                left: 20,
                top: 20,
                transform: `rotate(${angle}deg) translateX(6px)`,
                transformOrigin: '0 50%',
              }}
            >
              <SparkArt color={colors[i % colors.length]} size={3} />
            </span>
          )
        })}
      </span>
    )
  }
  if (id === 'default') {
    return (
      <>
        <GlintArt color={colors[0]} size={14} />
        <GlintArt color={colors[1] ?? colors[0]} size={22} />
        <GlintArt color={colors[2] ?? colors[0]} size={11} />
      </>
    )
  }
  return <span className="none">なし</span>
}

/** 打ち上げ中の花火 (玉と尾)。開く前の上昇に使う。 */
export function ShellArt({ color, size }: ArtProps) {
  return (
    <svg width={size} height={size * 4} viewBox="0 0 6 24" aria-hidden="true">
      <defs>
        <linearGradient id={`shell-${color.replace('#', '')}`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor={color} stopOpacity="0" />
          <stop offset="1" stopColor={color} stopOpacity="0.9" />
        </linearGradient>
      </defs>
      <rect x="2.2" y="2" width="1.6" height="21" rx="0.8" fill={`url(#shell-${color.replace('#', '')})`} />
      <circle cx="3" cy="3" r="2.6" fill={color} />
    </svg>
  )
}
