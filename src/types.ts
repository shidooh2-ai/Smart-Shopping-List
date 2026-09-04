/** 盤面1マスの状態。棚以外の通行可能スペースは既定で「通路」。 */
export type Cell =
  | { k: 'aisle' }
  | { k: 'wall' }
  | { k: 'shelf'; shelfId: string }
  | { k: 'node'; nodeId: string }

export interface Floor {
  id: string
  /** 表示名 (例: "1F") */
  name: string
  /** 階数。地下は負数。ルートの上下移動コスト算出に使う */
  level: number
  width: number
  height: number
  /** row-major、長さ = width * height */
  cells: Cell[]
  /** 編集の参考として薄く重ねて表示する背景画像 (dataURL)。見取り図からの自動生成時に設定される */
  backgroundImage?: string
  /** 背景画像の不透明度 (0=透明〜1=不透明)。既定 0.35 */
  backgroundOpacity?: number
}

export interface Shelf {
  id: string
  floorId: string
  name: string
  /** この棚で取り扱う商品ジャンル */
  categoryIds: string[]
}

export type NodeKind = 'stairs' | 'elevator' | 'entrance' | 'checkout'

export interface MapNode {
  id: string
  floorId: string
  kind: NodeKind
  name: string
  /** 階段・エレベーターは同じ groupId 同士が階をまたいで接続される */
  groupId?: string
}

export interface StoreMap {
  id: string
  name: string
  floors: Floor[]
  shelves: Shelf[]
  nodes: MapNode[]
  /** 1マスの実寸 (m)。距離と所要時間の表示に使う */
  cellMeters: number
  createdAt: number
  updatedAt: number
  /** iCloud (CloudKit) 経由で共有中の場合の情報 */
  cloud?: CloudLink
}

export interface Category {
  id: string
  name: string
  color: string
  /** ジャンル特定に使う語彙 */
  keywords: string[]
  builtin?: boolean
}

export interface ShoppingItem {
  id: string
  text: string
  checked: boolean
  categoryId: string | null
  /** ユーザーが手動でジャンルを指定した場合 true (自動判定で上書きしない) */
  manual: boolean
  /** 自動判定の確信度 0..1 */
  confidence: number
  createdAt: number
  /** この品目を追加したユーザーのニックネーム (未設定なら null) */
  addedBy?: string | null
}

/** リマインダーの繰り返し方。'once' は指定日時に1回だけ */
export type ReminderRepeat = 'once' | 'daily' | 'weekly'

export interface ListReminder {
  enabled: boolean
  /** 通知する時刻 'HH:mm' */
  time: string
  repeat: ReminderRepeat
  /** repeat==='once' のときの日付 'YYYY-MM-DD' */
  date?: string
  /** repeat==='weekly' のときの曜日 (0=日曜 〜 6=土曜)。空なら通知しない */
  weekdays?: number[]
}

/** 共有リストで他の人の変更を知らせる通知の種類 */
export type ListActivityKind = 'add' | 'remove' | 'purchase'

/** 共有リストの変更履歴。他デバイスからの pull で「まだ見ていない変更」を検出するのに使う */
export interface ListActivityEvent {
  /** 新規発行のID。この値で「既に知っている変更か」を判定する */
  id: string
  kind: ListActivityKind
  /** 対象品目のテキスト (複数まとめての操作なら件数を含む説明文) */
  itemText: string
  /** 操作した人のニックネーム (未設定なら null) */
  by: string | null
  at: number
}

/**
 * リストごとの通知の有効/無効。
 * 端末ごとの好みなので同期はせず (CloudKitには送らない)、ローカルにだけ保存する。
 * 未設定 (リストを共有した直後など) はすべて有効として扱う。
 */
export interface ListNotificationPrefs {
  onAdd: boolean
  onRemove: boolean
  onPurchase: boolean
}

export interface ShoppingList {
  id: string
  name: string
  /** リストを見分けるためのマークの色 */
  color?: string
  /** このリストのリマインダー設定 (未設定なら通知しない) */
  reminder?: ListReminder
  storeId: string | null
  items: ShoppingItem[]
  createdAt: number
  updatedAt: number
  /** iCloud (CloudKit) 経由で共有中の場合の情報 */
  cloud?: CloudLink
  /** 直近の変更履歴 (共有相手への通知の元ネタ)。件数は上限を設けて切り詰める */
  activity?: ListActivityEvent[]
  /** このリストの通知設定 (端末ローカル。CloudKitへは同期しない) */
  notifications?: ListNotificationPrefs
}

export interface PurchasedItem {
  id: string
  text: string
  categoryId: string | null
  /** 購入日時。日付ごとのグルーピング表示に使う。ユーザーが後から編集できる */
  purchasedAt: number
  /** 購入元のリスト名 (参考表示用のスナップショット。リストが削除・改名されても残る) */
  listName: string | null
  /** この品目を追加したユーザーのニックネーム (未設定なら null) */
  addedBy?: string | null
}

/** iCloud (CloudKit) 共有への紐付け情報。iPhoneアプリ (Capacitor) でのみ使う */
export interface CloudLink {
  /** CloudKitのレコード名 (recordName) */
  recordId: string
  /** この端末がオーナー (共有を開始した側) かどうか。オーナーのみ共有停止できる */
  owner: boolean
  /** 最後にCloudKitへ反映した内容のupdatedAt。これより新しいローカル変更だけを送信する */
  lastPushedUpdatedAt: number
  /** CloudKitのゾーン所有者ID。共有された側 (owner=false) がpush/unshareする際に必要 */
  zoneOwnerName?: string
}

export interface Pos {
  floorId: string
  x: number
  y: number
}

export interface RouteStop {
  /** 1始まりの立ち寄り順 */
  order: number
  pos: Pos
  shelfIds: string[]
  shelfNames: string[]
  floorName: string
  categoryIds: string[]
  itemIds: string[]
}

export interface RouteLeg {
  from: Pos
  to: Pos
  /** 通過するマスの列。階移動は連続する2点の floorId が変わることで表現 */
  path: Pos[]
  /** 経路コスト (1マス=1、階移動は重み付き) */
  distance: number
  /** 同一フロア内で実際に歩くマス数 */
  steps: number
  /** この区間で階を移動する回数 */
  floorChanges: number
}

export interface RoutePlan {
  stops: RouteStop[]
  legs: RouteLeg[]
  totalDistance: number
  start: Pos | null
  goal: Pos | null
  /** ジャンルが特定できずルートに含められなかった品目 */
  unresolvedItemIds: string[]
  /** 売り場が地図上に無いジャンル */
  missingCategoryIds: string[]
  /** 到達不能だったジャンル */
  unreachableCategoryIds: string[]
  /** 同一フロア内で歩くマス数の合計 */
  totalSteps: number
}

/** 階をまたぐときに階段とエレベーターのどちらを優先するか。 */
export type RoutePreference = 'balanced' | 'stairs' | 'elevator'
