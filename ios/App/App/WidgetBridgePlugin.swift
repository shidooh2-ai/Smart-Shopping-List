import Capacitor
import Foundation
import WidgetKit

/**
 ホーム画面ウィジェット・Siriショートカットとアプリ本体の橋渡しをするプラグイン。

 - writeSnapshot: 買い物リストの内容を App Group の共有領域へ書き出し、ウィジェットを再描画させる
 - readPendingChanges / clearPendingChanges: ウィジェット上で付けたチェックをアプリ側へ取り込む
 - readPendingAdds / clearPendingAdds: Siriショートカットで追加された品目をアプリ側へ取り込む

 App Group の entitlement が無い間 (無料のPersonal Teamなど) は SharedStore.isAvailable が false になり、
 isAvailable() が available:false を返すだけで何も起きない。JS側もそれを見て何もしないので、
 ウィジェット拡張ターゲットを追加していない状態でも安全にビルド・実行できる。
 詳しい有効化手順は ios/App/ShoppingListWidget/ShoppingListWidget.swift、Siriショートカットは
 App/ShoppingListIntents.swift の冒頭コメントを参照。
 */
@objc(WidgetBridgePlugin)
public class WidgetBridgePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WidgetBridgePlugin"
    public let jsName = "WidgetBridge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "writeSnapshot", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "readPendingChanges", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearPendingChanges", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "readPendingAdds", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearPendingAdds", returnType: CAPPluginReturnPromise)
    ]

    @objc func isAvailable(_ call: CAPPluginCall) {
        call.resolve(["available": SharedStore.isAvailable])
    }

    @objc func writeSnapshot(_ call: CAPPluginCall) {
        guard SharedStore.isAvailable else {
            call.resolve(["written": false])
            return
        }
        guard let json = call.getString("json") else {
            call.reject("json が指定されていません")
            return
        }
        SharedStore.saveSnapshot(json: json)
        if #available(iOS 14.0, *) {
            WidgetCenter.shared.reloadAllTimelines()
        }
        call.resolve(["written": true])
    }

    @objc func readPendingChanges(_ call: CAPPluginCall) {
        let changes = SharedStore.loadPendingChanges().map { change in
            [
                "listId": change.listId,
                "itemId": change.itemId,
                "checked": change.checked,
                "at": change.at
            ] as [String: Any]
        }
        call.resolve(["changes": changes])
    }

    @objc func clearPendingChanges(_ call: CAPPluginCall) {
        SharedStore.clearPendingChanges()
        if #available(iOS 14.0, *) {
            WidgetCenter.shared.reloadAllTimelines()
        }
        call.resolve(["cleared": true])
    }

    @objc func readPendingAdds(_ call: CAPPluginCall) {
        let adds = SharedStore.loadPendingAdds().map { add in
            ["listId": add.listId, "text": add.text, "at": add.at] as [String: Any]
        }
        call.resolve(["adds": adds])
    }

    @objc func clearPendingAdds(_ call: CAPPluginCall) {
        SharedStore.clearPendingAdds()
        call.resolve(["cleared": true])
    }
}
