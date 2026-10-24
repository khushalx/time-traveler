import test from "node:test";
import assert from "node:assert/strict";
import {
  exactYear,
  reusableLicense,
  metadataProblems,
  DuplicateIndex,
  hamming,
  classify,
} from "./policy.mjs";
import { retryDelay } from "./http.mjs";
import { normalizeCommons } from "./adapters/commons.mjs";
import { normalizeLOC } from "./adapters/loc.mjs";
import {
  discoverSmithsonian,
  discoverEuropeana,
} from "./adapters/optional.mjs";
import { optimize, fingerprint } from "./images.mjs";
import sharp from "sharp";

test("exact capture years reject approximation, ranges, digitization, invalid dates and free prose", () => {
  for (const value of [
    "1967",
    "1967-11-13",
    "Taken in September 1967",
    "13 November 1967",
    "November 13, 1967",
    "1967-11-13T12:00:00Z",
  ])
    assert.equal(exactYear(value), 1967, value);
  for (const value of [
    "circa 1950",
    "ca. 1950",
    "1950s",
    "1960/1969",
    "1960–1969",
    "between 1960 and 1969",
    "Uploaded in 2017",
    "Digitized 2005",
    "probably 1967",
    "1967?",
    "1967-13-01",
    "1967-02-29",
    "street built in 1967",
    "1899",
    "2021",
    "",
  ])
    assert.equal(exactYear(value), null, value);
  assert.equal(exactYear("1968-02-29"), 1968);
});
test("rights require a compatible license name and matching canonical license URL", () => {
  for (const [name, url] of [
    ["CC BY 4.0", "https://creativecommons.org/licenses/by/4.0/"],
    ["CC BY-SA 3.0", "http://creativecommons.org/licenses/by-sa/3.0/deed.en"],
    ["CC0 1.0", "https://creativecommons.org/publicdomain/zero/1.0/"],
    ["Public domain", "https://creativecommons.org/publicdomain/mark/1.0/"],
  ])
    assert.ok(reusableLicense(name, url));
  for (const [name, url] of [
    ["CC BY-NC 4.0", "https://creativecommons.org/licenses/by-nc/4.0/"],
    ["CC BY-ND 4.0", "https://creativecommons.org/licenses/by-nd/4.0/"],
    ["No known restrictions", ""],
    ["Public domain", ""],
    ["CC BY 4.0", "https://evil.example/licenses/by/4.0/"],
    ["CC BY-SA 4.0", "https://creativecommons.org/licenses/by/4.0/"],
    ["CC BY 4.0", "https://creativecommons.org/licenses/by/4.0-fake/"],
    ["Public domain", "https://creativecommons.org/publicdomain/mark/1.0-fake/"],
  ])
    assert.equal(reusableLicense(name, url), null);
});
const candidate = {
  title: "Street, 1967",
  description: "A street scene.",
  captureDate: "1967",
  expectedYear: 1967,
  imageUrl: "https://upload.wikimedia.org/photo.jpg",
  sourceUrl: "https://commons.wikimedia.org/wiki/File:photo.jpg",
  width: 1600,
  height: 1000,
  creator: "Photographer",
  license: "CC BY 4.0",
  licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
  categories: ["Streets in India"],
};
test("conflicting original/scan years, dates and unsuitable content stay out of gameplay", () => {
  assert.deepEqual(metadataProblems(candidate).issues, []);
  assert.ok(
    metadataProblems({
      ...candidate,
      captureDate: "2012-05-21",
    }).issues.includes("title-date-conflicts-with-capture-date"),
  );
  assert.ok(
    metadataProblems({
      ...candidate,
      description: "Circa 1967 street scene.",
    }).issues.includes("conflicting-or-approximate-context-date"),
  );
  assert.ok(
    metadataProblems({
      ...candidate,
      title: "Newspaper screenshot, 1967",
    }).issues.includes("unsuitable-or-non-photographic-subject"),
  );
  assert.ok(
    metadataProblems({ ...candidate, width: 400 }).issues.includes(
      "low-source-resolution",
    ),
  );
  assert.ok(
    metadataProblems({
      ...candidate,
      width: 6000,
      height: 1000,
    }).issues.includes("extreme-aspect-ratio"),
  );
  assert.equal(classify("A market street in Mumbai, India").region, "India");
  assert.equal(classify("A tram in Tokyo, Japan").category, "Transport");
});
test("Commons uses capture metadata rather than upload time; original source evidence survives", () => {
  const page = {
    pageid: 12,
    title: "File:Example.jpg",
    imageinfo: [
      {
        url: "https://example.org/photo.jpg",
        descriptionurl: "https://commons.wikimedia.org/wiki/File:Example.jpg",
        width: 1600,
        height: 1200,
        extmetadata: {
          DateTime: { value: "2017-01-01" },
          DateTimeOriginal: { value: "1967" },
          Artist: { value: "<a>Real Creator</a>" },
          LicenseShortName: { value: "CC BY 4.0" },
          LicenseUrl: { value: "https://creativecommons.org/licenses/by/4.0/" },
        },
      },
    ],
  };
  const record = normalizeCommons(page);
  assert.equal(record.captureDate, "1967");
  assert.equal(record.creator, "Real Creator");
  assert.equal(record.rawEvidence.date.value, "1967");
  delete page.imageinfo[0].extmetadata.DateTimeOriginal;
  assert.equal(normalizeCommons(page).captureDate, "");
});
test("LOC uncertain copyright is not automatically converted into public domain", () => {
  const record = normalizeLOC({
    item: {
      id: "https://www.loc.gov/item/test/",
      url: "https://www.loc.gov/item/test/",
      title: "Street",
      date: "1967",
      rights: ["No known restrictions"],
      original_format: ["photo, print, drawing"],
    },
    resources: [
      {
        files: [
          [
            {
              url: "https://tile.loc.gov/photo.jpg",
              mimetype: "image/jpeg",
              width: 1600,
              height: 1200,
            },
          ],
        ],
      },
    ],
  });
  assert.equal(record.license, "No known restrictions");
  assert.equal(record.licenseUrl, "");
});
test("perceptual duplicate index detects similar hashes at scale", () => {
  const index = new DuplicateIndex();
  for (let i = 0; i < 5000; i++)
    index.add(
      `photo-${i}`,
      BigInt(i * 123456789)
        .toString(16)
        .padStart(16, "0"),
    );
  index.add("known", "abcdef0123456789");
  assert.equal(index.find("abcdef0123456788"), "known");
  assert.equal(hamming("0000000000000000", "ffffffffffffffff"), 64);
});
test("image decoder rejects corrupt, blank and low-resolution data", async () => {
  await assert.rejects(optimize(Buffer.from("not an image")));
  const low = await sharp({
    create: { width: 300, height: 300, channels: 3, background: "white" },
  })
    .png()
    .toBuffer();
  await assert.rejects(optimize(low), /dimensions/);
  const blank = await sharp({
    create: { width: 1600, height: 1200, channels: 3, background: "white" },
  })
    .png()
    .toBuffer();
  await assert.rejects(optimize(blank), /blank/);
  assert.equal((await fingerprint(blank)).length, 16);
});
test("Retry-After seconds and HTTP dates are honored", () => {
  assert.equal(retryDelay("10"), 10000);
  assert.equal(retryDelay(new Date(20000).toUTCString(), 0), 20000);
});
test("optional sources clearly fail without credentials and make no API requests", async () => {
  const oldSI = process.env.SMITHSONIAN_API_KEY,
    oldEU = process.env.EUROPEANA_API_KEY;
  delete process.env.SMITHSONIAN_API_KEY;
  delete process.env.EUROPEANA_API_KEY;
  const noRequest = () => {
    throw new Error("Should not request");
  };
  try {
    await assert.rejects(
      discoverSmithsonian(noRequest, { search: "street" }),
      /API_KEY/,
    );
    await assert.rejects(
      discoverEuropeana(noRequest, { search: "street" }),
      /API_KEY/,
    );
  } finally {
    if (oldSI) process.env.SMITHSONIAN_API_KEY = oldSI;
    if (oldEU) process.env.EUROPEANA_API_KEY = oldEU;
  }
});
