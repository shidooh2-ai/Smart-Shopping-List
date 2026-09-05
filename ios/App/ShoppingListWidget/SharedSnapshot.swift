import AppIntents
import Foundation

/**
 アプリ本体とウィジェット・Siriショートカットの間でやり取りするデータ。

 WKWebView の localStorage はウィジェット/Siriからは読めないため、アプリ側 (WidgetBridgePlugin) が
 App Group の共有 UserDefaults に JSON のスナップショットを書き出し、それらはそれを読む。

 逆方向 (ウィジェットでチェックを付けた/Siriで品目を追加した) は「未反映の変更」として積んでおき、
 アプリが次に起動/復帰したときにまとめて取り込む (ウィジェット/Siri側から localStorage は書けないため)。

 ※ このファイルはアプリ本体ターゲットとウィジェット拡張ターゲットの両方に含めること
    (Xcode の Target Membership で両方にチェックを入れる)。
 */
enum SharedStore {
    /// Xcode の Signing & Capabilities → App Groups で作成する ID と合わせること。
    static let appGroupId = "group.com.kaimonoroute.app"

    private static let snapshotKey = "widget.snapshot"
    private static let pendingKey = "widget.pendingChanges"
    private static let pendingAddsKey = "widget.pendingAdds"
    private static let pagePrefix = "widget.page."

    static var defaults: UserDefaults? {
        // App Group の entitlement が無い間は nil が返る (クラッシュはしない)。
        UserDefaults(suiteName: appGroupId)
    }

    /// App Group が使える状態か (有料アカウントで capability を追加すると true になる)。
    static var isAvailable: Bool { defaults != nil }

    // MARK: - スナップショット (アプリ → ウィジェット)

    static func loadSnapshot() -> Snapshot? {
        guard let json = defaults?.string(forKey: snapshotKey), let data = json.data(using: .utf8) else { return nil }
        return try? JSONDecoder().decode(Snapshot.self, from: data)
    }

    static func saveSnapshot(json: String) {
        defaults?.set(json, forKey: snapshotKey)
    }

    // MARK: - 未反映の変更 (ウィジェット → アプリ)

    static func loadPendingChanges() -> [PendingChange] {
        guard let json = defaults?.string(forKey: pendingKey), let data = json.data(using: .utf8) else { return [] }
        return (try? JSONDecoder().decode([PendingChange].self, from: data)) ?? []
    }

    static func appendPendingChange(_ change: PendingChange) {
        var changes = loadPendingChanges()
        // 同じ品目への変更は最後のものだけ残す
        changes.removeAll { $0.listId == change.listId && $0.itemId == change.itemId }
        changes.append(change)
        savePendingChanges(changes)
    }

    static func savePendingChanges(_ changes: [PendingChange]) {
        guard let data = try? JSONEncoder().encode(changes), let json = String(data: data, encoding: .utf8) else { return }
        defaults?.set(json, forKey: pendingKey)
    }

    static func clearPendingChanges() {
        defaults?.removeObject(forKey: pendingKey)
    }

    /// ウィジェット内でチェックした結果を、アプリが取り込むまでの間だけ見た目に反映しておく。
    static func applyPendingChanges(to list: SharedList) -> SharedList {
        let changes = loadPendingChanges().filter { $0.listId == list.id }
        guard !changes.isEmpty else { return list }
        var byItemId: [String: Bool] = [:]
        for change in changes { byItemId[change.itemId] = change.checked }
        var updated = list
        updated.items = list.items.map { item in
            guard let checked = byItemId[item.id] else { return item }
            var copy = item
            copy.checked = checked
            return copy
        }
        return updated
    }

    // MARK: - 未反映の追加 (Siriショートカット → アプリ)

    static func loadPendingAdds() -> [PendingAdd] {
        guard let json = defaults?.string(forKey: pendingAddsKey), let data = json.data(using: .utf8) else { return [] }
        return (try? JSONDecoder().decode([PendingAdd].self, from: data)) ?? []
    }

    static func appendPendingAdd(_ add: PendingAdd) {
        var adds = loadPendingAdds()
        adds.append(add)
        guard let data = try? JSONEncoder().encode(adds), let json = String(data: data, encoding: .utf8) else { return }
        defaults?.set(json, forKey: pendingAddsKey)
    }

    static func clearPendingAdds() {
        defaults?.removeObject(forKey: pendingAddsKey)
    }

    // MARK: - ページ位置 (ウィジェットはスクロールできないのでページ送りで代用する)

    static func page(listId: String) -> Int {
        defaults?.integer(forKey: pagePrefix + listId) ?? 0
    }

    static func setPage(_ page: Int, listId: String) {
        defaults?.set(max(0, page), forKey: pagePrefix + listId)
    }
}

struct Snapshot: Codable {
    var updatedAt: Double
    var activeListId: String?
    var lists: [SharedList]

    func list(id: String?) -> SharedList? {
        if let id, let found = lists.first(where: { $0.id == id }) { return found }
        if let activeListId, let found = lists.first(where: { $0.id == activeListId }) { return found }
        return lists.first
    }
}

struct SharedList: Codable, Identifiable {
    var id: String
    var name: String
    /// リストのマークの色 (#rrggbb)
    var color: String?
    var items: [SharedItem]

    var remaining: Int { items.filter { !$0.checked }.count }
}

struct SharedItem: Codable, Identifiable {
    var id: String
    var text: String
    var checked: Bool
    /// ジャンルの色 (#rrggbb)
    var color: String?
}

struct PendingChange: Codable {
    var listId: String
    var itemId: String
    var checked: Bool
    var at: Double
}

/// Siriショートカットで追加された品目。まだジャンル判定もしていない生のテキストのまま積んでおき、
/// アプリ側の addItems() (既存のジャンル自動判定・言い換え学習ロジック) にそのまま渡す。
struct PendingAdd: Codable {
    var listId: String
    var text: String
    var at: Double
}

// MARK: - Siriショートカット/ウィジェット設定で「どの買い物リストか」を選ぶための AppEntity
// ウィジェット (iOS 17+) と Siriショートカット (iOS 16+) の両方から使うため、
// 両者に共通する下限の iOS 16.0 を指定している。

@available(iOS 16.0, *)
struct ListEntity: AppEntity {
    var id: String
    var name: String

    static var typeDisplayRepresentation: TypeDisplayRepresentation { "買い物リスト" }
    var displayRepresentation: DisplayRepresentation { DisplayRepresentation(title: "\(name)") }
    static var defaultQuery = ListEntityQuery()
}

@available(iOS 16.0, *)
struct ListEntityQuery: EntityQuery {
    func entities(for identifiers: [String]) async throws -> [ListEntity] {
        allLists().filter { identifiers.contains($0.id) }
    }

    func suggestedEntities() async throws -> [ListEntity] {
        allLists()
    }

    private func allLists() -> [ListEntity] {
        (SharedStore.loadSnapshot()?.lists ?? []).map { ListEntity(id: $0.id, name: $0.name) }
    }
}
