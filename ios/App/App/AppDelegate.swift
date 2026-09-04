import UIKit
import Capacitor
import CloudKit

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Override point for customization after application launch.
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let config = UISceneConfiguration(name: "Default Configuration",
                                          sessionRole: connectingSceneSession.role)
        config.delegateClass = SceneDelegate.self
        return config
    }

    /// リモート通知の登録が成功した (CloudSyncPlugin.enablePush() から呼ばれる)。
    /// CKSubscription経由のサイレント通知はCloudKitのpush topicへ自動的に届くため、
    /// 独自サーバーへトークンを送る必要は無い (ログのみ)。
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        CAPLog.print("AppDelegate: remote notifications registered")
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        CAPLog.print("AppDelegate: remote notification registration failed: \(error.localizedDescription)")
    }

    /// CKSubscriptionからのサイレント通知 (content-available) の受信。
    /// 中身 (何が変わったか) は運ばれてこないので、CloudSyncPlugin側にだけ知らせて
    /// JS の pullCloudShares() に差分検出とローカル通知を任せる。
    ///
    /// 注意: ここで即座に completionHandler(.newData) を呼んでいるのは、
    /// JS側の非同期処理 (CloudKitへの問い合わせ→ローカル通知のスケジュール) の完了を
    /// このハンドラで待ち合わせる仕組みを持たないため。OSのバックグラウンド実行時間の
    /// 制約でこの処理が打ち切られるリスクを避けるための簡略化であり、フォアグラウンド
    /// 復帰時の pullCloudShares() が最終的な取りこぼしの保険になる。
    func application(
        _ application: UIApplication,
        didReceiveRemoteNotification userInfo: [AnyHashable: Any],
        fetchCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void
    ) {
        guard CKNotification(fromRemoteNotificationDictionary: userInfo) != nil else {
            completionHandler(.noData)
            return
        }
        NotificationCenter.default.post(name: .cloudKitRecordChanged, object: nil)
        completionHandler(.newData)
    }

    /// 他の人からiCloud共有 (店舗マップ・買い物リスト) の招待リンクを開いたときに呼ばれる。
    func application(_ application: UIApplication, userDidAcceptCloudKitShareWith cloudKitShareMetadata: CKShare.Metadata) {
        let container = CKContainer(identifier: cloudKitShareMetadata.containerIdentifier)
        let op = CKAcceptSharesOperation(shareMetadatas: [cloudKitShareMetadata])
        op.perShareResultBlock = { _, result in
            if case .failure(let error) = result {
                CAPLog.print("CloudKit share accept failed: \(error.localizedDescription)")
            }
        }
        op.acceptSharesResultBlock = { _ in
            NotificationCenter.default.post(name: .cloudKitShareAccepted, object: nil)
        }
        container.add(op)
    }
}
