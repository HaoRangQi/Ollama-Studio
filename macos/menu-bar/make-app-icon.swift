import AppKit
import Foundation

/// Draws the menu bar app's square icon: the terminal mark on a purple rounded tile.
func renderAppIcon(pixelSize: Int, outputPath: String) {
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

    let scale = CGFloat(pixelSize) / 1024.0
    func s(_ value: CGFloat) -> CGFloat { value * scale }

    // Rounded tile with a diagonal brand gradient.
    let tileRect = NSRect(x: s(64), y: s(64), width: s(896), height: s(896))
    let tile = NSBezierPath(roundedRect: tileRect, xRadius: s(200), yRadius: s(200))
    NSGraphicsContext.saveGraphicsState()
    tile.addClip()
    let gradient = NSGradient(
        starting: NSColor(srgbRed: 0.474, green: 0.322, blue: 0.925, alpha: 1),
        ending: NSColor(srgbRed: 0.302, green: 0.192, blue: 0.659, alpha: 1)
    )
    gradient?.draw(in: tileRect, angle: -45)
    NSGraphicsContext.restoreGraphicsState()

    // Subtle rim so the tile reads on both light and dark backgrounds.
    NSColor.white.withAlphaComponent(0.18).setStroke()
    let rim = NSBezierPath(
        roundedRect: tileRect.insetBy(dx: s(12), dy: s(12)),
        xRadius: s(188),
        yRadius: s(188)
    )
    rim.lineWidth = s(8)
    rim.stroke()

    // Terminal mark.
    NSColor.white.withAlphaComponent(0.97).setStroke()
    let terminalRect = NSRect(x: s(246), y: s(326), width: s(532), height: s(372))
    let terminal = NSBezierPath(
        roundedRect: terminalRect,
        xRadius: s(82),
        yRadius: s(82)
    )
    terminal.lineWidth = s(58)
    terminal.lineJoinStyle = .round
    terminal.stroke()

    let chevron = NSBezierPath()
    chevron.move(to: NSPoint(x: s(398), y: s(574)))
    chevron.line(to: NSPoint(x: s(490), y: s(512)))
    chevron.line(to: NSPoint(x: s(398), y: s(450)))
    chevron.lineWidth = s(58)
    chevron.lineCapStyle = .round
    chevron.lineJoinStyle = .round
    chevron.stroke()

    let cursor = NSBezierPath()
    cursor.move(to: NSPoint(x: s(548), y: s(450)))
    cursor.line(to: NSPoint(x: s(656), y: s(450)))
    cursor.lineWidth = s(58)
    cursor.lineCapStyle = .round
    cursor.stroke()

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

try? FileManager.default.createDirectory(
    atPath: outputDirectory,
    withIntermediateDirectories: true
)

let variants: [(String, Int)] = [
    ("icon_16x16.png", 16),
    ("icon_16x16@2x.png", 32),
    ("icon_32x32.png", 32),
    ("icon_32x32@2x.png", 64),
    ("icon_128x128.png", 128),
    ("icon_128x128@2x.png", 256),
    ("icon_256x256.png", 256),
    ("icon_256x256@2x.png", 512),
    ("icon_512x512.png", 512),
    ("icon_512x512@2x.png", 1024)
]

for (filename, pixelSize) in variants {
    renderAppIcon(pixelSize: pixelSize, outputPath: "\(outputDirectory)/\(filename)")
}

print("Wrote app icon set to \(outputDirectory)")
