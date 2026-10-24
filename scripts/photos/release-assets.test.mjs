import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { prepareAssets, validateAssetRelease } from "./release-assets.mjs";

const hash = (b) => createHash("sha256").update(b).digest("hex");
async function fixture(t, alter = (lines) => lines) {
  const root = await mkdtemp(join(tmpdir(), "time-traveler-assets-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const main = Buffer.from("reviewed main image");
  const digest = hash(main);
  const payloads = new Map([
    [digest + ".webp", main],
    [digest + "-800.webp", Buffer.from("reviewed mobile image")],
    [digest + "-320.webp", Buffer.from("reviewed thumbnail")],
  ]);
  const record = { id: "approved-test", sha256: digest, derivatives: {
    main: digest + ".webp", mobile: digest + "-800.webp", thumb: digest + "-320.webp",
  } };
  const version = "abcdef0123456789";
  const lines = [{ type: "time-traveler-photo-assets", schemaVersion: 1, catalogVersion: version },
    ...[...payloads].map(([file, bytes]) => ({ file, data: bytes.toString("base64") }))];
  const bundle = gzipSync(alter(lines).map((line) => JSON.stringify(line)).join("\n") + "\n");
  const release = { schemaVersion: 1, catalogVersion: version, url: "https://example.org/assets.jsonl.gz",
    sha256: hash(bundle), bytes: bundle.length,
    files: [...payloads].map(([file, bytes]) => ({ file, sha256: hash(bytes), bytes: bytes.length })),
  };
  await mkdir(join(root, "data/photo-library"), { recursive: true });
  await mkdir(join(root, "public/library"), { recursive: true });
  await writeFile(join(root, "data/photo-library/approved.json"), JSON.stringify([record]));
  await writeFile(join(root, "data/photo-library/assets.json"), JSON.stringify(release));
  await writeFile(join(root, "public/library/manifest.json"), JSON.stringify({ version }));
  return { root, bundle, release, record, version, payloads };
}

test("clean CI restores every derivative, verifies bytes and reuses public files offline", async (t) => {
  const f = await fixture(t);
  let requests = 0;
  const options = { root: f.root, log: () => {}, fetcher: async () => {
    requests++;
    return new Response(f.bundle);
  } };
  assert.equal(await prepareAssets(options), 1);
  for (const [file, bytes] of f.payloads)
    assert.deepEqual(await readFile(join(f.root, "public/library/images", file)), bytes);
  assert.equal(requests, 1);
  await prepareAssets({ ...options, fetcher: () => { throw new Error("Unexpected network request"); } });
  await rm(join(f.root, "public/library/images"), { recursive: true });
  await prepareAssets(options);
  assert.equal(requests, 1, "individual cached derivatives should work offline");
  await rm(join(f.root, "public/library/images"), { recursive: true });
  await rm(join(f.root, ".photo-library/assets"), { recursive: true });
  await prepareAssets(options);
  assert.equal(requests, 1, "cached release bundle should work offline");
});

test("corrupt or truncated downloads cannot publish incomplete images", async (t) => {
  const f = await fixture(t);
  await assert.rejects(prepareAssets({ root: f.root, log: () => {},
    fetcher: async () => new Response(f.bundle.subarray(0, 10)),
  }), /checksum mismatch/);
  await assert.rejects(readFile(join(f.root, "public/library/images", f.record.derivatives.main)), /ENOENT/);
  await assert.rejects(prepareAssets({ root: f.root, log: () => {},
    fetcher: async () => new Response("not found", { status: 404 }),
  }), /HTTP 404/);
});

test("bundle records require every approved file, matching checksums and safe filenames", async (t) => {
  const missing = await fixture(t, (lines) => lines.slice(0, -1));
  await assert.rejects(prepareAssets({ root: missing.root, log: () => {},
    fetcher: async () => new Response(missing.bundle),
  }), /incomplete/);
  const corrupt = await fixture(t, (lines) => lines.map((line, i) => i === 1 ? { ...line, data: "Y29ycnVwdA==" } : line));
  await assert.rejects(prepareAssets({ root: corrupt.root, log: () => {},
    fetcher: async () => new Response(corrupt.bundle),
  }), /asset checksum mismatch/);
  for (const release of [
    { ...missing.release, catalogVersion: "old" },
    { ...missing.release, files: [] },
    { ...missing.release, url: "http://example.org/assets" },
    { ...missing.release, files: [{ ...missing.release.files[0], file: "../escape.webp" }] },
  ]) assert.throws(() => validateAssetRelease(release, [missing.record], missing.version));
});

test("a corrupt existing public asset is repaired from verified local cache", async (t) => {
  const f = await fixture(t);
  const options = { root: f.root, log: () => {}, fetcher: async () => new Response(f.bundle) };
  await prepareAssets(options);
  const path = join(f.root, "public/library/images", f.record.derivatives.main);
  await writeFile(path, "corrupt");
  await prepareAssets({ ...options, fetcher: () => { throw new Error("Unexpected network request"); } });
  assert.deepEqual(await readFile(path), f.payloads.get(f.record.derivatives.main));
});
