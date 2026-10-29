import AppKit
import Foundation

/// Draws the menu bar app's square icon: a paper-white tile with the studio mascot head.
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

    // 1024×1024 设计坐标，原点翻到左上角，与图标定稿的坐标系一致。
    let scale = CGFloat(pixelSize) / 1024.0
    let canvas = NSAffineTransform()
    canvas.translateX(by: 0, yBy: CGFloat(pixelSize))
    canvas.scaleX(by: scale, yBy: -scale)
    canvas.concat()

    let paper = NSColor(srgbRed: 251.0 / 255.0, green: 248.0 / 255.0, blue: 241.0 / 255.0, alpha: 1)
    let ink = NSColor(srgbRed: 23.0 / 255.0, green: 18.0 / 255.0, blue: 31.0 / 255.0, alpha: 1)
    let paperEdge = NSColor(srgbRed: 216.0 / 255.0, green: 208.0 / 255.0, blue: 198.0 / 255.0, alpha: 1)

    // 16/32px 下细线会被抗锯齿吃掉，小尺寸按比例加粗描边与五官。
    let metrics: (headLine: CGFloat, eyeRadius: CGFloat, muzzleLine: CGFloat, noseLine: CGFloat) = {
        if pixelSize <= 16 { return (48, 50, 34, 18) }
        if pixelSize <= 32 { return (30, 36, 22, 13) }
        return (16, 30, 16, 10)
    }()

    // 纸白圆角底与细边。
    let tileRect = NSRect(x: 64, y: 64, width: 896, height: 896)
    let tile = NSBezierPath(roundedRect: tileRect, xRadius: 200, yRadius: 200)
    paper.setFill()
    tile.fill()

    let rim = NSBezierPath(
        roundedRect: tileRect.insetBy(dx: 12, dy: 12),
        xRadius: 188,
        yRadius: 188
    )
    paperEdge.setStroke()
    rim.lineWidth = 6
    rim.stroke()

    // 头部轮廓：手绘路径先按矩阵拉宽、拉高，再描边；非等比矩阵让线宽保留手绘的细微变化。
    NSGraphicsContext.saveGraphicsState()
    var headMatrix = NSAffineTransformStruct()
    headMatrix.m11 = 1.02228
    headMatrix.m12 = 0
    headMatrix.m21 = 0
    headMatrix.m22 = 1.369855
    headMatrix.tX = 58.0395
    headMatrix.tY = 16.948
    let headTransform = NSAffineTransform()
    headTransform.transformStruct = headMatrix
    headTransform.concat()

    let head = NSBezierPath()
    head.move(to: NSPoint(x: 373.0, y: 187.6))
    head.curve(to: NSPoint(x: 404.0, y: 188.9), controlPoint1: NSPoint(x: 385.9, y: 187.3), controlPoint2: NSPoint(x: 392.6, y: 187.7))
    head.curve(to: NSPoint(x: 441.5, y: 194.7), controlPoint1: NSPoint(x: 415.4, y: 190.0), controlPoint2: NSPoint(x: 430.9, y: 192.6))
    head.curve(to: NSPoint(x: 467.6, y: 201.5), controlPoint1: NSPoint(x: 452.1, y: 196.8), controlPoint2: NSPoint(x: 456.1, y: 197.8))
    head.curve(to: NSPoint(x: 510.7, y: 216.7), controlPoint1: NSPoint(x: 479.2, y: 205.1), controlPoint2: NSPoint(x: 498.3, y: 213.1))
    head.curve(to: NSPoint(x: 542.1, y: 222.8), controlPoint1: NSPoint(x: 523.1, y: 220.3), controlPoint2: NSPoint(x: 532.5, y: 221.6))
    head.curve(to: NSPoint(x: 568.4, y: 224.3), controlPoint1: NSPoint(x: 551.7, y: 224.1), controlPoint2: NSPoint(x: 553.5, y: 224.8))
    head.curve(to: NSPoint(x: 631.1, y: 219.9), controlPoint1: NSPoint(x: 583.2, y: 223.8), controlPoint2: NSPoint(x: 611.4, y: 219.3))
    head.curve(to: NSPoint(x: 686.5, y: 228.0), controlPoint1: NSPoint(x: 650.8, y: 220.6), controlPoint2: NSPoint(x: 672.0, y: 224.9))
    head.curve(to: NSPoint(x: 717.9, y: 238.0), controlPoint1: NSPoint(x: 700.9, y: 231.0), controlPoint2: NSPoint(x: 708.5, y: 234.2))
    head.curve(to: NSPoint(x: 742.7, y: 250.8), controlPoint1: NSPoint(x: 727.3, y: 241.8), controlPoint2: NSPoint(x: 735.3, y: 245.9))
    head.curve(to: NSPoint(x: 762.5, y: 267.5), controlPoint1: NSPoint(x: 750.2, y: 255.7), controlPoint2: NSPoint(x: 757.2, y: 261.5))
    head.curve(to: NSPoint(x: 774.8, y: 286.9), controlPoint1: NSPoint(x: 767.9, y: 273.5), controlPoint2: NSPoint(x: 772.4, y: 281.9))
    head.curve(to: NSPoint(x: 776.9, y: 297.6), controlPoint1: NSPoint(x: 777.1, y: 291.9), controlPoint2: NSPoint(x: 776.6, y: 294.0))
    head.curve(to: NSPoint(x: 776.1, y: 308.5), controlPoint1: NSPoint(x: 777.1, y: 301.2), controlPoint2: NSPoint(x: 778.3, y: 302.3))
    head.curve(to: NSPoint(x: 763.7, y: 335.2), controlPoint1: NSPoint(x: 774.0, y: 314.8), controlPoint2: NSPoint(x: 765.9, y: 328.7))
    head.curve(to: NSPoint(x: 762.9, y: 347.4), controlPoint1: NSPoint(x: 761.5, y: 341.6), controlPoint2: NSPoint(x: 761.9, y: 342.5))
    head.curve(to: NSPoint(x: 770.1, y: 364.1), controlPoint1: NSPoint(x: 764.0, y: 352.2), controlPoint2: NSPoint(x: 764.2, y: 357.6))
    head.curve(to: NSPoint(x: 798.7, y: 386.3), controlPoint1: NSPoint(x: 776.1, y: 370.6), controlPoint2: NSPoint(x: 791.4, y: 379.1))
    head.curve(to: NSPoint(x: 813.6, y: 407.5), controlPoint1: NSPoint(x: 805.9, y: 393.5), controlPoint2: NSPoint(x: 810.8, y: 402.3))
    head.curve(to: NSPoint(x: 815.6, y: 417.2), controlPoint1: NSPoint(x: 816.4, y: 412.6), controlPoint2: NSPoint(x: 815.4, y: 413.9))
    head.curve(to: NSPoint(x: 814.7, y: 427.1), controlPoint1: NSPoint(x: 815.8, y: 420.4), controlPoint2: NSPoint(x: 815.6, y: 423.7))
    head.curve(to: NSPoint(x: 810.3, y: 437.1), controlPoint1: NSPoint(x: 813.9, y: 430.4), controlPoint2: NSPoint(x: 812.2, y: 434.0))
    head.curve(to: NSPoint(x: 803.4, y: 445.5), controlPoint1: NSPoint(x: 808.5, y: 440.1), controlPoint2: NSPoint(x: 806.7, y: 442.5))
    head.curve(to: NSPoint(x: 790.5, y: 455.0), controlPoint1: NSPoint(x: 800.1, y: 448.5), controlPoint2: NSPoint(x: 795.5, y: 452.0))
    head.curve(to: NSPoint(x: 773.6, y: 463.3), controlPoint1: NSPoint(x: 785.6, y: 457.9), controlPoint2: NSPoint(x: 787.6, y: 460.3))
    head.curve(to: NSPoint(x: 706.3, y: 473.2), controlPoint1: NSPoint(x: 759.5, y: 466.3), controlPoint2: NSPoint(x: 721.2, y: 470.6))
    head.curve(to: NSPoint(x: 684.0, y: 478.7), controlPoint1: NSPoint(x: 691.4, y: 475.8), controlPoint2: NSPoint(x: 695.4, y: 473.4))
    head.curve(to: NSPoint(x: 638.0, y: 504.8), controlPoint1: NSPoint(x: 672.6, y: 484.0), controlPoint2: NSPoint(x: 651.8, y: 498.2))
    head.curve(to: NSPoint(x: 601.7, y: 518.8), controlPoint1: NSPoint(x: 624.3, y: 511.5), controlPoint2: NSPoint(x: 617.3, y: 514.4))
    head.curve(to: NSPoint(x: 544.1, y: 531.4), controlPoint1: NSPoint(x: 586.0, y: 523.2), controlPoint2: NSPoint(x: 561.0, y: 528.7))
    head.curve(to: NSPoint(x: 500.2, y: 535.3), controlPoint1: NSPoint(x: 527.1, y: 534.2), controlPoint2: NSPoint(x: 518.5, y: 534.8))
    head.curve(to: NSPoint(x: 434.3, y: 534.3), controlPoint1: NSPoint(x: 482.0, y: 535.8), controlPoint2: NSPoint(x: 455.0, y: 536.0))
    head.curve(to: NSPoint(x: 376.0, y: 525.1), controlPoint1: NSPoint(x: 413.6, y: 532.6), controlPoint2: NSPoint(x: 394.0, y: 529.3))
    head.curve(to: NSPoint(x: 326.5, y: 509.3), controlPoint1: NSPoint(x: 358.1, y: 521.0), controlPoint2: NSPoint(x: 341.3, y: 515.6))
    head.curve(to: NSPoint(x: 287.5, y: 487.2), controlPoint1: NSPoint(x: 311.8, y: 502.9), controlPoint2: NSPoint(x: 297.4, y: 491.9))
    head.curve(to: NSPoint(x: 267.3, y: 481.1), controlPoint1: NSPoint(x: 277.6, y: 482.5), controlPoint2: NSPoint(x: 280.2, y: 481.7))
    head.curve(to: NSPoint(x: 209.7, y: 483.7), controlPoint1: NSPoint(x: 254.3, y: 480.5), controlPoint2: NSPoint(x: 226.4, y: 484.3))
    head.curve(to: NSPoint(x: 167.3, y: 477.1), controlPoint1: NSPoint(x: 193.0, y: 483.0), controlPoint2: NSPoint(x: 178.4, y: 479.7))
    head.curve(to: NSPoint(x: 143.0, y: 468.0), controlPoint1: NSPoint(x: 156.1, y: 474.5), controlPoint2: NSPoint(x: 149.9, y: 471.2))
    head.curve(to: NSPoint(x: 125.6, y: 458.0), controlPoint1: NSPoint(x: 136.0, y: 464.8), controlPoint2: NSPoint(x: 131.0, y: 461.9))
    head.curve(to: NSPoint(x: 110.6, y: 444.9), controlPoint1: NSPoint(x: 120.2, y: 454.2), controlPoint2: NSPoint(x: 114.6, y: 449.5))
    head.curve(to: NSPoint(x: 101.6, y: 430.6), controlPoint1: NSPoint(x: 106.6, y: 440.4), controlPoint2: NSPoint(x: 103.4, y: 435.0))
    head.curve(to: NSPoint(x: 99.7, y: 418.9), controlPoint1: NSPoint(x: 99.8, y: 426.3), controlPoint2: NSPoint(x: 99.5, y: 422.5))
    head.curve(to: NSPoint(x: 102.4, y: 409.4), controlPoint1: NSPoint(x: 99.8, y: 415.4), controlPoint2: NSPoint(x: 100.9, y: 412.5))
    head.curve(to: NSPoint(x: 108.3, y: 400.5), controlPoint1: NSPoint(x: 103.8, y: 406.4), controlPoint2: NSPoint(x: 104.9, y: 404.3))
    head.curve(to: NSPoint(x: 122.9, y: 386.7), controlPoint1: NSPoint(x: 111.8, y: 396.7), controlPoint2: NSPoint(x: 120.1, y: 390.4))
    head.curve(to: NSPoint(x: 125.2, y: 377.8), controlPoint1: NSPoint(x: 125.7, y: 382.9), controlPoint2: NSPoint(x: 125.7, y: 381.3))
    head.curve(to: NSPoint(x: 119.6, y: 365.6), controlPoint1: NSPoint(x: 124.6, y: 374.3), controlPoint2: NSPoint(x: 125.5, y: 370.2))
    head.curve(to: NSPoint(x: 90.0, y: 350.1), controlPoint1: NSPoint(x: 113.8, y: 361.0), controlPoint2: NSPoint(x: 96.5, y: 354.2))
    head.curve(to: NSPoint(x: 80.7, y: 341.1), controlPoint1: NSPoint(x: 83.5, y: 346.0), controlPoint2: NSPoint(x: 83.2, y: 344.1))
    head.curve(to: NSPoint(x: 75.0, y: 331.8), controlPoint1: NSPoint(x: 78.2, y: 338.0), controlPoint2: NSPoint(x: 76.3, y: 335.1))
    head.curve(to: NSPoint(x: 72.5, y: 321.1), controlPoint1: NSPoint(x: 73.6, y: 328.4), controlPoint2: NSPoint(x: 72.7, y: 324.7))
    head.curve(to: NSPoint(x: 73.9, y: 310.3), controlPoint1: NSPoint(x: 72.3, y: 317.6), controlPoint2: NSPoint(x: 72.7, y: 314.1))
    head.curve(to: NSPoint(x: 79.8, y: 298.8), controlPoint1: NSPoint(x: 75.2, y: 306.6), controlPoint2: NSPoint(x: 77.5, y: 302.2))
    head.curve(to: NSPoint(x: 87.7, y: 289.8), controlPoint1: NSPoint(x: 82.1, y: 295.4), controlPoint2: NSPoint(x: 82.9, y: 293.8))
    head.curve(to: NSPoint(x: 108.8, y: 274.7), controlPoint1: NSPoint(x: 92.5, y: 285.8), controlPoint2: NSPoint(x: 100.4, y: 279.3))
    head.curve(to: NSPoint(x: 138.4, y: 262.7), controlPoint1: NSPoint(x: 117.3, y: 270.2), controlPoint2: NSPoint(x: 129.4, y: 265.6))
    head.curve(to: NSPoint(x: 162.7, y: 257.0), controlPoint1: NSPoint(x: 147.4, y: 259.7), controlPoint2: NSPoint(x: 151.2, y: 258.8))
    head.curve(to: NSPoint(x: 207.4, y: 251.7), controlPoint1: NSPoint(x: 174.2, y: 255.2), controlPoint2: NSPoint(x: 198.1, y: 253.2))
    head.curve(to: NSPoint(x: 218.6, y: 248.0), controlPoint1: NSPoint(x: 216.7, y: 250.1), controlPoint2: NSPoint(x: 215.1, y: 249.6))
    head.curve(to: NSPoint(x: 228.7, y: 241.7), controlPoint1: NSPoint(x: 222.2, y: 246.3), controlPoint2: NSPoint(x: 221.8, y: 247.4))
    head.curve(to: NSPoint(x: 260.4, y: 214.1), controlPoint1: NSPoint(x: 235.7, y: 236.1), controlPoint2: NSPoint(x: 249.8, y: 221.2))
    head.curve(to: NSPoint(x: 291.8, y: 199.0), controlPoint1: NSPoint(x: 270.9, y: 207.0), controlPoint2: NSPoint(x: 280.8, y: 202.9))
    head.curve(to: NSPoint(x: 326.8, y: 190.7), controlPoint1: NSPoint(x: 302.9, y: 195.1), controlPoint2: NSPoint(x: 313.3, y: 192.6))
    head.curve(to: NSPoint(x: 373.0, y: 187.6), controlPoint1: NSPoint(x: 340.3, y: 188.8), controlPoint2: NSPoint(x: 360.1, y: 187.9))
    head.close()
    head.lineWidth = metrics.headLine
    head.lineJoinStyle = .round
    NSColor.white.setFill()
    ink.setStroke()
    head.fill()
    head.stroke()
    NSGraphicsContext.restoreGraphicsState()

    // 眼睛、口鼻与 Y 形鼻都画在最终坐标里，线宽保持均匀。
    ink.setFill()
    let eyeRadius = metrics.eyeRadius
    for eyeX in [401.8, 622.2] {
        NSBezierPath(
            ovalIn: NSRect(
                x: eyeX - eyeRadius,
                y: 457.1 - eyeRadius,
                width: eyeRadius * 2,
                height: eyeRadius * 2
            )
        ).fill()
    }

    let muzzle = NSBezierPath(
        ovalIn: NSRect(x: 352.4, y: 535.8, width: 319.2, height: 143.2)
    )
    NSColor.white.setFill()
    muzzle.fill()
    ink.setStroke()
    muzzle.lineWidth = metrics.muzzleLine
    muzzle.stroke()

    let nose = NSBezierPath()
    nose.move(to: NSPoint(x: 494, y: 601.4))
    nose.line(to: NSPoint(x: 512, y: 621.4))
    nose.line(to: NSPoint(x: 530, y: 601.4))
    nose.move(to: NSPoint(x: 512, y: 621.4))
    nose.line(to: NSPoint(x: 512, y: 643.4))
    nose.lineWidth = metrics.noseLine
    nose.lineCapStyle = .round
    nose.lineJoinStyle = .round
    nose.stroke()

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
