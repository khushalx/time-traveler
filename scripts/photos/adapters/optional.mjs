import { plain } from "../policy.mjs";
export async function discoverSmithsonian(http, query, start = 0) {
  const key = process.env.SMITHSONIAN_API_KEY;
  if (!key)
    throw new Error(
      "SMITHSONIAN_API_KEY is required; obtain a key from api.data.gov. No request was made.",
    );
  const endpoint = "https://api.si.edu/openaccess/api/v1.0";
  const search = await http(
    `${endpoint}/search?${new URLSearchParams({ api_key: key, q: `${query.search} AND online_media_type:Images`, start: String(start), rows: "25" })}`,
    { cache: false },
  );
  const candidates = [];
  for (const row of search.response?.rows ?? []) {
    const result = await http(
      `${endpoint}/content/${encodeURIComponent(row.id)}?api_key=${encodeURIComponent(key)}`,
      { cache: false },
    );
    const d = result.response?.content;
    if (!d) continue;
    const f = d.freetext ?? {};
    const indexed = d.indexedStructured ?? {};
    const images = d.descriptiveNonRepeating?.online_media?.media ?? [];
    const image = images.find(
      (m) => m.type === "Images" && m.usage?.access === "CC0",
    );
    if (!image) continue;
    const dates = (f.date ?? []).filter(
      (x) =>
        /date|created|photographed/i.test(x.label) &&
        !/accession|acquisition/i.test(x.label),
    );
    candidates.push({
      id: `smithsonian-${row.id}`,
      adapter: "smithsonian",
      sourceName: "Smithsonian Open Access",
      sourceId: row.id,
      title: plain(row.title),
      description: plain((f.notes ?? []).map((n) => n.content).join(" ")),
      imageUrl: image.content,
      originalUrl: image.content,
      sourceUrl: d.descriptiveNonRepeating?.record_link,
      captureDate: dates.length === 1 ? plain(dates[0].content) : "",
      dateField: "content.freetext.date",
      creator:
        plain(
          (f.name ?? [])
            .filter((n) => /photographer|creator/i.test(n.label))
            .map((n) => n.content)
            .join("; "),
        ) || "Unknown creator",
      license: "CC0 1.0",
      licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
      categories: indexed.objectType ?? [],
      restrictions: /photograph/i.test(JSON.stringify(indexed.objectType))
        ? ""
        : "Object date is not a capture date; needs independent verification",
      rawEvidence: {
        dates,
        usage: image.usage,
        names: f.name,
        objectType: indexed.objectType,
      },
    });
  }
  return {
    candidates,
    next: start + 25 < (search.response?.rowCount ?? 0) ? start + 25 : null,
  };
}
export async function discoverEuropeana(http, query, start = 1) {
  const key = process.env.EUROPEANA_API_KEY;
  if (!key)
    throw new Error(
      "EUROPEANA_API_KEY is required; obtain a personal Europeana API key. No request was made.",
    );
  const search = await http(
    `https://api.europeana.eu/record/v2/search.json?${new URLSearchParams({ wskey: key, query: query.search, qf: "TYPE:IMAGE", rows: "24", start: String(start), profile: "rich" })}`,
    { cache: false },
  );
  const candidates = [];
  for (const row of search.items ?? []) {
    const result = await http(
      `https://api.europeana.eu/record/v2${row.id}.json?wskey=${encodeURIComponent(key)}`,
      { cache: false },
    );
    const o = result.object;
    const p = o?.proxies?.find((p) => !p.europeanaProxy);
    if (!p) continue;
    const values = (x) => Object.values(x ?? {}).flat();
    const dates = values(p.dctermsCreated);
    const rights = o.aggregations?.[0]?.edmRights?.[0] ?? row.rights?.[0] ?? "";
    const license = /creativecommons.org\/licenses\/by-sa\//.test(rights)
      ? `CC BY-SA ${rights.match(/by-sa\/([\d.]+)/)?.[1]}`
      : /creativecommons.org\/licenses\/by\//.test(rights)
        ? `CC BY ${rights.match(/by\/([\d.]+)/)?.[1]}`
        : /\/zero\//.test(rights)
          ? "CC0 1.0"
          : /\/mark\//.test(rights)
            ? "Public domain"
            : rights;
    candidates.push({
      id: `europeana-${row.id.replace(/\W/g, "-")}`,
      adapter: "europeana",
      sourceName: "Europeana",
      sourceId: row.id,
      title: plain(values(p.dcTitle)[0]),
      description: plain(values(p.dcDescription).join(" ")),
      imageUrl: o.aggregations?.[0]?.edmIsShownBy,
      originalUrl: o.aggregations?.[0]?.edmIsShownBy,
      sourceUrl: row.guid,
      captureDate: dates.length === 1 ? plain(dates[0]) : "",
      dateField: "provider proxy.dctermsCreated",
      creator: plain(values(p.dcCreator).join("; ")) || "Unknown creator",
      license,
      licenseUrl: rights,
      categories: values(p.dcType),
      restrictions: /photograph/i.test(values(p.dcType).join(" "))
        ? ""
        : "Creation may date an object rather than a photograph",
      rawEvidence: { dates, rights, creator: p.dcCreator, type: p.dcType },
    });
  }
  return {
    candidates,
    next: start + 24 < (search.totalResults ?? 0) ? start + 24 : null,
  };
}
