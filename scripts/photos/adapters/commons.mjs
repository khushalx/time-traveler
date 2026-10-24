import { plain } from "../policy.mjs";
export function normalizeCommons(page, expectedYear) {
  const info = page.imageinfo?.[0];
  if (!info) return null;
  const m = info.extmetadata ?? {};
  const value = (key) => plain(m[key]?.value ?? "");
  if (!/\.(jpe?g|png|webp|tiff?)$/i.test(page.title)) return null;
  return {
    id: `commons-${page.pageid}`,
    sourceId: String(page.pageid),
    sourceName: "Wikimedia Commons",
    adapter: "commons",
    title:
      value("ObjectName") ||
      page.title.replace(/^File:/, "").replace(/\.[^.]+$/, ""),
    description: value("ImageDescription"),
    imageUrl: info.thumburl || info.url,
    originalUrl: info.url,
    sourceUrl: info.descriptionurl,
    width: info.width,
    height: info.height,
    creator: value("Artist") || value("Attribution") || "Unknown creator",
    license: value("LicenseShortName"),
    licenseUrl: value("LicenseUrl"),
    restrictions: value("Restrictions"),
    captureDate: value("DateTimeOriginal"),
    dateField: "imageinfo.extmetadata.DateTimeOriginal",
    expectedYear,
    categories: value("Categories").split("|"),
    rawEvidence: {
      date: m.DateTimeOriginal ?? null,
      license: m.LicenseShortName ?? null,
      licenseUrl: m.LicenseUrl ?? null,
      artist: m.Artist ?? null,
      description: m.ImageDescription ?? null,
      credit: m.Credit ?? null,
      categories: m.Categories ?? null,
      sha1: info.sha1,
    },
  };
}
export async function discoverCommons(http, query, cursor = 0) {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    generator: "search",
    gsrsearch: query.search,
    gsrnamespace: "6",
    gsrlimit: "50",
    gsroffset: String(cursor),
    prop: "imageinfo",
    iiprop: "url|size|extmetadata|sha1",
    iiurlwidth: "1600",
    maxlag: "5",
  });
  const data = await http(`https://commons.wikimedia.org/w/api.php?${params}`);
  return {
    candidates: (data.query?.pages ?? [])
      .map((page) => normalizeCommons(page, query.year))
      .filter(Boolean),
    next: data.continue?.gsroffset ?? null,
  };
}
