import type { Photo, PhotoChoice } from "./game";
export type CatalogEntry = PhotoChoice & { year: number; chunk?: string };
type IndexRow = [
  string,
  number,
  string,
  string,
  "easy" | "medium" | "hard",
  number,
  string,
];
type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;
export const LIVE_CATALOG_BASE = "https://raw.githubusercontent.com/khushalx/time-traveler/main/public";
export const LIVE_MANIFEST_URL = `${LIVE_CATALOG_BASE}/library/live/manifest.json`;
const LIVE_IMAGE = /^https:\/\/github\.com\/khushalx\/time-traveler\/releases\/download\/photo-live-[a-f0-9]{16}\/[a-f0-9]{64}\.webp$/;
export type PhotoCatalog = {
  entries: CatalogEntry[];
  total: number;
  available: boolean;
  load: (ids: string[]) => Promise<Photo[]>;
};

export function parseManifest(value: unknown, live = false): CatalogEntry[] {
  if (!value || typeof value !== "object")
    throw new Error("Invalid catalog manifest");
  const manifest = value as { schemaVersion?: number; entries?: unknown[] };
  if (
    manifest.schemaVersion !== 1 ||
    !Array.isArray(manifest.entries) ||
    manifest.entries.length > 100000
  )
    throw new Error("Unsupported catalog manifest");
  const seen = new Set<string>();
  return manifest.entries.map((raw) => {
    if (!Array.isArray(raw) || raw.length !== 7)
      throw new Error("Invalid catalog row");
    const [id, year, category, region, difficulty, quality, chunk] =
      raw as IndexRow;
    if (
      typeof id !== "string" ||
      !id ||
      (live && !/^commons-\d+$/.test(id)) ||
      seen.has(id) ||
      !Number.isInteger(year) ||
      year < 1900 ||
      year > 2020 ||
      typeof category !== "string" ||
      typeof region !== "string" ||
      !["easy", "medium", "hard"].includes(difficulty) ||
      !Number.isFinite(quality) ||
      quality < 0 ||
      quality > 1 ||
      typeof chunk !== "string" ||
      !(live ? /^\/library\/live\/releases\/[a-f0-9]{16}\/\d+\.json$/ :
        /^\/library\/releases\/[a-f0-9]{16}\/\d+\.json$/).test(chunk)
    )
      throw new Error("Invalid catalog metadata");
    seen.add(id);
    return { id, year, category, region, difficulty, quality,
      chunk: live ? LIVE_CATALOG_BASE + chunk : chunk };
  });
}
function validPhoto(p: Photo, entry: CatalogEntry) {
  const live = entry.chunk?.startsWith(LIVE_CATALOG_BASE + "/library/live/");
  const main = p?.src;
  if (live && (typeof main !== "string" || !LIVE_IMAGE.test(main) ||
      p.thumbnailSrc !== main.replace(/\.webp$/, "-320.webp") ||
      p.srcSet !== (p.width > 800
        ? `${main.replace(/\.webp$/, "-800.webp")} 800w, ${main} ${p.width}w`
        : `${main} ${p.width}w`) ||
      !/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/.test(p.sourceUrl))) return false;
  return (
    p &&
    p.id === entry.id &&
    p.year === entry.year &&
    typeof p.title === "string" &&
    typeof p.fact === "string" &&
    typeof p.creator === "string" &&
    typeof p.license === "string" &&
    typeof p.sourceUrl === "string" &&
    /^https:\/\//.test(p.sourceUrl) &&
    typeof p.src === "string" &&
    (live ? LIVE_IMAGE.test(p.src) : /^\/library\/images\/[a-f0-9]{64}\.webp$/.test(p.src)) &&
    Number.isInteger(p.width) &&
    Number.isInteger(p.height) &&
    p.width >= 500 &&
    p.height >= 450 &&
    p.yearConfidence === "verified" &&
    !!p.dateEvidence
  );
}
/** Only the compact index is fetched up front; selected 25-record chunks are cached. */
export async function openCatalog(
  seed: Photo[],
  fetcher: Fetcher = fetch,
  { live = true } = {},
): Promise<PhotoCatalog> {
  let imported: CatalogEntry[] = [];
  let available = false;
  const sources = await Promise.all([
    { url: "/library/manifest.json", live: false },
    ...(live ? [{ url: LIVE_MANIFEST_URL, live: true }] : []),
  ].map(async (source) => {
    try {
      const response = await fetcher(source.url, {
      cache: "no-cache",
      signal: AbortSignal.timeout(source.live ? 4000 : 8000),
      });
      if (!response.ok) return null;
      return parseManifest(await response.json(), source.live);
    } catch { return null; /* A failed live refresh never removes the offline archive. */ }
  }));
  available = sources.some((entries) => entries !== null);
  imported = sources.flatMap((entries) => entries ?? []);
  const seenIds = new Set(seed.map((p) => p.id));
  const entries: CatalogEntry[] = [
    ...seed,
    ...imported.filter((p) => {
      if (seenIds.has(p.id)) return false;
      seenIds.add(p.id);
      return true;
    }),
  ];
  const index = new Map(entries.map((p) => [p.id, p]));
  const cache = new Map(seed.map((p) => [p.id, p]));
  const requests = new Map<string, Promise<void>>();
  async function loadChunk(path: string) {
    if (!requests.has(path))
      requests.set(
        path,
        (async () => {
          const response = await fetcher(path, {
            cache: "force-cache",
            signal: AbortSignal.timeout(8000),
          });
          if (!response.ok)
            throw new Error("Photo metadata is temporarily unavailable");
          const data = await response.json();
          if (!Array.isArray(data) || data.length > 25)
            throw new Error("Invalid photo chunk");
          const owned: Photo[] = [];
          for (const p of data as Photo[]) {
            if (!p || typeof p.id !== "string") throw new Error("Invalid photo record");
            const entry = index.get(p.id);
            // An overlapping seed/local ID takes precedence over a live copy.
            if (entry && entry.chunk !== path) continue;
            if (!entry || !validPhoto(p, entry))
              throw new Error("Photo metadata did not match the index");
            owned.push(p);
          }
          for (const p of owned) cache.set(p.id, p);
        })().catch((error) => {
          requests.delete(path);
          throw error;
        }),
      );
    await requests.get(path);
  }
  return {
    entries,
    total: entries.length,
    available,
    async load(ids) {
      if (ids.length > 250) throw new Error("Too many requested photographs");
      const paths = new Set<string>();
      for (const id of ids) {
        const p = index.get(id);
        if (!p) throw new Error("Photo is absent from the catalog");
        if (!cache.has(id) && p.chunk) paths.add(p.chunk);
      }
      await Promise.all([...paths].map(loadChunk));
      return ids.map((id) => {
        const p = cache.get(id);
        if (!p) throw new Error("Photo record is missing");
        return p;
      });
    },
  };
}
