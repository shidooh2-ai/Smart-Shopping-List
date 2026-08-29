import { GenreScreen } from './screens/GenreScreen'
import { ListScreen } from './screens/ListScreen'
import { MapScreen } from './screens/MapScreen'
import { RouteScreen } from './screens/RouteScreen'
import { type Tab, useActiveList, useAppStore, useListStore } from './store/useAppStore'

const TABS: Array<{ id: Tab; label: string; glyph: string }> = [
  { id: 'list', label: 'リスト', glyph: '📝' },
  { id: 'route', label: 'ルート', glyph: '🧭' },
  { id: 'map', label: 'マップ', glyph: '🗺️' },
  { id: 'genre', label: 'ジャンル', glyph: '🏷️' },
]

const TITLES: Record<Tab, string> = {
  list: '買い物リスト',
  route: '買い回りルート',
  map: '店舗マップ',
  genre: 'ジャンル設定',
}

export default function App() {
  const tab = useAppStore((s) => s.tab)
  const setTab = useAppStore((s) => s.setTab)
  const list = useActiveList()
  const store = useListStore(list)

  const remaining = list?.items.filter((i) => !i.checked).length ?? 0

  return (
    <div className="app">
      <header className="appbar">
        <h1>
          {TITLES[tab]}
          <span className="sub">
            {tab === 'genre'
              ? '入力した品目から売り場を当てる辞書'
              : `${list?.name ?? 'リストなし'}${store ? ` ・ ${store.name}` : ''} ・ 未購入 ${remaining} 件`}
          </span>
        </h1>
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
              {t.glyph}
            </span>
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  )
}
