// Recorte de persona con Apple Vision (viene en macOS, sin descargas).
// Uso: matte <carpeta_jpg> <carpeta_salida>  → PNG en gris (255 = persona)
import Foundation
import Vision
import CoreImage

let args = CommandLine.arguments
guard args.count >= 3 else { print("uso: matte <in> <out>"); exit(1) }
let inDir = args[1], outDir = args[2]
let files = try FileManager.default.contentsOfDirectory(atPath: inDir).filter { $0.hasSuffix(".jpg") }.sorted()
try FileManager.default.createDirectory(atPath: outDir, withIntermediateDirectories: true)

let request = VNGeneratePersonSegmentationRequest()
request.qualityLevel = .accurate
request.outputPixelFormat = kCVPixelFormatType_OneComponent8
let handler = VNSequenceRequestHandler()      // mantiene coherencia temporal entre frames
let ctx = CIContext()
let gray = CGColorSpaceCreateDeviceGray()
let t0 = Date()
for (i, f) in files.enumerated() {
    guard let img = CIImage(contentsOf: URL(fileURLWithPath: inDir + "/" + f)) else { continue }
    try handler.perform([request], on: img)
    guard let obs = request.results?.first as? VNPixelBufferObservation else { print("sin resultado en \(f)"); continue }
    var mask = CIImage(cvPixelBuffer: obs.pixelBuffer)
    mask = mask.transformed(by: CGAffineTransform(scaleX: img.extent.width / mask.extent.width, y: img.extent.height / mask.extent.height))
    let out = URL(fileURLWithPath: outDir + "/" + f.replacingOccurrences(of: ".jpg", with: ".png"))
    try ctx.writePNGRepresentation(of: mask, to: out, format: .L8, colorSpace: gray, options: [:])
    if i % 100 == 0 { print("\(i)/\(files.count)  \(String(format: "%.1f", Double(i + 1) / Date().timeIntervalSince(t0))) fps") }
}
print("listo: \(files.count) frames en \(String(format: "%.1f", Date().timeIntervalSince(t0))) s")
