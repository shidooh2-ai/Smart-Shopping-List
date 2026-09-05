import Capacitor

/**
 アプリ独自のCapacitorプラグイン (CloudSyncPluginなど、npmパッケージ化していないもの) は
 ここで登録する。Capacitorはnpmパッケージのプラグインは自動登録するが、
 アプリ内に直接置いたプラグインはこのように明示的な登録が必要。
 */
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        // 保留中: CloudSyncPlugin (CloudKit共有 + 他の人の変更のプッシュ通知) は実装済みだが、
        // このXcodeプロジェクトのTeamが無料のPersonal Teamのため iCloud capability を追加できず、
        // CloudSyncPlugin内の `CKContainer.default()` がアプリ起動直後にクラッシュする。
        // 有料のApple Developer Programに登録し、Signing & Capabilitiesで
        // 1) iCloud (CloudKit)
        // 2) Push Notifications
        // 3) Background Modes → Remote notifications (Info.plistのUIBackgroundModesは追加済み)
        // を追加できるようになったら、下の行のコメントを外して再登録する。
        // bridge?.registerPluginInstance(CloudSyncPlugin())

        // 保留中: ホーム画面ウィジェット。WidgetBridgePlugin.swift と
        // ShoppingListWidget/SharedSnapshot.swift をXcodeでアプリ本体ターゲットに追加すると
        // ビルドが通るようになるので、そのタイミングで下の行のコメントを外す。
        // (ウィジェット自体には App Group が必要で、これも有料登録が前提)
        // 手順は ios/App/ShoppingListWidget/ShoppingListWidget.swift の冒頭コメント参照。
        // bridge?.registerPluginInstance(WidgetBridgePlugin())

        // 参考: Siriショートカット (App/ShoppingListIntents.swift) はCapacitorプラグインではなく
        // AppIntents/AppShortcutsProviderなので、ここでの registerPluginInstance は不要
        // (バイナリのメタデータから自動的に認識される)。ただしファイル自体はXcodeで
        // アプリ本体ターゲットに追加する必要があり、必要なcapabilityはウィジェットと共通の
        // App Groupsのみ (iCloud/Push Notificationsは不要)。詳しくはそのファイルの冒頭コメント参照。
    }
}
