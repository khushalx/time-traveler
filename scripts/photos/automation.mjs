import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { metadataProblems, validRecord, plain, POLICY_VERSION } from "./policy.mjs";

export const AUTO_POLICY = "commons-auto-v1";
const ASSET = /^[a-f0-9]{64}(?:-(?:800|320))?\.webp$/;
const TOPICS = ["street", "train", "family", "market", "cars", "school", "fashion", "factory", "music", "city"];
const PLACES = ["India", "Japan", "Egypt", "Brazil", "London", "Mexico", "Australia", "China", "Kenya", "New York", "Singapore", "France"];

/** Every year is discoverable. Sparse years go first; the tie order rotates each run. */
export function discoveryPlan(photos, sequence = 0) {
  const counts = new Map();
  for (const p of photos) counts.set(p.year, (counts.get(p.year) ?? 0) + 1);
  const rank = (year) => createHash("sha256").update(`${sequence}:${year}`).digest("hex");
  return Array.from({ length: 121 }, (_, i) => i + 1900)
    .sort((a, b) => (counts.get(a) ?? 0) - (counts.get(b) ?? 0) || rank(a).localeCompare(rank(b)))
    .map((year, i) => {
      const topic = TOPICS[(i + sequence) % TOPICS.length];
      const place = sequence % 3 === 0 ? "" : PLACES[(i + sequence) % PLACES.length];
      return { year, search: `${place} ${topic} intitle:${year} filetype:bitmap`.trim() };
    });
}

/** Automation never clears a human rejection or a date/license exception. */
export function automationProblems(p) {
  const checked = metadataProblems({ ...p, width: p.sourceWidth, height: p.sourceHeight });
  const reasons = checked.issues;
  if (checked.year !== p.year || plain(p.rawEvidence?.date?.value) !== p.captureDate)
    reasons.push("capture-evidence-mismatch");
  if (p.status !== "review" || !validRecord(p)) reasons.push("not-an-eligible-review-record");
  if (p.adapter !== "commons" || !/^commons-\d+$/.test(p.id)) reasons.push("unsupported-auto-source");
  if (!/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/.test(p.sourceUrl ?? "") ||
      !/^https:\/\/(?:upload|thumb)\.wikimedia\.org\//.test(p.imageUrl ?? "")) reasons.push("untrusted-source-url");
  if (!p.derivatives || ![p.derivatives.main, p.derivatives.mobile, p.derivatives.thumb].every((file) => ASSET.test(file)) ||
      p.derivatives.main !== `${p.sha256}.webp` || p.derivatives.mobile !== `${p.sha256}-800.webp` ||
      p.derivatives.thumb !== `${p.sha256}-320.webp` ||
      !/^[a-f0-9]{64}$/.test(p.sha256 ?? "") || !/^[a-f0-9]{16}$/.test(p.perceptualHash ?? ""))
    reasons.push("missing-verified-image");
  if ((p.reasons ?? []).some((r) => !["visual-review-required", "ocr-unavailable", "ocr-visible-year", "ocr-watermark-or-copyright", "ocr-text-heavy"].includes(r)))
    reasons.push("unresolved-import-exception");
  const context = [p.title, p.description, ...(p.categories ?? [])].join(" ");
  if (!/photograph|photography|\bphotos\b|fortepan|press agency|geograph/i.test(context))
    reasons.push("photographic-source-not-established");
  if (/sexual|erotic|fetish|genitals?|suicide|self.harm|injur|violence|violent|torture|prisoner|war crime|propaganda|AI[ -]generated|generated (?:image|with)|artificial intelligence|digital art|montage|photomontage|restor(?:ed|ation)|retouch|stamp|captioned/i.test(context))
    reasons.push("subject-requires-human-review");
  return [...new Set(reasons)];
}

export async function autoAccept(p, screen, { root = ".", now = new Date() } = {}) {
  const issues = automationProblems(p);
  if (issues.length) return { accepted: false, reasons: issues };
  const main = `${root}/.photo-library/assets/${p.derivatives.main}`;
  try {
    const bytes = await readFile(main);
    if (createHash("sha256").update(bytes).digest("hex") !== p.sha256)
      return { accepted: false, reasons: ["asset-checksum-mismatch"] };
    const result = await screen(main);
    if (!result?.engine || !Array.isArray(result.ocr) || !Array.isArray(result.flags))
      return { accepted: false, reasons: ["ocr-unavailable"] };
    if (result.flags.length) return { accepted: false, reasons: result.flags };
    return {
      accepted: true,
      record: {
        ...p,
        status: "live",
        reasons: [],
        ocr: result.ocr,
        automatedReview: {
          policy: AUTO_POLICY, policyVersion: POLICY_VERSION,
          engine: result.engine, at: now.toISOString(), sha256: p.sha256,
          checks: ["exact-source-capture-date", "reusable-license", "decoded-image", "duplicate-screen", "photographic-metadata", "no-ocr-flags"],
        },
      },
    };
  } catch (error) {
    return { accepted: false, reasons: [`automatic-screen-failed: ${error.message}`] };
  }
}

export function hasAutomaticApproval(p) {
  return p.status === "live" && p.automatedReview?.policy === AUTO_POLICY &&
    p.automatedReview.policyVersion === POLICY_VERSION &&
    p.automatedReview.sha256 === p.sha256 && !!p.automatedReview.engine &&
    p.reasons?.length === 0 && validRecord(p) &&
    automationProblems({ ...p, status: "review" }).length === 0;
}
