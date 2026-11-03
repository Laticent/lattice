// QLProbe: a test app that shows ONE file in Apple's Quick Look viewer (QLPreviewController), the component the Files
// app's Preview uses, full screen. The office probe (office-capture.mjs) launches it once per slide file, with the
// file's path in the app's own Documents as the first argument, and captures the device screen. Built by run.sh with
// swiftc for the iOS Simulator; never shipped.
import QuickLook
import UIKit

@main
final class AppDelegate: UIResponder, UIApplicationDelegate, QLPreviewControllerDataSource {
    var window: UIWindow?
    private var url: URL?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        let args = ProcessInfo.processInfo.arguments
        if args.count > 1, FileManager.default.fileExists(atPath: args[1]) { url = URL(fileURLWithPath: args[1]) }
        let preview = QLPreviewController()
        preview.dataSource = self
        window = UIWindow(frame: UIScreen.main.bounds)
        window?.rootViewController = preview
        window?.makeKeyAndVisible()
        return true
    }

    func numberOfPreviewItems(in controller: QLPreviewController) -> Int { url == nil ? 0 : 1 }

    func previewController(_ controller: QLPreviewController, previewItemAt index: Int) -> QLPreviewItem { url! as NSURL }
}
