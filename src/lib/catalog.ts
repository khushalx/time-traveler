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
export type PhotoCatalog = {
  entries: CatalogEntry[];
  total: number;
  available: boolean;
  load: (ids: string[]) => Promise<Photo[]>;
};

export function parseManifest(value: unknown): CatalogEntry[] {
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
      !/^\/library\/releases\/[a-f0-9]{16}\/\d+\.json$/.test(chunk)
    )
      throw new Error("Invalid catalog metadata");
    seen.add(id);
    return { id, year, category, region, difficulty, quality, chunk };
  });
}
function validPhoto(p: Photo, entry: CatalogEntry) {
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
    /^\/library\/images\/[a-f0-9]{64}\.webp$/.test(p.src) &&
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
): Promise<PhotoCatalog> {
  let imported: CatalogEntry[] = [];
  let available = false;
  try {
    const response = await fetcher("/library/manifest.json", {
      cache: "no-cache",
      signal: AbortSignal.timeout(8000),
    });
    if (response.ok) {
      imported = parseManifest(await response.json());
      available = true;
    }
  } catch {
    /* The curated offline fallback remains playable. */
  }
  const seedIds = new Set(seed.map((p) => p.id));
  const entries: CatalogEntry[] = [
    ...seed,
    ...imported.filter((p) => !seedIds.has(p.id)),
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
          for (const p of data as Photo[]) {
            const entry = index.get(p.id);
            if (!entry || entry.chunk !== path || !validPhoto(p, entry))
              throw new Error("Photo metadata did not match the index");
          }
          for (const p of data as Photo[]) cache.set(p.id, p);
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
