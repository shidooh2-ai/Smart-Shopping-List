import { Capacitor, registerPlugin } from '@capacitor/core'

/**
 * iCloud (CloudKit) 経由で店舗マップ・買い物リストを共有するネイティブプラグインの薄いラッパー。
 * 実体は ios/App/App/CloudSyncPlugin.swift。iPhoneアプリ (Capacitor) 上でのみ動作し、
 * Web版では isCloudSyncSupported() が false になり何もしない。
 */

export type CloudEntityKind = 'store' | 'list'

export interface CloudSyncItem {
  recordId: string
  /** CloudKitのゾーン所有者ID。共有相手のレコードを push/unshare するときに必要 */
  zoneOwnerName: string
  kind: CloudEntityKind
  name: string
  localId: string
  json: string
  updatedAt: number
  /** この端末がオーナー (共有を開始した側) かどうか */
  owner: boolean
}

interface ShareOptions {
  kind: CloudEntityKind
  localId: string
  name: string
  json: string
  updatedAt: number
}

interface UnshareOptions {
  recordId: string
  owner: boolean
  zoneOwnerName?: string
}

interface PushOptions {
  recordId: string
  json: string
  updatedAt: number
  owner: boolean
  zoneOwnerName?: string
}

export interface CloudSyncPluginApi {
  isAvailable(): Promise<{ available: boolean; status: string }>
  share(opts: ShareOptions): Promise<{ recordId: string; shared: boolean }>
  unshare(opts: UnshareOptions): Promise<{ stopped: boolean }>
  pull(): Promise<{ items: CloudSyncItem[] }>
  push(opts: PushOptions): Promise<{ pushed: boolean }>
  addListener(
    eventName: 'shareReceived',
    listenerFunc: () => void,
  ): Promise<{ remove: () => void }>
}

export const CloudSync = registerPlugin<CloudSyncPluginApi>('CloudSync')

/** CloudKit共有はiPhoneアプリ (Capacitor/iOS) 上でのみ使える。Web版では常にfalse。 */
export function isCloudSyncSupported(): boolean {
  return Capacitor.getPlatform() === 'ios'
}
