import { useEffect } from 'react'
import { BasketGlyph, GenreGlyph, ListGlyph, MapGlyph, RouteGlyph } from './components/icons'
import { startCloudSyncBridge } from './lib/cloudSyncBridge'
import { GenreScreen } from './screens/GenreScreen'
import { ListScreen } from './screens/ListScreen'
import { MapScreen } from './screens/MapScreen'
import { RouteScreen } from './screens/RouteScreen'
import { type Tab, useActiveList, useAppStore, useListStore } from './store/useAppStore'

const TABS: Array<{ id: Tab; label: string; Icon: typeof ListGlyph }> = [
  { id: 'list', label: 'リスト', Icon: ListGlyph },
  { id: 'route', label: 'ルート', Icon: RouteGlyph },
  { id: 'map', label: 'マップ', Icon: MapGlyph },
  { id: 'genre', label: 'ジャンル', Icon: GenreGlyph },
]

const TITLES: Record<Tab, string> = {
  list: '買い物リスト',
  route: '買い回りルート',
  map: '店舗マップ',
  genre: 'ジャンル',
}

const BADGE: Record<Tab, { color: string; Icon: (props: { size?: number; color?: string; strokeWidth?: number }) => JSX.Element }> = {
  list: { color: '#2f9e5c', Icon: BasketGlyph },
  route: { color: '#ff7a45', Icon: RouteGlyph },
  map: { color: '#8d6e63', Icon: MapGlyph },
  genre: { color: '#7e57c2', Icon: GenreGlyph },
}

export default function App() {
  const tab = useAppStore((s) => s.tab)
  const setTab = useAppStore((s) => s.setTab)
  const list = useActiveList()
  const store = useListStore(list)

  const total = list?.items.length ?? 0
  const remaining = list?.items.filter((i) => !i.checked).length ?? 0
  const done = total - remaining
  const badge = BADGE[tab]

  useEffect(() => {
    startCloudSyncBridge()
  }, [])

  return (
    <div className="app">
      <header className="appbar">
        <div className="eyebrow">
          <span className="badge" style={{ background: badge.color }} aria-hidden="true">
            <badge.Icon size={19} color="#ffffff" />
          </span>
          <span className="store">
            {tab === 'genre'
              ? '入力した品目から売り場を当てる辞書'
              : `${list?.name ?? 'リストなし'}${store ? ` ・ ${store.name}` : ''}`}
          </span>
        </div>
        <div className="titlerow">
          <h1>{TITLES[tab]}</h1>
          {tab === 'list' && list && <span className="sub count">残り {remaining} 件</span>}
        </div>
        {tab === 'list' && list && total > 0 && (
          <div className="progress">
            <div className="track">
              <div className="fill" style={{ width: `${Math.round((done / total) * 100)}%` }} />
            </div>
            <span className="frac">
              {done} / {total}
            </span>
          </div>
        )}
      </header>

      <main className="screen-host" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {tab === 'list' && <ListScreen />}
        {tab === 'route' && <RouteScreen />}
        {tab === 'map' && <MapScreen />}
        {tab === 'genre' && <GenreScreen />}
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
