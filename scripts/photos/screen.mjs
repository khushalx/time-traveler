import { promisify } from "node:util";
import { execFile } from "node:child_process";
import sharp from "sharp";
const run = promisify(execFile);
export function ocrFlags(observations) {
  const text = observations.map((x) => x.text).join(" ");
  const flags = [];
  if (
    /\b(?:19|20)\d{2}\b|\bexpo\s*['’]?\d{2}\b|\b\d{1,2}[/.]\d{1,2}[/.]\d{2,4}\b/i.test(
      text,
    )
  )
    flags.push("ocr-visible-year");
  if (/getty|alamy|shutterstock|panoramio|watermark|copyright|©/i.test(text))
    flags.push("ocr-watermark-or-copyright");
  if (observations.reduce((sum, x) => sum + (x.area ?? 0), 0) > 0.18)
    flags.push("ocr-text-heavy");
  return flags;
}
export async function screenImage(path, command) {
  if (!command) return { ocr: [], flags: ["ocr-unavailable"] };
  // Vision's file-URL handler may silently return no text for WebP. Use a
  // decoded JPEG so the optional screen sees the same pixels as the player.
  await sharp(path)
    .jpeg({ quality: 95 })
    .toFile(".photo-library/ocr-input.jpg");
  try {
    const { stdout } = await run(command, [".photo-library/ocr-input.jpg"], {
      timeout: 30000,
      maxBuffer: 2000000,
    });
    const ocr = JSON.parse(stdout);
    return { ocr, flags: ocrFlags(ocr) };
  } catch {
    return { ocr: [], flags: ["ocr-unavailable"] };
  }
}
