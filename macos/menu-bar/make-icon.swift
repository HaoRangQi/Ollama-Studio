import AppKit
import Foundation

/// Draws the monochrome menu bar mark: the studio mascot head as a solid silhouette.
/// Template images only use alpha, so the system can invert them for light/dark menu bars.
func renderIcon(pixelSize: Int, outputPath: String) {
    guard
        let rep = NSBitmapImageRep(
            bitmapDataPlanes: nil,
            pixelsWide: pixelSize,
            pixelsHigh: pixelSize,
            bitsPerSample: 8,
            samplesPerPixel: 4,
            hasAlpha: true,
            isPlanar: false,
            colorSpaceName: .deviceRGB,
            bytesPerRow: 0,
            bitsPerPixel: 0
        )
    else {
        fputs("Failed to create bitmap for \(outputPath)\n", stderr)
        exit(1)
    }

    rep.size = NSSize(width: pixelSize, height: pixelSize)

    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
    NSColor.clear.setFill()
    NSRect(x: 0, y: 0, width: pixelSize, height: pixelSize).fill()

    // 18pt 设计坐标，原点翻到左上角。
    let scale = CGFloat(pixelSize) / 18.0
    let canvas = NSAffineTransform()
    canvas.translateX(by: 0, yBy: CGFloat(pixelSize))
    canvas.scaleX(by: scale, yBy: -scale)
    canvas.concat()

    // 实心头部剪影，眼睛挖空；18px 下留空比细线更清楚。
    let head = NSBezierPath()
    head.move(to: NSPoint(x: 7.72, y: 4.82))
    head.curve(to: NSPoint(x: 9.21, y: 5.06), controlPoint1: NSPoint(x: 8.15, y: 4.84), controlPoint2: NSPoint(x: 8.67, y: 4.91))
    head.curve(to: NSPoint(x: 10.97, y: 5.71), controlPoint1: NSPoint(x: 9.75, y: 5.21), controlPoint2: NSPoint(x: 10.50, y: 5.62))
    head.curve(to: NSPoint(x: 12.01, y: 5.58), controlPoint1: NSPoint(x: 11.43, y: 5.80), controlPoint2: NSPoint(x: 11.67, y: 5.58))
    head.curve(to: NSPoint(x: 12.98, y: 5.68), controlPoint1: NSPoint(x: 12.34, y: 5.57), controlPoint2: NSPoint(x: 12.61, y: 5.58))
    head.curve(to: NSPoint(x: 14.23, y: 6.22), controlPoint1: NSPoint(x: 13.35, y: 5.79), controlPoint2: NSPoint(x: 13.96, y: 6.07))
    head.curve(to: NSPoint(x: 14.63, y: 6.59), controlPoint1: NSPoint(x: 14.51, y: 6.37), controlPoint2: NSPoint(x: 14.50, y: 6.40))
    head.curve(to: NSPoint(x: 14.98, y: 7.36), controlPoint1: NSPoint(x: 14.75, y: 6.79), controlPoint2: NSPoint(x: 14.97, y: 7.04))
    head.curve(to: NSPoint(x: 14.71, y: 8.54), controlPoint1: NSPoint(x: 14.99, y: 7.69), controlPoint2: NSPoint(x: 14.75, y: 8.29))
    head.curve(to: NSPoint(x: 14.75, y: 8.91), controlPoint1: NSPoint(x: 14.67, y: 8.80), controlPoint2: NSPoint(x: 14.66, y: 8.76))
    head.curve(to: NSPoint(x: 15.24, y: 9.43), controlPoint1: NSPoint(x: 14.84, y: 9.06), controlPoint2: NSPoint(x: 15.09, y: 9.20))
    head.curve(to: NSPoint(x: 15.68, y: 10.26), controlPoint1: NSPoint(x: 15.40, y: 9.65), controlPoint2: NSPoint(x: 15.62, y: 10.04))
    head.curve(to: NSPoint(x: 15.62, y: 10.75), controlPoint1: NSPoint(x: 15.74, y: 10.48), controlPoint2: NSPoint(x: 15.71, y: 10.57))
    head.curve(to: NSPoint(x: 15.08, y: 11.36), controlPoint1: NSPoint(x: 15.52, y: 10.93), controlPoint2: NSPoint(x: 15.16, y: 11.25))
    head.curve(to: NSPoint(x: 15.17, y: 11.38), controlPoint1: NSPoint(x: 15.01, y: 11.46), controlPoint2: NSPoint(x: 15.43, y: 11.32))
    head.curve(to: NSPoint(x: 13.52, y: 11.70), controlPoint1: NSPoint(x: 14.91, y: 11.44), controlPoint2: NSPoint(x: 14.03, y: 11.48))
    head.curve(to: NSPoint(x: 12.11, y: 12.68), controlPoint1: NSPoint(x: 13.01, y: 11.91), controlPoint2: NSPoint(x: 12.64, y: 12.44))
    head.curve(to: NSPoint(x: 10.34, y: 13.18), controlPoint1: NSPoint(x: 11.58, y: 12.93), controlPoint2: NSPoint(x: 10.82, y: 13.09))
    head.curve(to: NSPoint(x: 9.20, y: 13.20), controlPoint1: NSPoint(x: 9.85, y: 13.26), controlPoint2: NSPoint(x: 9.54, y: 13.22))
    head.curve(to: NSPoint(x: 8.25, y: 13.06), controlPoint1: NSPoint(x: 8.85, y: 13.18), controlPoint2: NSPoint(x: 8.59, y: 13.14))
    head.curve(to: NSPoint(x: 7.15, y: 12.71), controlPoint1: NSPoint(x: 7.91, y: 12.97), controlPoint2: NSPoint(x: 7.52, y: 12.91))
    head.curve(to: NSPoint(x: 6.06, y: 11.90), controlPoint1: NSPoint(x: 6.79, y: 12.52), controlPoint2: NSPoint(x: 6.53, y: 12.04))
    head.curve(to: NSPoint(x: 4.32, y: 11.87), controlPoint1: NSPoint(x: 5.58, y: 11.76), controlPoint2: NSPoint(x: 4.76, y: 11.95))
    head.curve(to: NSPoint(x: 3.37, y: 11.42), controlPoint1: NSPoint(x: 3.87, y: 11.80), controlPoint2: NSPoint(x: 3.58, y: 11.55))
    head.curve(to: NSPoint(x: 3.08, y: 11.12), controlPoint1: NSPoint(x: 3.17, y: 11.29), controlPoint2: NSPoint(x: 3.17, y: 11.28))
    head.curve(to: NSPoint(x: 2.81, y: 10.47), controlPoint1: NSPoint(x: 2.99, y: 10.96), controlPoint2: NSPoint(x: 2.84, y: 10.65))
    head.curve(to: NSPoint(x: 2.91, y: 10.03), controlPoint1: NSPoint(x: 2.78, y: 10.29), controlPoint2: NSPoint(x: 2.83, y: 10.20))
    head.curve(to: NSPoint(x: 3.28, y: 9.49), controlPoint1: NSPoint(x: 2.98, y: 9.87), controlPoint2: NSPoint(x: 3.22, y: 9.62))
    head.curve(to: NSPoint(x: 3.28, y: 9.21), controlPoint1: NSPoint(x: 3.34, y: 9.35), controlPoint2: NSPoint(x: 3.40, y: 9.36))
    head.curve(to: NSPoint(x: 2.52, y: 8.60), controlPoint1: NSPoint(x: 3.15, y: 9.06), controlPoint2: NSPoint(x: 2.67, y: 8.78))
    head.curve(to: NSPoint(x: 2.33, y: 8.12), controlPoint1: NSPoint(x: 2.36, y: 8.41), controlPoint2: NSPoint(x: 2.33, y: 8.32))
    head.curve(to: NSPoint(x: 2.51, y: 7.37), controlPoint1: NSPoint(x: 2.33, y: 7.91), controlPoint2: NSPoint(x: 2.35, y: 7.60))
    head.curve(to: NSPoint(x: 3.28, y: 6.73), controlPoint1: NSPoint(x: 2.67, y: 7.14), controlPoint2: NSPoint(x: 2.86, y: 6.91))
    head.curve(to: NSPoint(x: 5.01, y: 6.26), controlPoint1: NSPoint(x: 3.69, y: 6.54), controlPoint2: NSPoint(x: 4.54, y: 6.51))
    head.curve(to: NSPoint(x: 6.07, y: 5.18), controlPoint1: NSPoint(x: 5.47, y: 6.00), controlPoint2: NSPoint(x: 5.79, y: 5.40))
    head.curve(to: NSPoint(x: 6.65, y: 4.94), controlPoint1: NSPoint(x: 6.34, y: 4.96), controlPoint2: NSPoint(x: 6.37, y: 5.00))
    head.curve(to: NSPoint(x: 7.72, y: 4.82), controlPoint1: NSPoint(x: 6.93, y: 4.87), controlPoint2: NSPoint(x: 7.30, y: 4.79))
    head.close()
    head.close()
    for eyeX in [7.06, 10.94] {
        head.append(NSBezierPath(ovalIn: NSRect(x: eyeX - 0.62, y: 7.42, width: 1.24, height: 1.24)))
    }
    head.windingRule = .evenOdd
    NSColor.black.setFill()
    head.fill()

    NSGraphicsContext.restoreGraphicsState()

    guard let png = rep.representation(using: .png, properties: [:]) else {
        fputs("Failed to encode \(outputPath)\n", stderr)
        exit(1)
    }
    do {
        try png.write(to: URL(fileURLWithPath: outputPath))
    } catch {
        fputs("Failed to write \(outputPath): \(error)\n", stderr)
        exit(1)
    }
}

let outputDirectory = CommandLine.arguments.count > 1
    ? CommandLine.arguments[1]
    : FileManager.default.currentDirectoryPath

renderIcon(pixelSize: 18, outputPath: "\(outputDirectory)/menu-iconTemplate.png")
renderIcon(pixelSize: 36, outputPath: "\(outputDirectory)/menu-iconTemplate@2x.png")
print("Wrote menu icon assets to \(outputDirectory)")
