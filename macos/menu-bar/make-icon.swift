import AppKit
import Foundation

/// Draws the monochrome menu bar mark: a terminal window with a prompt and cursor.
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

    let scale = CGFloat(pixelSize) / 18.0
    let stroke = 1.55 * scale
    NSColor.black.setStroke()

    // Terminal window outline.
    let windowRect = NSRect(x: 2.6 * scale, y: 4.4 * scale, width: 12.8 * scale, height: 9.2 * scale)
    let window = NSBezierPath(
        roundedRect: windowRect,
        xRadius: 2.1 * scale,
        yRadius: 2.1 * scale
    )
    window.lineWidth = stroke
    window.lineJoinStyle = .round
    window.stroke()

    // Prompt chevron.
    let chevron = NSBezierPath()
    chevron.move(to: NSPoint(x: 5.6 * scale, y: 10.35 * scale))
    chevron.line(to: NSPoint(x: 7.55 * scale, y: 9.0 * scale))
    chevron.line(to: NSPoint(x: 5.6 * scale, y: 7.65 * scale))
    chevron.lineWidth = stroke
    chevron.lineCapStyle = .round
    chevron.lineJoinStyle = .round
    chevron.stroke()

    // Cursor underscore.
    let cursor = NSBezierPath()
    cursor.move(to: NSPoint(x: 9.35 * scale, y: 7.65 * scale))
    cursor.line(to: NSPoint(x: 12.4 * scale, y: 7.65 * scale))
    cursor.lineWidth = stroke
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

renderIcon(pixelSize: 18, outputPath: "\(outputDirectory)/menu-iconTemplate.png")
renderIcon(pixelSize: 36, outputPath: "\(outputDirectory)/menu-iconTemplate@2x.png")
print("Wrote menu icon assets to \(outputDirectory)")
