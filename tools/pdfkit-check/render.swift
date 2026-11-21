// tools/pdfkit-check/render.swift — draw each page of a PDF through Apple's PDFKit, the renderer behind Preview and the
// iPhone's PDF viewer, into an sRGB PNG per page. tools/pdfkit-check/check.mjs compiles it with swiftc on the macOS runner
// (the `pdf-pdfkit` platform suite) and compares the pages with the screen.
//
// Usage: render <in.pdf> <out-dir> <pixels per point>
import CoreGraphics
import Foundation
import ImageIO
import PDFKit
import UniformTypeIdentifiers

let args = CommandLine.arguments
guard args.count == 4, let doc = PDFDocument(url: URL(fileURLWithPath: args[1])), let scale = Double(args[3]) else {
    FileHandle.standardError.write("usage: render <in.pdf> <out-dir> <pixels per point>\n".data(using: .utf8)!)
    exit(2)
}
let srgb = CGColorSpace(name: CGColorSpace.sRGB)!
for i in 0..<doc.pageCount {
    guard let page = doc.page(at: i) else { continue }
    let box = page.bounds(for: .mediaBox)
    let w = Int((box.width * scale).rounded()), h = Int((box.height * scale).rounded())
    guard let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0, space: srgb,
                              bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { exit(3) }
    // A white sheet under the page, as a viewer shows it; PDFKit's own default interpolation (what Preview uses).
    ctx.setFillColor(CGColor(srgbRed: 1, green: 1, blue: 1, alpha: 1))
    ctx.fill(CGRect(x: 0, y: 0, width: w, height: h))
    ctx.scaleBy(x: scale, y: scale)
    page.draw(with: .mediaBox, to: ctx)
    guard let image = ctx.makeImage() else { exit(4) }
    let url = URL(fileURLWithPath: args[2]).appendingPathComponent(String(format: "page-%02d.png", i + 1))
    guard let dest = CGImageDestinationCreateWithURL(url as CFURL, UTType.png.identifier as CFString, 1, nil) else { exit(5) }
    CGImageDestinationAddImage(dest, image, nil)
    if !CGImageDestinationFinalize(dest) { exit(6) }
}
