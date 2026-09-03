import Capacitor

/**
 アプリ独自のCapacitorプラグイン (CloudSyncPluginなど、npmパッケージ化していないもの) は
 ここで登録する。Capacitorはnpmパッケージのプラグインは自動登録するが、
 アプリ内に直接置いたプラグインはこのように明示的な登録が必要。
 */
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        // 保留中: CloudSyncPlugin (CloudKit共有) は実装済みだが、このXcodeプロジェクトの
        // Teamが無料のPersonal Teamのため iCloud capability を追加できず、
        // CloudSyncPlugin内の `CKContainer.default()` がアプリ起動直後にクラッシュする。
        // 有料のApple Developer Programに登録し、Signing & Capabilitiesで
        // iCloud (CloudKit) を追加できるようになったら、下の行のコメントを外して再登録する。
        // bridge?.registerPluginInstance(CloudSyncPlugin())
    }
}
