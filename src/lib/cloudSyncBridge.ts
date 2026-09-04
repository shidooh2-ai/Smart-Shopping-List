import { App as CapacitorApp } from '@capacitor/app'
import { useAppStore } from '../store/useAppStore'
import { CloudSync, isCloudSyncSupported } from './cloudSync'

const PUSH_DEBOUNCE_MS = 1500

let started = false

/**
 * iCloud共有の「配線」— アプリ起動時に一度だけ呼ぶ (App.tsx から)。
 * - 起動時・アプリをフォアグラウンドに戻したときに最新の共有内容を取得する
 * - 共有の招待を受け取ったとき (userDidAcceptCloudKitShareWith) にも取得し直す
 * - サーバー側の変更をサイレント通知 (CKSubscription) で知らせてきたときも取得し直す。
 *   これによって、アプリが閉じていても他の参加者の変更をローカル通知で知らせられる
 *   (実際に届くのは通知の受信をきっかけにOSがアプリをバックグラウンド起動したとき)
 * - stores/lists に変更があれば、少し待ってからCloudKitへ送信する (デバウンス)
 * Web版・Android版では isCloudSyncSupported() が false なので何もしない。
 */
export function startCloudSyncBridge(): void {
  if (started || !isCloudSyncSupported()) return
  started = true

  void useAppStore.getState().pullCloudShares()
  void CloudSync.enablePush()

  void CloudSync.addListener('shareReceived', () => {
    void useAppStore.getState().pullCloudShares()
  })

  void CloudSync.addListener('recordChanged', () => {
    void useAppStore.getState().pullCloudShares()
  })

  void CapacitorApp.addListener('appStateChange', ({ isActive }) => {
    if (isActive) void useAppStore.getState().pullCloudShares()
  })

  let pushTimer: ReturnType<typeof setTimeout> | null = null
  let prevStores = useAppStore.getState().stores
  let prevLists = useAppStore.getState().lists

  useAppStore.subscribe((state) => {
    if (state.stores === prevStores && state.lists === prevLists) return
    prevStores = state.stores
    prevLists = state.lists
    if (pushTimer) clearTimeout(pushTimer)
    pushTimer = setTimeout(() => {
      void useAppStore.getState().pushCloudChanges()
    }, PUSH_DEBOUNCE_MS)
  })
}
