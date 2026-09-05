import { useRef, useState } from 'react'
import { EffectPreview } from '../components/effectArt'
import { ViewSwitch } from '../components/ViewSwitch'
import { EFFECTS, effectStyle } from '../data/effects'
import { THEMES } from '../data/themes'
import { fireEffect } from '../lib/effectBus'
import { exportJsonFile } from '../lib/exportFile'
import { applyArrayMerge, applyRecordMerge, planArrayMerge, planRecordMerge } from '../lib/importMerge'
import { decodeImportedStoreMap, encodeFloorCells } from '../lib/mapCodec'
import { isWakeLockSupported } from '../lib/wakeLock'
import { useAppStore } from '../store/useAppStore'
import type { Category, PurchasedItem, ShoppingList, StoreMap, TripRecord } from '../types'

const SETTINGS_VIEWS = [
  { id: 'settings' as const, label: '設定' },
  { id: 'map' as const, label: 'マップ' },
  { id: 'genre' as const, label: 'ジャンル' },
]

export function SettingsScreen() {
  const nickname = useAppStore((s) => s.nickname)
  const setNickname = useAppStore((s) => s.setNickname)
  const screenWakeLockEnabled = useAppStore((s) => s.screenWakeLockEnabled)
  const setScreenWakeLockEnabled = useAppStore((s) => s.setScreenWakeLockEnabled)
  const setSettingsView = useAppStore((s) => s.setSettingsView)
  const theme = useAppStore((s) => s.theme)
  const setTheme = useAppStore((s) => s.setTheme)
  const effectTheme = useAppStore((s) => s.effectTheme)
  const setEffectTheme = useAppStore((s) => s.setEffectTheme)
  const stores = useAppStore((s) => s.stores)
  const lists = useAppStore((s) => s.lists)
  const categories = useAppStore((s) => s.categories)
  const aliases = useAppStore((s) => s.aliases)
  const purchased = useAppStore((s) => s.purchased)
  const tripHistory = useAppStore((s) => s.tripHistory)
  const replaceAll = useAppStore((s) => s.replaceAll)
  const [name, setName] = useState(nickname)
  const [mapExportStoreId, setMapExportStoreId] = useState<string | null>(stores[0]?.id ?? null)
  const backupFileRef = useRef<HTMLInputElement | null>(null)
  const mapFileRef = useRef<HTMLInputElement | null>(null)
  const wakeLockSupported = isWakeLockSupported()
  const mapExportStore = stores.find((s) => s.id === mapExportStoreId) ?? stores[0] ?? null

  /** 全体のバックアップを書き出す (マス目はランレングス圧縮してコンパクトに)。 */
  const exportBackup = () => {
    const compactStores = stores.map((s) => ({
      ...s,
      floors: s.floors.map((f) => encodeFloorCells(f, s.shelves, s.nodes)),
    }))
    const payload = JSON.stringify({
      app: 'smart-shopping-list',
      version: 2,
      exportedAt: new Date().toISOString(),
      stores: compactStores,
      lists,
      categories,
      aliases,
      purchased,
      nickname,
      tripHistory,
    })
    void exportJsonFile(`shopping-route-${new Date().toISOString().slice(0, 10)}.json`, payload)
  }

  /**
   * 全体のバックアップを、今のデータに統合する形で読み込む。id が重複する項目
   * (内容が同じものは除く) があれば、まとめて上書きするかどうかを確認する。
   */
  const importBackup = async (file: File) => {
    try {
      const data = JSON.parse(await file.text())
      if (!data || typeof data !== 'object') throw new Error('形式が違います')

      const storesPlan = Array.isArray(data.stores)
        ? planArrayMerge(
            stores,
            (data.stores as unknown[]).map(decodeImportedStoreMap).filter((s): s is StoreMap => s != null),
          )
        : null
      const listsPlan = Array.isArray(data.lists) ? planArrayMerge(lists, data.lists as ShoppingList[]) : null
      const categoriesPlan = Array.isArray(data.categories)
        ? planArrayMerge(categories, data.categories as Category[])
        : null
      const aliasesPlan =
        data.aliases && typeof data.aliases === 'object'
          ? planRecordMerge(aliases, data.aliases as Record<string, string>)
          : null
      const purchasedPlan = Array.isArray(data.purchased)
        ? planArrayMerge(purchased, data.purchased as PurchasedItem[])
        : null
      const tripHistoryPlan = Array.isArray(data.tripHistory)
        ? planArrayMerge(tripHistory, data.tripHistory as TripRecord[])
        : null

      const conflictLines: string[] = []
      if (storesPlan && storesPlan.conflicts.length > 0) {
        conflictLines.push(`・店舗: ${storesPlan.conflicts.map((s) => s.name).join('、')}`)
      }
      if (listsPlan && listsPlan.conflicts.length > 0) {
        conflictLines.push(`・リスト: ${listsPlan.conflicts.map((l) => l.name).join('、')}`)
      }
      if (categoriesPlan && categoriesPlan.conflicts.length > 0) {
        conflictLines.push(`・ジャンル: ${categoriesPlan.conflicts.map((c) => c.name).join('、')}`)
      }
      if (aliasesPlan && aliasesPlan.conflicts.length > 0) {
        conflictLines.push(`・覚えた言い換え: ${aliasesPlan.conflicts.length}件`)
      }
      if (purchasedPlan && purchasedPlan.conflicts.length > 0) {
        conflictLines.push(`・購入済み: ${purchasedPlan.conflicts.length}件`)
      }
      if (tripHistoryPlan && tripHistoryPlan.conflicts.length > 0) {
        conflictLines.push(`・お買い物の記録: ${tripHistoryPlan.conflicts.length}件`)
      }

      const overwrite =
        conflictLines.length === 0 ||
        window.confirm(
          `読み込むデータに、既存のものと重複する項目があります。上書きしますか？\n\n${conflictLines.join('\n')}\n\n「OK」で上書き、「キャンセル」で重複分をスキップして読み込みます。`,
        )

      replaceAll({
        stores: storesPlan ? applyArrayMerge(stores, storesPlan, overwrite) : undefined,
        lists: listsPlan ? applyArrayMerge(lists, listsPlan, overwrite) : undefined,
        categories: categoriesPlan ? applyArrayMerge(categories, categoriesPlan, overwrite) : undefined,
        aliases: aliasesPlan ? applyRecordMerge(aliases, aliasesPlan, overwrite) : undefined,
        purchased: purchasedPlan ? applyArrayMerge(purchased, purchasedPlan, overwrite) : undefined,
        tripHistory: tripHistoryPlan ? applyArrayMerge(tripHistory, tripHistoryPlan, overwrite) : undefined,
        // nickname は端末ごとの個人設定なので、読み込みでは変更しない
      })
      window.alert('読み込みました。')
    } catch (e) {
      window.alert(`読み込めませんでした: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  /** 店舗のマップを配布用のJSONとして書き出す。withCategories なら専用ジャンルも含める。 */
  const exportMap = (withCategories: boolean) => {
    if (!mapExportStore) return
    const safeName = mapExportStore.name.replace(/[\\/:*?"<>|]/g, '_')
    const { cloud: _cloud, categories: storeCategories, ...rest } = mapExportStore
    const compact = { ...rest, floors: rest.floors.map((f) => encodeFloorCells(f, rest.shelves, rest.nodes)) }
    const payload = JSON.stringify({
      app: 'smart-shopping-list',
      kind: 'store-map',
      version: 2,
      exportedAt: new Date().toISOString(),
      store: withCategories ? { ...compact, categories: storeCategories } : compact,
    })
    void exportJsonFile(`${safeName}${withCategories ? '-map-genres' : '-map'}.json`, payload)
  }

  /**
   * マップを読み込む。同じ id の店舗が既にあれば「同じ店舗の更新」とみなし、
   * 上書きするかどうかを確認する。無ければ新しい店舗として追加する。
   */
  const importMap = async (file: File) => {
    try {
      const data = JSON.parse(await file.text())
      const decoded = decodeImportedStoreMap(data)
      if (!decoded) throw new Error('マップの形式が違います')
      const existing = stores.find((s) => s.id === decoded.id)
      if (existing) {
        if (!window.confirm(`店舗「${existing.name}」は既に登録されています。読み込んだ内容で上書きしますか？`)) {
          return
        }
        replaceAll({ stores: stores.map((s) => (s.id === decoded.id ? decoded : s)) })
        window.alert('店舗を更新しました。')
      } else {
        replaceAll({ stores: [...stores, decoded] })
        window.alert('店舗を追加しました。')
      }
    } catch (e) {
      window.alert(`読み込めませんでした: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return (
    <div className="screen">
      <ViewSwitch options={SETTINGS_VIEWS} active="settings" onChange={setSettingsView} />
      <div className="card">
        <h2>ニックネーム</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          リストに品目を追加すると、このニックネームが「追加した人」として品目に表示されます。
        </p>
        <input
          type="text"
          value={name}
          placeholder="例: たろう"
          onChange={(e) => setName(e.target.value)}
          onBlur={() => setNickname(name.trim())}
        />
      </div>

      <div className="card">
        <h2>テーマ</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          「デフォルト」は端末のライト／ダーク設定に合わせて自動で切り替わります。
        </p>
        <div className="theme-grid">
          {THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-pressed={theme === t.id}
              onClick={() => setTheme(t.id)}
            >
              <span className="theme-preview" data-theme={t.id === 'default' ? undefined : t.id}>
                <i style={{ background: 'var(--surface)', border: '1px solid var(--border)' }} />
                <i style={{ background: 'var(--accent)' }} />
                <i style={{ background: 'var(--coral)' }} />
              </span>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <h2>エフェクト</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          品目をチェックしたときや、リストを買い終えたときの演出です。テーマと同じように着せ替えできます。
        </p>
        <div className="theme-grid">
          {EFFECTS.map((e) => (
            <button
              key={e.id}
              type="button"
              aria-pressed={effectTheme === e.id}
              onClick={() => setEffectTheme(e.id)}
              title={e.description}
            >
              <span className="effect-preview">
                <EffectPreview id={e.id} colors={e.colors} />
              </span>
              {e.label}
            </button>
          ))}
        </div>
        <p className="muted" style={{ margin: '10px 0 0' }}>
          {effectStyle(effectTheme).description}
        </p>
        <button
          type="button"
          className="btn slim"
          style={{ marginTop: 8 }}
          onClick={() => fireEffect('complete')}
        >
          試す
        </button>
      </div>

      <div className="card">
        <h2>画面表示</h2>
        <label className="settings-row">
          <span className="grow">
            <span className="title">画面ロックを無効化</span>
            <span className="muted">
              有効にすると、このアプリを開いている間は画面が自動で暗くなりません。買い物中の利用を想定しています。
            </span>
          </span>
          <input
            type="checkbox"
            checked={screenWakeLockEnabled}
            disabled={!wakeLockSupported}
            onChange={(e) => setScreenWakeLockEnabled(e.target.checked)}
            aria-label="画面ロックを無効化"
          />
        </label>
        {!wakeLockSupported && (
          <p className="muted" style={{ marginBottom: 0 }}>
            この端末・ブラウザでは対応していません。
          </p>
        )}
      </div>

      <div className="card">
        <h2>バックアップ</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          リスト・マップ・ジャンルを1つのJSONファイルに書き出せます。読み込みは今のデータに統合され、
          重複する項目があれば上書きするかどうかを確認します。
        </p>
        <div className="row wrap">
          <button type="button" className="btn slim" onClick={exportBackup}>
            書き出す（JSON）
          </button>
          <button type="button" className="btn slim" onClick={() => backupFileRef.current?.click()}>
            読み込む
          </button>
        </div>
        <input
          ref={backupFileRef}
          type="file"
          accept="application/json,.json"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void importBackup(f)
            e.target.value = ''
          }}
        />
      </div>

      <div className="card">
        <h2>店舗マップ</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          店舗のマップを配布用のJSONとして書き出せます。読み込みは、同じ店舗のマップが既にあれば
          上書きするかどうかを確認し、無ければ新しい店舗として追加します。
        </p>
        {stores.length === 0 ? (
          <p className="muted" style={{ marginBottom: 0 }}>
            まだ店舗マップがありません。「マップ」タブから作成できます。
          </p>
        ) : (
          <>
            <select
              value={mapExportStore?.id ?? ''}
              onChange={(e) => setMapExportStoreId(e.target.value)}
              style={{ width: '100%', marginBottom: 8 }}
            >
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <div className="row wrap">
              <button type="button" className="btn slim" onClick={() => exportMap(false)}>
                マップを書き出す
              </button>
              <button type="button" className="btn slim" onClick={() => exportMap(true)}>
                マップ＋専用ジャンルを書き出す
              </button>
            </div>
          </>
        )}
        <div className="row wrap" style={{ marginTop: stores.length === 0 ? 0 : 8 }}>
          <button type="button" className="btn slim" onClick={() => mapFileRef.current?.click()}>
            マップを読み込む
          </button>
        </div>
        <input
          ref={mapFileRef}
          type="file"
          accept="application/json,.json"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void importMap(f)
            e.target.value = ''
          }}
        />
      </div>

      <div className="card">
        <h2>他のユーザーとの共有</h2>
        <p className="muted" style={{ marginTop: 0, marginBottom: 0 }}>
          iCloud経由でリストや店舗マップを共有する機能は準備中です。有料のApple Developer
          Programへの登録が必要なため、現在は無効になっています。有効になると、共有相手が追加した品目にも上のニックネームが表示されます。
        </p>
      </div>
    </div>
  )
}
