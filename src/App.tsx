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

/** スクロール方向に応じてタブバーを自動的に隠す/表示するしきい値 (px)。 */
const HIDE_THRESHOLD = 8
const NEAR_TOP = 8

export default function App() {
  const tab = useAppStore((s) => s.tab)
  const setTab = useAppStore((s) => s.setTab)
  const [tabbarHidden, setTabbarHidden] = useState(false)
  const mainRef = useRef<HTMLElement | null>(null)
  const lastScrollTop = useRef(0)

  useEffect(() => {
    startCloudSyncBridge()
  }, [])

  // タブを切り替えたら、前の画面のスクロール位置を引きずらないようにリセットする。
  useEffect(() => {
    lastScrollTop.current = 0
    setTabbarHidden(false)
  }, [tab])

  useEffect(() => {
    const mainEl = mainRef.current
    if (!mainEl) return
    const handleScroll = (e: Event) => {
      const target = e.target
      if (!(target instanceof HTMLElement)) return
      const current = target.scrollTop
      const delta = current - lastScrollTop.current
      if (current <= NEAR_TOP) setTabbarHidden(false)
      else if (delta > HIDE_THRESHOLD) setTabbarHidden(true)
      else if (delta < -HIDE_THRESHOLD) setTabbarHidden(false)
      lastScrollTop.current = current
    }
    // `.screen` (各画面が持つスクロール要素) の scroll イベントは bubbling しないため、
    // capture フェーズで拾う。
    mainEl.addEventListener('scroll', handleScroll, { capture: true, passive: true })
    return () => mainEl.removeEventListener('scroll', handleScroll, true)
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
