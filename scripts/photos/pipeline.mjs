import {
  readFile,
  writeFile,
  mkdir,
  rename,
  copyFile,
  access,
  open,
  unlink,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import { parseArgs, promisify } from "node:util";
import { execFile } from "node:child_process";
import sharp from "sharp";
import { request } from "./http.mjs";
import {
  POLICY_VERSION,
  metadataProblems,
  reusableLicense,
  classify,
  validRecord,
  DuplicateIndex,
  plain,
} from "./policy.mjs";
import { optimize, fingerprint } from "./images.mjs";
import { screenImage } from "./screen.mjs";
import { discoverCommons } from "./adapters/commons.mjs";
import { discoverLOC } from "./adapters/loc.mjs";
import {
  discoverSmithsonian,
  discoverEuropeana,
} from "./adapters/optional.mjs";
const run = promisify(execFile);
const directory = "data/photo-library";
const recordsFile = `${directory}/records.json`;
const checkpointFile = `${directory}/checkpoint.json`;
const adapters = {
  commons: discoverCommons,
  loc: discoverLOC,
  smithsonian: discoverSmithsonian,
  europeana: discoverEuropeana,
};
const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    target: { type: "string", default: "5000" },
    source: { type: "string", default: "commons" },
    category: { type: "string" },
    from: { type: "string", default: "1900" },
    to: { type: "string", default: "2020" },
    "dry-run": { type: "boolean" },
    resume: { type: "boolean" },
    "max-candidates": { type: "string", default: "2000" },
    "max-pages": { type: "string", default: "100" },
    "max-per-creator-year": {type:"string",default:"20"},
    query: { type: "string" },
    plan: { type: "string" },
    "skip-ocr": { type: "boolean" },
    year: { type: "string" },
    ids: { type: "string" },
    reason: { type: "string" },
    reviewer: { type: "string" },
    sheet: { type: "string" },
    action: { type: "string" },
    online: { type: "boolean" },
  },
});
const action = positionals[0] ?? "stats";
// An importer and reviewer must never overwrite one another's snapshot.
const mutating =
  (["import", "publish", "screen", "restore"].includes(action) && !values["dry-run"]) ||
  (action === "review" && values.ids);
if (mutating) {
  await mkdir(".photo-library", { recursive: true });
  // The sync owns the entire discovery/review/publication transaction.
  try {
    const owner = Number(await readFile(".photo-library/sync.lock", "utf8"));
    let alive = false;
    try { process.kill(owner, 0); alive = true; } catch { /* stale sync */ }
    if (alive && !(owner === process.ppid && process.env.PHOTO_SYNC_PID === String(owner)))
      throw new Error(`Automatic photo sync ${owner} is running. Wait before modifying the catalog.`);
  } catch (error) { if (error.code !== "ENOENT") throw error; }
  const lock = ".photo-library/job.lock";
  try {
    const handle = await open(lock, "wx");
    await handle.writeFile(String(process.pid));
    await handle.close();
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    const owner = Number(await readFile(lock, "utf8"));
    let alive = true;
    try {
      process.kill(owner, 0);
    } catch {
      alive = false;
    }
    if (alive)
      throw new Error(
        `Photo job ${owner} is running. Wait for it before modifying the catalog.`,
      );
    await unlink(lock);
    const handle = await open(lock, "wx");
    await handle.writeFile(String(process.pid));
    await handle.close();
  }
}
const integer = (name) => {
  const n = Number(values[name]);
  if (!Number.isInteger(n) || n < 0) throw new Error(`Invalid --${name}`);
  return n;
};
const from = integer("from"),
  to = integer("to");
if (from < 1900 || to > 2020 || from > to)
  throw new Error("Use a capture range within 1900–2020");
await mkdir(directory, { recursive: true });
const readJSON = async (file, fallback) => {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
};
const saveJSON = async (file, data) => {
  await mkdir(file.slice(0, file.lastIndexOf("/")), { recursive: true });
  await writeFile(file + ".tmp", JSON.stringify(data, null, 2) + "\n");
  await rename(file + ".tmp", file);
};
const records = await readJSON(recordsFile, []);
const seed = await readJSON("src/data/photos.json", []);
const checkpoint = await readJSON(checkpointFile, {
  version: 1,
  jobs: {},
  failures: [],
});
const customPlan = values.plan ? await readJSON(values.plan, null) : null;
if (values.plan && (!Array.isArray(customPlan) || customPlan.length > 500 ||
    customPlan.some((q) => !q || typeof q.search !== "string" || q.search.length > 500 ||
      !Number.isInteger(q.year) || q.year < from || q.year > to)))
  throw new Error("Invalid discovery plan");
const approved = () => records.filter((p) => p.status === "approved");
const byId = new Map(records.map((p) => [p.id, p]));
const countBy = (items, key) =>
  Object.fromEntries(
    [
      ...items
        .reduce((map, p) => {
          const value =
            typeof key === "function" ? key(p) : (p[key] ?? "Unspecified");
          map.set(value, (map.get(value) ?? 0) + 1);
          return map;
        }, new Map())
        .entries(),
    ].sort(([a], [b]) => String(a).localeCompare(String(b))),
  );
function stats() {
  const accepted = approved();
  return {
    policyVersion: POLICY_VERSION,
    candidatesDiscovered: records.length,
    importedApproved: accepted.length,
    existingCurated: seed.length,
    totalPlayable: accepted.length + seed.length + records.filter((p) => p.status === "live").length,
    liveApproved: records.filter((p) => p.status === "live").length,
    rejected: records.filter((p) => p.status === "rejected").length,
    pendingReview: records.filter((p) => p.status === "review").length,
    duplicatesRemoved: records.filter(
      (p) =>
        p.reasons?.includes("visual-duplicate") ||
        p.reasons?.includes("identical-file"),
    ).length,
    byDecade: countBy(accepted, (p) => `${Math.floor(p.year / 10) * 10}s`),
    byCategory: countBy(accepted, "category"),
    bySource: countBy(accepted, "sourceName"),
    byRegion: countBy(accepted, "region"),
    reviewReasons: countBy(
      records
        .filter((p) => p.status !== "approved")
        .flatMap((p) => (p.reasons ?? []).map((reason) => ({ reason }))),
      "reason",
    ),
    failures: checkpoint.failures.slice(-30),
    sourceStatus: {
      smithsonian: process.env.SMITHSONIAN_API_KEY
        ? "key configured"
        : "optional key missing",
      europeana: process.env.EUROPEANA_API_KEY
        ? "key configured"
        : "optional key missing",
    },
  };
}
async function report() {
  const report = stats();
  await saveJSON(`${directory}/report.json`, report);
  console.log(JSON.stringify(report, null, 2));
}
async function prepareOCR() {
  if (process.platform !== "darwin") return null;
  try {
    await access(".photo-library/ocr");
    return ".photo-library/ocr";
  } catch {
    /* compile once */
  }
  try {
    await run(
      "swiftc",
      ["scripts/photos/ocr.swift", "-o", ".photo-library/ocr"],
      { timeout: 120000 },
    );
    return ".photo-library/ocr";
  } catch {
    return null;
  }
}
function queries() {
  if (customPlan) return customPlan;
  if (values.query)
    return [
      {
        search: values.query,
        year: values.year ? Number(values.year) : undefined,
      },
    ];
  const topics = values.category
    ? [values.category]
    : [
        "street",
        "market",
        "train",
        "fashion",
        "family",
        "cars",
        "music",
        "technology",
      ];
  const places = [
    "India",
    "Japan",
    "Africa",
    "Brazil",
    "London",
    "France",
    "Australia",
    "Mexico",
    "China",
    "New York",
    "Singapore",
    "Egypt",
    "Canada",
    "Netherlands",
  ];
  const years = [
    1960, 1935, 1980, 1955, 1970, 1940, 1990, 1910, 2000, 1925, 2010, 1905,
    1967, 1948, 1985, 1950, 1975, 1995, 1915, 2005, 1920, 2015, 1900, 1930,
    1945, 1958, 1965, 1978, 1988, 1998, 2008, 2018, 2020,
  ].filter((y) => y >= from && y <= to);
  const result = [];
  for (let i = 0; i < years.length; i++) {
    result.push({
      year: years[i],
      search: `Fortepan ${years[i]} ${topics[i % topics.length]} filetype:bitmap`,
    });
    result.push({
      year: years[i],
      search: `${places[i % places.length]} ${topics[i % topics.length]} intitle:${years[i]} filetype:bitmap`,
    });
    result.push({
      year: years[i],
      search: `${topics[(i + 2) % topics.length]} intitle:${years[i]} filetype:bitmap`,
    });
  }
  for (let offset = 1; offset < places.length; offset++)
    for (let i = 0; i < years.length; i++)
      result.push({
        year: years[i],
        search: `${places[(i + offset) % places.length]} ${topics[(i + offset) % topics.length]} intitle:${years[i]} filetype:bitmap`,
      });
  // Exact-dated archive collections supplement country/subject discovery.
  for (const year of years)
    for (const topic of topics.slice(0, 4))
      result.push({
        year,
        search: `Fortepan ${year} ${topic} filetype:bitmap`,
      });
  return result;
}
async function importPhotos() {
  const sources = values.source.split(",");
  if (sources.some((s) => !adapters[s]))
    throw new Error("Unknown source; use commons,loc,smithsonian,europeana");
  const target = integer("target"),
    maxCandidates = integer("max-candidates"),
    maxPages = integer("max-pages");
  const plan = queries();
  if (values["dry-run"]) {
    console.log(
      JSON.stringify(
        {
          dryRun: true,
          target,
          sources,
          from,
          to,
          queries: plan,
          networkRequests: 0,
        },
        null,
        2,
      ),
    );
    return;
  }
  const duplicates = new DuplicateIndex();
  const sha = new Map();
  for (const p of records)
    if (p.perceptualHash) {
      duplicates.add(p.id, p.perceptualHash);
      if (p.originalSha256) sha.set(p.originalSha256, p.id);
    }
  for (const p of seed)
    try {
      duplicates.add(p.id, await fingerprint(await readFile(`public${p.src}`)));
    } catch {
      /* validation reports seed problems separately */
    }
  const ocr = values["skip-ocr"] ? null : await prepareOCR();
  let processed = 0,
    pages = 0;
  for (const source of sources) {
    for (const query of plan) {
      if (
        approved().length + seed.length >= target ||
        processed >= maxCandidates ||
        pages >= maxPages
      )
        break;
      const key = createHash("sha256")
        .update(JSON.stringify({ source, query, from, to }))
        .digest("hex");
      const job = checkpoint.jobs[key] ?? {
        cursor: source === "commons" ? 0 : source === "smithsonian" ? 0 : 1,
        done: false,
        query,
        source,
      };
      if (values.resume && job.done) continue;
      if (!values.resume) {
        job.cursor = source === "commons" || source === "smithsonian" ? 0 : 1;
        job.done = false;
      }
      try {
        const batch = await adapters[source](request, query, job.cursor);
        pages++;
        // Persist each candidate before advancing the provider cursor. Re-running a
        // partially processed page is safe because source IDs are unique.
        for (const c of batch.candidates) {
          if (byId.has(c.id)) continue;
          if (processed >= maxCandidates) break;
          processed++;
          const validation = metadataProblems(c, from, to);
          const grouping=classify([c.title,c.description,...(c.categories??[])].join(" "));
          if(!validation.issues.length && records.filter((p)=>p.derivatives&&p.creator===c.creator&&p.year===validation.year&&p.category===grouping.category).length>=integer("max-per-creator-year"))validation.issues.push("collection-concentration-requires-review");
          let record = {
            ...c,
            year: validation.year,
            dateEvidence: `${c.dateField}: ${c.captureDate || "not supplied"}`,
            yearConfidence:
              validation.year && !validation.issues.some((x) => /date/.test(x))
                ? "verified"
                : "review",
            status: "review",
            reasons: validation.issues,
            discoveredAt: new Date().toISOString(),
            policyVersion: POLICY_VERSION,
          };
          if (
            validation.issues.some((x) =>
              /unsuitable|low-source|extreme-aspect/.test(x),
            )
          )
            record.status = "rejected";
          else if (!validation.issues.length) {
            try {
              const bytes = await request(c.imageUrl, {
                binary: true,
                delay: 500,
              });
              const image = await optimize(bytes);
              Object.assign(record, image);
              const identical = sha.get(image.originalSha256);
              const visuallySame = duplicates.find(image.perceptualHash);
              if (identical || visuallySame) {
                record.status = "rejected";
                record.duplicateOf = identical || visuallySame;
                record.reasons = [
                  identical ? "identical-file" : "visual-duplicate",
                ];
              } else {
                duplicates.add(c.id, image.perceptualHash);
                sha.set(image.originalSha256, c.id);
                Object.assign(
                  record,
                  classify(
                    [c.title, c.description, ...(c.categories ?? [])].join(" "),
                  ),
                );
                record.difficulty = /famous|apollo|inauguration|olympic/i.test(
                  c.title,
                )
                  ? "easy"
                  : record.year < 1920 || record.year > 2000
                    ? "medium"
                    : "hard";
                record.quality = Math.min(
                  1,
                  Math.min(image.sourceWidth, image.sourceHeight) / 1200,
                );
                record.fact =
                  c.description.length > 25 && c.description.length < 380
                    ? c.description
                    : "";
                record.reasons = ["visual-review-required"];
                const screened = await screenImage(
                  `.photo-library/assets/${image.derivatives.main}`,
                  ocr,
                );
                record.ocr = screened.ocr;
                record.reasons.push(...screened.flags);
                record.ocrVersion = 2;
              }
            } catch (error) {
              record.reasons = [`asset-validation-failed: ${error.message}`];
              if(/dimensions|blank|corrupt|unsupported|Input buffer|pixel limit|Vips/i.test(error.message))record.status="rejected";
              checkpoint.failures.push({
                source,
                id: c.id,
                message: error.message,
                at: new Date().toISOString(),
              });
            }
          }
          records.push(record);
          byId.set(record.id, record);
          await saveJSON(recordsFile, records);
          console.log(
            `${processed} ${record.id}: ${record.status} ${record.year ?? "?"} ${record.reasons.join(", ")}`,
          );
        }
        // If the cap interrupted a page, retain its cursor for the next resume.
        if (batch.candidates.every((c) => byId.has(c.id))) {
          job.done = batch.next === null;
          job.cursor = batch.next ?? job.cursor;
        }
        checkpoint.jobs[key] = job;
        await saveJSON(checkpointFile, checkpoint);
      } catch (error) {
        checkpoint.failures.push({
          source,
          query: query.search,
          message: error.message,
          at: new Date().toISOString(),
        });
        await saveJSON(checkpointFile, checkpoint);
        console.error(`${source}: ${error.message}`);
        if (
          error.status === 403 ||
          error.status === 429 ||
          error.message.includes("API_KEY") ||
          error.message.includes("Access challenges")
        )
          break;
      }
    }
  }
  await report();
}
async function validate() {
  const errors = [];
  const unique = new Set();
  const dup = new DuplicateIndex();
  for (const p of approved()) {
    if (unique.has(p.id)) errors.push(`${p.id}: duplicate ID`);
    unique.add(p.id);
    if (!validRecord(p)) errors.push(`${p.id}: invalid schema`);
    if (
      p.reasons?.length ||
      !p.visualReview?.reviewer ||
      p.visualReview.policyVersion !== POLICY_VERSION
    )
      errors.push(`${p.id}: review is incomplete`);
    const checked=metadataProblems({...p,width:p.sourceWidth,height:p.sourceHeight},from,to);
    if (p.year !== checked.year || checked.issues.length)
      errors.push(`${p.id}: year mapping mismatch`);
    const duplicate = dup.find(p.perceptualHash);
    if (duplicate) errors.push(`${p.id}: perceptual duplicate of ${duplicate}`);
    dup.add(p.id, p.perceptualHash);
    try {
      const bytes = await readFile(
        `.photo-library/assets/${p.derivatives.main}`,
      );
      if (createHash("sha256").update(bytes).digest("hex") !== p.sha256)
        errors.push(`${p.id}: asset checksum mismatch`);
      const decoded = await sharp(bytes).metadata();
      if (decoded.width !== p.width || decoded.height !== p.height)
        errors.push(`${p.id}: dimension mismatch`);
      for (const file of Object.values(p.derivatives))
        await access(`.photo-library/assets/${file}`);
      if (values.online)
        await request(p.imageUrl, { binary: true, cache: false, delay: 500 });
    } catch (error) {
      errors.push(`${p.id}: ${error.message}`);
    }
  }
  if (errors.length) throw new Error(errors.join("\n"));
  console.log(
    `Validated ${approved().length} imported approvals and their derivatives. ${seed.length} curated records retained.`,
  );
}
async function publish() {
  await validate();
  const accepted = approved();
  const license = (p) => reusableLicense(p.license, p.licenseUrl);
  const photos = accepted.map((p) => ({
    id: p.id,
    src: `/library/images/${p.derivatives.main}`,
    srcSet: p.width > 800
      ? `/library/images/${p.derivatives.mobile} 800w, /library/images/${p.derivatives.main} ${p.width}w`
      : `/library/images/${p.derivatives.main} ${p.width}w`,
    thumbnailSrc: `/library/images/${p.derivatives.thumb}`,
    year: p.year,
    title: p.title,
    fact: p.fact ?? "",
    sourceUrl: p.sourceUrl,
    sourceName: p.sourceName,
    creator: p.creator,
    license: license(p).name,
    licenseUrl: license(p).url,
    category: p.category,
    region: p.region,
    location: p.region,
    difficulty: p.difficulty,
    quality: p.quality,
    width: p.width,
    height: p.height,
    dateEvidence: p.dateEvidence,
    yearConfidence: "verified",
    modifications: p.modifications,
  }));
  const version = createHash("sha256")
    .update(JSON.stringify(photos))
    .digest("hex")
    .slice(0, 16);
  const release = `public/library/releases/${version}`;
  await mkdir(release, { recursive: true });
  await mkdir("public/library/images", { recursive: true });
  const entries = [];
  for (let offset = 0; offset < photos.length; offset += 25) {
    const chunk = photos.slice(offset, offset + 25);
    const path = `/library/releases/${version}/${offset / 25}.json`;
    await saveJSON(`public${path}`, chunk);
    for (const p of chunk)
      entries.push([
        p.id,
        p.year,
        p.category,
        p.region,
        p.difficulty,
        p.quality,
        path,
      ]);
  }
  for (const p of accepted)
    for (const file of Object.values(p.derivatives))
      await copyFile(
        `.photo-library/assets/${file}`,
        `public/library/images/${file}`,
      );
  // The manifest is replaced last; readers never see a partially published release.
  await saveJSON("public/library/manifest.json", {
    version,
    schemaVersion: 1,
    imported: photos.length,
    curated: seed.length,
    total: photos.length + seed.length,
    fields: [
      "id",
      "year",
      "category",
      "region",
      "difficulty",
      "quality",
      "chunk",
    ],
    entries,
  });
  await saveJSON(`${directory}/approved.json`, accepted);
  await report();
  console.log(
    `Published ${photos.length} imported photographs (${photos.length + seed.length} total playable).`,
  );
}
async function review() {
  if (values.ids) {
    if (!values.reviewer || !["approve", "reject"].includes(values.action))
      throw new Error("Review requires --reviewer and --action approve|reject");
    for (const id of values.ids.split(",")) {
      const p = byId.get(id);
      if (!p) throw new Error(`Unknown ID: ${id}`);
      if (values.action === "approve") {
        if (
          !validRecord(p) ||
          !p.derivatives ||
          p.yearConfidence !== "verified" ||
          p.reasons.some(
            (r) =>
              ![
                "visual-review-required",
                "ocr-visible-year",
                "ocr-watermark-or-copyright",
                "ocr-text-heavy",
                "ocr-unavailable",
              ].includes(r),
          )
        )
          throw new Error(
            `${id} cannot be approved until metadata, rights, file and date checks pass`,
          );
        if (
          p.reasons.some((r) => r !== "visual-review-required") &&
          !values.reason
        )
          throw new Error(
            `${id} requires an explicit explanation resolving OCR flags`,
          );
        p.status = "approved";
        p.reasons = [];
      } else {
        p.status = "rejected";
        p.reasons = [values.reason || "visual-review-rejected"];
      }
      p.visualReview = {
        reviewer: values.reviewer,
        at: new Date().toISOString(),
        policyVersion: POLICY_VERSION,
        notes:
          values.reason ||
          "Inspected full derivative for photograph quality, watermarks, revealing dates, suitability, and visual duplication.",
      };
    }
    await saveJSON(recordsFile, records);
    await report();
    return;
  }
  const candidates = records.filter(
    (p) =>
      p.status === "review" &&
      p.derivatives &&
      p.reasons?.includes("visual-review-required"),
  );
  const number = Number(values.sheet ?? 0);
  const selected = candidates.slice(number * 20, number * 20 + 20);
  if (!selected.length) {
    console.log(
      `No sheet ${number}; ${candidates.length} assets await visual review.`,
    );
    return;
  }
  const tiles = [];
  for (let i = 0; i < selected.length; i++) {
    const p = selected[i];
    const image = await sharp(`.photo-library/assets/${p.derivatives.main}`)
      .resize(300, 210, { fit: "inside" })
      .toBuffer();
    const caption = Buffer.from(
      `<svg width="320" height="65"><rect width="320" height="65" fill="#ffffff"/><text x="8" y="17" font-family="Arial" font-size="12">${i + 1}. ${p.id} · ${p.year}</text><text x="8" y="34" font-family="Arial" font-size="11">${plain(p.title).slice(0, 46).replace(/[<>&]/g, "")}</text><text x="8" y="51" font-family="Arial" font-size="10">${p.reasons.join(" / ").slice(0, 62)}</text></svg>`,
    );
    const meta = await sharp(image).metadata();
    const tile = await sharp({
      create: { width: 320, height: 280, channels: 3, background: "#dedede" },
    })
      .composite([
        { input: image, left: Math.floor((320 - meta.width) / 2), top: 0 },
        { input: caption, left: 0, top: 215 },
      ])
      .png()
      .toBuffer();
    tiles.push({
      input: tile,
      left: (i % 4) * 320,
      top: Math.floor(i / 4) * 280,
    });
  }
  await mkdir(".photo-library/review", { recursive: true });
  const file = `.photo-library/review/sheet-${number}.jpg`;
  await sharp({
    create: {
      width: 1280,
      height: Math.ceil(selected.length / 4) * 280,
      channels: 3,
      background: "white",
    },
  })
    .composite(tiles)
    .jpeg({ quality: 90 })
    .toFile(file);
  await saveJSON(
    `.photo-library/review/sheet-${number}.json`,
    selected.map((p) => ({
      id: p.id,
      title: p.title,
      year: p.year,
      dateEvidence: p.dateEvidence,
      sourceUrl: p.sourceUrl,
      license: p.license,
      licenseUrl: p.licenseUrl,
      creator: p.creator,
      reasons: p.reasons,
      path: `.photo-library/assets/${p.derivatives.main}`,
    })),
  );
  console.log(file);
  console.log(selected.map((p) => p.id).join(","));
}
try {
  if (action === "import") await importPhotos();
  else if (action === "validate") await validate();
  else if (action === "publish") await publish();
  else if (action === "review") await review();
  else if (action === "stats") await report();
  else if (action === "screen") {
    const command = await prepareOCR();
    for (const p of records.filter(
      (p) =>
        p.status === "review" &&
        p.derivatives &&
        p.reasons.includes("visual-review-required"),
    )) {
      const screened = await screenImage(
        `.photo-library/assets/${p.derivatives.main}`,
        command,
      );
      p.ocr = screened.ocr;
      p.reasons = ["visual-review-required", ...screened.flags];
      p.ocrVersion = 2;
    }
    await saveJSON(recordsFile, records);
    await report();
  } else if (action === "restore") {
    for (const p of approved()) {
      try {
        for (const file of Object.values(p.derivatives))
          await access(`.photo-library/assets/${file}`);
      } catch {
        const result = await optimize(
          await request(p.imageUrl, { binary: true }),
        );
        if (result.sha256 !== p.sha256)
          throw new Error(
            `${p.id}: provider image changed; re-review required`,
          );
      }
    }
    console.log("Approved derivatives restored from source; checksums match.");
  } else
    throw new Error(
      "Use import, validate, stats, review, screen, restore or publish",
    );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  if (mutating)
    try {
      await unlink(".photo-library/job.lock");
    } catch {
      /* already removed */
    }
}
