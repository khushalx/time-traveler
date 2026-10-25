import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { createHash } from "node:crypto";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { join } from "node:path";
import { hasAutomaticApproval } from "./automation.mjs";
import { reusableLicense } from "./policy.mjs";
const run = promisify(execFile);
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
export const REPOSITORY = "khushalx/time-traveler";
export async function saveJSON(path, value) {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path + ".tmp", JSON.stringify(value, null, 2) + "\n");
  await rename(path + ".tmp", path);
}

/** Never overwrite a release. A retry may fill missing uploads, then verify all bytes. */
export async function uploadRelease({ tag, files, notes, root = "." }) {
  const gh = async (args) => (await run("gh", args, { cwd: root, maxBuffer: 4000000 })).stdout;
  const endpoint = `repos/${REPOSITORY}/releases/tags/${tag}`;
  let release;
  try { release = JSON.parse(await gh(["api", endpoint])); }
  catch (error) {
    if (!/404|Not Found/.test(error.stderr ?? "")) throw error;
    const notesFile = ".photo-library/live-release-notes.md";
    await writeFile(join(root, notesFile), notes);
    await gh(["release", "create", tag, "--repo", REPOSITORY,
      "--target", (await run("git", ["rev-parse", "HEAD"], { cwd: root })).stdout.trim(),
      "--title", `Time Traveler photo batch ${tag.slice(-16)}`, "--notes-file", notesFile]);
    release = JSON.parse(await gh(["api", endpoint]));
  }
  if (release.draft) throw new Error("Live photo release is still a draft");
  for (const file of files) {
    if (!release.assets.some((a) => a.name === file.file))
      await gh(["release", "upload", tag, file.path, "--repo", REPOSITORY]);
  }
  release = JSON.parse(await gh(["api", endpoint]));
  for (const file of files) {
    const asset = release.assets.find((a) => a.name === file.file);
    if (!asset || asset.size !== file.bytes || asset.state !== "uploaded")
      throw new Error(`Incomplete live asset: ${file.file}`);
    if (asset.digest) {
      if (asset.digest !== `sha256:${file.sha256}`) throw new Error(`Changed release asset: ${file.file}`);
    } else {
      const response = await fetch(asset.browser_download_url, { signal: AbortSignal.timeout(30000) });
      if (!response.ok || Number(response.headers.get("content-length") ?? 0) > file.bytes)
        throw new Error(`Cannot verify release asset: ${file.file}`);
      const parts = [];
      let size = 0;
      for await (const part of response.body) {
        size += part.length;
        if (size > file.bytes) throw new Error(`Oversized release asset: ${file.file}`);
        parts.push(Buffer.from(part));
      }
      const data = Buffer.concat(parts);
      if (data.length !== file.bytes || hash(data) !== file.sha256)
        throw new Error(`Changed release asset: ${file.file}`);
    }
  }
}

export function livePhoto(p) {
  if (!hasAutomaticApproval(p) || !/^photo-live-[a-f0-9]{16}$/.test(p.delivery?.tag ?? ""))
    throw new Error(`Incomplete live approval: ${p.id}`);
  const base = `https://github.com/${REPOSITORY}/releases/download/${p.delivery.tag}/`;
  const license = reusableLicense(p.license, p.licenseUrl);
  return {
    id: p.id, src: base + p.derivatives.main,
    srcSet: p.width > 800
      ? `${base}${p.derivatives.mobile} 800w, ${base}${p.derivatives.main} ${p.width}w`
      : `${base}${p.derivatives.main} ${p.width}w`,
    thumbnailSrc: base + p.derivatives.thumb,
    year: p.year, title: p.title, fact: p.fact ?? "", sourceUrl: p.sourceUrl,
    sourceName: p.sourceName, creator: p.creator, license: license.name, licenseUrl: license.url,
    category: p.category, region: p.region, location: p.region,
    difficulty: p.difficulty, quality: p.quality, width: p.width, height: p.height,
    dateEvidence: p.dateEvidence, yearConfidence: "verified", modifications: p.modifications,
  };
}

/** Files become discoverable only after the entire immutable release is verified. */
export async function publishLiveBatch(records, added, { root = ".", upload = uploadRelease } = {}) {
  if (!added.length) return { added: 0 };
  const files = [];
  const seen = new Set();
  for (const p of added) {
    if (!hasAutomaticApproval(p)) throw new Error(`Not automatically approved: ${p.id}`);
    for (const file of Object.values(p.derivatives)) {
      if (seen.has(file)) continue;
      seen.add(file);
      const path = `.photo-library/assets/${file}`;
      const bytes = await readFile(join(root, path));
      const sha256 = hash(bytes);
      if (file === p.derivatives.main && sha256 !== p.sha256) throw new Error("Main asset checksum mismatch");
      files.push({ file, path, bytes: bytes.length, sha256 });
    }
  }
  const version = hash(JSON.stringify(files.map(({ file, bytes, sha256 }) => ({ file, bytes, sha256 })))).slice(0, 16);
  const tag = `photo-live-${version}`;
  const notes = `Automatically imported Wikimedia Commons photographs.\n\n${added.map((p) =>
    `${p.title}\nCreator: ${p.creator}\nSource: ${p.sourceUrl}\nLicense: ${p.license} ${p.licenseUrl}\nChanges: ${p.modifications}\n`).join("\n")}\nChecks: exact source date, rights, decoded pixels, duplicate screen and OCR. Automated checks may miss issues; original sources remain linked.\n`;
  await upload({ tag, files, notes, root });
  const additions = new Map(added.map((p) => [p.id, { ...p, delivery: { tag } }]));
  const updated = records.map((p) => additions.get(p.id) ?? p);
  const photos = updated.filter((p) => p.status === "live").map(livePhoto).sort((a, b) => a.id.localeCompare(b.id));
  const catalogVersion = hash(JSON.stringify(photos)).slice(0, 16);
  const entries = [];
  for (let offset = 0; offset < photos.length; offset += 25) {
    const chunk = `/library/live/releases/${catalogVersion}/${offset / 25}.json`;
    await saveJSON(join(root, "public", chunk), photos.slice(offset, offset + 25));
    for (const p of photos.slice(offset, offset + 25))
      entries.push([p.id, p.year, p.category, p.region, p.difficulty, p.quality, chunk]);
  }
  // The Git commit is the transaction boundary for manifest, chunks and audit.
  await saveJSON(join(root, "data/photo-library/records.json"), updated);
  await saveJSON(join(root, "public/library/live/manifest.json"), {
    schemaVersion: 1, version: catalogVersion, total: photos.length,
    updatedAt: new Date().toISOString(), entries,
  });
  return { added: added.length, total: photos.length, tag, version: catalogVersion };
}
