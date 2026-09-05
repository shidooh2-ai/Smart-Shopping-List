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

/**
 * アプリのキャラクター「リス太」。ユーザーが送ってくれたキャラクター案を元にした固定デザインなので、
 * (他のエフェクトと違って) 色は着せ替えず、このファイル内の色をそのまま使う。
 * happy=true で「できたリス」の閉じ目の笑顔になる (お買い物完了のときに使う)。
 */
export function SquirrelArt({ size, happy = false }: { size: number; happy?: boolean }) {
  const height = size * 1.2
  return (
    <svg width={size} height={height} viewBox="0 0 100 120" aria-hidden="true">
      {/* しっぽ */}
      <path
        d="M66 98C102 96 112 50 90 24 79 11 56 12 53 26 50 38 64 40 74 52 86 66 84 86 68 88Z"
        fill="#c9a06e"
        stroke="#8a6242"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M68 90C92 88 100 50 82 30 74 21 61 22 59 30 57 39 68 41 76 51 85 62 82 79 70 81Z"
        fill="#f2ddc2"
      />
      <path d="M86 38C91 46 92 57 88 66" stroke="#a97c4f" strokeWidth="2.4" fill="none" strokeLinecap="round" opacity="0.55" />

      {/* あし */}
      <ellipse cx="39" cy="105" rx="8.5" ry="5.5" fill="#c9a06e" stroke="#8a6242" strokeWidth="1.6" />
      <ellipse cx="61" cy="105" rx="8.5" ry="5.5" fill="#c9a06e" stroke="#8a6242" strokeWidth="1.6" />

      {/* からだ */}
      <path
        d="M50 48C68 48 77 66 77 81 77 97 65 106 50 106 35 106 23 97 23 81 23 66 32 48 50 48Z"
        fill="#c9a06e"
        stroke="#8a6242"
        strokeWidth="1.8"
      />
      <path
        d="M50 60C62 60 68 72 68 83 68 95 60 101 50 101 40 101 32 95 32 83 32 72 38 60 50 60Z"
        fill="#f7e7d2"
      />

      {/* うで */}
      <ellipse cx="26" cy="78" rx="6.5" ry="8" fill="#c9a06e" stroke="#8a6242" strokeWidth="1.6" transform="rotate(-14 26 78)" />
      <ellipse cx="74" cy="78" rx="6.5" ry="8" fill="#c9a06e" stroke="#8a6242" strokeWidth="1.6" transform="rotate(14 74 78)" />

      {/* みみ */}
      <path d="M30 24C23 13 27 3 36 8 41 11 43 18 43 24Z" fill="#c9a06e" stroke="#8a6242" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M32.5 21C29 13 31.5 8.5 36 11.5 39 13.5 40.5 18 40.5 21Z" fill="#efc9ad" />
      <path d="M70 24C77 13 73 3 64 8 59 11 57 18 57 24Z" fill="#c9a06e" stroke="#8a6242" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M67.5 21C71 13 68.5 8.5 64 11.5 61 13.5 59.5 18 59.5 21Z" fill="#efc9ad" />
      <g stroke="#8a6242" strokeWidth="1.5" strokeLinecap="round" fill="none">
        <path d="M32 6 29 0" />
        <path d="M36 5 36 -1" />
        <path d="M40 6 43 0" />
        <path d="M68 6 71 0" />
        <path d="M64 5 64 -1" />
        <path d="M60 6 57 0" />
      </g>

      {/* あたま */}
      <path
        d="M50 10C69 10 80 24 80 41 80 57 67 67 50 67 33 67 20 57 20 41 20 24 31 10 50 10Z"
        fill="#c9a06e"
        stroke="#8a6242"
        strokeWidth="1.8"
      />
      <path
        d="M50 28C65 28 74 39 74 50 74 60 63 67 50 67 37 67 26 60 26 50 26 39 35 28 50 28Z"
        fill="#f7e7d2"
      />
      <path d="M38 22C36 26 35 30 35 33" stroke="#a97c4f" strokeWidth="2.2" fill="none" strokeLinecap="round" opacity="0.6" />
      <path d="M62 22C64 26 65 30 65 33" stroke="#a97c4f" strokeWidth="2.2" fill="none" strokeLinecap="round" opacity="0.6" />

      {/* ほっぺ */}
      <ellipse cx="32" cy="52" rx="5" ry="3.6" fill="#f0a992" opacity="0.55" />
      <ellipse cx="68" cy="52" rx="5" ry="3.6" fill="#f0a992" opacity="0.55" />

      {/* め (できたリス=笑顔で目を閉じる / 通常=丸目) */}
      {happy ? (
        <g stroke="#4a3325" strokeWidth="2.2" fill="none" strokeLinecap="round">
          <path d="M36.5 45q4.5-6 9 0" />
          <path d="M54.5 45q4.5-6 9 0" />
        </g>
      ) : (
        <>
          <ellipse cx="41" cy="45" rx="4.2" ry="5" fill="#4a3325" />
          <ellipse cx="59" cy="45" rx="4.2" ry="5" fill="#4a3325" />
          <circle cx="42.6" cy="43" r="1.5" fill="#fff" />
          <circle cx="60.6" cy="43" r="1.5" fill="#fff" />
        </>
      )}

      {/* はな・くち */}
      <path
        d="M47.2 52h5.6c1.2 0 1.6 1.4 0.6 2.2l-2.2 1.7c-0.7 0.6-1.7 0.6-2.4 0l-2.2-1.7c-1-0.8-0.6-2.2 0.6-2.2z"
        fill="#a9724f"
      />
      <path d="M50 56.5q-2.6 3-5 0.4M50 56.5q2.6 3 5 0.4" stroke="#8a6242" strokeWidth="1.4" fill="none" strokeLinecap="round" />

      {/* バンダナ */}
      <path
        d="M33 64C41 71 59 71 67 64L64 73C58 78 42 78 36 73Z"
        fill="#9caf7d"
        stroke="#7d8f61"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** どんぐり。「木の実を集める」リス太の趣味にちなみ、品目チェックの粒に使う。 */
export function AcornArt({ size }: { size: number }) {
  return (
    <svg width={size} height={size * 1.25} viewBox="0 0 24 30" aria-hidden="true">
      <path d="M12 27.5c-4.2 0-7-3.6-7-8.2 0-3.5 3-6.3 7-6.3s7 2.8 7 6.3c0 4.6-2.8 8.2-7 8.2z" fill="#e3b57f" stroke="#8a6242" strokeWidth="1.1" />
      <path d="M12 6.4c4.6 0 8 2.4 8 4.9 0 2.4-3.4 3.5-8 3.5s-8-1.1-8-3.5c0-2.5 3.4-4.9 8-4.9z" fill="#a97c4f" stroke="#8a6242" strokeWidth="1.1" />
      <path d="M12 6.4V2.6" stroke="#8a6242" strokeWidth="1.6" strokeLinecap="round" />
      <ellipse cx="9.4" cy="19" rx="1.6" ry="2.4" fill="#fff" opacity="0.35" />
    </svg>
  )
}

/** 葉っぱ。どんぐりと一緒に舞わせて、木の下でお買い物完了をお祝いする雰囲気にする。 */
export function LeafArt({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M20.5 3.5C11 3 3.5 8 3.5 15.5c0 2.4.8 4 .8 4s2.2-6.5 8-9.6c-3.4 3-5.8 7-6.6 11.6 0 0 9.6 1.6 13.4-5.6 2.4-4.6 1.4-12.4 1.4-12.4z"
        fill="#9caf7d"
        stroke="#7d8f61"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
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
  if (id === 'squirrel') {
    return (
      <>
        <SquirrelArt size={30} happy />
        <span style={{ transform: 'translateY(2px)' }}>
          <AcornArt size={12} />
        </span>
        <span style={{ transform: 'rotate(-10deg)' }}>
          <LeafArt size={12} />
        </span>
      </>
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
