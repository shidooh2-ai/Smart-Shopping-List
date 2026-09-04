import { useEffect, useRef, useState } from 'react'
import { GenreGlyph, ListGlyph, MapGlyph, RouteGlyph } from './components/icons'
import { startCloudSyncBridge } from './lib/cloudSyncBridge'
import { GenreScreen } from './screens/GenreScreen'
import { ListScreen } from './screens/ListScreen'
import { MapScreen } from './screens/MapScreen'
import { RouteScreen } from './screens/RouteScreen'
import { type Tab, useAppStore } from './store/useAppStore'

const TABS: Array<{ id: Tab; label: string; Icon: typeof ListGlyph }> = [
  { id: 'list', label: 'リスト', Icon: ListGlyph },
  { id: 'route', label: 'ルート', Icon: RouteGlyph },
  { id: 'map', label: 'マップ', Icon: MapGlyph },
  { id: 'genre', label: 'ジャンル', Icon: GenreGlyph },
]

/**
 * スクロール方向に応じてタブバーを自動的に隠す/表示するしきい値 (px)。
 * 状態が切り替わるたびに累積量をリセットする「ヒステリシス」方式にすることで、
 * iOSのバウンス(ラバーバンド)スクロールで scrollTop が細かく前後した際に
 * 表示/非表示が連続で切り替わってチラつくのを防ぐ。
 */
const HIDE_ACCUM = 28
const SHOW_ACCUM = 28
const NEAR_TOP = 8
const NEAR_BOTTOM = 2

export default function App() {
  const tab = useAppStore((s) => s.tab)
  const setTab = useAppStore((s) => s.setTab)
  const [tabbarHidden, setTabbarHidden] = useState(false)
  const mainRef = useRef<HTMLElement | null>(null)
  const lastScrollTop = useRef(0)
  const accumDelta = useRef(0)

  useEffect(() => {
    startCloudSyncBridge()
  }, [])

  // タブを切り替えたら、前の画面のスクロール位置を引きずらないようにリセットする。
  useEffect(() => {
    lastScrollTop.current = 0
    accumDelta.current = 0
    setTabbarHidden(false)
  }, [tab])

  useEffect(() => {
    const mainEl = mainRef.current
    if (!mainEl) return
    let target: HTMLElement | null = null
    let rafId: number | null = null

    const process = () => {
      rafId = null
      if (!target) return
      // ラバーバンド(バウンス)スクロールでは scrollTop が実際の可動域を
      // 超えて負の値や scrollHeight 超えの値になることがあるため、可動域に
      // クランプしてから差分を取る。そうしないと端で跳ね返るたびに
      // 上下スクロールと誤認してタブバーが点滅してしまう。
      const maxScroll = Math.max(0, target.scrollHeight - target.clientHeight)
      const current = Math.min(Math.max(target.scrollTop, 0), maxScroll)
      const delta = current - lastScrollTop.current
      lastScrollTop.current = current

      if (current <= NEAR_TOP || current >= maxScroll - NEAR_BOTTOM) {
        accumDelta.current = 0
        setTabbarHidden(false)
        return
      }

      if ((delta > 0 && accumDelta.current < 0) || (delta < 0 && accumDelta.current > 0)) {
        accumDelta.current = 0
      }
      accumDelta.current += delta

      if (accumDelta.current > HIDE_ACCUM) {
        setTabbarHidden(true)
        accumDelta.current = 0
      } else if (accumDelta.current < -SHOW_ACCUM) {
        setTabbarHidden(false)
        accumDelta.current = 0
      }
    }

    const handleScroll = (e: Event) => {
      if (!(e.target instanceof HTMLElement)) return
      target = e.target
      // 1フレームに1回だけ計算し、バーストするscrollイベントによるチラつきを抑える。
      if (rafId == null) rafId = requestAnimationFrame(process)
    }

    // `.screen` (各画面が持つスクロール要素) の scroll イベントは bubbling しないため、
    // capture フェーズで拾う。
    mainEl.addEventListener('scroll', handleScroll, { capture: true, passive: true })
    return () => {
      mainEl.removeEventListener('scroll', handleScroll, true)
      if (rafId != null) cancelAnimationFrame(rafId)
    }
  }, [])

  return (
    <div className="app">
      <main
        ref={mainRef}
        className="screen-host"
        style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}
      >
        {tab === 'list' && <ListScreen />}
        {tab === 'route' && <RouteScreen />}
        {tab === 'map' && <MapScreen />}
        {tab === 'genre' && <GenreScreen />}
      </main>

      <nav className={`tabbar${tabbarHidden ? ' hidden' : ''}`}>
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-current={tab === t.id ? 'page' : undefined}
            onClick={() => setTab(t.id)}
          >
            <span className="glyph" aria-hidden="true">
              <t.Icon size={22} color={tab === t.id ? 'var(--accent)' : 'currentColor'} />
            </span>
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  )
}
