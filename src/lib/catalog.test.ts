import test from "node:test";
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { readFile } from "node:fs/promises";
import { openCatalog, parseManifest, LIVE_MANIFEST_URL, LIVE_CATALOG_BASE } from "./catalog.ts";
import { selectPhotos, beginTrip, EMPTY_PROGRESS, type Photo } from "./game.ts";
const chunk = "/library/releases/abcdef0123456789/0.json";
const row = ["commons-1", 1967, "Street life", "India", "medium", 0.9, chunk];
const photo: Photo = {
  id: "commons-1",
  year: 1967,
  title: "A real street",
  fact: "",
  src: `/library/images/${"a".repeat(64)}.webp`,
  width: 1400,
  height: 1000,
  creator: "Creator",
  license: "CC BY 4.0",
  sourceUrl: "https://commons.wikimedia.org/wiki/File:Photo.jpg",
  category: "Street life",
  dateEvidence: "DateTimeOriginal: 1967",
  yearConfidence: "verified",
};
test("published archive chunks match every real catalog year and asset", async () => {
  const catalog = await openCatalog([], async (url) =>
    new Response(await readFile(`public${url}`, "utf8")),
  );
  assert.equal(catalog.available, true);
  assert.ok(catalog.total >= 200);
  for (let offset = 0; offset < catalog.total; offset += 200) {
    const selected = catalog.entries.slice(offset, offset + 200);
    const photos = await catalog.load(selected.map((p) => p.id));
    for (const p of photos) {
      assert.equal(p.year, selected.find((e) => e.id === p.id)!.year);
      assert.ok((await readFile(`public${p.src}`)).length > 1000);
      assert.ok(p.licenseUrl && p.dateEvidence && p.modifications);
    }
  }
});
test("the real archive supports twelve distinct decades in every Grand Tour and five in Classic", async () => {
  const seed = JSON.parse(await readFile("src/data/photos.json", "utf8")) as Photo[];
  const catalog = await openCatalog(seed, async (url) =>
    new Response(await readFile(`public${url}`, "utf8")),
  );
  for (const bank of [seed, catalog.entries]) {
    let recent: string[] = [];
    for (let trip = 0; trip < 30; trip++) {
      for (const count of [5, 12]) {
        const ids = selectPhotos(bank, recent, Math.random, count);
        assert.equal(ids.length, count);
        assert.equal(new Set(ids.map((id) => Math.floor(bank.find((p) => p.id === id)!.year / 10))).size, count);
        recent = [...recent, ...ids].slice(-250);
      }
    }
  }
});
test("catalog rows reject malformed data, duplicate IDs, external chunks and unverified years", () => {
  assert.equal(parseManifest({ schemaVersion: 1, entries: [row] }).length, 1);
  for (const entries of [
    [row, row],
    [[...row.slice(0, 6), "https://evil.example/chunk.json"]],
    [["x", 2050, ...row.slice(2)]],
    [null],
  ])
    assert.throws(() => parseManifest({ schemaVersion: 1, entries }));
});
test("selected metadata chunks load once; year mapping and missing records are checked", async () => {
  const calls: string[] = [];
  const fetcher = async (url: string) => {
    calls.push(url);
    return new Response(
      JSON.stringify(
        url.includes("manifest")
          ? { schemaVersion: 1, entries: [row] }
          : [photo],
      ),
    );
  };
  const catalog = await openCatalog([], fetcher, { live: false });
  assert.equal(calls.length, 1);
  assert.equal((await catalog.load([photo.id]))[0].year, 1967);
  await catalog.load([photo.id]);
  assert.equal(calls.length, 2);
  await assert.rejects(catalog.load(["missing"]));
  const broken = await openCatalog(
    [],
    async (url) =>
      new Response(
        JSON.stringify(
          url.includes("manifest")
            ? { schemaVersion: 1, entries: [row] }
            : [{ ...photo, year: 1968 }],
        ),
      ),
  );
  await assert.rejects(broken.load([photo.id]), /did not match/);
});
test("missing manifest falls back to curated data; a failed chunk can retry", async () => {
  const seed = { ...photo, id: "seed" };
  const fallback = await openCatalog(
    [seed],
    async () => new Response("missing", { status: 404 }),
  );
  assert.equal((await fallback.load(["seed"]))[0], seed);
  let attempts = 0;
  const catalog = await openCatalog([], async (url) => {
    if (url.includes("manifest"))
      return new Response(JSON.stringify({ schemaVersion: 1, entries: [row] }));
    attempts++;
    return attempts === 1
      ? new Response("missing", { status: 503 })
      : new Response(JSON.stringify([photo]));
  });
  await assert.rejects(catalog.load([photo.id]));
  assert.equal((await catalog.load([photo.id]))[0].id, photo.id);
});
test("5000-record selections stay varied, avoid recent IDs and sample beyond the first page", () => {
  const categories = [
    "Street life",
    "Fashion",
    "Transport",
    "Technology",
    "Events",
    "Everyday life",
    "Architecture",
  ];
  const regions = [
    "India",
    "East Asia",
    "Africa",
    "Europe",
    "North America",
    "Latin America",
  ];
  const bank = Array.from({ length: 5000 }, (_, i) => ({
    ...photo,
    id: `image-${i}`,
    year: 1900 + (i % 121),
    category: categories[i % categories.length],
    region: regions[i % regions.length],
    difficulty: (["easy", "medium", "hard"] as const)[i % 3],
  }));
  const recent = bank.slice(0, 250).map((p) => p.id);
  const started = performance.now();
  const sampled = new Set<string>();
  for (let game = 0; game < 100; game++) {
    const ids = selectPhotos(bank, recent);
    assert.equal(new Set(ids).size, 5);
    assert.ok(ids.every((id) => !recent.includes(id)));
    ids.forEach((id) => sampled.add(id));
    const selected = ids.map((id) => bank.find((p) => p.id === id)!);
    assert.ok(new Set(selected.map((p) => p.category)).size > 1);
  }
  assert.ok(sampled.size > 300);
  assert.ok([...sampled].some((id) => Number(id.split("-")[1]) > 4500));
  assert.ok(
    performance.now() - started < 6000,
    "100 games should finish well below six seconds",
  );
  const trip = beginTrip(
    { ...EMPTY_PROGRESS, best: 4000, played: 10, recent },
    bank.slice(300, 305),
    bank.length,
  );
  assert.equal(trip.best, 4000);
  assert.equal(trip.recent.length, 250);
});

const liveChunk = "/library/live/releases/abcdef0123456789/0.json";
const remoteMain = `https://github.com/khushalx/time-traveler/releases/download/photo-live-abcdef0123456789/${"b".repeat(64)}.webp`;
const remotePhoto: Photo = { ...photo, id: "commons-2", year: 2018, src: remoteMain,
  thumbnailSrc: remoteMain.replace(".webp", "-320.webp"),
  srcSet: `${remoteMain.replace(".webp", "-800.webp")} 800w, ${remoteMain} 1400w` };
const liveRow = [remotePhoto.id, remotePhoto.year, "Street life", "India", "medium", 0.9, liveChunk];
test("live index merges with the offline archive and fetches only selected chunks once", async () => {
  const calls: string[] = [];
  const catalog = await openCatalog([], async url => {
    calls.push(url);
    const value = url === LIVE_MANIFEST_URL ? {schemaVersion: 1, entries: [liveRow]} :
      url === "/library/manifest.json" ? {schemaVersion: 1, entries: [row]} :
      url === LIVE_CATALOG_BASE + liveChunk ? [remotePhoto] : [photo];
    return new Response(JSON.stringify(value));
  });
  assert.equal(catalog.total, 2);
  assert.equal(calls.length, 2);
  assert.equal((await catalog.load([remotePhoto.id]))[0].src, remoteMain);
  await catalog.load([remotePhoto.id]);
  assert.equal(calls.length, 3);
  assert.ok(!calls.includes(chunk));
});
test("live outages preserve local play and malicious photo URLs never load", async () => {
  const local = await openCatalog([], async url => url === LIVE_MANIFEST_URL ? new Response("offline", {status: 503}) :
    new Response(JSON.stringify(url.includes("manifest") ? {schemaVersion: 1, entries: [row]} : [photo])));
  assert.equal(local.total, 1);
  assert.equal((await local.load([photo.id]))[0].year, 1967);
  for (const patch of [{src: "https://evil.example/image.webp"}, {year: 2017}, {thumbnailSrc: "https://evil.example/thumb.webp"}]) {
    const catalog = await openCatalog([], async url => url === "/library/manifest.json" ? new Response("missing", {status: 404}) :
      new Response(JSON.stringify(url === LIVE_MANIFEST_URL ? {schemaVersion: 1, entries: [liveRow]} : [{...remotePhoto, ...patch}])));
    await assert.rejects(catalog.load([remotePhoto.id]), /did not match/);
  }
});
test("seed and local IDs take precedence over overlapping live records", async () => {
  const overlapping = {...remotePhoto, id: photo.id, year: photo.year};
  const catalog = await openCatalog([photo], async url => url === "/library/manifest.json" ? new Response("missing", {status: 404}) :
    new Response(JSON.stringify(url === LIVE_MANIFEST_URL ? {schemaVersion: 1, entries: [liveRow, [photo.id, photo.year, ...liveRow.slice(2)]]} : [remotePhoto, overlapping])));
  assert.equal(catalog.total, 2);
  assert.equal((await catalog.load([remotePhoto.id]))[0].id, remotePhoto.id);
  assert.equal((await catalog.load([photo.id]))[0].src, photo.src);
});
