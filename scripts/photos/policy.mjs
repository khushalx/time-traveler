export const POLICY_VERSION = 1;
export const plain = (value = "") =>
  String(value)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

/** Never call this with upload, accession, or digitization timestamps. */
export function exactYear(value, min = 1900, max = 2020) {
  const text = plain(value);
  if (
    !text ||
    /\b(circa|ca\.?|c\.|about|approx\w*|between|before|after|unknown|probably|possibly|early|late|mid|digitiz\w*|scann?\w*|upload\w*|published|copyright)\b|[?~]|\d{4}\s*[/–—-]\s*\d{4}|\d{3}0s/i.test(
      text,
    )
  )
    return null;
  const years = [...new Set(text.match(/\b(?:18|19|20)\d{2}\b/g) ?? [])];
  if (years.length !== 1) return null;
  const year = Number(years[0]);
  // Exact calendar/year statements only. Free prose remains a review case.
  const cleaned = text.replace(
    /^(taken|photographed|created)\s+(on|in)\s+/i,
    "",
  );
  const dateLike =
    /^\d{4}(?:-\d{2}(?:-\d{2})?)?(?:[T ]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?$/.test(
      cleaned,
    ) ||
    /^(?:(?:\d{1,2}\s+)?(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}|(?:\d{1,2}\s+)?(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}|\d{4}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)(?:\s+\d{1,2})?)$/i.test(
      cleaned,
    );
  if (!dateLike || year < min || year > max) return null;
  const iso = cleaned.match(/^\d{4}-(\d{2})(?:-(\d{2}))?/);
  if (
    iso &&
    (Number(iso[1]) < 1 ||
      Number(iso[1]) > 12 ||
      (iso[2] &&
        (Number(iso[2]) < 1 ||
          Number(iso[2]) >
            new Date(Date.UTC(year, Number(iso[1]), 0)).getUTCDate())))
  )
    return null;
  return year;
}

export function reusableLicense(name, url = "") {
  const label = plain(name).trim();
  const link = String(url)
    .replace(/^http:/, "https:")
    .replace(/\/?(?:deed\.[a-z-]+)?$/, "");
  if (
    /^CC(?:[- ]BY)(?:[- ]SA)?[- ](?:1\.0|2\.0|2\.5|3\.0|4\.0)$/i.test(label) &&
    /^https:\/\/creativecommons\.org\/licenses\/by(?:-sa)?\/(?:1\.0|2\.0|2\.5|3\.0|4\.0)$/.test(
      link,
    )
  ) {
    const parts = link.match(/licenses\/(by(?:-sa)?)\/([\d.]+)/);
    const expected = `CC ${parts[1].toUpperCase().replace("-", "-")} ${parts[2]}`;
    if (label.toUpperCase().replace(/-/g, " ") !== expected.replace(/-/g, " "))
      return null;
    return { name: expected, url: link + "/" };
  }
  if (
    /^(CC0(?: 1\.0)?|public domain|public domain mark(?: 1\.0)?|PDM(?: 1\.0)?)$/i.test(
      label,
    ) &&
    /^https:\/\/creativecommons\.org\/publicdomain\/(zero|mark)\/1\.0$/.test(
      link,
    )
  )
    return {
      name: /zero/.test(link) ? "CC0 1.0" : "Public domain",
      url: link + "/",
    };
  return null;
}

const REGIONS = [
  [
    "India",
    /\b(india|indian|mumbai|bombay|delhi|calcutta|kolkata|madras|chennai|bangalore|bengaluru|varanasi|jaipur|kochi|kerala)\b/i,
  ],
  [
    "South Asia",
    /\b(sri lanka|ceylon|pakistan|bangladesh|nepal|dhaka|karachi|colombo)\b/i,
  ],
  [
    "East Asia",
    /\b(japan|tokyo|osaka|china|beijing|shanghai|hong kong|korea|seoul|taiwan)\b/i,
  ],
  [
    "Southeast Asia",
    /\b(vietnam|hanoi|saigon|thailand|bangkok|indonesia|jakarta|singapore|malaysia|philippines|manila|burma|myanmar)\b/i,
  ],
  [
    "Africa",
    /\b(africa|kenya|nairobi|ghana|accra|nigeria|lagos|egypt|cairo|morocco|ethiopia|cape town|johannesburg)\b/i,
  ],
  [
    "Latin America",
    /\b(brazil|rio de janeiro|são paulo|sao paulo|mexico|argentina|buenos aires|chile|peru|cuba|havana|colombia)\b/i,
  ],
  [
    "Oceania",
    /\b(australia|sydney|melbourne|new zealand|auckland|wellington|fiji)\b/i,
  ],
  [
    "Middle East",
    /\b(iran|tehran|iraq|baghdad|lebanon|beirut|israel|palestine|jerusalem|turkey|istanbul)\b/i,
  ],
  [
    "Europe",
    /\b(london|britain|england|scotland|wales|ireland|france|paris|germany|berlin|italy|rome|spain|madrid|netherlands|amsterdam|russia|moscow|sweden|stockholm|poland|warsaw|prague|portugal|lisbon|norway|oslo|switzerland|austria|vienna|denmark|copenhagen|hungary|budapest|sopron|baja|eger|pécs|czechoslovakia|czech|greece|heraklion|finland|helsinki|belgium|brussels|romania|bucharest|bulgaria|sofia|yugoslavia|croatia|serbia|belgrade|ukraine|kyiv|gdr|ddr)\b/i,
  ],
  [
    "North America",
    /\b(united states|america|new york|chicago|washington|california|san francisco|boston|canada|toronto|montreal|vancouver|los angeles|oregon|texas|florida)\b/i,
  ],
];
export function classify(text) {
  const location =
    REGIONS.find(([, pattern]) => pattern.test(text))?.[0] ?? "Unspecified";
  const categories = [
    [
      "Music & culture",
      /\b(music|musician|concert|singer|jazz|band|festival|cinema|dance|dancing|theatre)\b/i,
    ],
    [
      "Technology",
      /\b(computer|telephone|television|radio|laboratory|factory|electronics|spacecraft|shuttle|apollo|astronaut|rocket)\b/i,
    ],
    [
      "Fashion",
      /\b(fashion|dress|clothing|outfit|costume|hairstyle|miniskirt|swimsuit)\b/i,
    ],
    [
      "Transport",
      /\b(bus|buses|car|cars|train|railway|tram|automobile|traffic|bicycle|motorcycle|aircraft|airport|ship|boat)\b/i,
    ],
    [
      "Street life",
      /\b(street|market|shop|shopping|pedestrian|vendor|boulevard|avenue|cafe|café)\b/i,
    ],
    [
      "Events",
      /\b(protest|demonstration|parade|celebration|olympic|inauguration|election|rally)\b/i,
    ],
    [
      "Everyday life",
      /\b(family|children|child|playing|school|worker|working|farmer|farming|picnic|beach|kitchen)\b/i,
    ],
    [
      "Architecture",
      /\b(building|architecture|city|town|bridge|skyline|square|station|temple|mosque|church|cathedral|palace)\b/i,
    ],
  ];
  return {
    category:
      categories.find(([, pattern]) => pattern.test(text))?.[0] ??
      "Everyday life",
    region: location,
  };
}

export function metadataProblems(candidate, min = 1900, max = 2020) {
  const issues = [];
  const year = exactYear(candidate.captureDate, min, max);
  if (!year) issues.push("ambiguous-or-missing-capture-date");
  const context = [
    candidate.title,
    candidate.description,
    ...(candidate.categories ?? []),
  ].join(" ");
  if (
    /\b(circa|ca\.?|c\.)\s*\d{4}|\b(approximately|probably|possibly|between)\s+(?:in\s+)?\d{4}|\d{4}\s*[-–/]\s*\d{4}/i.test(
      candidate.title + " " + candidate.description,
    )
  )
    issues.push("conflicting-or-approximate-context-date");
  const explicitYears = candidate.title?.match(/\b(?:19|20)\d{2}\b/g) ?? [];
  if (year && explicitYears.some((y) => Number(y) !== year))
    issues.push("title-date-conflicts-with-capture-date");
  if (candidate.expectedYear && year !== candidate.expectedYear)
    issues.push("discovery-year-conflicts-with-capture-date");
  if (
    /\b(fashion plate|filmroll|film roll|museum specimen|object number|inventory number|product photography)\b/i.test(
      context,
    )
  )
    issues.push("object-creation-date-is-not-a-capture-date");
  if (!reusableLicense(candidate.license, candidate.licenseUrl))
    issues.push("unclear-or-incompatible-rights");
  if (
    !candidate.creator ||
    /^(unknown|anonymous|not provided)$/i.test(candidate.creator)
  ) {
    if (!/public domain|CC0/i.test(candidate.license ?? ""))
      issues.push("missing-required-creator");
  }
  if (candidate.restrictions) issues.push("source-restrictions-require-review");
  if (
    /\b(watermark|date stamp|dated stamp|screenshot|collage|contact sheet|postcard|stereograph|engraving|lithograph|painting|drawing|illustration|advertisement|poster|newspaper|document|map|reproduction|colorized|colourised|ai-generated|generative|execution|corpse|corpses|dead body|mutilat\w*|nude|nudity|pornograph\w*|lynching|massacre|holocaust|wounded|bloody|gore)\b/i.test(
      context,
    )
  )
    issues.push("unsuitable-or-non-photographic-subject");
  if (
    !/^https:\/\//.test(candidate.imageUrl ?? "") ||
    !/^https:\/\//.test(candidate.sourceUrl ?? "")
  )
    issues.push("invalid-source-url");
  if (
    candidate.width &&
    (Math.max(candidate.width, candidate.height) < 1000 ||
      Math.min(candidate.width, candidate.height) < 600)
  )
    issues.push("low-source-resolution");
  if (
    candidate.width &&
    (candidate.width / candidate.height < 0.55 ||
      candidate.width / candidate.height > 2.3)
  )
    issues.push("extreme-aspect-ratio");
  return { year, issues: [...new Set(issues)] };
}

export function hamming(a, b) {
  let n = BigInt("0x" + a) ^ BigInt("0x" + b),
    distance = 0;
  while (n) {
    n &= n - 1n;
    distance++;
  }
  return distance;
}
export class DuplicateIndex {
  bands = new Map();
  hashes = new Map();
  add(id, hash) {
    this.hashes.set(id, hash);
    for (let i = 0; i < 8; i++) {
      const key = `${i}:${hash.slice(i * 2, i * 2 + 2)}`;
      if (!this.bands.has(key)) this.bands.set(key, new Set());
      this.bands.get(key).add(id);
    }
  }
  find(hash, threshold = 6) {
    const possible = new Set();
    for (let i = 0; i < 8; i++)
      for (const id of this.bands.get(`${i}:${hash.slice(i * 2, i * 2 + 2)}`) ??
        [])
        possible.add(id);
    for (const id of possible)
      if (hamming(hash, this.hashes.get(id)) <= threshold) return id;
    return null;
  }
}

export function validRecord(p) {
  return (
    !!p &&
    typeof p.id === "string" &&
    typeof p.title === "string" &&
    p.title.length > 0 &&
    Number.isInteger(p.year) &&
    p.year >= 1900 &&
    p.year <= 2020 &&
    Number.isInteger(p.width) &&
    Number.isInteger(p.height) &&
    p.width >= 500 &&
    p.height >= 450 &&
    /^https:\/\//.test(p.sourceUrl) &&
    !!p.creator &&
    !!p.dateEvidence &&
    p.yearConfidence === "verified" &&
    !!reusableLicense(p.license, p.licenseUrl) &&
    ["approved", "review", "rejected"].includes(p.status)
  );
}
