import { createWriteStream } from "node:fs";
import { readFile, writeFile, mkdir, rename, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { parseArgs } from "node:util";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";
import { checksum, validateAssetRelease } from "./release-assets.mjs";

const { values } = parseArgs({ options: { url: { type: "string" } } });
if (!values.url) throw new Error("Supply --url with the public, versioned release asset URL");
const records = JSON.parse(await readFile("data/photo-library/approved.json", "utf8"));
const catalog = JSON.parse(await readFile("public/library/manifest.json", "utf8"));
const filename = `photo-assets-${catalog.version}.jsonl.gz`;
const output = `.photo-library/releases/${filename}`;
await mkdir(".photo-library/releases", { recursive: true });
const files = [];
const credits = records.map((p) => ({
  id: p.id, title: p.title, creator: p.creator, sourceUrl: p.sourceUrl,
  license: p.license, licenseUrl: p.licenseUrl, modifications: p.modifications,
  derivatives: p.derivatives,
}));
async function* entries() {
  yield JSON.stringify({ type: "time-traveler-photo-assets", schemaVersion: 1,
    catalogVersion: catalog.version, credits }) + "\n";
  const seen = new Set();
  for (const p of records) for (const file of Object.values(p.derivatives)) {
    if (seen.has(file)) continue;
    seen.add(file);
    let bytes;
    try { bytes = await readFile(`public/library/images/${file}`); }
    catch (error) {
      if (error.code !== "ENOENT") throw error;
      bytes = await readFile(`.photo-library/assets/${file}`);
    }
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    if (file === p.derivatives.main && sha256 !== p.sha256)
      throw new Error(`Approved main image changed: ${p.id}`);
    files.push({ file, bytes: bytes.length, sha256 });
    yield JSON.stringify({ file, data: bytes.toString("base64") }) + "\n";
  }
}
await pipeline(Readable.from(entries()), createGzip({ level: 6 }), createWriteStream(output + ".tmp"));
await rename(output + ".tmp", output);
const release = { schemaVersion: 1, catalogVersion: catalog.version, url: values.url,
  bytes: (await stat(output)).size, sha256: await checksum(output), files };
validateAssetRelease(release, records, catalog.version);
await writeFile("data/photo-library/assets.json", JSON.stringify(release, null, 2) + "\n");
console.log(`Created ${output}: ${records.length} photographs, ${files.length} files, ${release.bytes} bytes.`);
console.log(`Upload it to ${release.url} before pushing the updated descriptor.`);
