import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, writeFile, mkdir, rename, rm, stat, open } from "node:fs/promises";
import { join } from "node:path";
import { createGunzip } from "node:zlib";
import { createInterface } from "node:readline";

const FILE = /^[a-f0-9]{64}(?:-(?:800|320))?\.webp$/;
const HASH = /^[a-f0-9]{64}$/;

export async function checksum(file) {
  const hash = createHash("sha256");
  for await (const bytes of createReadStream(file)) hash.update(bytes);
  return hash.digest("hex");
}

async function matches(path, expected) {
  try {
    return (await stat(path)).size === expected.bytes &&
      (await checksum(path)) === expected.sha256;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

export function validateAssetRelease(release, records, catalogVersion) {
  if (!release || release.schemaVersion !== 1 ||
      release.catalogVersion !== catalogVersion ||
      !HASH.test(release.sha256) ||
      !Number.isSafeInteger(release.bytes) || release.bytes <= 0 ||
      release.bytes > 2_000_000_000 || !Array.isArray(release.files))
    throw new Error("Invalid or outdated photo asset release descriptor");
  const url = new URL(release.url);
  if (url.protocol !== "https:" || url.username || url.password)
    throw new Error("Photo asset release requires a public HTTPS URL");
  const required = new Map();
  for (const p of records) {
    if (!p.derivatives || !HASH.test(p.sha256))
      throw new Error(`Invalid approved derivative metadata: ${p.id}`);
    for (const file of Object.values(p.derivatives)) {
      if (!FILE.test(file)) throw new Error("Invalid approved asset filename");
      required.set(file, file === p.derivatives.main ? p.sha256 : null);
    }
  }
  const files = new Map();
  for (const file of release.files) {
    if (!FILE.test(file.file) || files.has(file.file) ||
        !required.has(file.file) || !HASH.test(file.sha256) ||
        !Number.isSafeInteger(file.bytes) || file.bytes <= 0 || file.bytes > 10_000_000 ||
        (required.get(file.file) && required.get(file.file) !== file.sha256))
      throw new Error("Photo asset release does not match approved photographs");
    files.set(file.file, file);
  }
  if (files.size !== required.size)
    throw new Error("Photo asset release is missing approved derivatives");
  return files;
}

async function downloadBundle(release, destination, fetcher) {
  await mkdir(join(destination, ".."), { recursive: true });
  const temporary = destination + ".download";
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetcher(release.url, {
        signal: AbortSignal.timeout(180000),
        headers: { "User-Agent": "TimeTravelerAssetBuild/1.0", Accept: "application/octet-stream" },
      });
      if (!response.ok || !response.body)
        throw new Error(`Photo release download returned HTTP ${response.status}`);
      if (Number(response.headers.get("content-length") ?? 0) > release.bytes)
        throw new Error("Photo release exceeds its expected download size");
      let size = 0;
      const hash = createHash("sha256");
      const output = await open(temporary, "w");
      try {
        for await (const bytes of response.body) {
          size += bytes.length;
          if (size > release.bytes) throw new Error("Photo release exceeds its expected download size");
          hash.update(bytes);
          await output.writeFile(bytes);
        }
      } finally {
        await output.close();
      }
      if (size !== release.bytes || hash.digest("hex") !== release.sha256)
        throw new Error("Photo release checksum mismatch; refusing incomplete or changed images");
      await rename(temporary, destination);
      return;
    } catch (error) {
      await rm(temporary, { force: true });
      if (attempt === 2) throw error;
    }
  }
}

async function unpackBundle(bundle, release, files, cache) {
  const stream = createReadStream(bundle).pipe(createGunzip());
  const lines = createInterface({ input: stream, crlfDelay: Infinity });
  const seen = new Set();
  let header = false;
  try {
    for await (const line of lines) {
      if (line.length > 16_000_000) throw new Error("Photo bundle record is too large");
      const entry = JSON.parse(line);
      if (!header) {
        if (entry.type !== "time-traveler-photo-assets" || entry.schemaVersion !== 1 ||
            entry.catalogVersion !== release.catalogVersion)
          throw new Error("Photo bundle header does not match the catalog");
        header = true;
        continue;
      }
      const expected = files.get(entry.file);
      if (!expected || seen.has(entry.file) || typeof entry.data !== "string")
        throw new Error("Unexpected or duplicate photo bundle entry");
      const bytes = Buffer.from(entry.data, "base64");
      if (bytes.length !== expected.bytes ||
          createHash("sha256").update(bytes).digest("hex") !== expected.sha256)
        throw new Error(`Photo bundle asset checksum mismatch: ${entry.file}`);
      const destination = join(cache, entry.file);
      await writeFile(destination + ".tmp", bytes);
      await rename(destination + ".tmp", destination);
      seen.add(entry.file);
    }
    if (!header || seen.size !== files.size) throw new Error("Photo bundle is incomplete");
  } finally {
    lines.close();
    stream.destroy();
  }
}

/** Restore reviewed bytes on a clean CI checkout, without archive APIs or re-encoding. */
export async function prepareAssets({ root = process.cwd(), fetcher = fetch, log = console.log } = {}) {
  let records;
  try {
    records = JSON.parse(await readFile(join(root, "data/photo-library/approved.json"), "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return 0;
  }
  if (!records.length) return 0;
  const catalog = JSON.parse(await readFile(join(root, "public/library/manifest.json"), "utf8"));
  let release;
  try {
    release = JSON.parse(await readFile(join(root, "data/photo-library/assets.json"), "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    throw new Error("Photo asset release is missing. Run npm run photos:bundle and upload the bundle before deploying.");
  }
  const files = validateAssetRelease(release, records, catalog.version);
  const publicDirectory = join(root, "public/library/images");
  const cache = join(root, ".photo-library/assets");
  await mkdir(publicDirectory, { recursive: true });
  await mkdir(cache, { recursive: true });
  const pending = [];
  for (const file of files.values()) {
    if (await matches(join(publicDirectory, file.file), file)) continue;
    if (!(await matches(join(cache, file.file), file))) pending.push(file.file);
  }
  if (pending.length) {
    const bundle = join(root, ".photo-library/bundles", release.sha256 + ".jsonl.gz");
    if (!(await matches(bundle, release))) {
      log(`Restoring ${records.length} approved photographs from the verified release bundle…`);
      await downloadBundle(release, bundle, fetcher);
    }
    await unpackBundle(bundle, release, files, cache);
  }
  for (const file of files.values()) {
    const destination = join(publicDirectory, file.file);
    if (await matches(destination, file)) continue;
    const source = join(cache, file.file);
    if (!(await matches(source, file))) throw new Error(`Approved photo asset is missing or corrupt: ${file.file}`);
    await writeFile(destination + ".tmp", await readFile(source));
    await rename(destination + ".tmp", destination);
  }
  log(`Prepared and checksum-verified ${records.length} approved photo derivative sets.`);
  return records.length;
}
