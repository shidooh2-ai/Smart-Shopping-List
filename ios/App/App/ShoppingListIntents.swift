import AppIntents
import Foundation

/**
 Siriショートカット「買い物リストに追加する」。

 「Hey Siri、かいものルートで牛乳を追加して」のように、アプリを開かずに品目を追加できる。
 ウィジェットと全く同じ仕組み (App Group経由の共有ストレージ) を使う:
   Siri側は SharedStore.appendPendingAdd() でテキストを積むだけで、実際にジャンル判定して
   リストへ入れる処理は、アプリが次に起動/復帰したときに JS 側の addItems() (既存の自動判定
   ロジックがそのまま使える) が行う。Siriショートカット自体はネイティブのUI・ロジックを
   一切持たず、「積む」役目だけに徹している。

 ■ 有効化の手順 (有料の Apple Developer Program 登録後)
 1. このファイルを Xcode でアプリ本体ターゲットに追加する
    (SharedSnapshot.swift は既にウィジェット用の手順でアプリ本体ターゲットに追加済みのはず。
     未対応ならそちらを先に済ませること)
 2. アプリ本体ターゲットの Signing & Capabilities に App Groups を追加し、
    group.com.kaimonoroute.app を選択する (ウィジェットの手順5と同じ。ウィジェットを
    有効化済みなら追加の作業は不要)
 3. WidgetBridgePlugin.swift の readPendingAdds/clearPendingAdds をJSから呼べるよう
    ビルドし直す (widgetBridge.ts 側は実装済み)
 ※ CloudKit・プッシュ通知と違い、iCloud/Push Notifications capability は不要。
   App Groups だけで動く点がこの機能の利点。
 */

@available(iOS 16.0, *)
struct AddShoppingItemIntent: AppIntent {
    static var title: LocalizedStringResource { "買い物リストに追加する" }
    static var description: IntentDescription { "品目を買い物リストに追加します。ジャンルは次にアプリを開いたときに自動で判定されます。" }

    @Parameter(title: "品目")
    var itemText: String

    /// 未指定ならアプリで最後に開いていたリストに追加する
    @Parameter(title: "リスト")
    var list: ListEntity?

    static var parameterSummary: some ParameterSummary {
        Summary("\(\.$itemText) を \(\.$list) に追加する")
    }

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let text = itemText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else {
            return .result(dialog: "品目名が空です。")
        }
        guard let snapshot = SharedStore.loadSnapshot(), let targetList = snapshot.list(id: list?.id) else {
            return .result(dialog: "買い物リストがまだありません。先にアプリを開いてください。")
        }
        SharedStore.appendPendingAdd(
            PendingAdd(listId: targetList.id, text: text, at: Date().timeIntervalSince1970 * 1000)
        )
        return .result(dialog: "「\(text)」を\(targetList.name)に追加しました。")
    }
}

@available(iOS 16.0, *)
struct ShoppingListShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: AddShoppingItemIntent(),
            phrases: [
                "\(.applicationName)に追加",
                "\(.applicationName)で買い物リストに追加"
            ],
            shortTitle: "買い物リストに追加",
            systemImageName: "cart.badge.plus"
        )
    }
}
