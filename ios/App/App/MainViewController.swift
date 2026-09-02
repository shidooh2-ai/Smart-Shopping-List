import Capacitor

/**
 アプリ独自のCapacitorプラグイン (CloudSyncPluginなど、npmパッケージ化していないもの) は
 ここで登録する。Capacitorはnpmパッケージのプラグインは自動登録するが、
 アプリ内に直接置いたプラグインはこのように明示的な登録が必要。
 */
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(CloudSyncPlugin())
    }
}
