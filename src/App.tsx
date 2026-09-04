import { useEffect } from 'react'
import { ListGlyph, MapGlyph, SettingsGlyph } from './components/icons'
import { startCloudSyncBridge } from './lib/cloudSyncBridge'
import { useScreenWakeLock } from './lib/wakeLock'
import { GenreScreen } from './screens/GenreScreen'
import { ListScreen } from './screens/ListScreen'
import { MapScreen } from './screens/MapScreen'
import { RouteScreen } from './screens/RouteScreen'
import { SettingsScreen } from './screens/SettingsScreen'
import { type Tab, useAppStore } from './store/useAppStore'

const TABS: Array<{ id: Tab; label: string; Icon: typeof ListGlyph }> = [
  { id: 'shopping', label: '買い物', Icon: ListGlyph },
  { id: 'store', label: 'お店', Icon: MapGlyph },
  { id: 'settings', label: '設定', Icon: SettingsGlyph },
]

export default function App() {
  const tab = useAppStore((s) => s.tab)
  const setTab = useAppStore((s) => s.setTab)
  const shoppingView = useAppStore((s) => s.shoppingView)
  const storeView = useAppStore((s) => s.storeView)
  const screenWakeLockEnabled = useAppStore((s) => s.screenWakeLockEnabled)

  useEffect(() => {
    startCloudSyncBridge()
  }, [])

  useScreenWakeLock(screenWakeLockEnabled)

  return (
    <div className="app">
      <main className="screen-host" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {tab === 'shopping' && (shoppingView === 'list' ? <ListScreen /> : <RouteScreen />)}
        {tab === 'store' && (storeView === 'map' ? <MapScreen /> : <GenreScreen />)}
        {tab === 'settings' && <SettingsScreen />}
      </main>

      <nav className="tabbar">
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
