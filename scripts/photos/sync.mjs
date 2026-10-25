import { readFile, mkdir, open, unlink, access } from "node:fs/promises";
import { spawn } from "node:child_process";
import { parseArgs } from "node:util";
import { discoveryPlan, autoAccept, automationProblems, AUTO_POLICY } from "./automation.mjs";
import { automaticOcrEngine, screenAutomatically } from "./screen.mjs";
import { publishLiveBatch, saveJSON } from "./live-publish.mjs";
import { request } from "./http.mjs";
import { optimize } from "./images.mjs";
const { values } = parseArgs({ options: {
  "dry-run": { type: "boolean" },
  "max-new": { type: "string", default: "40" },
  "max-candidates": { type: "string", default: "400" },
  "max-pages": { type: "string", default: "12" },
} });
const bounded = (key, max) => {
  const value = Number(values[key]);
  if (!Number.isInteger(value) || value < 1 || value > max) throw new Error(`Invalid --${key} (1–${max})`);
  return value;
};
const maxNew = bounded("max-new", 100);
bounded("max-candidates", 2000);
bounded("max-pages", 50);
const readJSON = async (file, fallback) => {
  try { return JSON.parse(await readFile(file, "utf8")); }
  catch (e) { if (e.code === "ENOENT") return fallback; throw e; }
};
const stateFile = "data/photo-library/automation.json";
const state = await readJSON(stateFile, { sequence: 0 });
const recordsFile = "data/photo-library/records.json";
const records = await readJSON(recordsFile, []);
const seed = await readJSON("src/data/photos.json", []);
const bank = [...seed, ...records.filter((p) => ["approved", "live"].includes(p.status))];
const plan = discoveryPlan(bank, state.sequence);
if (values["dry-run"]) {
  console.log(JSON.stringify({ dryRun: true, policy: AUTO_POLICY, maxNew,
    pages: Number(values["max-pages"]), networkRequests: 0, queries: plan }, null, 2));
  process.exit(0);
}

await mkdir(".photo-library", { recursive: true });
const lockFile = ".photo-library/sync.lock";
try {
  const lock = await open(lockFile, "wx");
  await lock.writeFile(String(process.pid));
  await lock.close();
} catch (error) {
  if (error.code !== "EEXIST") throw error;
  const pid = Number(await readFile(lockFile, "utf8"));
  let alive = true;
  try { process.kill(pid, 0); } catch { alive = false; }
  if (alive) throw new Error(`Photo sync ${pid} is already running`);
  await unlink(lockFile);
  const lock = await open(lockFile, "wx");
  await lock.writeFile(String(process.pid));
  await lock.close();
}
const startedAt = new Date().toISOString();
let result;
try {
  // Fail before discovery if the required OCR engine is unavailable.
  const engine = await automaticOcrEngine();
  await saveJSON(".photo-library/discovery-plan.json", plan);
  const beforeFailures = (await readJSON("data/photo-library/checkpoint.json", { failures: [] })).failures.length;
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["scripts/photos/pipeline.mjs", "import", "--source", "commons",
      "--plan", ".photo-library/discovery-plan.json", "--resume", "--skip-ocr", "--target", "100000",
      "--max-candidates", values["max-candidates"], "--max-pages", values["max-pages"],
      "--max-per-creator-year", "8"], { stdio: "inherit",
        env: { ...process.env, PHOTO_SYNC_PID: String(process.pid) } });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`Import failed (${code})`)));
  });
  const updated = await readJSON(recordsFile, []);
  const candidates = updated.filter((p) => p.status === "review" && p.derivatives &&
    (p.automaticScreen?.policy !== AUTO_POLICY || p.automaticScreen?.retryable) && automationProblems(p).length === 0);
  const counts = new Map();
  for (const p of bank) counts.set(p.year, (counts.get(p.year) ?? 0) + 1);
  const accepted = [];
  const held = {};
  let checked = 0;
  // Re-sort as approvals arrive so a single plentiful year cannot fill a batch.
  while (candidates.length && accepted.length < maxNew && checked < maxNew * 4) {
    candidates.sort((a, b) => (counts.get(a.year) ?? 0) - (counts.get(b.year) ?? 0) || a.id.localeCompare(b.id));
    const p = candidates.shift();
    let decision;
    try {
      try {
        for (const file of Object.values(p.derivatives)) await access(`.photo-library/assets/${file}`);
      } catch {
        // Actions caches can be evicted. Recreate only the exact imported pixels.
        const restored = await optimize(await request(p.imageUrl, { binary: true }));
        if (restored.sha256 !== p.sha256) throw new Error("Source or encoder changed; renewed review required");
      }
      decision = await autoAccept(p, (path) => screenAutomatically(path, engine));
    } catch (error) {
      decision = { accepted: false, reasons: [`automatic-screen-failed: ${error.message}`] };
    }
    checked++;
    if (decision.accepted) {
      Object.assign(p, decision.record);
      accepted.push(p);
      counts.set(p.year, (counts.get(p.year) ?? 0) + 1);
      console.log(`Accepted ${p.id} (${p.year}) by ${AUTO_POLICY}`);
    } else {
      p.automaticScreen = { policy: AUTO_POLICY, at: new Date().toISOString(), reasons: decision.reasons,
        retryable: decision.reasons.some((r) => r === "ocr-unavailable" || r.startsWith("automatic-screen-failed:")) };
      for (const reason of decision.reasons) held[reason] = (held[reason] ?? 0) + 1;
      console.log(`Held ${p.id}: ${decision.reasons.join(", ")}`);
    }
  }
  if (accepted.length) result = await publishLiveBatch(updated, accepted);
  else await saveJSON(recordsFile, updated);
  const failures = (await readJSON("data/photo-library/checkpoint.json", { failures: [] })).failures.slice(beforeFailures);
  result = { ...result, added: result?.added ?? 0, checked, held,
    liveTotal: updated.filter((p) => p.status === "live").length,
    playableTotal: seed.length + updated.filter((p) => ["approved", "live"].includes(p.status)).length,
    discovered: updated.length - records.length, providerFailures: failures.slice(-5) };
  const report = await readJSON("data/photo-library/report.json", {});
  await saveJSON("data/photo-library/report.json", { ...report, totalPlayable: result.playableTotal,
    liveApproved: result.liveTotal, pendingReview: updated.filter((p) => p.status === "review").length });
  await saveJSON(stateFile, { sequence: state.sequence + 1, policy: AUTO_POLICY,
    startedAt, completedAt: new Date().toISOString(), ...result });
  console.log(JSON.stringify(result, null, 2));
  if (!result.discovered && !result.checked && failures.length)
    throw new Error("Wikimedia discovery failed; the last published catalog remains available");
} finally {
  await unlink(lockFile);
}
