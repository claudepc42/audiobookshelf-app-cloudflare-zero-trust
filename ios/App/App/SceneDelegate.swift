import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {

    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }
        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = UIStoryboard(name: "Main", bundle: nil).instantiateInitialViewController()
        window?.makeKeyAndVisible()

        // Cold launch via URL scheme or universal link: forward like Capacitor's
        // AppDelegate hooks do, since UIKit won't call those once a scene delegate
        // is registered. Both are sets — UIKit can deliver more than one context/
        // activity in a single launch, so every member must be forwarded, not just
        // the first (a prior version used .first and silently dropped the rest).
        for urlContext in connectionOptions.urlContexts {
            _ = ApplicationDelegateProxy.shared.application(UIApplication.shared, open: urlContext.url, options: [:])
        }
        for userActivity in connectionOptions.userActivities {
            ApplicationDelegateProxy.shared.application(UIApplication.shared, continue: userActivity, restorationHandler: { _ in })
        }
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        for urlContext in URLContexts {
            _ = ApplicationDelegateProxy.shared.application(UIApplication.shared, open: urlContext.url, options: [:])
        }
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        ApplicationDelegateProxy.shared.application(UIApplication.shared, continue: userActivity, restorationHandler: { _ in })
    }
}
