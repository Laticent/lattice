// QLProbe: a test app that shows ONE file in Apple's Quick Look viewer (QLPreviewController), the component the Files
// app's Preview uses, full screen. The office probe (office-capture.mjs) launches it with the file's path in the app's
// own Documents as the first argument, and captures the device screen. Built by run.sh with swiftc for the iOS
// Simulator; never shipped.
//
// A second argument `tour` scrolls the preview down one screen every TOUR_STEP seconds, the way a person reads a deck,
// so the capture can see what the viewer draws on a slide it reaches by scrolling (the owner's iPhone drew shapes from
// earlier slides onto later ones; one-slide files cannot show that). What the app found is written to
// Documents/qlprobe-log.txt: the scroll view it drove, or the view classes it saw when it found none.
import QuickLook
import UIKit

let TOUR_STEP = 8.0

@main
final class AppDelegate: UIResponder, UIApplicationDelegate, QLPreviewControllerDataSource {
    var window: UIWindow?
    private var url: URL?
    private var log: [String] = []

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        let args = ProcessInfo.processInfo.arguments
        if args.count > 1, FileManager.default.fileExists(atPath: args[1]) { url = URL(fileURLWithPath: args[1]) }
        let preview = QLPreviewController()
        preview.dataSource = self
        window = UIWindow(frame: UIScreen.main.bounds)
        window?.rootViewController = preview
        window?.makeKeyAndVisible()
        if args.count > 2, args[2] == "tour" {
            DispatchQueue.main.asyncAfter(deadline: .now() + TOUR_STEP) { self.tour(preview, step: 1) }
        }
        return true
    }

    /// The largest scroll view under a view whose content is taller than it: the deck's page stack.
    private func pages(in view: UIView) -> UIScrollView? {
        var best: UIScrollView?
        var queue = [view]
        while !queue.isEmpty {
            let v = queue.removeFirst()
            if let s = v as? UIScrollView, s.contentSize.height > s.bounds.height + 1,
               best == nil || s.bounds.width * s.bounds.height > best!.bounds.width * best!.bounds.height { best = s }
            queue.append(contentsOf: v.subviews)
        }
        return best
    }

    private func classes(in view: UIView, depth: Int = 0) -> [String] {
        guard depth < 12 else { return [] }
        return ["\(String(repeating: " ", count: depth))\(type(of: view)) \(view.frame)"] + view.subviews.flatMap { classes(in: $0, depth: depth + 1) }
    }

    private func tour(_ preview: QLPreviewController, step: Int) {
        guard let scroll = pages(in: preview.view) else {
            log.append("step \(step): no scroll view with more content than screen")
            log.append(contentsOf: classes(in: preview.view))
            write()
            return
        }
        let page = scroll.bounds.height * 0.9
        let end = max(0, scroll.contentSize.height - scroll.bounds.height)
        let y = min(end, scroll.contentOffset.y + page)
        log.append("step \(step): \(type(of: scroll)) content \(scroll.contentSize) offset \(scroll.contentOffset.y) -> \(y)")
        write()
        scroll.setContentOffset(CGPoint(x: scroll.contentOffset.x, y: y), animated: true)
        if y < end, step < 20 {
            DispatchQueue.main.asyncAfter(deadline: .now() + TOUR_STEP) { self.tour(preview, step: step + 1) }
        } else {
            log.append("end")
            write()
        }
    }

    private func write() {
        guard let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first else { return }
        try? log.joined(separator: "\n").write(to: docs.appendingPathComponent("qlprobe-log.txt"), atomically: true, encoding: .utf8)
    }

    func numberOfPreviewItems(in controller: QLPreviewController) -> Int { url == nil ? 0 : 1 }

    func previewController(_ controller: QLPreviewController, previewItemAt index: Int) -> QLPreviewItem { url! as NSURL }
}
