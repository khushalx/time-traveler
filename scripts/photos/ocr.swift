import Foundation
import Vision
import ImageIO
// Optional local screening, never a substitute for the visual approval gate.
do {
  let url = URL(fileURLWithPath: CommandLine.arguments[1])
  let request = VNRecognizeTextRequest()
  request.recognitionLevel = .accurate
  request.usesLanguageCorrection = false
  try VNImageRequestHandler(url: url, options: [:]).perform([request])
  let texts = (request.results ?? []).compactMap { item -> [String: Any]? in
    guard let text = item.topCandidates(1).first else { return nil }
    return ["text":text.string,"confidence":text.confidence,"area":item.boundingBox.width * item.boundingBox.height]
  }
  let data = try JSONSerialization.data(withJSONObject:texts)
  print(String(data:data,encoding:.utf8)!)
} catch { fputs("OCR unavailable: \(error)\n",stderr); exit(1) }
