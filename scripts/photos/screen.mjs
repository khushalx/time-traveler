import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { mkdtemp, rm, mkdir, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
const run = promisify(execFile);
export function ocrFlags(observations) {
  const text = observations.map((x) => x.text).join(" ");
  const flags = [];
  if (
    /\b(?:18|19|20)\d{2}\b|\bexpo\s*['’]?\d{2}\b|\b\d{1,2}[/.]\d{1,2}[/.]\d{2,4}\b/i.test(
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

export function parseTsv(tsv) {
  const lines = tsv.trim().split(/\r?\n/);
  if (!lines[0]?.startsWith("level\tpage_num\t")) throw new Error("Invalid OCR output");
  const rows = lines.slice(1).map((line) => line.split("\t"));
  const page = rows.find((r) => r[0] === "1");
  const area = Number(page?.[8]) * Number(page?.[9]);
  if (!Number.isFinite(area) || area <= 0) throw new Error("OCR did not process a page");
  return rows.filter((r) => r[0] === "5" && Number(r[10]) >= 25 && r.slice(11).join("\t").trim())
    .map((r) => ({ text: r.slice(11).join("\t"), confidence: Number(r[10]) / 100,
      area: Number(r[8]) * Number(r[9]) / area }));
}

export async function automaticOcrEngine() {
  try {
    await run("tesseract", ["--version"], { timeout: 10000 });
    return "tesseract";
  } catch { /* Native Vision is also available on local Macs. */ }
  if (process.platform === "darwin") {
    await mkdir(".photo-library", { recursive: true });
    try { await access(".photo-library/ocr"); }
    catch {
      await run("swiftc", ["scripts/photos/ocr.swift", "-o", ".photo-library/ocr"], { timeout: 120000 });
    }
    return ".photo-library/ocr";
  }
  throw new Error("Automatic imports require Tesseract OCR. Install tesseract-ocr; missing OCR never approves an image.");
}

/** Two segmentation passes catch both scattered signs and blocks of captions. */
export async function screenAutomatically(path, engine) {
  const directory = await mkdtemp(join(tmpdir(), "time-traveler-ocr-"));
  try {
    const input = join(directory, "photo.jpg");
    await sharp(path).jpeg({ quality: 95 }).toFile(input);
    let ocr;
    if (engine === "tesseract") {
      const passes = [];
      for (const mode of [3, 11]) {
        const result = await run("tesseract", [input, "stdout", "-l", "eng", "--psm", String(mode), "tsv"],
          { timeout: 30000, maxBuffer: 2000000 });
        passes.push(parseTsv(result.stdout));
      }
      // Keep the larger text area rather than double-counting the two scans.
      const flags = [...new Set(passes.flatMap(ocrFlags))];
      return { engine: "tesseract-eng-psm3+11", ocr: passes.flat(), flags };
    }
    const result = await run(engine, [input], { timeout: 30000, maxBuffer: 2000000 });
    ocr = JSON.parse(result.stdout);
    if (!Array.isArray(ocr) || ocr.some((x) => typeof x.text !== "string" || !Number.isFinite(x.area)))
      throw new Error("Invalid OCR observations");
    return { engine: "apple-vision-accurate", ocr, flags: ocrFlags(ocr) };
  } catch {
    return { engine: null, ocr: [], flags: ["ocr-unavailable"] };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
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
