import Foundation
import Capacitor
import CloudKit
import UIKit

extension Notification.Name {
    static let cloudKitShareAccepted = Notification.Name("cloudKitShareAccepted")
    /// AppDelegateがサイレントプッシュ (CKSubscriptionの通知) を受け取ったときに投げる。
    /// 中身 (何が変わったか) は運ばない — 受け取った側はpull()し直して差分を見る。
    static let cloudKitRecordChanged = Notification.Name("cloudKitRecordChanged")
}

/**
 かいものルート の店舗マップ・買い物リストを iCloud (CloudKit) 経由で他の人と共有するためのプラグイン。
 サーバーを自前で持たず、Appleの CloudKit を使う (無料枠の範囲内)。

 データは JSON にシリアライズして CKAsset として保存し、CKShare で招待した相手と共有する。
 同期のきっかけは3つ: アプリ起動時・共有操作時・CKSubscriptionのサイレント通知
 (enablePush参照。AppDelegateがリモート通知を受け取って .cloudKitRecordChanged を投げる)。
 */
@objc(CloudSyncPlugin)
public class CloudSyncPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "CloudSyncPlugin"
    public let jsName = "CloudSync"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "share", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "unshare", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pull", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "push", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "enablePush", returnType: CAPPluginReturnPromise)
    ]

    private let container = CKContainer.default()
    private let zoneName = "SharedItemsZone"
    private var zoneCreated = false

    override public func load() {
        NotificationCenter.default.addObserver(
            self, selector: #selector(handleShareAccepted), name: .cloudKitShareAccepted, object: nil
        )
        NotificationCenter.default.addObserver(
            self, selector: #selector(handleRecordChanged), name: .cloudKitRecordChanged, object: nil
        )
    }

    /// call.getDouble(key) は値がJS側で整数 (小数点なし) の場合、ブリッジ側でIntとして
    /// デコードされ nil を返すことがあるため、Int/Doubleの両方を試す。
    private func getTimestamp(_ call: CAPPluginCall, _ key: String) -> Double? {
        if let d = call.getDouble(key) { return d }
        if let i = call.getInt(key) { return Double(i) }
        return nil
    }

    @objc private func handleShareAccepted() {
        notifyListeners("shareReceived", data: [:])
    }

    @objc private func handleRecordChanged() {
        notifyListeners("recordChanged", data: [:])
    }

    // MARK: - プッシュ通知の準備 (CKSubscription + APNs)

    /// リモート通知への登録と、変更を知らせてもらうためのサブスクリプションを用意する。
    /// 参加者としてリストを受け取っている場合は sharedCloudDatabase、
    /// 自分がオーナーの場合は privateCloudDatabase の変更をそれぞれ購読する必要があるため、
    /// 両方に登録しておく (どちらに何も無くても購読自体は無害)。
    @objc func enablePush(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            UIApplication.shared.registerForRemoteNotifications()
        }
        let info = CKSubscription.NotificationInfo()
        info.shouldSendContentAvailable = true // サイレント通知 (バナー等は出さない)

        let group = DispatchGroup()
        var anyError: Error?

        for (db, subscriptionID) in [
            (container.privateCloudDatabase, "private-changes"),
            (container.sharedCloudDatabase, "shared-changes")
        ] {
            group.enter()
            let subscription = CKDatabaseSubscription(subscriptionID: subscriptionID)
            subscription.notificationInfo = info
            let op = CKModifySubscriptionsOperation(subscriptionsToSave: [subscription], subscriptionIDsToDelete: nil)
            op.modifySubscriptionsResultBlock = { result in
                if case .failure(let error) = result {
                    // 既に同じIDで登録済みの場合もここに来ることがあるが実害は無いので、
                    // ログだけ残して成功扱いにする。
                    CAPLog.print("CloudSyncPlugin: subscription (\(subscriptionID)) failed: \(error.localizedDescription)")
                    anyError = error
                }
                group.leave()
            }
            db.add(op)
        }

        group.notify(queue: .main) {
            call.resolve(["enabled": anyError == nil])
        }
    }

    // MARK: - isAvailable

    @objc func isAvailable(_ call: CAPPluginCall) {
        container.accountStatus { status, error in
            if let error = error {
                DispatchQueue.main.async { call.reject(error.localizedDescription) }
                return
            }
            DispatchQueue.main.async {
                call.resolve([
                    "available": status == .available,
                    "status": Self.statusString(status)
                ])
            }
        }
    }

    private static func statusString(_ status: CKAccountStatus) -> String {
        switch status {
        case .available: return "available"
        case .noAccount: return "noAccount"
        case .restricted: return "restricted"
        case .couldNotDetermine: return "couldNotDetermine"
        case .temporarilyUnavailable: return "temporarilyUnavailable"
        @unknown default: return "unknown"
        }
    }

    // MARK: - ゾーン (共有には既定ゾーン以外のカスタムゾーンが必須)

    private func ensureZone(completion: @escaping (Error?) -> Void) {
        if zoneCreated {
            completion(nil)
            return
        }
        let zoneID = CKRecordZone.ID(zoneName: zoneName, ownerName: CKCurrentUserDefaultName)
        let zone = CKRecordZone(zoneID: zoneID)
        let op = CKModifyRecordZonesOperation(recordZonesToSave: [zone], recordZoneIDsToDelete: nil)
        op.modifyRecordZonesResultBlock = { [weak self] result in
            switch result {
            case .success:
                self?.zoneCreated = true
                completion(nil)
            case .failure(let error):
                // 失敗時は zoneCreated を立てない (次回呼び出し時にまた作成を試みる)
                completion(error)
            }
        }
        container.privateCloudDatabase.add(op)
    }

    // MARK: - 共有の作成・更新

    @objc func share(_ call: CAPPluginCall) {
        guard let kind = call.getString("kind"),
              let localId = call.getString("localId"),
              let name = call.getString("name"),
              let json = call.getString("json") else {
            call.reject("kind, localId, name, json が必要です")
            return
        }
        let updatedAt = getTimestamp(call, "updatedAt") ?? (Date().timeIntervalSince1970 * 1000)

        ensureZone { [weak self] error in
            guard let self = self else { return }
            if let error = error {
                DispatchQueue.main.async {
                    call.reject("iCloudゾーンの作成に失敗しました: \(error.localizedDescription)")
                }
                return
            }
            self.saveAndShare(kind: kind, localId: localId, name: name, json: json, updatedAt: updatedAt, call: call)
        }
    }

    private func recordType(for kind: String) -> String {
        kind == "list" ? "SharedList" : "SharedStore"
    }

    private func saveAndShare(kind: String, localId: String, name: String, json: String, updatedAt: Double, call: CAPPluginCall) {
        let zoneID = CKRecordZone.ID(zoneName: zoneName, ownerName: CKCurrentUserDefaultName)
        let recordID = CKRecord.ID(recordName: "\(kind)-\(localId)", zoneID: zoneID)

        container.privateCloudDatabase.fetch(withRecordID: recordID) { [weak self] existing, _ in
            guard let self = self else { return }
            let record = existing ?? CKRecord(recordType: self.recordType(for: kind), recordID: recordID)

            guard let assetURL = self.writeTempJSON(json) else {
                DispatchQueue.main.async { call.reject("一時ファイルの書き込みに失敗しました") }
                return
            }
            record["payload"] = CKAsset(fileURL: assetURL)
            record["name"] = name as CKRecordValue
            record["localId"] = localId as CKRecordValue
            record["updatedAt"] = updatedAt as CKRecordValue

            self.fetchExistingShare(for: record) { existingShare in
                let share: CKShare
                if let existingShare = existingShare {
                    share = existingShare
                    share[CKShare.SystemFieldKey.title] = name as CKRecordValue
                } else {
                    share = CKShare(rootRecord: record)
                    share[CKShare.SystemFieldKey.title] = name as CKRecordValue
                    share.publicPermission = .none
                }

                let op = CKModifyRecordsOperation(recordsToSave: [record, share], recordIDsToDelete: nil)
                op.savePolicy = .changedKeys
                op.modifyRecordsResultBlock = { result in
                    try? FileManager.default.removeItem(at: assetURL)
                    switch result {
                    case .success:
                        DispatchQueue.main.async {
                            call.resolve(["recordId": recordID.recordName, "shared": true])
                            self.presentShareSheet(share: share)
                        }
                    case .failure(let error):
                        DispatchQueue.main.async {
                            call.reject("保存に失敗しました: \(error.localizedDescription)")
                        }
                    }
                }
                self.container.privateCloudDatabase.add(op)
            }
        }
    }

    private func fetchExistingShare(for record: CKRecord, completion: @escaping (CKShare?) -> Void) {
        guard let shareRef = record.share else {
            completion(nil)
            return
        }
        container.privateCloudDatabase.fetch(withRecordID: shareRef.recordID) { share, _ in
            completion(share as? CKShare)
        }
    }

    /// 招待する相手を選ぶ、標準の共有シート (Messages / メール / リンクをコピー など) を表示する。
    /// レコード自体はこの時点で既に保存済みなので、JS側の呼び出しはシートの結果を待たずに解決する。
    private func presentShareSheet(share: CKShare) {
        guard let vc = self.bridge?.viewController else { return }
        let sharingController = UICloudSharingController(share: share, container: self.container)
        sharingController.availablePermissions = [.allowReadWrite, .allowPrivate]
        sharingController.delegate = self
        DispatchQueue.main.async {
            vc.present(sharingController, animated: true)
        }
    }

    // MARK: - 共有停止

    @objc func unshare(_ call: CAPPluginCall) {
        guard let recordId = call.getString("recordId") else {
            call.reject("recordId が必要です")
            return
        }
        let owner = call.getBool("owner") ?? true
        let zoneOwnerName = call.getString("zoneOwnerName") ?? CKCurrentUserDefaultName
        let zoneID = CKRecordZone.ID(zoneName: zoneName, ownerName: zoneOwnerName)
        let recordID = CKRecord.ID(recordName: recordId, zoneID: zoneID)

        if owner {
            container.privateCloudDatabase.fetch(withRecordID: recordID) { [weak self] record, _ in
                guard let self = self, let record = record, let shareRef = record.share else {
                    DispatchQueue.main.async { call.resolve(["stopped": true]) }
                    return
                }
                self.container.privateCloudDatabase.delete(withRecordID: shareRef.recordID) { _, error in
                    DispatchQueue.main.async {
                        if let error = error {
                            call.reject("共有停止に失敗しました: \(error.localizedDescription)")
                        } else {
                            call.resolve(["stopped": true])
                        }
                    }
                }
            }
        } else {
            container.sharedCloudDatabase.delete(withRecordID: recordID) { _, error in
                DispatchQueue.main.async {
                    if let error = error {
                        call.reject("共有解除に失敗しました: \(error.localizedDescription)")
                    } else {
                        call.resolve(["stopped": true])
                    }
                }
            }
        }
    }

    // MARK: - 取得 (自分が共有したもの + 共有されたもの)

    @objc func pull(_ call: CAPPluginCall) {
        let group = DispatchGroup()
        var results: [[String: Any]] = []
        let lock = NSLock()

        group.enter()
        fetchOwned { items in
            lock.lock(); results.append(contentsOf: items); lock.unlock()
            group.leave()
        }

        group.enter()
        fetchShared { items in
            lock.lock(); results.append(contentsOf: items); lock.unlock()
            group.leave()
        }

        group.notify(queue: .main) {
            call.resolve(["items": results])
        }
    }

    private func fetchOwned(completion: @escaping ([[String: Any]]) -> Void) {
        ensureZone { [weak self] error in
            guard let self = self else { completion([]); return }
            if error != nil {
                // ゾーンが存在しない = まだ何も共有していない
                completion([])
                return
            }
            let zoneID = CKRecordZone.ID(zoneName: self.zoneName, ownerName: CKCurrentUserDefaultName)
            self.queryAllRecords(db: self.container.privateCloudDatabase, zoneID: zoneID, owner: true, completion: completion)
        }
    }

    private func fetchShared(completion: @escaping ([[String: Any]]) -> Void) {
        container.sharedCloudDatabase.fetchAllRecordZones { [weak self] zones, error in
            guard let self = self, let zones = zones, error == nil else {
                completion([])
                return
            }
            let group = DispatchGroup()
            var all: [[String: Any]] = []
            let lock = NSLock()
            for zone in zones {
                group.enter()
                self.queryAllRecords(db: self.container.sharedCloudDatabase, zoneID: zone.zoneID, owner: false) { items in
                    lock.lock(); all.append(contentsOf: items); lock.unlock()
                    group.leave()
                }
            }
            group.notify(queue: .global()) {
                completion(all)
            }
        }
    }

    private func queryAllRecords(db: CKDatabase, zoneID: CKRecordZone.ID, owner: Bool, completion: @escaping ([[String: Any]]) -> Void) {
        let group = DispatchGroup()
        var results: [[String: Any]] = []
        let lock = NSLock()

        for type in ["SharedStore", "SharedList"] {
            group.enter()
            let query = CKQuery(recordType: type, predicate: NSPredicate(value: true))
            let op = CKQueryOperation(query: query)
            op.zoneID = zoneID
            var records: [CKRecord] = []
            op.recordMatchedBlock = { _, result in
                if case .success(let record) = result { records.append(record) }
            }
            op.queryResultBlock = { [weak self] _ in
                guard let self = self else { group.leave(); return }
                let kind = type == "SharedList" ? "list" : "store"
                for record in records {
                    if let item = self.recordToDict(record, owner: owner, kind: kind) {
                        lock.lock(); results.append(item); lock.unlock()
                    }
                }
                group.leave()
            }
            db.add(op)
        }

        group.notify(queue: .global()) {
            completion(results)
        }
    }

    private func recordToDict(_ record: CKRecord, owner: Bool, kind: String) -> [String: Any]? {
        guard let asset = record["payload"] as? CKAsset,
              let fileURL = asset.fileURL,
              let data = try? Data(contentsOf: fileURL),
              let json = String(data: data, encoding: .utf8) else {
            return nil
        }
        return [
            "recordId": record.recordID.recordName,
            "zoneOwnerName": record.recordID.zoneID.ownerName,
            "kind": kind,
            "name": record["name"] as? String ?? "",
            "localId": record["localId"] as? String ?? "",
            "json": json,
            "updatedAt": record["updatedAt"] as? Double ?? 0,
            "owner": owner
        ]
    }

    // MARK: - 更新の送信 (共有シートは出さず、内容だけ差し替える)

    @objc func push(_ call: CAPPluginCall) {
        guard let recordId = call.getString("recordId"), let json = call.getString("json") else {
            call.reject("recordId, json が必要です")
            return
        }
        let owner = call.getBool("owner") ?? true
        let zoneOwnerName = call.getString("zoneOwnerName") ?? CKCurrentUserDefaultName
        let updatedAt = getTimestamp(call, "updatedAt") ?? (Date().timeIntervalSince1970 * 1000)
        let db = owner ? container.privateCloudDatabase : container.sharedCloudDatabase
        let zoneID = CKRecordZone.ID(zoneName: zoneName, ownerName: zoneOwnerName)
        let recordID = CKRecord.ID(recordName: recordId, zoneID: zoneID)

        db.fetch(withRecordID: recordID) { [weak self] record, error in
            guard let self = self, let record = record else {
                DispatchQueue.main.async {
                    call.reject("レコードが見つかりません: \(error?.localizedDescription ?? "unknown")")
                }
                return
            }
            guard let assetURL = self.writeTempJSON(json) else {
                DispatchQueue.main.async { call.reject("一時ファイルの書き込みに失敗しました") }
                return
            }
            record["payload"] = CKAsset(fileURL: assetURL)
            record["updatedAt"] = updatedAt as CKRecordValue
            let op = CKModifyRecordsOperation(recordsToSave: [record], recordIDsToDelete: nil)
            op.savePolicy = .changedKeys
            op.modifyRecordsResultBlock = { result in
                try? FileManager.default.removeItem(at: assetURL)
                DispatchQueue.main.async {
                    switch result {
                    case .success: call.resolve(["pushed": true])
                    case .failure(let error): call.reject("送信に失敗しました: \(error.localizedDescription)")
                    }
                }
            }
            db.add(op)
        }
    }

    // MARK: - ヘルパー

    private func writeTempJSON(_ json: String) -> URL? {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".json")
        do {
            try json.write(to: url, atomically: true, encoding: .utf8)
            return url
        } catch {
            return nil
        }
    }
}

extension CloudSyncPlugin: UICloudSharingControllerDelegate {
    public func itemTitle(for csc: UICloudSharingController) -> String? {
        csc.share?[CKShare.SystemFieldKey.title] as? String
    }

    public func cloudSharingController(_ csc: UICloudSharingController, failedToSaveShareWithError error: Error) {
        CAPLog.print("CloudSyncPlugin: 共有シートでエラー: \(error.localizedDescription)")
    }

    public func cloudSharingControllerDidSaveShare(_ csc: UICloudSharingController) {
        // 招待を送信済み。特に追加の処理は不要
    }

    public func cloudSharingControllerDidStopSharing(_ csc: UICloudSharingController) {
        // このシート経由で共有停止された場合。JS側は次回の pull() で反映を検知する
    }
}
