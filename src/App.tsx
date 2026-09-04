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
 * タブバーの自動非表示は「スクロール方向」ではなく「スクロール中かどうか」で
 * 判定する。方向(上/下)をscrollTopの差分から判定する方式は、iOSのバウンス
 * (ラバーバンド)スクロールで値が細かく前後するとチラつきが止まらなかったため。
 * 代わりに、スクロールが起きている間は隠し、スクロールが止まってから
 * SHOW_DELAY_MS 経ったら表示する、というシンプルな方式にする。
 * (隠す動作は起きるたびに同じ状態を再設定するだけなので何度起きても
 *  チラつかず、表示は「静止後に一度だけ」しか起きない。)
 */
const SHOW_DELAY_MS = 500
const NEAR_TOP = 8

export default function App() {
  const tab = useAppStore((s) => s.tab)
  const setTab = useAppStore((s) => s.setTab)
  const [tabbarHidden, setTabbarHidden] = useState(false)
  const mainRef = useRef<HTMLElement | null>(null)
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    startCloudSyncBridge()
  }, [])

  // タブを切り替えたら、前の画面の状態を引きずらないようにリセットする。
  useEffect(() => {
    if (showTimer.current != null) clearTimeout(showTimer.current)
    setTabbarHidden(false)
  }, [tab])

  useEffect(() => {
    const mainEl = mainRef.current
    if (!mainEl) return

    const handleScroll = (e: Event) => {
      if (!(e.target instanceof HTMLElement)) return
      if (showTimer.current != null) clearTimeout(showTimer.current)

      if (e.target.scrollTop <= NEAR_TOP) {
        setTabbarHidden(false)
        return
      }

      setTabbarHidden(true)
      showTimer.current = setTimeout(() => {
        showTimer.current = null
        setTabbarHidden(false)
      }, SHOW_DELAY_MS)
    }

    // `.screen` (各画面が持つスクロール要素) の scroll イベントは bubbling しないため、
    // capture フェーズで拾う。
    mainEl.addEventListener('scroll', handleScroll, { capture: true, passive: true })
    return () => {
      mainEl.removeEventListener('scroll', handleScroll, true)
      if (showTimer.current != null) clearTimeout(showTimer.current)
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
