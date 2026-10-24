import { plain } from "../policy.mjs";
export function normalizeLOC(data) {
  const item = data.item ?? data;
  const detail = item.item ?? item;
  const created = detail.created_published_date ?? detail.date ?? item.date;
  const dates = Array.isArray(created) ? created : [created];
  const rights =
    (detail.rights ?? item.rights ?? []).join?.(" ") ||
    plain(detail.rights ?? item.rights ?? "");
  const sources = (data.resources ?? item.resources ?? []).flatMap((r) =>
    (r.files ?? []).flat(),
  );
  const image = sources
    .filter((x) => /^image\/(jpeg|png)/.test(x.mimetype ?? "") && x.url)
    .sort((a, b) => Math.abs(1600 - a.width) - Math.abs(1600 - b.width))[0];
  if (!image) return null;
  // "No known restrictions" is not an automatic public-domain declaration.
  const publicDomain =
    /public domain|no copyright/i.test(rights) &&
    !/may|possibly|unknown|not determined/i.test(rights);
  return {
    id: `loc-${String(item.id ?? item.url).replace(/\W+/g, "-")}`,
    adapter: "loc",
    sourceName: "Library of Congress",
    sourceId: item.id ?? item.url,
    title: plain(item.title),
    description: plain((item.description ?? []).join(" ")),
    imageUrl: image.url.replace(/^http:/, "https:"),
    originalUrl: image.url,
    sourceUrl: item.url ?? item.id,
    width: image.width,
    height: image.height,
    captureDate:
      dates.length === 1
        ? plain(dates[0]).replace(/^\[|\]$/g, "")
        : dates.join(" / "),
    dateField: "item.created_published_date (photographic item only)",
    creator:
      plain((detail.names ?? item.contributor ?? []).join("; ")) ||
      "Unknown creator",
    license: publicDomain ? "Public domain" : rights,
    licenseUrl: publicDomain
      ? "https://creativecommons.org/publicdomain/mark/1.0/"
      : "",
    categories: item.subject ?? [],
    rawEvidence: {
      dates,
      rights,
      notes: detail.notes,
      formats: item.original_format,
    },
    restrictions:
      !item.original_format?.includes("photo, print, drawing") &&
      !/photograph/i.test(JSON.stringify(detail.medium ?? []))
        ? "Photographic original format needs review"
        : "",
  };
}
export async function discoverLOC(http, query, page = 1) {
  const url = new URL("https://www.loc.gov/photos/");
  url.search = new URLSearchParams({
    fo: "json",
    c: "25",
    sp: String(page),
    q: query.search,
  });
  const data = await http(url.href);
  const candidates = [];
  for (const item of data.results ?? []) {
    const detail = await http(`${item.id.replace(/\/$/, "")}/?fo=json`);
    const normalized = normalizeLOC(detail);
    if (normalized) candidates.push(normalized);
  }
  return { candidates, next: data.pagination?.next ? page + 1 : null };
}
